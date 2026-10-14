"use client";
import { toolLimits } from "../lib/resource-limits";
import { useEffect, useRef, useState } from "react";
import { UtilityShell } from "./utility-shell";
import { LocalUpload } from "./local-workbench";
import { loadRaster } from "../lib/local-images";
export default function PanoramaViewer() {
  const [file, setFile] = useState<File | null>(null),
    [fov, setFov] = useState(75),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const stage = useRef<HTMLDivElement>(null),
    api = useRef<{ fov: (value: number) => void; reset: () => void } | null>(
      null,
    );
  useEffect(() => {
    if (!file || !stage.current) return;
    const controller = new AbortController(),
      host = stage.current;
    let dispose: (() => void) | undefined;
    void (async () => {
      const [THREE, { OrbitControls }, bitmap] = await Promise.all([
        import("three"),
        import("three/addons/controls/OrbitControls.js"),
        loadRaster(file, controller.signal, toolLimits.image.pixels),
      ]);
      if (controller.signal.aborted) {
        bitmap.close();
        return;
      }
      if (Math.abs(bitmap.width / bitmap.height - 2) > 0.05) {
        bitmap.close();
        throw new Error("请使用宽高约 2:1 的等距柱状全景图片。");
      }
      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true });
      } catch {
        bitmap.close();
        throw new Error("浏览器或设备不支持 WebGL，无法预览全景。");
      }
      if (
        Math.max(bitmap.width, bitmap.height) >
        renderer.capabilities.maxTextureSize
      ) {
        bitmap.close();
        renderer.dispose();
        throw new Error("图片超过设备支持的纹理尺寸，请缩小后重试。");
      }
      const scene = new THREE.Scene(),
        camera = new THREE.PerspectiveCamera(75, 1, 0.01, 1000);
      camera.position.set(0, 0, 0.1);
      const texture = new THREE.Texture(bitmap);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.flipY = false;
      texture.repeat.y = -1;
      texture.offset.y = 1;
      texture.needsUpdate = true;
      const geometry = new THREE.SphereGeometry(500, 64, 48);
      geometry.scale(-1, 1, 1);
      const material = new THREE.MeshBasicMaterial({ map: texture });
      scene.add(new THREE.Mesh(geometry, material));
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      host.append(renderer.domElement);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enablePan = false;
      controls.enableZoom = false;
      controls.enableDamping = true;
      controls.rotateSpeed = -0.35;
      controls.minDistance = 0.1;
      controls.maxDistance = 0.1;
      controls.saveState();
      function changeFov(value: number) {
        camera.fov = Math.max(25, Math.min(100, value));
        camera.updateProjectionMatrix();
      }
      const wheel = (event: WheelEvent) => {
        event.preventDefault();
        const next = Math.max(
          25,
          Math.min(100, camera.fov + event.deltaY * 0.03),
        );
        changeFov(next);
        setFov(next);
      };
      const lost = (event: Event) => {
        event.preventDefault();
        setError("图形上下文已丢失，请重新导入图片。");
      };
      renderer.domElement.addEventListener("wheel", wheel, { passive: false });
      renderer.domElement.addEventListener("webglcontextlost", lost);
      const resize = () => {
        const width = Math.max(1, host.clientWidth),
          height = Math.max(1, host.clientHeight);
        renderer.setSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };
      const observer = new ResizeObserver(resize);
      observer.observe(host);
      resize();
      let frame = 0;
      const draw = () => {
        controls.update();
        renderer.render(scene, camera);
        frame = requestAnimationFrame(draw);
      };
      draw();
      api.current = {
        fov: changeFov,
        reset: () => {
          controls.reset();
          changeFov(75);
          setFov(75);
        },
      };
      setFov(75);
      setBusy(false);
      dispose = () => {
        api.current = null;
        cancelAnimationFrame(frame);
        observer.disconnect();
        controls.dispose();
        renderer.domElement.removeEventListener("wheel", wheel);
        renderer.domElement.removeEventListener("webglcontextlost", lost);
        geometry.dispose();
        material.dispose();
        texture.dispose();
        bitmap.close();
        renderer.dispose();
        renderer.forceContextLoss();
        renderer.domElement.remove();
      };
    })().catch((cause) => {
      if (!controller.signal.aborted) {
        setError((cause as Error).message);
        setBusy(false);
      }
    });
    return () => {
      controller.abort();
      dispose?.();
    };
  }, [file]);
  return (
    <UtilityShell
      title="360° 全景图预览"
      description="加载等距柱状全景图片，拖动视角、滚轮缩放，查看完整空间。"
    >
      <LocalUpload
        accept="image/png,image/jpeg,image/webp"
        hint="约 2:1 全景图 · 最大 100 MB · 最多 100 MP · 需要 WebGL"
        onFiles={(files) => {
          setBusy(true);
          setError("");
          setFile(files[0]);
        }}
      />
      <section className="utility-panel utility-controls">
        <label className="utility-range-control">
          <span>
            视野角度（越小越放大）<output>{Math.round(fov)}°</output>
          </span>
          <input
            aria-label="全景视野角度"
            type="range"
            min="25"
            max="100"
            value={fov}
            disabled={busy || !file || !!error}
            onChange={(e) => {
              const next = Number(e.target.value);
              setFov(next);
              api.current?.fov(next);
            }}
          />
        </label>
        <div className="utility-actions">
          <button
            type="button"
            disabled={busy || !file}
            onClick={() => api.current?.reset()}
          >
            重置视角
          </button>
          <button
            type="button"
            disabled={busy || !file}
            onClick={async () => {
              try {
                if (!stage.current?.requestFullscreen)
                  throw new Error("当前浏览器不支持此全屏方式。");
                await stage.current.requestFullscreen();
              } catch (cause) {
                setError((cause as Error).message);
              }
            }}
          >
            全屏预览
          </button>
        </div>
        <p className="utility-muted">
          鼠标或单指拖动视角，使用滚轮或视野滑块缩放。这里只预览图片，不改变文件。
        </p>
      </section>
      <div
        ref={stage}
        className="panorama-stage"
        aria-label="360 度全景预览区域"
      >
        {!file && <p>选择全景图片开始预览</p>}
      </div>
      {busy && (
        <p className="utility-muted" role="status">
          正在加载全景图片…
        </p>
      )}
      {error && (
        <p className="utility-error" role="alert">
          {error}
        </p>
      )}
    </UtilityShell>
  );
}
