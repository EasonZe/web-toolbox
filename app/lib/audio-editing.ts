export type AudioClip = {
  channels: Float32Array[];
  sampleRate: number;
  start: number;
  end: number;
  fadeIn: number;
  fadeOut: number;
};
export function composeAudio(clips: AudioClip[]) {
  if (!clips.length || clips.length > 20)
    throw new Error("请选择 1–20 段音频。");
  const sampleRate = clips[0].sampleRate,
    channels = Math.min(
      2,
      Math.max(...clips.map((clip) => clip.channels.length)),
    );
  let total = 0;
  const ranges = clips.map((clip) => {
    const duration = clip.channels[0]?.length / sampleRate;
    if (
      clip.sampleRate !== sampleRate ||
      !channels ||
      clip.channels.some((data) => data.length !== clip.channels[0].length) ||
      ![clip.start, clip.end, clip.fadeIn, clip.fadeOut].every(
        Number.isFinite,
      ) ||
      clip.start < 0 ||
      clip.end > duration + 1 / sampleRate ||
      clip.end <= clip.start ||
      clip.fadeIn < 0 ||
      clip.fadeOut < 0 ||
      clip.fadeIn + clip.fadeOut > clip.end - clip.start
    )
      throw new Error(
        "裁剪区间或淡入淡出时间无效，淡入淡出总时长不能超过片段。",
      );
    const start = Math.round(clip.start * sampleRate),
      end = Math.min(
        clip.channels[0].length,
        Math.round(clip.end * sampleRate),
      );
    if (end <= start) throw new Error("裁剪片段不能为空。");
    total += end - start;
    return {
      start,
      end,
      fadeIn: Math.round(clip.fadeIn * sampleRate),
      fadeOut: Math.round(clip.fadeOut * sampleRate),
    };
  });
  if (total > sampleRate * 600 || total * channels > 30_000_000)
    throw new Error("合并结果不能超过 10 分钟或 3000 万音频采样点。");
  const output = Array.from(
    { length: channels },
    () => new Float32Array(total),
  );
  let offset = 0;
  clips.forEach((clip, i) => {
    const range = ranges[i],
      length = range.end - range.start;
    for (let c = 0; c < channels; c++) {
      const source = clip.channels[Math.min(c, clip.channels.length - 1)];
      for (let n = 0; n < length; n++) {
        const gainIn = range.fadeIn ? Math.min(1, n / range.fadeIn) : 1,
          gainOut = range.fadeOut
            ? Math.min(1, (length - 1 - n) / range.fadeOut)
            : 1;
        output[c][offset + n] =
          source[range.start + n] * Math.min(gainIn, gainOut);
      }
    }
    offset += length;
  });
  return { channels: output, sampleRate, length: total };
}
