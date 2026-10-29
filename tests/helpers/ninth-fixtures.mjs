import gifenc from "gifenc";
const { GIFEncoder } = gifenc;
export const gifPalette = [[0, 0, 255], [255, 0, 0], [0, 255, 0], [255, 255, 0]];
// Independent encoder creates compressed image blocks; fixtures place patches and GCE explicitly.
export function makeGif(frames, { width = 3, height = 1, background = 0 } = {}) {
  let prefix;
  const chunks = [];
  for (const frame of frames) {
    const encoder = GIFEncoder();
    encoder.writeFrame(new Uint8Array(frame.pixels), frame.width ?? frame.pixels.length, frame.height ?? 1, { palette: frame.palette ?? gifPalette, repeat: -1, delay: frame.delay ?? 0, dispose: frame.dispose ?? 1, transparent: frame.transparent !== undefined, transparentIndex: frame.transparent ?? 0 });
    encoder.finish(); const bytes = encoder.bytes();
    const paletteBytes = 3 * 2 ** ((bytes[10] & 7) + 1), start = 13 + paletteBytes;
    if (!prefix) { prefix = bytes.slice(0, start); new DataView(prefix.buffer).setUint16(6, width, true); new DataView(prefix.buffer).setUint16(8, height, true); prefix[11] = background; }
    // Preserve each frame's own palette by moving its global palette to a local palette.
    const gce = bytes.slice(start, start + 8), descriptor = bytes.slice(start + 8, start + 18);
    new DataView(descriptor.buffer).setUint16(1, frame.left ?? 0, true); new DataView(descriptor.buffer).setUint16(3, frame.top ?? 0, true); descriptor[9] = 0x80 | bytes[10] & 7 | (frame.interlaced ? 0x40 : 0);
    chunks.push(gce);
    if (frame.comment) chunks.push(new Uint8Array([0x21, 0xfe, 1, 65, 0]));
    if (frame.application) chunks.push(new Uint8Array([0x21, 0xff, 11, ...new TextEncoder().encode("TESTAPP0001"), 0]));
    chunks.push(descriptor, bytes.slice(13, start), bytes.slice(start + 18, -1));
  }
  return new Uint8Array(Buffer.concat([prefix, ...chunks, new Uint8Array([0x3b])]));
}
