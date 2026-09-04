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
  decoration?: string;
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
    id: "bold-script",
    name: "粗花体",
    example: "𝓔𝓪𝓼𝓸𝓷",
    upper: range(0x1d4d0, 26),
    lower: range(0x1d4ea, 26),
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
    id: "italic",
    name: "数学斜体",
    example: "𝐸𝑎𝑠𝑜𝑛",
    upper: range(0x1d434, 26),
    lower: "𝑎𝑏𝑐𝑑𝑒𝑓𝑔ℎ𝑖𝑗𝑘𝑙𝑚𝑛𝑜𝑝𝑞𝑟𝑠𝑡𝑢𝑣𝑤𝑥𝑦𝑧",
  },
  {
    id: "bold-italic",
    name: "粗斜体",
    example: "𝑬𝒂𝒔𝒐𝒏",
    upper: range(0x1d468, 26),
    lower: range(0x1d482, 26),
  },
  {
    id: "sans",
    name: "无衬线体",
    example: "𝖤𝖺𝗌𝗈𝗇",
    upper: range(0x1d5a0, 26),
    lower: range(0x1d5ba, 26),
    digits: range(0x1d7e2, 10),
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
    id: "sans-italic",
    name: "无衬线斜体",
    example: "𝘌𝘢𝘴𝘰𝘯",
    upper: range(0x1d608, 26),
    lower: range(0x1d622, 26),
  },
  {
    id: "sans-bold-italic",
    name: "无衬线粗斜体",
    example: "𝙀𝙖𝙨𝙤𝙣",
    upper: range(0x1d63c, 26),
    lower: range(0x1d656, 26),
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
    id: "fraktur",
    name: "哥特体",
    example: "𝔈𝔞𝔰𝔬𝔫",
    upper: "𝔄𝔅ℭ𝔇𝔈𝔉𝔊ℌℑ𝔍𝔎𝔏𝔐𝔑𝔒𝔓𝔔ℜ𝔖𝔗𝔘𝔙𝔚𝔛𝔜ℨ",
    lower: range(0x1d51e, 26),
  },
  {
    id: "bold-fraktur",
    name: "粗哥特体",
    example: "𝕰𝖆𝖘𝖔𝖓",
    upper: range(0x1d56c, 26),
    lower: range(0x1d586, 26),
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
    id: "parenthesized",
    name: "括号字",
    example: "⒠⒜⒮⒪⒩",
    upper: range(0x249c, 26),
    lower: range(0x249c, 26),
  },
  {
    id: "squared",
    name: "方框字",
    example: "🄴🄰🅂🄾🄽",
    upper: range(0x1f130, 26),
    lower: range(0x1f130, 26),
  },
  {
    id: "negative-circled",
    name: "黑圆圈字",
    example: "🅔🅐🅢🅞🅝",
    upper: range(0x1f150, 26),
    lower: range(0x1f150, 26),
    digits: "⓿❶❷❸❹❺❻❼❽❾",
  },
  {
    id: "negative-squared",
    name: "黑方框字",
    example: "🅴🅰🆂🅾🅽",
    upper: range(0x1f170, 26),
    lower: range(0x1f170, 26),
  },
  {
    id: "fullwidth",
    name: "全角字",
    example: "Ｅａｓｏｎ",
    upper: "",
    lower: "",
    fullwidth: true,
  },
  {
    id: "small-caps",
    name: "小型大写",
    example: "ᴇᴀꜱᴏɴ",
    upper: "ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘꞯʀꜱᴛᴜᴠᴡxʏᴢ",
    lower: "ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘꞯʀꜱᴛᴜᴠᴡxʏᴢ",
  },
  {
    id: "strikethrough",
    name: "删除线",
    example: "E̶a̶s̶o̶n̶",
    upper,
    lower,
    digits,
    decoration: "\u0336",
  },
  {
    id: "underline",
    name: "下划线",
    example: "E̲a̲s̲o̲n̲",
    upper,
    lower,
    digits,
    decoration: "\u0332",
  },
  {
    id: "double-underline",
    name: "双下划线",
    example: "E̳a̳s̳o̳n̳",
    upper,
    lower,
    digits,
    decoration: "\u0333",
  },
  {
    id: "overline",
    name: "上划线",
    example: "E̅a̅s̅o̅n̅",
    upper,
    lower,
    digits,
    decoration: "\u0305",
  },
  {
    id: "slashed",
    name: "斜线字",
    example: "E̸a̸s̸o̸n̸",
    upper,
    lower,
    digits,
    decoration: "\u0338",
  },
  {
    id: "dotted",
    name: "点缀字",
    example: "Ėȧṡȯṅ",
    upper,
    lower,
    digits,
    decoration: "\u0307",
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

  if (style.decoration) {
    return Array.from(value, (character) => (
      /[A-Za-z0-9]/.test(character) ? `${character}${style.decoration}` : character
    )).join("");
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
