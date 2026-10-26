export type PdfExportOptions = { mode: "images" | "text"; range: string; format: "png" | "jpeg"; dpi: number; quality: number };
export const defaultPdfExportOptions: PdfExportOptions = { mode: "images", range: "", format: "png", dpi: 144, quality: 0.92 };
