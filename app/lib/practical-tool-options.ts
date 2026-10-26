export type CronOptions = { expression: string; timezone: string; from: string; count: number };
export type ImageDiffOptions = { threshold: number; includeAA: boolean; mask: boolean };
export const defaultImageDiffOptions: ImageDiffOptions = { threshold: 0.1, includeAA: false, mask: false };
export type VideoTrimOptions = { start: number; end: number; format: "mp4" | "webm"; resolution: "original" | "2160" | "1080" | "720" | "480"; quality: number; keepAudio: boolean };
export const defaultVideoTrimOptions: VideoTrimOptions = { start: 0, end: 0, format: "mp4", resolution: "original", quality: 80, keepAudio: true };
