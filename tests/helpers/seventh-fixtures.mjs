import { zipSync, strToU8 } from "fflate";
export function pptxParts(strict = false) {
  const p = strict ? "http://purl.oclc.org/ooxml/presentationml/main" : "http://schemas.openxmlformats.org/presentationml/2006/main";
  const a = strict ? "http://purl.oclc.org/ooxml/drawingml/main" : "http://schemas.openxmlformats.org/drawingml/2006/main";
  const r = strict ? "http://purl.oclc.org/ooxml/officeDocument/relationships" : "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  return {
    "[Content_Types].xml": strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="png" ContentType="image/png"/><Default Extension="svg" ContentType="image/svg+xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>'),
    "ppt/presentation.xml": strToU8(`<p:presentation xmlns:p="${p}" xmlns:r="${r}"><p:sldIdLst><p:sldId id="256" r:id="rB"/><p:sldId id="257" r:id="rA"/></p:sldIdLst></p:presentation>`),
    "ppt/_rels/presentation.xml.rels": strToU8(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rA" Type="${r}/slide" Target="slides/slide1.xml"/><Relationship Id="rB" Type="${r}/slide" Target="slides/slide9.xml"/><Relationship Id="ignored" Type="${r}/image" TargetMode="External" Target="https://example.invalid/never-fetch"/></Relationships>`),
    "ppt/slides/slide9.xml": strToU8(`<p:sld xmlns:p="${p}" xmlns:a="${a}"><p:cSld><a:p><a:r><a:t>中文 &amp; first</a:t></a:r><a:br/><a:r><a:t><![CDATA[<not HTML>]]></a:t></a:r></a:p><a:p><a:r><a:t>表格</a:t></a:r></a:p></p:cSld></p:sld>`),
    "ppt/slides/slide1.xml": strToU8(`<p:sld xmlns:p="${p}" xmlns:a="${a}"><p:cSld/></p:sld>`),
    "ppt/media/photo.png": new Uint8Array([137, 80, 78, 71, 0, 1, 2]),
    "ppt/media/master.svg": strToU8('<svg xmlns="http://www.w3.org/2000/svg"><script>neverExecute()</script></svg>'),
    "ppt/media/movie.mp4": new Uint8Array([0, 0, 0, 0]),
    "ppt/notesSlides/notesSlide1.xml": strToU8("<ignored>notes not body</ignored>"),
  };
}
export const pptxFile = (parts = pptxParts()) => new File([zipSync(parts, { level: 0 })], "fixture.pptx");
