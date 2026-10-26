export type GridSplitOptions = { rows: number; columns: number; mode: "original" | "square-crop" | "square-pad"; format: "png" | "jpeg"; quality: number };
export const defaultGridSplitOptions: GridSplitOptions = { rows: 3, columns: 3, mode: "square-crop", format: "png", quality: 0.92 };
