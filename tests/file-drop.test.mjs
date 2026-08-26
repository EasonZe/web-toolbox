import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const componentsDirectory = path.join(root, "app", "components");
const dropZoneSource = fs.readFileSync(
  path.join(componentsDirectory, "file-drop-zone.tsx"),
  "utf8",
);

const filePickerComponents = [
  "audio-converter.tsx",
  "background-remover.tsx",
  "image-compressor.tsx",
  "image-converter.tsx",
  "image-line-redraw.tsx",
  "image-watermark.tsx",
  "qr-generator.tsx",
  "qr-reader.tsx",
  "sensitive-redactor.tsx",
  "video-to-audio.tsx",
  "video-compressor.tsx",
  "video-to-gif.tsx",
];

test("shared file drop zone supports click selection and drag-and-drop", () => {
  assert.match(dropZoneSource, /type="file"/);
  assert.match(dropZoneSource, /onChange=/);
  assert.match(dropZoneSource, /onDragEnter=/);
  assert.match(dropZoneSource, /onDragOver=/);
  assert.match(dropZoneSource, /onDragLeave=/);
  assert.match(dropZoneSource, /onDrop=/);
  assert.match(dropZoneSource, /dataTransfer\.files/);
  assert.match(dropZoneSource, /multiple=/);
  assert.match(dropZoneSource, /onFiles/);
  assert.match(dropZoneSource, /is-dragging/);
});

test("every image, video, and audio picker uses the shared drop zone", () => {
  for (const fileName of filePickerComponents) {
    const source = fs.readFileSync(
      path.join(componentsDirectory, fileName),
      "utf8",
    );
    assert.match(source, /<FileDropZone/, `${fileName} does not use FileDropZone`);
    assert.doesNotMatch(
      source,
      /type="file"/,
      `${fileName} still contains a file input without shared drag support`,
    );
  }
});
