export function createModelObjectURLScope() {
  const urls = new Set<string>();
  let released = false;
  function release() {
    released = true;
    for (const url of urls) URL.revokeObjectURL(url);
    urls.clear();
  }
  function capture<T>(parse: () => T): T {
    if (released) throw new Error("模型预览已关闭。");
    const create = URL.createObjectURL;
    // FBXLoader.parse is synchronous and does not expose its embedded-image
    // URLs. Capture only that call, including unused images and parse failures.
    // Never keep this override across an await or an asynchronous loader.
    URL.createObjectURL = (object) => {
      const url = create.call(URL, object);
      urls.add(url);
      return url;
    };
    try { return parse(); }
    catch (cause) { release(); throw cause; }
    finally { URL.createObjectURL = create; }
  }
  return { capture, release };
}
