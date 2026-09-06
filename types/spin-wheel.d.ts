declare module "spin-wheel" {
  export class Wheel {
    constructor(container: HTMLElement, props: {
      items: { label: string }[];
      isInteractive?: boolean;
      pointerAngle?: number;
      itemBackgroundColors?: string[];
      itemLabelColors?: string[];
      itemLabelFont?: string;
      itemLabelFontSizeMax?: number;
      borderColor?: string;
      borderWidth?: number;
      lineColor?: string;
      lineWidth?: number;
      onRest?: (event: { currentIndex: number }) => void;
    });
    spinToItem(index: number, duration: number, center?: boolean, revolutions?: number, direction?: number): void;
    remove(): void;
  }
}
