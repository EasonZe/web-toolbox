export type ChannelSource = {
  pixels: Uint8ClampedArray | null;
  channel: number | "luma";
  invert: boolean;
  constant: number;
};
export function packTextureChannels(
  width: number,
  height: number,
  channels: ChannelSource[],
) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 4096 ||
    height > 4096 ||
    width * height > 16_777_216 ||
    channels.length !== 4
  )
    throw new Error("输出尺寸须为 1–4096 像素。");
  const result = new Uint8ClampedArray(width * height * 4);
  channels.forEach((source, index) => {
    if (
      (source.pixels && source.pixels.length !== result.length) ||
      ![0, 1, 2, 3, "luma"].includes(source.channel) ||
      !Number.isFinite(source.constant) ||
      source.constant < 0 ||
      source.constant > 255
    )
      throw new Error("通道数据无效。");
    for (let pixel = 0; pixel < width * height; pixel++) {
      const offset = pixel * 4,
        p = source.pixels;
      const value = p
        ? source.channel === "luma"
          ? p[offset] * 0.2126 + p[offset + 1] * 0.7152 + p[offset + 2] * 0.0722
          : p[offset + source.channel]
        : source.constant;
      result[offset + index] = source.invert ? 255 - value : value;
    }
  });
  return result;
}
export function heightToNormal(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  strength: number,
  flipX: boolean,
  flipY: boolean,
  wrap = true,
) {
  if (
    pixels.length !== width * height * 4 ||
    width < 1 ||
    height < 1 ||
    width * height > 16_777_216 ||
    !Number.isFinite(strength) ||
    strength < 0.1 ||
    strength > 20
  )
    throw new Error("高度图尺寸或强度无效。");
  const heights = new Float32Array(width * height),
    output = new Uint8ClampedArray(pixels.length);
  for (let i = 0; i < heights.length; i++)
    heights[i] =
      (pixels[i * 4] * 0.2126 +
        pixels[i * 4 + 1] * 0.7152 +
        pixels[i * 4 + 2] * 0.0722) /
      255;
  const sample = (x: number, y: number) =>
    heights[
      (wrap ? (y + height) % height : Math.max(0, Math.min(height - 1, y))) *
        width +
        (wrap ? (x + width) % width : Math.max(0, Math.min(width - 1, x)))
    ];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const dx =
        ((sample(x + 1, y - 1) +
          2 * sample(x + 1, y) +
          sample(x + 1, y + 1) -
          sample(x - 1, y - 1) -
          2 * sample(x - 1, y) -
          sample(x - 1, y + 1)) *
          strength) /
        8;
      const dy =
        ((sample(x - 1, y + 1) +
          2 * sample(x, y + 1) +
          sample(x + 1, y + 1) -
          sample(x - 1, y - 1) -
          2 * sample(x, y - 1) -
          sample(x + 1, y - 1)) *
          strength) /
        8;
      const nx = (flipX ? 1 : -1) * dx,
        ny = (flipY ? 1 : -1) * dy,
        norm = Math.hypot(nx, ny, 1),
        offset = (y * width + x) * 4;
      output[offset] = ((nx / norm) * 0.5 + 0.5) * 255;
      output[offset + 1] = ((ny / norm) * 0.5 + 0.5) * 255;
      output[offset + 2] = ((1 / norm) * 0.5 + 0.5) * 255;
      output[offset + 3] = 255;
    }
  return output;
}
