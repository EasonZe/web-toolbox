declare module "imagetracerjs" {
  type Color = { r: number; g: number; b: number; a: number };
  type Segment = { type: string; x1: number; y1: number; x2: number; y2: number; x3?: number; y3?: number };
  type Path = { segments: Segment[]; isholepath: boolean; holechildren: number[] };
  type TraceData = { width: number; height: number; palette: Color[]; layers: Path[][] };
  const tracer: { imagedataToTracedata(image: { width: number; height: number; data: Uint8ClampedArray }, options: Record<string, unknown>): TraceData; getsvgstring(data: TraceData, options: Record<string, unknown>): string };
  export default tracer;
}
