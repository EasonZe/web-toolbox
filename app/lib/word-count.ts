export type TextStats = {
  characters: number;
  charactersNoWhitespace: number;
  chineseCharacters: number;
  words: number;
  westernWords: number;
  paragraphs: number;
  lines: number;
  sentences: number;
  whitespace: number;
  bytes: number;
  readingMinutes: number;
};

export function countText(text: string): TextStats {
  const characters = Array.from(text);
  const chineseCharacters = characters.filter((character) =>
    /\p{Script=Han}/u.test(character),
  ).length;
  const westernText = text.replace(/\p{Script=Han}/gu, " ");
  const westernWords = (
    westernText.match(/[\p{L}\p{N}]+(?:['’_-][\p{L}\p{N}]+)*/gu) ?? []
  ).length;
  const trimmed = text.trim();
  const sentenceParts = trimmed
    ? trimmed.split(/[。！？.!?]+|\n+/u).filter((part) => part.trim())
    : [];
  const readingTime = chineseCharacters / 500 + westernWords / 200;

  return {
    characters: characters.length,
    charactersNoWhitespace: characters.filter(
      (character) => !/\s/u.test(character),
    ).length,
    chineseCharacters,
    words: chineseCharacters + westernWords,
    westernWords,
    paragraphs: trimmed
      ? trimmed.split(/\n\s*\n/u).filter((part) => part.trim()).length
      : 0,
    lines: text ? text.split(/\r\n|\r|\n/u).length : 0,
    sentences: sentenceParts.length,
    whitespace: characters.filter((character) => /\s/u.test(character)).length,
    bytes: new TextEncoder().encode(text).byteLength,
    readingMinutes: readingTime > 0 ? Math.max(1, Math.ceil(readingTime)) : 0,
  };
}
