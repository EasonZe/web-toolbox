"use client";
import { useEffect, useRef, useState } from "react";
import type * as Three from "three";
function dispose(root: Three.Object3D) {
  root.traverse((child) => {
    const mesh = child as Three.Mesh;
    mesh.geometry?.dispose();
    const materials = mesh.material ? Array.isArray(mesh.material) ? mesh.material : [mesh.material] : [];
    for (const material of materials) { for (const value of Object.values(material)) if (value && typeof value === "object" && "isTexture" in value) (value as Three.Texture).dispose(); material.dispose(); }
  });
}
export default function UnityModelPreview({ blob, name }: { blob: Blob; name: string }) {
  const host = useRef<HTMLDivElement>(null), [error, setError] = useState(""), [info, setInfo] = useState("正在读取模型…");
  useEffect(() => {
    let cancelled = false, cleanup: (() => void) | undefined;
    const container = host.current;
    if (!container) return;
    void (async () => {
      const [THREE, { OrbitControls }] = await Promise.all([import("three"), import("three/addons/controls/OrbitControls.js")]);
      if (cancelled) return;
      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(40, 1, .01, 100000);
      const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true;
      const light = new THREE.HemisphereLight(0xffffff, 0x596c80, 3); scene.add(light);
      const fill = new THREE.DirectionalLight(0xffffff, 3); fill.position.set(3, 5, 4); scene.add(fill);
      const manager = new THREE.LoadingManager();
      // No model-controlled network requests: this preview renders raw geometry.
      manager.setURLModifier((url) => /^(data:|blob:)/i.test(url) ? url : "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==");
      let root: Three.Object3D | undefined;
      const observer = new ResizeObserver(() => { const w = container.clientWidth, h = container.clientHeight; if (w && h) { renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); } });
      container.append(renderer.domElement); observer.observe(container);
      cleanup = () => { renderer.setAnimationLoop(null); observer.disconnect(); controls.dispose(); dispose(scene); if (root && !root.parent) dispose(root); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); };
      try {
        const data = await blob.arrayBuffer();
        if (cancelled) return;
        if (/\.fbx$/i.test(name)) { const { FBXLoader } = await import("three/addons/loaders/FBXLoader.js"); root = new FBXLoader(manager).parse(data, ""); }
        else if (/\.obj$/i.test(name)) { const { OBJLoader } = await import("three/addons/loaders/OBJLoader.js"); root = new OBJLoader(manager).parse(new TextDecoder().decode(data)); }
        else if (/\.stl$/i.test(name)) { const { STLLoader } = await import("three/addons/loaders/STLLoader.js"); root = new THREE.Mesh(new STLLoader(manager).parse(data), new THREE.MeshStandardMaterial({ color: 0xb5ced8 })); }
        else { const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js"); root = (await new GLTFLoader(manager).parseAsync(data, "")).scene; }
        if (cancelled) { dispose(root); root = undefined; return; }
        const box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
        const edge = Math.max(size.x, size.y, size.z);
        if (!Number.isFinite(edge) || edge <= 0) throw new Error("模型中没有可显示的几何体。");
        root.position.sub(center).multiplyScalar(2 / edge); root.scale.multiplyScalar(2 / edge); scene.add(root);
        const grid = new THREE.GridHelper(5, 10, 0x8398a2, 0xbdcbd0); grid.position.y = -size.y / edge; scene.add(grid);
        camera.position.set(3.2, 2.4, 3.6); controls.target.set(0, 0, 0); controls.update();
        let triangles = 0;
        root.traverse((child) => { const geometry = (child as Three.Mesh).geometry; if (geometry) triangles += (geometry.index?.count ?? geometry.attributes.position?.count ?? 0) / 3; });
        setInfo(`${Math.round(triangles).toLocaleString("zh-CN")} 个三角面 · 拖动旋转，滚轮或双指缩放`);
        renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
      } catch (cause) { cleanup(); cleanup = undefined; if (!cancelled) setError(cause instanceof Error ? cause.message : "模型预览失败。"); }
    })().catch(() => { cleanup?.(); cleanup = undefined; if (!cancelled) setError("无法初始化 3D 预览，请确认浏览器支持 WebGL。"); });
    return () => { cancelled = true; cleanup?.(); };
  }, [blob, name]);
  return <div><div ref={host} className="unity-model-stage" aria-label="模型三维预览" />{error ? <p role="alert" className="utility-error">{error}</p> : <p className="utility-muted">{info}</p>}</div>;
}
