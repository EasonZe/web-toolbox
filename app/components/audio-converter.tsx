"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import {
  FiDownload,
  FiFile,
  FiHeadphones,
  FiMusic,
  FiRefreshCw,
  FiUploadCloud,
} from "react-icons/fi";
import { FileDropZone } from "./file-drop-zone";

type OutputFormat = "wav" | "mp3" | "m4a" | "ogg" | "webm";
type ChannelMode = "mono" | "stereo";

type AudioMetadata = {
  duration: number;
  sampleRate: number;
  channels: number;
  codec: string;
};

type AudioResult = AudioMetadata & {
  url: string;
  size: number;
  name: string;
  label: string;
};

const outputFormats: Array<{
  value: OutputFormat;
  label: string;
  detail: string;
}> = [
  { value: "wav", label: "WAV", detail: "无损 PCM" },
  { value: "mp3", label: "MP3", detail: "兼容性好" },
  { value: "m4a", label: "M4A", detail: "AAC 音频" },
  { value: "ogg", label: "OGG", detail: "Opus 编码" },
  { value: "webm", label: "WebM", detail: "Opus 编码" },
];

const codecNames: Record<string, string> = {
  aac: "AAC",
  opus: "Opus",
  mp3: "MP3",
  vorbis: "Vorbis",
  flac: "FLAC",
  "pcm-s16": "PCM",
  "pcm-s24": "PCM",
  "pcm-s32": "PCM",
  "pcm-f32": "PCM",
};

let mp3EncoderRegistered = false;

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds)) return "0:00";
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainder = totalSeconds % 60;

  if (hours) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${remainder
      .toString()
      .padStart(2, "0")}`;
  }
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function describeConversionError(reason?: string) {
  if (reason === "undecodable_source_codec") {
    return "当前浏览器无法解码这个音频编码，请换用Chrome或Edge重试";
  }
  if (reason === "no_encodable_target_codec") {
    return "当前浏览器不支持所选输出格式，请改选WAV或MP3";
  }
  if (reason === "unknown_source_codec") {
    return "无法识别原音频编码，请更换文件";
  }
  return "音频格式转换失败，请更换输出格式后重试";
}

export default function AudioConverter() {
  const sourceUrlRef = useRef("");
  const resultUrlRef = useRef("");
  const [file, setFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [metadata, setMetadata] = useState<AudioMetadata | null>(null);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("mp3");
  const [sampleRate, setSampleRate] = useState(44100);
  const [channelMode, setChannelMode] = useState<ChannelMode>("stereo");
  const [bitrate, setBitrate] = useState(192);
  const [reading, setReading] = useState(false);
  const [converting, setConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<AudioResult | null>(null);

  useEffect(() => {
    return () => {
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    };
  }, []);

  function clearResult() {
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    resultUrlRef.current = "";
    setResult(null);
    setProgress(0);
    setStatus("");
  }

  async function handleFileChange(selectedFile: File) {
    const looksLikeAudio =
      selectedFile.type.startsWith("audio/") ||
      /\.(mp3|wav|m4a|aac|ogg|oga|opus|webm|flac)$/i.test(selectedFile.name);
    if (!looksLikeAudio) {
      setMessage("请选择常见的音频文件。");
      return;
    }
    if (selectedFile.size > 500 * 1024 * 1024) {
      setMessage("音频文件不能超过500 MB。");
      return;
    }

    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    clearResult();

    const nextSourceUrl = URL.createObjectURL(selectedFile);
    sourceUrlRef.current = nextSourceUrl;
    setFile(selectedFile);
    setSourceUrl(nextSourceUrl);
    setMetadata(null);
    setReading(true);
    setMessage("");

    let input: { dispose: () => void } | null = null;

    try {
      const { ALL_FORMATS, BlobSource, Input } = await import("mediabunny");
      const mediaInput = new Input({
        source: new BlobSource(selectedFile),
        formats: ALL_FORMATS,
      });
      input = mediaInput;

      const track = await mediaInput.getPrimaryAudioTrack();
      if (!track) throw new Error("文件中没有可识别的音频轨道");

      const [duration, sourceSampleRate, channels, codec, canDecode] =
        await Promise.all([
          mediaInput.computeDuration([track]),
          track.getSampleRate(),
          track.getNumberOfChannels(),
          track.getCodec(),
          track.canDecode(),
        ]);

      if (!canDecode) {
        throw new Error("当前浏览器无法解码这个音频编码");
      }

      setMetadata({
        duration,
        sampleRate: sourceSampleRate,
        channels,
        codec: codec ? (codecNames[codec] ?? codec.toUpperCase()) : "未知",
      });
      setSampleRate(sourceSampleRate >= 48000 ? 48000 : 44100);
      setChannelMode(channels === 1 ? "mono" : "stereo");
    } catch (error) {
      setMetadata(null);
      setMessage(
        error instanceof Error
          ? `${error.message}。请更换文件或浏览器后重试。`
          : "无法读取这个音频文件。",
      );
    } finally {
      input?.dispose();
      setReading(false);
    }
  }

  async function handleConvert(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !metadata) {
      setMessage("请先选择一个可以读取的音频文件。");
      return;
    }

    clearResult();
    setConverting(true);
    setStatus("正在准备转换…");
    setProgress(3);
    setMessage("");

    let input: { dispose: () => void } | null = null;

    try {
      const media = await import("mediabunny");
      const targetChannels = channelMode === "mono" ? 1 : 2;
      const targetSampleRate =
        outputFormat === "ogg" || outputFormat === "webm"
          ? 48000
          : sampleRate;
      const targetBitrate = bitrate * 1000;

      if (outputFormat === "mp3" && !mp3EncoderRegistered) {
        if (
          !(await media.canEncodeAudio("mp3", {
            numberOfChannels: targetChannels,
            sampleRate: targetSampleRate,
            bitrate: targetBitrate,
          }))
        ) {
          const { registerMp3Encoder } = await import(
            "@mediabunny/mp3-encoder"
          );
          registerMp3Encoder();
        }
        mp3EncoderRegistered = true;
      }

      const configuration =
        outputFormat === "wav"
          ? {
              format: new media.WavOutputFormat(),
              codec: "pcm-s16" as const,
              extension: "wav",
              mimeType: "audio/wav",
              label: "WAV",
            }
          : outputFormat === "mp3"
            ? {
                format: new media.Mp3OutputFormat(),
                codec: "mp3" as const,
                extension: "mp3",
                mimeType: "audio/mpeg",
                label: "MP3",
              }
            : outputFormat === "m4a"
              ? {
                  format: new media.Mp4OutputFormat(),
                  codec: "aac" as const,
                  extension: "m4a",
                  mimeType: "audio/mp4",
                  label: "M4A",
                }
              : outputFormat === "ogg"
                ? {
                    format: new media.OggOutputFormat(),
                    codec: "opus" as const,
                    extension: "ogg",
                    mimeType: "audio/ogg",
                    label: "OGG",
                  }
                : {
                    format: new media.WebMOutputFormat(),
                    codec: "opus" as const,
                    extension: "webm",
                    mimeType: "audio/webm",
                    label: "WebM",
                  };

      const encodable = await media.canEncodeAudio(configuration.codec, {
        numberOfChannels: targetChannels,
        sampleRate: targetSampleRate,
        bitrate:
          configuration.codec === "pcm-s16" ? undefined : targetBitrate,
      });
      if (!encodable) {
        throw new Error("当前浏览器不支持所选输出格式，请改选WAV或MP3");
      }

      const mediaInput = new media.Input({
        source: new media.BlobSource(file),
        formats: media.ALL_FORMATS,
      });
      input = mediaInput;
      const target = new media.BufferTarget();
      const output = new media.Output({
        format: configuration.format,
        target,
      });

      setStatus("正在分析音频轨道…");
      setProgress(8);
      const conversion = await media.Conversion.init({
        input: mediaInput,
        output,
        tracks: "primary",
        video: { discard: true },
        audio: {
          codec: configuration.codec,
          bitrate:
            configuration.codec === "pcm-s16" ? undefined : targetBitrate,
          numberOfChannels: targetChannels,
          sampleRate: targetSampleRate,
          sampleFormat: "s16",
          forceTranscode: true,
        },
        showWarnings: false,
      });

      if (!conversion.isValid) {
        throw new Error(
          describeConversionError(conversion.discardedTracks[0]?.reason),
        );
      }

      conversion.onProgress = (nextProgress) => {
        setStatus("正在转换音频格式…");
        setProgress(Math.min(99, Math.max(8, Math.round(nextProgress * 100))));
      };
      await conversion.execute();

      if (!target.buffer) throw new Error("没有生成音频文件");
      const blob = new Blob([target.buffer], { type: configuration.mimeType });
      const resultUrl = URL.createObjectURL(blob);
      const baseName = file.name.replace(/\.[^.]+$/, "") || "converted-audio";
      const name = `${baseName}.${configuration.extension}`;

      resultUrlRef.current = resultUrl;
      setResult({
        url: resultUrl,
        size: blob.size,
        name,
        label: configuration.label,
        duration: metadata.duration,
        sampleRate: targetSampleRate,
        channels: targetChannels,
        codec: configuration.codec,
      });
      setStatus("转换完成");
      setProgress(100);
    } catch (error) {
      setStatus("");
      setProgress(0);
      setMessage(
        error instanceof Error
          ? `${error.message}。`
          : "音频格式转换失败，请更换格式后重试。",
      );
    } finally {
      input?.dispose();
      setConverting(false);
    }
  }

  const selectedFormat =
    outputFormats.find((option) => option.value === outputFormat) ??
    outputFormats[0];

  return (
    <main className="tool-shell audio-converter-shell">
      <Link className="back-link" href="/">
        <span aria-hidden="true">←</span> Eason的工具箱
      </Link>

      <header className="tool-header audio-converter-header">
        <h1>音频格式转换工具</h1>
        <p>转换音频格式并调整采样率、声道与码率。</p>
      </header>

      <section
        className="converter-card audio-converter-card"
        aria-label="音频格式转换"
        aria-busy={reading || converting}
      >
        <FileDropZone
          className="video-file-picker audio-converter-picker"
          accept="audio/*,.flac,.ogg,.oga,.opus,.m4a,.aac"
          disabled={reading || converting}
          onFile={handleFileChange}
          ariaLabel="选择或拖入音频"
        >
          <FiUploadCloud aria-hidden="true" />
          <strong>
            {reading
              ? "正在读取音频…"
              : file
                ? "重新选择音频"
                : "选择音频"}
          </strong>
          <span>
            点击选择或拖入音频，支持MP3、WAV、M4A/AAC、OGG、Opus、FLAC、WebM等格式
          </span>
        </FileDropZone>

        <section
          className={`audio-converter-source${file && sourceUrl ? "" : " is-empty"}`}
          aria-label="原音频"
        >
          {file && sourceUrl ? (
            <>
            <div className="audio-converter-file-icon" aria-hidden="true">
              <FiMusic />
            </div>
            <div className="audio-converter-file-copy">
              <strong>{file.name}</strong>
              <span>
                {formatFileSize(file.size)}
                {metadata
                  ? ` · ${formatDuration(metadata.duration)} · ${metadata.codec}`
                  : " · 正在读取"}
              </span>
            </div>
            <audio src={sourceUrl} controls preload="metadata" />
            </>
          ) : (
            <div className="file-tool-empty audio-source-empty">
              <FiMusic aria-hidden="true" />
              <strong>音频预览</strong>
              <span>选择音频后在这里试听原音频</span>
            </div>
          )}
        </section>

        <form className="audio-converter-form" onSubmit={handleConvert}>
            <div className="audio-converter-workbench">
              <section
                className="audio-converter-format-panel"
                aria-labelledby="audio-format-title"
              >
                <div className="audio-converter-section-heading">
                  <div>
                    <h2 id="audio-format-title">目标格式</h2>
                    <p>选择转换后下载的音频格式</p>
                  </div>
                  <FiFile aria-hidden="true" />
                </div>

                <div className="audio-format-options">
                  {outputFormats.map((option) => (
                    <button
                      className={
                        outputFormat === option.value ? "is-selected" : ""
                      }
                      type="button"
                      key={option.value}
                      onClick={() => {
                        setOutputFormat(option.value);
                        clearResult();
                      }}
                      aria-pressed={outputFormat === option.value}
                      disabled={converting || !metadata}
                    >
                      <strong>{option.label}</strong>
                      <span>{option.detail}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section
                className="audio-converter-settings"
                aria-labelledby="audio-settings-title"
              >
                <h2 id="audio-settings-title">转换设置</h2>

                <div className="audio-converter-setting-grid">
                  <label>
                    <span>采样率</span>
                    <select
                      value={
                        outputFormat === "ogg" || outputFormat === "webm"
                          ? 48000
                          : sampleRate
                      }
                      disabled={
                        converting ||
                        !metadata ||
                        outputFormat === "ogg" ||
                        outputFormat === "webm"
                      }
                      onChange={(event) =>
                        setSampleRate(Number(event.target.value))
                      }
                    >
                      <option value="44100">44.1 kHz</option>
                      <option value="48000">48 kHz</option>
                    </select>
                  </label>

                  <label>
                    <span>声道</span>
                    <select
                      value={channelMode}
                      disabled={converting || !metadata}
                      onChange={(event) =>
                        setChannelMode(event.target.value as ChannelMode)
                      }
                    >
                      <option value="stereo">立体声</option>
                      <option value="mono">单声道</option>
                    </select>
                  </label>

                  {outputFormat !== "wav" ? (
                    <label className="audio-converter-bitrate">
                      <span>音频码率</span>
                      <select
                        value={bitrate}
                        disabled={converting || !metadata}
                        onChange={(event) =>
                          setBitrate(Number(event.target.value))
                        }
                      >
                        <option value="128">128 kbps</option>
                        <option value="192">192 kbps</option>
                        <option value="256">256 kbps</option>
                        <option value="320">320 kbps</option>
                      </select>
                    </label>
                  ) : null}
                </div>

                <p className="audio-converter-note">
                  M4A、OGG与WebM可用性取决于浏览器编码支持；WAV和MP3兼容性最佳。
                  MP3编码由{" "}
                  <a
                    href="https://lame.sourceforge.io/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    LAME
                  </a>{" "}
                  提供。
                </p>

                <button
                  className="convert-button audio-converter-submit"
                  type="submit"
                  disabled={converting || !metadata}
                >
                  <FiRefreshCw aria-hidden="true" />
                  {converting
                    ? "正在转换…"
                    : `转换为${selectedFormat.label}`}
                </button>
              </section>
            </div>
        </form>

        {status ? (
          <div className="video-gif-progress" role="status" aria-live="polite">
            <div>
              <span>{status}</span>
              <strong>{progress}%</strong>
            </div>
            <progress max="100" value={progress}>
              {progress}%
            </progress>
          </div>
        ) : null}

        {message ? (
          <p className="message" role="alert">
            {message}
          </p>
        ) : null}

        <section
          className="audio-converter-result"
          aria-labelledby="audio-converter-result-title"
        >
            <div className="video-gif-result-header">
              <div>
                <h2 id="audio-converter-result-title">转换结果</h2>
                {result ? (
                  <span>
                    {result.label} · {formatFileSize(result.size)} ·{" "}
                    {formatDuration(result.duration)} ·{" "}
                    {(result.sampleRate / 1000).toFixed(1)} kHz ·{" "}
                    {result.channels === 1 ? "单声道" : "立体声"}
                  </span>
                ) : <span>等待转换</span>}
              </div>
              {result ? (
                <a
                  className="gif-download-button"
                  href={result.url}
                  download={result.name}
                >
                  <FiDownload aria-hidden="true" />
                  下载{result.label}
                </a>
              ) : null}
            </div>
            {result ? (
              <div className="audio-player-panel">
                <FiHeadphones aria-hidden="true" />
                <audio src={result.url} controls preload="metadata" />
              </div>
            ) : (
              <div className="file-tool-empty result-preview-empty">
                <FiHeadphones aria-hidden="true" />
                <strong>转换后的音频会显示在这里</strong>
                <span>选择音频并完成转换后即可试听</span>
              </div>
            )}
        </section>
      </section>
    </main>
  );
}
