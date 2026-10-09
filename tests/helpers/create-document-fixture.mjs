// Generate a non-private DOCX for manual browser conversion checks.
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Document, Packer, Paragraph } from "docx";

const folder = await mkdtemp(join(tmpdir(), "toolbox-document-regression-"));
const path = join(folder, "中文文档回归.docx");
const document = new Document({ sections: [{ children: [
  new Paragraph("中文文档安全回归"),
  new Paragraph('正文示例：<script>alert("test")</script>'),
] }] });
await writeFile(path, await Packer.toBuffer(document));
console.log(path);
