import { createWorker, OEM } from "tesseract.js";
self.onmessage = async ({
  data,
}: MessageEvent<{
  image: Blob;
  language: "eng" | "chi_sim" | "chi_sim+eng";
}>) => {
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
  try {
    if (!["eng", "chi_sim", "chi_sim+eng"].includes(data.language))
      throw new Error("不支持的识别语言。");
    const base = new URL("/ocr/7.0.0/", self.location.origin).href;
    // The English-first bilingual order is verified against both model files
    // in the real OCR regression, not just against mocked recognition output.
    const language =
      data.language === "chi_sim+eng" ? "eng+chi_sim" : data.language;
    worker = await createWorker(language, OEM.LSTM_ONLY, {
      workerPath: `${base}worker.min.js`,
      corePath: `${base}core`,
      langPath: `${base}data`,
      workerBlobURL: false,
      cacheMethod: "write",
      gzip: false,
      logger: (message) =>
        self.postMessage({
          progress:
            message.status === "recognizing text"
              ? 45 + message.progress * 50
              : message.progress * 35,
          status:
            message.status === "recognizing text"
              ? "正在识别文字…"
              : "正在加载本地识别引擎与语言模型…",
        }),
      errorHandler: (cause) =>
        self.postMessage({
          error: `OCR 初始化失败：${cause instanceof Error ? cause.message : String(cause)}`,
        }),
    });
    const result = await worker.recognize(data.image, { rotateAuto: true });
    self.postMessage({
      result: { text: result.data.text, confidence: result.data.confidence },
    });
  } catch (cause) {
    self.postMessage({
      error: cause instanceof Error ? cause.message : "文字识别失败。",
    });
  } finally {
    await worker?.terminate();
  }
};
