"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import type { CSSProperties, FormEvent } from "react";

type RgbaColor = {
  r: number;
  g: number;
  b: number;
  a: number;
};

type ColorFormat = {
  label: string;
  value: string;
};

type InputFormat = "HEX" | "RGB" | "HSL" | "HSV" | "CMYK";

const initialColor: RgbaColor = { r: 207, g: 226, b: 241, a: 1 };
const inputFormatOptions: InputFormat[] = [
  "HEX",
  "RGB",
  "HSL",
  "HSV",
  "CMYK",
];
const inputPlaceholders: Record<InputFormat, string> = {
  HEX: "#CFE2F1",
  RGB: "rgb(207, 226, 241)",
  HSL: "hsl(207, 55%, 88%)",
  HSV: "hsv(207, 14%, 95%)",
  CMYK: "cmyk(14%, 6%, 0%, 5%)",
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function normalizeHue(value: number) {
  return ((value % 360) + 360) % 360;
}

function parseNumber(value: string) {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : null;
}

function parsePercent(value: string) {
  const number = parseNumber(value.replace("%", ""));
  return number === null ? null : clamp(number / 100, 0, 1);
}

function parseAlpha(value: string | undefined) {
  if (!value) return 1;
  if (value.endsWith("%")) return parsePercent(value) ?? 1;
  const number = parseNumber(value);
  return number === null ? 1 : clamp(number, 0, 1);
}

function splitFunctionValues(value: string) {
  return value
    .trim()
    .replace(/\s*\/\s*/g, ",")
    .split(/[,\s]+/)
    .filter(Boolean);
}

function hslToRgb(hue: number, saturation: number, lightness: number) {
  const h = normalizeHue(hue) / 360;
  if (saturation === 0) {
    const channel = Math.round(lightness * 255);
    return { r: channel, g: channel, b: channel };
  }

  const q =
    lightness < 0.5
      ? lightness * (1 + saturation)
      : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  const channel = (offset: number) => {
    let t = h + offset;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  return {
    r: Math.round(channel(1 / 3) * 255),
    g: Math.round(channel(0) * 255),
    b: Math.round(channel(-1 / 3) * 255),
  };
}

function hsvToRgb(hue: number, saturation: number, brightness: number) {
  const h = normalizeHue(hue) / 60;
  const chroma = brightness * saturation;
  const x = chroma * (1 - Math.abs((h % 2) - 1));
  const match = brightness - chroma;
  let channels = [0, 0, 0];

  if (h < 1) channels = [chroma, x, 0];
  else if (h < 2) channels = [x, chroma, 0];
  else if (h < 3) channels = [0, chroma, x];
  else if (h < 4) channels = [0, x, chroma];
  else if (h < 5) channels = [x, 0, chroma];
  else channels = [chroma, 0, x];

  return {
    r: Math.round((channels[0] + match) * 255),
    g: Math.round((channels[1] + match) * 255),
    b: Math.round((channels[2] + match) * 255),
  };
}

function parseColor(value: string): RgbaColor | null {
  const input = value.trim();
  const hex = input.match(/^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);

  if (hex) {
    let digits = hex[1];
    if (digits.length <= 4) {
      digits = digits
        .split("")
        .map((digit) => digit + digit)
        .join("");
    }
    const hasAlpha = digits.length === 8;
    return {
      r: Number.parseInt(digits.slice(0, 2), 16),
      g: Number.parseInt(digits.slice(2, 4), 16),
      b: Number.parseInt(digits.slice(4, 6), 16),
      a: hasAlpha
        ? round(Number.parseInt(digits.slice(6, 8), 16) / 255, 3)
        : 1,
    };
  }

  const functionMatch = input.match(/^([a-z]+)\((.*)\)$/i);
  if (!functionMatch) return null;

  const name = functionMatch[1].toLowerCase();
  const values = splitFunctionValues(functionMatch[2]);

  if ((name === "rgb" || name === "rgba") && values.length >= 3) {
    const channels = values.slice(0, 3).map((channel) => {
      const number = parseNumber(channel.replace("%", ""));
      if (number === null) return null;
      return channel.endsWith("%")
        ? clamp((number / 100) * 255, 0, 255)
        : clamp(number, 0, 255);
    });
    if (channels.some((channel) => channel === null)) return null;
    return {
      r: Math.round(channels[0] as number),
      g: Math.round(channels[1] as number),
      b: Math.round(channels[2] as number),
      a: parseAlpha(values[3]),
    };
  }

  if ((name === "hsl" || name === "hsla") && values.length >= 3) {
    const hue = parseNumber(values[0].replace("deg", ""));
    const saturation = parsePercent(values[1]);
    const lightness = parsePercent(values[2]);
    if (hue === null || saturation === null || lightness === null) return null;
    return {
      ...hslToRgb(hue, saturation, lightness),
      a: parseAlpha(values[3]),
    };
  }

  if (
    (name === "hsv" || name === "hsva" || name === "hsb") &&
    values.length >= 3
  ) {
    const hue = parseNumber(values[0].replace("deg", ""));
    const saturation = parsePercent(values[1]);
    const brightness = parsePercent(values[2]);
    if (hue === null || saturation === null || brightness === null) return null;
    return {
      ...hsvToRgb(hue, saturation, brightness),
      a: parseAlpha(values[3]),
    };
  }

  if (name === "cmyk" && values.length >= 4) {
    const channels = values.slice(0, 4).map(parsePercent);
    if (channels.some((channel) => channel === null)) return null;
    const [cyan, magenta, yellow, black] = channels as number[];
    return {
      r: Math.round(255 * (1 - cyan) * (1 - black)),
      g: Math.round(255 * (1 - magenta) * (1 - black)),
      b: Math.round(255 * (1 - yellow) * (1 - black)),
      a: 1,
    };
  }

  return null;
}

function colorToHex(color: RgbaColor, includeAlpha = true) {
  const channel = (value: number) =>
    clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0");
  const alpha =
    includeAlpha && color.a < 1 ? channel(Math.round(color.a * 255)) : "";
  return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}${alpha}`.toUpperCase();
}

function rgbToHsl(color: RgbaColor) {
  const r = color.r / 255;
  const g = color.g / 255;
  const b = color.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;
  let hue = 0;
  let saturation = 0;

  if (delta !== 0) {
    saturation = delta / (1 - Math.abs(2 * lightness - 1));
    if (max === r) hue = 60 * (((g - b) / delta) % 6);
    else if (max === g) hue = 60 * ((b - r) / delta + 2);
    else hue = 60 * ((r - g) / delta + 4);
  }

  return {
    h: round(normalizeHue(hue)),
    s: round(saturation * 100),
    l: round(lightness * 100),
  };
}

function rgbToHsv(color: RgbaColor) {
  const r = color.r / 255;
  const g = color.g / 255;
  const b = color.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let hue = 0;

  if (delta !== 0) {
    if (max === r) hue = 60 * (((g - b) / delta) % 6);
    else if (max === g) hue = 60 * ((b - r) / delta + 2);
    else hue = 60 * ((r - g) / delta + 4);
  }

  return {
    h: round(normalizeHue(hue)),
    s: round(max === 0 ? 0 : (delta / max) * 100),
    v: round(max * 100),
  };
}

function rgbToCmyk(color: RgbaColor) {
  const r = color.r / 255;
  const g = color.g / 255;
  const b = color.b / 255;
  const black = 1 - Math.max(r, g, b);
  if (black === 1) return { c: 0, m: 0, y: 0, k: 100 };

  return {
    c: round(((1 - r - black) / (1 - black)) * 100),
    m: round(((1 - g - black) / (1 - black)) * 100),
    y: round(((1 - b - black) / (1 - black)) * 100),
    k: round(black * 100),
  };
}

function createFormats(color: RgbaColor): ColorFormat[] {
  const hsl = rgbToHsl(color);
  const hsv = rgbToHsv(color);
  const cmyk = rgbToCmyk(color);
  const alpha = round(color.a, 2);

  return [
    { label: "HEX", value: colorToHex(color) },
    {
      label: "RGB",
      value:
        color.a < 1
          ? `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`
          : `rgb(${color.r}, ${color.g}, ${color.b})`,
    },
    {
      label: "HSL",
      value:
        color.a < 1
          ? `hsla(${hsl.h}, ${hsl.s}%, ${hsl.l}%, ${alpha})`
          : `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`,
    },
    {
      label: "HSV",
      value:
        color.a < 1
          ? `hsva(${hsv.h}, ${hsv.s}%, ${hsv.v}%, ${alpha})`
          : `hsv(${hsv.h}, ${hsv.s}%, ${hsv.v}%)`,
    },
    {
      label: "CMYK",
      value: `cmyk(${cmyk.c}%, ${cmyk.m}%, ${cmyk.y}%, ${cmyk.k}%)`,
    },
  ];
}

export default function ColorConverter() {
  const [input, setInput] = useState("#CFE2F1");
  const [inputFormat, setInputFormat] = useState<InputFormat>("HEX");
  const [color, setColor] = useState<RgbaColor>(initialColor);
  const [message, setMessage] = useState("");
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formats = useMemo(() => createFormats(color), [color]);
  const solidHex = colorToHex(color, false);

  function showToast(label: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(`${label} 已复制`);
    toastTimer.current = setTimeout(() => setToast(""), 1500);
  }

  async function copyText(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      showToast(label);
    } catch {
      const helper = document.createElement("textarea");
      helper.value = text;
      helper.setAttribute("readonly", "");
      helper.style.position = "fixed";
      helper.style.opacity = "0";
      document.body.append(helper);
      helper.select();
      const copied = document.execCommand("copy");
      helper.remove();
      if (copied) showToast(label);
      else setMessage("浏览器未允许复制，请手动选择内容复制。");
    }
  }

  function convert(value: string) {
    const parsed = parseColor(value);
    if (!parsed) {
      setMessage("无法识别这个颜色，请检查格式后重试。");
      return;
    }
    setColor(parsed);
    const formattedValue =
      createFormats(parsed).find((format) => format.label === inputFormat)
        ?.value ?? colorToHex(parsed);
    setInput(formattedValue);
    setMessage("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!input.trim()) {
      setMessage("请先输入一个颜色值。");
      return;
    }
    convert(input);
  }

  return (
    <main className="tool-shell color-tool-shell">
      <Link className="back-link" href="/">
        <span aria-hidden="true">←</span> Eason的工具箱
      </Link>

      <header className="tool-header">
        <h1>颜色格式转换工具</h1>
      </header>

      <section
        className="converter-card color-converter-card"
        aria-label="颜色格式转换工具"
      >
        <div className="color-workbench">
          <div className="color-preview-panel">
            <div
              className="color-preview-swatch"
              style={{ "--preview-color": formats[1].value } as CSSProperties}
              aria-label={`当前颜色 ${formats[0].value}`}
              role="img"
            />
            <label className="color-picker-control">
              <span>选择颜色</span>
              <input
                type="color"
                value={solidHex}
                onChange={(event) => {
                  const parsed = parseColor(event.target.value);
                  if (!parsed) return;
                  setColor(parsed);
                  setInputFormat("HEX");
                  setInput(colorToHex(parsed));
                  setMessage("");
                }}
              />
            </label>
          </div>

          <form className="color-input-form" onSubmit={handleSubmit} noValidate>
            <fieldset className="color-input-formats">
              <legend>输入格式</legend>
              <div role="group" aria-label="选择输入格式">
                {inputFormatOptions.map((format) => {
                  const selected = inputFormat === format;
                  return (
                    <button
                      className={selected ? "is-selected" : ""}
                      type="button"
                      key={format}
                      aria-pressed={selected}
                      onClick={() => {
                        setInputFormat(format);
                        setInput(
                          formats.find((item) => item.label === format)?.value ??
                            "",
                        );
                        setMessage("");
                      }}
                    >
                      {format}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <label htmlFor="color-value">{inputFormat} 颜色值</label>
            <div className="color-input-row">
              <input
                className="color-value-input"
                id="color-value"
                value={input}
                autoComplete="off"
                spellCheck={false}
                placeholder={inputPlaceholders[inputFormat]}
                onChange={(event) => setInput(event.target.value)}
              />
              <button className="color-convert-button" type="submit">
                转换
              </button>
            </div>
            <p>
              可选择任意格式输入；HSV 同时支持 HSB 写法。
            </p>
            {message ? (
              <p className="message" role="status" aria-live="polite">
                {message}
              </p>
            ) : null}
          </form>
        </div>

        <section className="color-results" aria-labelledby="color-results-title">
          <h2 id="color-results-title">转换结果</h2>
          <div className="color-format-list">
            {formats.map((format) => (
              <div className="color-format-row" key={format.label}>
                <strong>{format.label}</strong>
                <code>{format.value}</code>
                <button
                  className="copy-button"
                  type="button"
                  onClick={() => copyText(format.label, format.value)}
                >
                  复制
                </button>
              </div>
            ))}
          </div>
        </section>
      </section>

      {toast ? (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      ) : null}
    </main>
  );
}
