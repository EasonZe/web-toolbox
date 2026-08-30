export type VideoOutputFormat = "mp4" | "webm" | "mov" | "mkv";
export type VideoResolution = "original" | "2160" | "1080" | "720" | "480";
export type VideoFrameRate = "original" | "60" | "30" | "24";

export const maxVideoConversionFileSize = 500 * 1024 * 1024;

export const videoOutputProfiles = {
  mp4: {
    label: "MP4",
    detail: "H.264 / AAC",
    extension: "mp4",
    mimeType: "video/mp4",
    videoCodecs: ["avc"] as const,
    audioCodec: "aac" as const,
  },
  webm: {
    label: "WebM",
    detail: "VP9 / Opus",
    extension: "webm",
    mimeType: "video/webm",
    videoCodecs: ["vp9", "vp8"] as const,
    audioCodec: "opus" as const,
  },
  mov: {
    label: "MOV",
    detail: "H.264 / AAC",
    extension: "mov",
    mimeType: "video/quicktime",
    videoCodecs: ["avc"] as const,
    audioCodec: "aac" as const,
  },
  mkv: {
    label: "MKV",
    detail: "VP9 / Opus",
    extension: "mkv",
    mimeType: "video/x-matroska",
    videoCodecs: ["vp9", "vp8"] as const,
    audioCodec: "opus" as const,
  },
} as const;

const videoExtensions = /\.(mp4|m4v|mov|webm|mkv|ogv|ogg|avi|mpeg|mpg|ts|mts|m2ts)$/i;

export function validateVideoConversionFile(file: File) {
  if (!(file.type.startsWith("video/") || videoExtensions.test(file.name))) {
    return "请选择常见的视频文件";
  }
  if (file.size === 0) return "视频文件为空";
  if (file.size > maxVideoConversionFileSize) return "视频文件不能超过500 MB";
  return "";
}

function even(value: number) {
  return Math.max(2, Math.round(value / 2) * 2);
}

export function calculateVideoDimensions(
  width: number,
  height: number,
  resolution: VideoResolution,
) {
  const sourceWidth = Math.max(2, Math.round(width));
  const sourceHeight = Math.max(2, Math.round(height));
  const maximumLongEdge = {
    original: Infinity,
    "2160": 3840,
    "1080": 1920,
    "720": 1280,
    "480": 854,
  } satisfies Record<VideoResolution, number>;
  const scale = Math.min(1, maximumLongEdge[resolution] / Math.max(sourceWidth, sourceHeight));
  return {
    width: even(sourceWidth * scale),
    height: even(sourceHeight * scale),
  };
}

export function calculateVideoFrameRate(
  sourceFrameRate: number,
  frameRate: VideoFrameRate,
) {
  const source = Number.isFinite(sourceFrameRate) && sourceFrameRate > 0
    ? sourceFrameRate
    : 30;
  return frameRate === "original" ? source : Math.min(source, Number(frameRate));
}

export function calculateVideoBitrate(
  width: number,
  height: number,
  frameRate: number,
  quality: number,
) {
  const normalizedQuality = Math.min(100, Math.max(20, quality));
  const bitsPerPixel = 0.025 + normalizedQuality / 100 * 0.11;
  return Math.round(Math.min(
    30_000_000,
    Math.max(450_000, width * height * frameRate * bitsPerPixel),
  ));
}

export function createVideoConversionPlan(options: {
  sourceWidth: number;
  sourceHeight: number;
  sourceFrameRate: number;
  duration: number;
  resolution: VideoResolution;
  frameRate: VideoFrameRate;
  quality: number;
  keepAudio: boolean;
  hasAudio: boolean;
}) {
  const dimensions = calculateVideoDimensions(
    options.sourceWidth,
    options.sourceHeight,
    options.resolution,
  );
  const targetFrameRate = calculateVideoFrameRate(options.sourceFrameRate, options.frameRate);
  const videoBitrate = calculateVideoBitrate(
    dimensions.width,
    dimensions.height,
    targetFrameRate,
    options.quality,
  );
  const audioBitrate = options.keepAudio && options.hasAudio ? 160_000 : 0;
  return {
    ...dimensions,
    frameRate: targetFrameRate,
    videoBitrate,
    audioBitrate,
    estimatedSize: (videoBitrate + audioBitrate) * Math.max(0, options.duration) / 8,
  };
}

export function createConvertedVideoName(name: string, format: VideoOutputFormat) {
  const baseName = name.replace(/\.[^.]+$/, "") || "converted-video";
  return `${baseName}-converted.${videoOutputProfiles[format].extension}`;
}
