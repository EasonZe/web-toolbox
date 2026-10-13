import { parse } from "@plussub/srt-vtt-parser";
export type SubtitleCue = {
  id: string;
  from: number;
  to: number;
  text: string;
};
export function parseSubtitles(text: string): SubtitleCue[] {
  if (text.length > 1_000_000) throw new Error("字幕最多 100 万字符。");
  const clean = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const timingLines = clean.split("\n").filter((line) => line.includes("-->"));
  const validTime = /^(?:\d{2,}:)?[0-5]\d:[0-5]\d[,.]\d{3}$/;
  for (const line of timingLines) {
    const sides = line.trim().split(/\s*-->\s*/);
    if (
      sides.length !== 2 ||
      !validTime.test(sides[0]) ||
      !validTime.test(sides[1].split(/\s/)[0])
    )
      throw new Error(
        "字幕时间格式无效，请使用 HH:MM:SS,mmm 或 HH:MM:SS.mmm。",
      );
  }
  let cues: SubtitleCue[];
  try {
    cues = parse(clean).entries;
  } catch {
    throw new Error("字幕格式无效，请检查时间行与分段。");
  }
  if (!cues.length || cues.length > 2000)
    throw new Error("请选择包含 1–2000 条有效字幕的 SRT 或 VTT 文件。");
  // Upstream parsers can skip malformed blocks. Never silently drop a cue.
  if (timingLines.length !== cues.length)
    throw new Error("部分字幕时间格式无效，请修正后重新导入。");
  cues.forEach(validateCue);
  return cues;
}
export function validateCue(cue: SubtitleCue) {
  if (
    !Number.isSafeInteger(cue.from) ||
    !Number.isSafeInteger(cue.to) ||
    cue.from < 0 ||
    cue.to <= cue.from ||
    cue.to > 99 * 3600000 ||
    cue.text.length > 20000 ||
    !cue.text.trim()
  )
    throw new Error("字幕须有文字，起止时间须有效且结束晚于开始。");
}
export function shiftSubtitles(cues: SubtitleCue[], milliseconds: number) {
  if (!Number.isSafeInteger(milliseconds))
    throw new Error("时间偏移须为整数毫秒。");
  return cues.map((cue) => {
    const next = {
      ...cue,
      from: cue.from + milliseconds,
      to: cue.to + milliseconds,
    };
    validateCue(next);
    return next;
  });
}
export function subtitleTimestamp(milliseconds: number, format: "srt" | "vtt") {
  const h = Math.floor(milliseconds / 3600000),
    m = Math.floor(milliseconds / 60000) % 60,
    s = Math.floor(milliseconds / 1000) % 60,
    ms = milliseconds % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}${format === "srt" ? "," : "."}${String(ms).padStart(3, "0")}`;
}
export function serializeSubtitles(cues: SubtitleCue[], format: "srt" | "vtt") {
  if (!cues.length) throw new Error("没有可导出的字幕。");
  return `${format === "vtt" ? "WEBVTT\n\n" : ""}${cues
    .map((cue, i) => {
      validateCue(cue);
      if (/\n\s*\n/.test(cue.text) || cue.text.includes("-->"))
        throw new Error("字幕正文不能含空行或时间分隔符。");
      return `${i + 1}\n${subtitleTimestamp(cue.from, format)} --> ${subtitleTimestamp(cue.to, format)}\n${cue.text}`;
    })
    .join("\n\n")}\n`;
}
