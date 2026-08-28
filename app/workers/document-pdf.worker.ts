import pdfMake from "pdfmake/build/pdfmake";
import type { TDocumentDefinitions } from "pdfmake/interfaces";

async function readFont(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("中文字体加载失败，请检查网络后重试。");
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

self.onmessage = async (event: MessageEvent<TDocumentDefinitions>) => {
  try {
    self.postMessage({ type: "progress", percent: 35, message: "正在加载中文字体…" });
    const [normal, bold] = await Promise.all([
      readFont("/fonts/noto-sans-sc/regular.otf"), readFont("/fonts/noto-sans-sc/bold.otf"),
    ]);
    pdfMake.addVirtualFileSystem({ "regular.otf": normal, "bold.otf": bold });
    pdfMake.addFonts({ NotoSC: { normal: "regular.otf", bold: "bold.otf", italics: "regular.otf", bolditalics: "bold.otf" } });
    self.postMessage({ type: "progress", percent: 65, message: "正在生成PDF…" });
    const output = pdfMake.createPdf(event.data) as unknown as { getBlob(): Promise<Blob> };
    const blob = await output.getBlob();
    self.postMessage({ type: "done", blob });
  } catch (error) {
    self.postMessage({ type: "error", message: error instanceof Error ? error.message : "PDF生成失败。" });
  }
};
