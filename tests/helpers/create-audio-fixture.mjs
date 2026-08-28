// Generates a deterministic stereo WAV for manual/browser compression checks.
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const duration = Number(process.argv[2] ?? 8);
if (!Number.isFinite(duration) || duration <= 0 || duration > 300) throw new Error("Duration must be 1–300 seconds.");
const sampleRate = 44100;
const dataSize = Math.floor(sampleRate * duration) * 4;
const wav = Buffer.alloc(44 + dataSize);
wav.write("RIFF", 0); wav.writeUInt32LE(36 + dataSize, 4); wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22);
wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 4, 28);
wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(dataSize, 40);
for (let i = 0; i < dataSize / 4; i++) {
  wav.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * i / sampleRate) * 8000), 44 + i * 4);
  wav.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 660 * i / sampleRate) * 8000), 46 + i * 4);
}
const path = join(tmpdir(), `eason-audio-test-${duration}s.wav`);
await writeFile(path, wav);
console.log(JSON.stringify({ path, bytes: wav.length, duration }));
