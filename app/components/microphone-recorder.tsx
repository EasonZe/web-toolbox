"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FiDownload, FiMic, FiPlay, FiRadio, FiSquare, FiTrash2 } from "react-icons/fi";
import { UtilityShell } from "./utility-shell";

type RecordingResult = {
  url: string;
  name: string;
  size: number;
  mimeType: string;
};

function chooseMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  return ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remainder = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function microphoneError(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") return "麦克风权限被拒绝，请在浏览器设置中允许后重试。";
    if (error.name === "NotFoundError") return "没有检测到可用的麦克风。";
    if (error.name === "NotReadableError") return "麦克风正被其他程序占用，请关闭占用程序后重试。";
    if (error.name === "OverconstrainedError") return "所选麦克风当前不可用，请选择其他设备。";
  }
  return "无法启用麦克风，请检查设备连接和浏览器权限。";
}

export default function MicrophoneRecorder() {
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef(0);
  const timerRef = useRef(0);
  const chunksRef = useRef<Blob[]>([]);
  const resultUrlRef = useRef("");
  const requestingRef = useRef(false);
  const smoothedLevelRef = useRef(0);
  const smoothedWaveRef = useRef<Float32Array | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState("");
  const [echoCancellation, setEchoCancellation] = useState(true);
  const [noiseSuppression, setNoiseSuppression] = useState(true);
  const [autoGainControl, setAutoGainControl] = useState(true);
  const [active, setActive] = useState(false);
  const [recording, setRecording] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [message, setMessage] = useState("点击“开始测试”并允许麦克风权限。");
  const [result, setResult] = useState<RecordingResult | null>(null);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const available = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === "audioinput");
    setDevices(available);
    setSelectedDevice((current) => current && available.some((device) => device.deviceId === current) ? current : available[0]?.deviceId ?? "");
  }, []);

  function stopVisualiser() {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    animationRef.current = 0;
    analyserRef.current = null;
    if (audioContextRef.current) void audioContextRef.current.close().catch(() => {});
    audioContextRef.current = null;
    smoothedLevelRef.current = 0;
    smoothedWaveRef.current = null;
    setLevel(0);
  }

  function releaseMicrophone() {
    stopVisualiser();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setActive(false);
  }

  function drawVisualiser(analyser: AnalyserNode) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const data = new Uint8Array(analyser.fftSize);
    const strokeStyle = getComputedStyle(canvas).getPropertyValue("--ui-accent").trim() || "#4f7890";
    const visualPointCount = 160;
    const smoothedWave = new Float32Array(visualPointCount).fill(0.5);
    smoothedWaveRef.current = smoothedWave;
    let frame = 0;

    const drawFrame = () => {
      if (analyserRef.current !== analyser) return;
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const value of data) {
        const normalized = (value - 128) / 128;
        sum += normalized * normalized;
      }
      const rms = Math.sqrt(sum / data.length);
      const targetLevel = Math.min(100, rms * 260);
      const levelFactor = targetLevel > smoothedLevelRef.current ? 0.16 : 0.06;
      smoothedLevelRef.current += (targetLevel - smoothedLevelRef.current) * levelFactor;
      if (frame++ % 6 === 0) setLevel(Math.round(smoothedLevelRef.current));

      const width = canvas.width;
      const height = canvas.height;
      context.clearRect(0, 0, width, height);
      context.lineWidth = 3;
      context.strokeStyle = strokeStyle;
      context.beginPath();
      const slice = width / (visualPointCount - 1);
      smoothedWave.forEach((previous, index) => {
        const dataIndex = Math.min(data.length - 1, Math.round(index / (visualPointCount - 1) * (data.length - 1)));
        const current = data[dataIndex] / 255;
        const smoothed = previous * 0.82 + current * 0.18;
        smoothedWave[index] = smoothed;
        const pointY = smoothed * height;
        if (index === 0) context.moveTo(0, pointY);
        else context.lineTo(index * slice, pointY);
      });
      context.stroke();
      animationRef.current = requestAnimationFrame(drawFrame);
    };
    drawFrame();
  }

  async function acquireMicrophone() {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("当前浏览器不支持麦克风访问。");
    releaseMicrophone();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: selectedDevice ? { exact: selectedDevice } : undefined,
        echoCancellation,
        noiseSuppression,
        autoGainControl,
      },
    });
    streamRef.current = stream;
    try {
      const AudioContextClass = window.AudioContext;
      const audioContext = new AudioContextClass();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.88;
      audioContext.createMediaStreamSource(stream).connect(analyser);
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      setActive(true);
      setMessage("麦克风工作正常，可观察音量或开始录音。");
      drawVisualiser(analyser);
      void refreshDevices().catch(() => {});
      return stream;
    } catch (error) {
      stopVisualiser();
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      throw error;
    }
  }

  async function startTest() {
    if (requestingRef.current) return;
    requestingRef.current = true;
    setRequesting(true);
    try {
      setMessage("正在请求麦克风权限…");
      await acquireMicrophone();
    } catch (error) {
      releaseMicrophone();
      setMessage(error instanceof Error && !(error instanceof DOMException) ? error.message : microphoneError(error));
    } finally {
      requestingRef.current = false;
      setRequesting(false);
    }
  }

  function clearTimer() {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = 0;
  }

  function finishRecording() {
    const recorder = recorderRef.current;
    const mimeType = recorder?.mimeType || chooseMimeType() || "audio/webm";
    const blob = new Blob(chunksRef.current, { type: mimeType });
    chunksRef.current = [];
    recorderRef.current = null;
    clearTimer();
    setRecording(false);
    if (!blob.size) {
      setMessage("没有录到声音，请确认麦克风输入后重试。");
      return;
    }
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    const url = URL.createObjectURL(blob);
    resultUrlRef.current = url;
    const extension = mimeType.includes("mp4") ? "m4a" : "webm";
    setResult({ url, size: blob.size, mimeType, name: `麦克风录音-${new Date().toISOString().replace(/[:.]/g, "-")}.${extension}` });
    setMessage("录音完成，可以试听或下载。");
  }

  async function startRecording() {
    if (requestingRef.current) return;
    requestingRef.current = true;
    setRequesting(true);
    try {
      const stream = streamRef.current ?? await acquireMicrophone();
      if (typeof MediaRecorder === "undefined") throw new Error("当前浏览器不支持录音功能。");
      const mimeType = chooseMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onerror = () => setMessage("录音过程中发生错误，请重新录制。");
      recorder.onstop = finishRecording;
      recorderRef.current = recorder;
      recorder.start(250);
      setSeconds(0);
      setRecording(true);
      setMessage("正在录音…");
      timerRef.current = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    } catch (error) {
      setMessage(error instanceof Error && !(error instanceof DOMException) ? error.message : microphoneError(error));
    } finally {
      requestingRef.current = false;
      setRequesting(false);
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }

  function stopTest() {
    if (recording) stopRecording();
    releaseMicrophone();
    setMessage(recording ? "已停止麦克风，正在整理录音…" : "麦克风测试已停止。");
  }

  function clearResult() {
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    resultUrlRef.current = "";
    setResult(null);
    setSeconds(0);
    setMessage(active ? "录音已清除，可以重新录制。" : "录音已清除。");
  }

  useEffect(() => {
    const mediaDevices = navigator.mediaDevices;
    const onDeviceChange = () => void refreshDevices().catch(() => {});
    const startupTimer = window.setTimeout(onDeviceChange, 0);
    mediaDevices?.addEventListener?.("devicechange", onDeviceChange);
    return () => {
      window.clearTimeout(startupTimer);
      mediaDevices?.removeEventListener?.("devicechange", onDeviceChange);
      clearTimer();
      if (recorderRef.current) {
        recorderRef.current.onstop = null;
        if (recorderRef.current.state !== "inactive") recorderRef.current.stop();
      }
      stopVisualiser();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    };
  }, [refreshDevices]);

  return (
    <UtilityShell title="麦克风测试与录音工具" description="检查麦克风音量和波形，录制、试听并下载声音。">
      <div className="utility-columns microphone-columns">
        <section className="utility-panel utility-controls" aria-labelledby="microphone-test-title">
          <div className="utility-heading"><h2 id="microphone-test-title">麦克风测试</h2><span className={`microphone-status${active ? " is-active" : ""}`}><i aria-hidden="true" />{active ? recording ? "正在录音" : "正在监听" : "未启用"}</span></div>
          <label>输入设备<select disabled={active || recording} value={selectedDevice} onChange={(event) => setSelectedDevice(event.target.value)}>{devices.length ? devices.map((device, index) => <option value={device.deviceId} key={device.deviceId || index}>{device.label || `麦克风 ${index + 1}`}</option>) : <option value="">默认麦克风</option>}</select></label>
          <div className="microphone-visualizer">
            <canvas ref={canvasRef} width={720} height={180} aria-label="麦克风实时波形" />
            {!active ? <div className="microphone-visualizer-empty"><FiMic aria-hidden="true" /><span>开始测试后显示实时波形</span></div> : null}
          </div>
          <div className="microphone-level" aria-label={`当前音量 ${level}%`}>
            <div><span style={{ width: `${level}%` }} /></div><strong>{level}%</strong>
          </div>
          <div className="utility-actions microphone-main-actions">
            {!active ? <button className="primary-button" type="button" disabled={requesting} onClick={() => void startTest()}><FiPlay aria-hidden="true" />{requesting ? "正在启用…" : "开始测试"}</button> : <button className="primary-button" type="button" onClick={stopTest}><FiSquare aria-hidden="true" />停止测试</button>}
          </div>
          <p className="utility-muted" role="status">{message}</p>
        </section>

        <section className="utility-panel utility-controls" aria-labelledby="microphone-record-title">
          <div className="utility-heading"><h2 id="microphone-record-title">录音</h2><output className="recording-time" aria-label="录音时长">{formatDuration(seconds)}</output></div>
          <fieldset className="microphone-options" disabled={active || recording}>
            <legend>输入处理（下次启动时生效）</legend>
            <label className="utility-checkbox"><input type="checkbox" checked={echoCancellation} onChange={(event) => setEchoCancellation(event.target.checked)} />回声消除</label>
            <label className="utility-checkbox"><input type="checkbox" checked={noiseSuppression} onChange={(event) => setNoiseSuppression(event.target.checked)} />噪声抑制</label>
            <label className="utility-checkbox"><input type="checkbox" checked={autoGainControl} onChange={(event) => setAutoGainControl(event.target.checked)} />自动增益</label>
          </fieldset>
          {!recording ? <button className="primary-button microphone-record-button" type="button" disabled={requesting} onClick={() => void startRecording()}><FiRadio aria-hidden="true" />{requesting ? "正在启用…" : "开始录音"}</button> : <button className="primary-button microphone-record-button is-recording" type="button" onClick={stopRecording}><FiSquare aria-hidden="true" />停止录音</button>}
          <div className="microphone-result">
            <h2>录音结果</h2>
            {result ? <>
              <audio controls src={result.url} aria-label="录音试听" />
              <div className="microphone-result-meta"><span>{result.mimeType.split(";")[0]}</span><span>{(result.size / 1024).toFixed(1)} KB</span></div>
              <div className="utility-actions">
                <a className="primary-button" download={result.name} href={result.url}><FiDownload aria-hidden="true" />下载录音</a>
                <button type="button" onClick={clearResult}><FiTrash2 aria-hidden="true" />清除</button>
              </div>
            </> : <div className="utility-empty compact">完成录音后可在这里试听和下载</div>}
          </div>
          <p className="utility-muted">实际录音格式由浏览器决定，优先使用 Opus WebM，也兼容支持 M4A 的浏览器。</p>
        </section>
      </div>
    </UtilityShell>
  );
}
