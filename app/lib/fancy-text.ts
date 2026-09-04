const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const lower = "abcdefghijklmnopqrstuvwxyz";
const digits = "0123456789";

function range(start: number, count: number) {
  return Array.from({ length: count }, (_, index) => String.fromCodePoint(start + index)).join("");
}

export type FancyTextStyle = {
  id: string;
  name: string;
  example: string;
  upper: string;
  lower: string;
  digits?: string;
  fullwidth?: boolean;
};

export const fancyTextStyles: FancyTextStyle[] = [
  {
    id: "double-struck",
    name: "双线体",
    example: "𝔼𝕒𝕤𝕠𝕟",
    upper: "𝔸𝔹ℂ𝔻𝔼𝔽𝔾ℍ𝕀𝕁𝕂𝕃𝕄ℕ𝕆ℙℚℝ𝕊𝕋𝕌𝕍𝕎𝕏𝕐ℤ",
    lower: "𝕒𝕓𝕔𝕕𝕖𝕗𝕘𝕙𝕚𝕛𝕜𝕝𝕞𝕟𝕠𝕡𝕢𝕣𝕤𝕥𝕦𝕧𝕨𝕩𝕪𝕫",
    digits: "𝟘𝟙𝟚𝟛𝟜𝟝𝟞𝟟𝟠𝟡",
  },
  {
    id: "script",
    name: "花体",
    example: "ℰ𝒶𝓈ℴ𝓃",
    upper: "𝒜ℬ𝒞𝒟ℰℱ𝒢ℋℐ𝒥𝒦ℒℳ𝒩𝒪𝒫𝒬ℛ𝒮𝒯𝒰𝒱𝒲𝒳𝒴𝒵",
    lower: "𝒶𝒷𝒸𝒹ℯ𝒻ℊ𝒽𝒾𝒿𝓀𝓁𝓂𝓃ℴ𝓅𝓆𝓇𝓈𝓉𝓊𝓋𝓌𝓍𝓎𝓏",
  },
  {
    id: "bold",
    name: "数学粗体",
    example: "𝐄𝐚𝐬𝐨𝐧",
    upper: range(0x1d400, 26),
    lower: range(0x1d41a, 26),
    digits: range(0x1d7ce, 10),
  },
  {
    id: "bold-italic",
    name: "粗斜体",
    example: "𝑬𝒂𝒔𝒐𝒏",
    upper: range(0x1d468, 26),
    lower: range(0x1d482, 26),
  },
  {
    id: "sans-bold",
    name: "无衬线粗体",
    example: "𝗘𝗮𝘀𝗼𝗻",
    upper: range(0x1d5d4, 26),
    lower: range(0x1d5ee, 26),
    digits: range(0x1d7ec, 10),
  },
  {
    id: "monospace",
    name: "等宽体",
    example: "𝙴𝚊𝚜𝚘𝚗",
    upper: range(0x1d670, 26),
    lower: range(0x1d68a, 26),
    digits: range(0x1d7f6, 10),
  },
  {
    id: "circled",
    name: "圆圈字",
    example: "Ⓔⓐⓢⓞⓝ",
    upper: range(0x24b6, 26),
    lower: range(0x24d0, 26),
    digits: "⓪①②③④⑤⑥⑦⑧⑨",
  },
  {
    id: "fullwidth",
    name: "全角字",
    example: "Ｅａｓｏｎ",
    upper: "",
    lower: "",
    fullwidth: true,
  },
];

export function transformFancyText(value: string, style: FancyTextStyle) {
  if (style.fullwidth) {
    return Array.from(value, (character) => {
      const code = character.charCodeAt(0);
      if (code === 32) return "　";
      return code >= 33 && code <= 126 ? String.fromCharCode(code + 0xfee0) : character;
    }).join("");
  }

  const styledUpper = Array.from(style.upper);
  const styledLower = Array.from(style.lower);
  const styledDigits = Array.from(style.digits ?? "");
  return Array.from(value, (character) => {
    const upperIndex = upper.indexOf(character);
    if (upperIndex >= 0) return styledUpper[upperIndex] ?? character;
    const lowerIndex = lower.indexOf(character);
    if (lowerIndex >= 0) return styledLower[lowerIndex] ?? character;
    const digitIndex = digits.indexOf(character);
    if (digitIndex >= 0) return styledDigits[digitIndex] ?? character;
    return character;
  }).join("");
}
