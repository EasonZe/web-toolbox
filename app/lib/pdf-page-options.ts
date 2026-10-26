export type PdfMargins = { top: number; right: number; bottom: number; left: number };
export type PdfNumberOptions = { range: string; template: string; start: number; position: "top-left" | "top-center" | "top-right" | "bottom-left" | "bottom-center" | "bottom-right"; size: number; margin: number; color: string; opacity: number };
export type PdfCropOptions = { range: string; margins: PdfMargins };
export const defaultPdfNumberOptions: PdfNumberOptions = { range: "", template: "{n} / {total}", start: 1, position: "bottom-center", size: 12, margin: 10, color: "#333333", opacity: 100 };
export const defaultPdfCropOptions: PdfCropOptions = { range: "", margins: { top: 5, right: 5, bottom: 5, left: 5 } };
export type PdfGeometry = { x: number; y: number; width: number; height: number; rotation: number; displayWidth: number; displayHeight: number };
