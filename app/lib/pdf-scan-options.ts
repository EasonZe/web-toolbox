export type PdfScanOptions = { range: string; dpi: number; mode: "color" | "grayscale" | "threshold"; threshold: number; format: "png" | "jpeg"; quality: number };
export const defaultPdfScanOptions: PdfScanOptions = { range: "", dpi: 144, mode: "grayscale", threshold: 160, format: "jpeg", quality: 0.9 };
