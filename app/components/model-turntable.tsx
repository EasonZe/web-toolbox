"use client";

import { useEffect, useRef, useState } from "react";
import { FiCamera, FiDownload, FiMaximize, FiRotateCcw, FiUploadCloud, FiVideo } from "react-icons/fi";
import type * as ThreeTypes from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { FileDropZone } from "./file-drop-zone";
import { UtilityShell } from "./utility-shell";
import { formatMediaSize } from "../lib/media-reversal";
import { formatModelDimension, modelExtension, parseModelResolution, turntableOutputName, validateModelFile } from "../lib/model-turntable";

type ModelInfo = {
  file: File;
  objects: number;
  triangles: number;
  animations: number;
  dimensions: [number, number, number];
};

type VideoResult = { url: string; name: string; size: number; mimeType: string };
type ExportState = { startedAt: number; durationMs: number; startRotation: number; direction: number; recorder: MediaRecorder };

function preferredVideoType() {
  if (typeof MediaRecorder === "undefined") return "";
  return ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"].find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function disposeObject(root: ThreeTypes.Object3D) {
  root.traverse((child) => {
    const mesh = child as ThreeTypes.Mesh;
    mesh.geometry?.dispose?.();
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value && typeof value === "object" && "isTexture" in value) (value as ThreeTypes.Texture).dispose();
      }
      material.dispose();
    }
  });
}

export default function ModelTurntable() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<{
    THREE: typeof ThreeTypes;
    renderer: ThreeTypes.WebGLRenderer;
    scene: ThreeTypes.Scene;
    camera: ThreeTypes.PerspectiveCamera;
    controls: OrbitControls;
    pivot: ThreeTypes.Group;
    ground: ThreeTypes.Mesh;
    grid: ThreeTypes.GridHelper;
    keyLight: ThreeTypes.DirectionalLight;
    fillLight: ThreeTypes.HemisphereLight;
    mixer: ThreeTypes.AnimationMixer | null;
    clips: ThreeTypes.AnimationClip[];
    lastTimestamp: number;
    home: { position: ThreeTypes.Vector3; target: ThreeTypes.Vector3 };
  } | null>(null);
  const animationFrame = useRef(0);
  const exportRef = useRef<ExportState | null>(null);
  const videoUrlRef = useRef("");
  const modelRootRef = useRef<ThreeTypes.Object3D | null>(null);
  const settingsRef = useRef({ autoRotate: true, speed: 24, direction: 1, playAnimations: true });
  const [ready, setReady] = useState(false);
  const [model, setModel] = useState<ModelInfo | null>(null);
  const [phase, setPhase] = useState<"idle" | "loading" | "exporting">("idle");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [autoRotate, setAutoRotate] = useState(true);
  const [speed, setSpeed] = useState(24);
  const [direction, setDirection] = useState(1);
  const [playAnimations, setPlayAnimations] = useState(true);
  const [background, setBackground] = useState("#eef3f5");
  const [exposure, setExposure] = useState(1);
  const [light, setLight] = useState(2.2);
  const [showGround, setShowGround] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [duration, setDuration] = useState(6);
  const [fps, setFps] = useState(30);
  const [resolution, setResolution] = useState("720x720");
  const [bitrate, setBitrate] = useState(8);
  const [progress, setProgress] = useState(0);
  const [video, setVideo] = useState<VideoResult | null>(null);
  const busy = phase !== "idle";

  useEffect(() => {
    settingsRef.current = { autoRotate, speed, direction, playAnimations };
  }, [autoRotate, speed, direction, playAnimations]);

  useEffect(() => {
    let disposed = false;
    let observer: ResizeObserver | null = null;
    const canvas = canvasRef.current;
    const viewport = viewportRef.current;
    if (!canvas || !viewport) return;
    void Promise.all([
      import("three"),
      import("three/addons/controls/OrbitControls.js"),
    ]).then(([THREE, { OrbitControls }]) => {
      if (disposed) return;
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      const scene = new THREE.Scene();
      scene.background = new THREE.Color("#eef3f5");
      const camera = new THREE.PerspectiveCamera(38, 1, .01, 10000);
      camera.position.set(3.2, 2.2, 4.2);
      const controls = new OrbitControls(camera, canvas);
      controls.enableDamping = true;
      controls.dampingFactor = .07;
      controls.minDistance = .05;
      controls.maxDistance = 10000;
      const pivot = new THREE.Group();
      scene.add(pivot);
      const ground = new THREE.Mesh(
        new THREE.CircleGeometry(4, 96),
        new THREE.MeshStandardMaterial({ color: 0xdde5e8, roughness: .86, metalness: 0 }),
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -.5;
      ground.receiveShadow = true;
      scene.add(ground);
      const grid = new THREE.GridHelper(8, 20, 0x7d8790, 0xc5cdd1);
      grid.position.y = -.495;
      grid.visible = true;
      scene.add(grid);
      const fillLight = new THREE.HemisphereLight(0xffffff, 0x6f7c83, 1.25);
      const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
      keyLight.position.set(4, 6, 5);
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(2048, 2048);
      scene.add(fillLight, keyLight);
      const home = { position: camera.position.clone(), target: controls.target.clone() };
      runtimeRef.current = { THREE, renderer, scene, camera, controls, pivot, ground, grid, keyLight, fillLight, mixer: null, clips: [], lastTimestamp: 0, home };
      const resize = () => {
        if (exportRef.current || !viewportRef.current || !runtimeRef.current) return;
        const width = Math.max(320, viewportRef.current.clientWidth);
        const height = Math.max(360, viewportRef.current.clientHeight);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };
      observer = new ResizeObserver(resize);
      observer.observe(viewport);
      resize();
      const animate = (timestamp: number) => {
        if (disposed) return;
        const runtime = runtimeRef.current;
        if (!runtime) return;
        const delta = runtime.lastTimestamp ? Math.min((timestamp - runtime.lastTimestamp) / 1000, .05) : 0;
        runtime.lastTimestamp = timestamp;
        const activeExport = exportRef.current;
        if (activeExport) {
          const ratio = Math.min(1, (timestamp - activeExport.startedAt) / activeExport.durationMs);
          runtime.pivot.rotation.y = activeExport.startRotation + activeExport.direction * Math.PI * 2 * ratio;
          setProgress(Math.round(ratio * 100));
          if (ratio >= 1 && activeExport.recorder.state !== "inactive") activeExport.recorder.stop();
        } else if (settingsRef.current.autoRotate && modelRootRef.current) {
          runtime.pivot.rotation.y += settingsRef.current.direction * THREE.MathUtils.degToRad(settingsRef.current.speed) * delta;
        }
        if (runtime.mixer && settingsRef.current.playAnimations) runtime.mixer.update(delta);
        runtime.controls.update();
        renderer.render(scene, camera);
        animationFrame.current = requestAnimationFrame(animate);
      };
      animationFrame.current = requestAnimationFrame(animate);
      setReady(true);
      setMessage("预览器已就绪，请导入模型。");
    }).catch(() => {
      if (!disposed) setError("无法启动 3D 预览，请确认浏览器已开启 WebGL。");
    });
    return () => {
      disposed = true;
      observer?.disconnect();
      cancelAnimationFrame(animationFrame.current);
      if (exportRef.current?.recorder.state !== "inactive") exportRef.current?.recorder.stop();
      const runtime = runtimeRef.current;
      if (modelRootRef.current) disposeObject(modelRootRef.current);
      runtime?.ground.geometry.dispose();
      (runtime?.ground.material as ThreeTypes.Material | undefined)?.dispose();
      runtime?.grid.geometry.dispose();
      (runtime?.grid.material as ThreeTypes.Material | undefined)?.dispose();
      runtime?.controls.dispose();
      runtime?.renderer.dispose();
      runtimeRef.current = null;
      if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
    };
  }, []);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.scene.background = new runtime.THREE.Color(background);
    runtime.renderer.toneMappingExposure = exposure;
    runtime.keyLight.intensity = light;
    runtime.fillLight.intensity = Math.max(.35, light * .55);
    runtime.ground.visible = showGround;
    runtime.grid.visible = showGrid;
  }, [background, exposure, light, showGround, showGrid, ready]);

  function clearVideo() {
    if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
    videoUrlRef.current = "";
    setVideo(null);
    setProgress(0);
  }

  function resetCamera() {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.camera.position.copy(runtime.home.position);
    runtime.controls.target.copy(runtime.home.target);
    runtime.controls.update();
  }

  async function loadModel(file: File) {
    const validation = validateModelFile(file);
    if (validation) { setError(`${validation}。`); return; }
    const runtime = runtimeRef.current;
    if (!runtime) { setError("3D 预览器尚未就绪。"); return; }
    setPhase("loading"); setError(""); setMessage("正在解析模型…"); clearVideo();
    try {
      const extension = modelExtension(file.name);
      let root: ThreeTypes.Object3D;
      let clips: ThreeTypes.AnimationClip[] = [];
      if (extension === "glb" || extension === "gltf") {
        const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
        const loader = new GLTFLoader();
        const content = extension === "gltf" ? await file.text() : await file.arrayBuffer();
        const gltf = await loader.parseAsync(content, "");
        root = gltf.scene;
        clips = gltf.animations;
      } else if (extension === "obj") {
        const { OBJLoader } = await import("three/addons/loaders/OBJLoader.js");
        root = new OBJLoader().parse(await file.text());
      } else if (extension === "stl") {
        const { STLLoader } = await import("three/addons/loaders/STLLoader.js");
        const geometry = new STLLoader().parse(await file.arrayBuffer());
        geometry.computeVertexNormals();
        root = new runtime.THREE.Mesh(geometry, new runtime.THREE.MeshStandardMaterial({ color: 0x8e83bc, roughness: .6, metalness: .08 }));
      } else {
        const { FBXLoader } = await import("three/addons/loaders/FBXLoader.js");
        root = new FBXLoader().parse(await file.arrayBuffer(), "");
        clips = root.animations;
      }
      const box = new runtime.THREE.Box3().setFromObject(root);
      if (box.isEmpty()) throw new Error("模型中没有可显示的几何体");
      const size = box.getSize(new runtime.THREE.Vector3());
      const center = box.getCenter(new runtime.THREE.Vector3());
      const maxDimension = Math.max(size.x, size.y, size.z);
      if (!Number.isFinite(maxDimension) || maxDimension <= 0) throw new Error("模型尺寸无效");
      root.position.sub(center);
      root.traverse((child) => {
        const mesh = child as ThreeTypes.Mesh;
        if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; }
      });
      if (modelRootRef.current) {
        runtime.pivot.remove(modelRootRef.current);
        disposeObject(modelRootRef.current);
      }
      runtime.mixer?.stopAllAction();
      runtime.mixer = null;
      runtime.clips = clips;
      runtime.pivot.rotation.set(0, 0, 0);
      runtime.pivot.add(root);
      modelRootRef.current = root;
      if (clips.length) {
        runtime.mixer = new runtime.THREE.AnimationMixer(root);
        for (const clip of clips) runtime.mixer.clipAction(clip).play();
      }
      runtime.ground.position.y = -size.y / 2 - maxDimension * .012;
      runtime.grid.position.y = runtime.ground.position.y + maxDimension * .003;
      const groundScale = Math.max(1, maxDimension * 1.15);
      runtime.ground.scale.setScalar(groundScale);
      runtime.grid.scale.setScalar(Math.max(.25, maxDimension / 4));
      const distance = maxDimension / (2 * Math.tan(runtime.THREE.MathUtils.degToRad(runtime.camera.fov / 2))) * 1.45;
      runtime.camera.near = Math.max(.001, distance / 1000);
      runtime.camera.far = Math.max(100, distance * 100);
      runtime.camera.position.set(distance * .78, distance * .52, distance * 1.08);
      runtime.controls.target.set(0, 0, 0);
      runtime.controls.minDistance = distance * .15;
      runtime.controls.maxDistance = distance * 8;
      runtime.camera.updateProjectionMatrix();
      runtime.controls.update();
      runtime.home = { position: runtime.camera.position.clone(), target: runtime.controls.target.clone() };
      let objects = 0;
      let triangles = 0;
      root.traverse((child) => {
        objects += 1;
        const mesh = child as ThreeTypes.Mesh;
        if (!mesh.isMesh || !mesh.geometry) return;
        const indexCount = mesh.geometry.index?.count;
        const vertexCount = mesh.geometry.getAttribute("position")?.count ?? 0;
        triangles += Math.floor((indexCount ?? vertexCount) / 3);
      });
      setModel({ file, objects, triangles, animations: clips.length, dimensions: [size.x, size.y, size.z] });
      setMessage(`已导入 ${file.name}，可拖动旋转、滚轮缩放或导出转台动画。`);
    } catch (cause) {
      setError(cause instanceof Error ? `${cause.message}。如使用 GLTF，请确保贴图和缓冲数据已内嵌。` : "模型解析失败。");
    } finally { setPhase("idle"); }
  }

  function downloadScreenshot() {
    const runtime = runtimeRef.current;
    if (!runtime || !model) return;
    runtime.renderer.render(runtime.scene, runtime.camera);
    runtime.renderer.domElement.toBlob((blob) => {
      if (!blob) { setError("无法生成截图。"); return; }
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${model.file.name.replace(/\.[^.]+$/, "") || "3d-model"}-preview.png`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("已导出当前视角 PNG 截图。");
    }, "image/png");
  }

  async function exportVideo() {
    const runtime = runtimeRef.current;
    const canvas = canvasRef.current;
    const viewport = viewportRef.current;
    if (!runtime || !canvas || !viewport || !model || busy) return;
    const mimeType = preferredVideoType();
    if (!mimeType || typeof canvas.captureStream !== "function") {
      setError("当前浏览器不支持画布动画导出，请使用新版 Chrome、Edge 或 Firefox。");
      return;
    }
    setPhase("exporting"); setError(""); setMessage("正在实时录制一圈转台动画，请保持页面在前台…"); clearVideo();
    const { width, height } = parseModelResolution(resolution);
    const oldRotation = runtime.pivot.rotation.y;
    const chunks: Blob[] = [];
    try {
      runtime.renderer.setPixelRatio(1);
      runtime.renderer.setSize(width, height, false);
      runtime.camera.aspect = width / height;
      runtime.camera.updateProjectionMatrix();
      runtime.pivot.rotation.y = 0;
      runtime.renderer.render(runtime.scene, runtime.camera);
      const stream = canvas.captureStream(fps);
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitrate * 1_000_000 });
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      const completed = new Promise<void>((resolve, reject) => {
        recorder.onstop = () => resolve();
        recorder.onerror = () => reject(new Error("浏览器录制器报错"));
      });
      recorder.start(250);
      exportRef.current = { startedAt: performance.now(), durationMs: duration * 1000, startRotation: 0, direction, recorder };
      await completed;
      stream.getTracks().forEach((track) => track.stop());
      if (!chunks.length) throw new Error("未生成有效的动画数据");
      let blob = new Blob(chunks, { type: recorder.mimeType || mimeType });
      if (blob.type.includes("webm")) {
        const { fixWebmDuration } = await import("@fix-webm-duration/fix");
        blob = await fixWebmDuration(blob, duration * 1000, { logger: false });
      }
      const url = URL.createObjectURL(blob);
      videoUrlRef.current = url;
      const name = turntableOutputName(model.file.name, blob.type);
      setVideo({ url, name, size: blob.size, mimeType: blob.type });
      setProgress(100); setMessage("转台动画已导出，可在下方预览或下载。");
    } catch (cause) {
      setError(cause instanceof Error ? `${cause.message}。` : "转台动画导出失败。");
    } finally {
      exportRef.current = null;
      runtime.pivot.rotation.y = oldRotation;
      runtime.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      const width = Math.max(320, viewport.clientWidth);
      const height = Math.max(360, viewport.clientHeight);
      runtime.renderer.setSize(width, height, false);
      runtime.camera.aspect = width / height;
      runtime.camera.updateProjectionMatrix();
      setPhase("idle");
    }
  }

  async function enterFullscreen() { await viewportRef.current?.requestFullscreen(); }

  return <UtilityShell title="3D模型预览与转台动画" description="导入常见3D模型，自由查看材质与动画，并导出360°转台视频。">
    <FileDropZone className="video-file-picker" accept=".glb,.gltf,.obj,.stl,.fbx,model/gltf-binary,model/gltf+json" disabled={busy || !ready} onFile={loadModel} ariaLabel="选择或拖入3D模型">
      <FiUploadCloud aria-hidden="true" /><strong>{phase === "loading" ? "正在解析模型…" : model ? "重新选择模型" : "选择或拖入3D模型"}</strong><span>GLB、GLTF（内嵌资源）、OBJ、STL、FBX，最大 120 MB，文件只在本地处理</span>
    </FileDropZone>
    <div className="model-turntable-layout">
      <section className="utility-panel model-viewer-panel">
        <div ref={viewportRef} className="model-viewer-viewport">
          <canvas ref={canvasRef} role="img" aria-label={model ? `${model.file.name} 3D模型交互预览` : "3D模型预览画布"} />
          {!model ? <div className="model-viewer-empty"><span>3D</span><strong>模型预览区</strong><small>拖动旋转 · 滚轮缩放 · 右键平移</small></div> : null}
          {phase === "exporting" ? <div className="model-export-overlay"><strong>正在导出 {progress}%</strong><progress max="100" value={progress}>{progress}%</progress></div> : null}
        </div>
        <div className="utility-actions model-viewer-actions">
          <button type="button" disabled={!model || busy} onClick={resetCamera}><FiRotateCcw aria-hidden="true" />重置视角</button>
          <button type="button" disabled={!model || busy} onClick={downloadScreenshot}><FiCamera aria-hidden="true" />导出PNG截图</button>
          <button type="button" disabled={busy} onClick={() => void enterFullscreen()}><FiMaximize aria-hidden="true" />全屏预览</button>
        </div>
        {model ? <dl className="model-stats"><div><dt>文件</dt><dd>{model.file.name} · {formatMediaSize(model.file.size)}</dd></div><div><dt>尺寸</dt><dd>{model.dimensions.map(formatModelDimension).join(" × ")}</dd></div><div><dt>三角面</dt><dd>{model.triangles.toLocaleString("zh-CN")}</dd></div><div><dt>节点 / 动画</dt><dd>{model.objects} / {model.animations}</dd></div></dl> : null}
      </section>
      <div className="model-turntable-controls">
        <section className="utility-panel utility-controls">
          <h2>预览设置</h2>
          <label className="utility-checkbox"><input type="checkbox" checked={autoRotate} onChange={(event) => setAutoRotate(event.target.checked)} />自动转台旋转</label>
          <label className="utility-range-control"><span>预览转速<output>{speed}°/秒</output></span><input type="range" min="5" max="90" step="1" value={speed} onChange={(event) => setSpeed(+event.target.value)} /></label>
          <div className="mode-tabs" role="tablist" aria-label="旋转方向"><button type="button" role="tab" aria-selected={direction === 1} onClick={() => setDirection(1)}>顺时针</button><button type="button" role="tab" aria-selected={direction === -1} onClick={() => setDirection(-1)}>逆时针</button></div>
          <label>背景颜色<input type="color" value={background} onChange={(event) => setBackground(event.target.value)} /></label>
          <label className="utility-range-control"><span>灯光强度<output>{light.toFixed(1)}</output></span><input type="range" min=".4" max="5" step=".1" value={light} onChange={(event) => setLight(+event.target.value)} /></label>
          <label className="utility-range-control"><span>曝光<output>{exposure.toFixed(1)}</output></span><input type="range" min=".4" max="2" step=".1" value={exposure} onChange={(event) => setExposure(+event.target.value)} /></label>
          <label className="utility-checkbox"><input type="checkbox" checked={showGround} onChange={(event) => setShowGround(event.target.checked)} />显示地面与阴影</label>
          <label className="utility-checkbox"><input type="checkbox" checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} />显示参考网格</label>
          <label className="utility-checkbox"><input type="checkbox" checked={playAnimations} disabled={!model?.animations} onChange={(event) => setPlayAnimations(event.target.checked)} />播放模型内置动画</label>
        </section>
        <section className="utility-panel utility-controls">
          <h2>转台动画导出</h2>
          <label>导出画布<select value={resolution} disabled={busy} onChange={(event) => setResolution(event.target.value)}><option value="512x512">方形 512×512</option><option value="720x720">方形 720×720</option><option value="1280x720">横屏 1280×720</option><option value="720x1280">竖屏 720×1280</option><option value="1920x1080">全高清 1920×1080</option></select></label>
          <label className="utility-range-control"><span>一圈时长<output>{duration}秒</output></span><input type="range" min="2" max="12" step="1" value={duration} disabled={busy} onChange={(event) => setDuration(+event.target.value)} /></label>
          <div className="model-export-row"><label>帧率<select value={fps} disabled={busy} onChange={(event) => setFps(+event.target.value)}><option value="24">24 FPS</option><option value="30">30 FPS</option><option value="60">60 FPS</option></select></label><label>码率<select value={bitrate} disabled={busy} onChange={(event) => setBitrate(+event.target.value)}><option value="4">4 Mbps</option><option value="8">8 Mbps</option><option value="12">12 Mbps</option></select></label></div>
          <button className="primary-button" type="button" disabled={!model || busy} onClick={() => void exportVideo()}><FiVideo aria-hidden="true" />{phase === "exporting" ? `正在导出 ${progress}%` : "导出360°转台动画"}</button>
          <p className="utility-muted">使用浏览器实时录制，格式为 WebM 或 MP4（由浏览器决定）；导出期间请保持页面在前台。</p>
        </section>
      </div>
    </div>
    {video ? <section className="utility-panel utility-controls model-video-result"><div className="utility-heading"><h2>动画导出结果</h2><span className="utility-muted">{formatMediaSize(video.size)} · {video.mimeType}</span></div><video controls loop playsInline src={video.url} /><a className="primary-button" href={video.url} download={video.name}><FiDownload aria-hidden="true" />下载转台动画</a></section> : null}
    {error ? <p className="utility-error" role="alert">{error}</p> : null}{message ? <p className="utility-muted" role="status">{message}</p> : null}
  </UtilityShell>;
}
