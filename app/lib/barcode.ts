import JsBarcode from "jsbarcode";
export const barcodeFormats = ["CODE128", "CODE39", "EAN13", "EAN8", "UPC", "ITF14"] as const;
export type BarcodeFormat = (typeof barcodeFormats)[number];
export const barcodeExamples: Record<BarcodeFormat, string> = { CODE128: "EASON-2026", CODE39: "TOOLBOX-123", EAN13: "6901234567892", EAN8: "96385074", UPC: "036000291452", ITF14: "10012345000017" };
export function barcodeOptions(value: string, format: BarcodeFormat, height: number, width: number, displayValue: boolean) {
  if (!value || value.length > 256) throw new Error("条码内容需要 1–256 个字符。");
  if (!(barcodeFormats as readonly string[]).includes(format) || !Number.isInteger(height) || height < 40 || height > 300 || ![1, 2, 3, 4].includes(width)) throw new Error("条码格式或尺寸无效。");
  const options = { format, height, width, displayValue, margin: 20, font: "sans-serif", fontSize: 18, background: "#ffffff", lineColor: "#000000" };
  const encoded: { encodings?: { data: string }[] } = {};
  try { JsBarcode(encoded, value, options); }
  catch { throw new Error("内容不符合此条码格式，请检查字符、位数与校验位，或使用示例。"); }
  if (!encoded.encodings?.length || encoded.encodings.reduce((sum, part) => sum + part.data.length * width, 40) > 8192) throw new Error("条码过宽，请减少内容或降低条宽。");
  return options;
}
