import assert from "node:assert/strict";
import test from "node:test";
import { mountComponent } from "./helpers/hook-runtime.mjs";
import { allElements } from "./helpers/client-hook-harness.mjs";
import { loadLocalModule } from "./helpers/load-local-module.mjs";

const preferences = loadLocalModule("app/lib/home-preferences.ts");
function home(view, width) {
  const frames = new Map(), nodes = new Map(), observers = [];
  const events = new EventTarget(); let frame = 0, tree;
  class Observer {
    constructor(fn) { this.fn = fn; observers.push(this); }
    observe(node) { this.fn([{ target: node, isIntersecting: true, intersectionRatio: 1, boundingClientRect: { height: 100 }, intersectionRect: { height: 100 } }]); }
    unobserve() {} disconnect() {}
  }
  const window = {
    innerHeight: 800, IntersectionObserver: Observer, location: { hash: "" },
    matchMedia: () => ({ matches: width <= 680 }),
    localStorage: { getItem: (key) => key === preferences.toolViewStorageKey ? view : null, setItem() {} },
    addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events),
    requestAnimationFrame(fn) { frames.set(++frame, fn); return frame; }, cancelAnimationFrame(id) { frames.delete(id); },
  };
  const component = mountComponent("app/components/tool-search-grid.tsx", "ToolSearchGrid", (id) => {
    if (id === "../lib/home-preferences") return preferences;
    if (id === "./tool-card-link") return { ToolCardLink: "a" };
  }, { window, IntersectionObserver: Observer });
  const browser = { getBoundingClientRect() {}, querySelectorAll(selector) {
    return allElements(tree, (node) => selector === ".tool-category-collapsible"
      ? node.props?.className?.includes("tool-category-collapsible") : node.props?.className?.startsWith("tool-card-shell")
    ).map((element) => {
      const key = element.key;
      if (!nodes.has(key)) nodes.set(key, { key, attributes: {}, classList: { add() {}, remove() {} }, style: { setProperty() {} }, removeAttribute(name) { delete this.attributes[name]; }, setAttribute(name, value) { this.attributes[name] = value; } });
      return nodes.get(key);
    });
  } };
  function render() { tree = component.render(); component.refs[0].current = browser; return tree; }
  function flush() { component.flushEffects(); while (frames.size) { const batch = [...frames]; frames.clear(); for (const [, fn] of batch) fn(); } }
  render(); flush(); render(); flush();
  return { component, nodes, observers, search(value) {
    allElements(tree, (node) => node.type === "input" && node.props.type === "search")[0].props.onChange({ target: { value } });
    render(); flush();
    const visible = browser.querySelectorAll(view === "groups" ? ".tool-category-collapsible" : ".tool-card-shell");
    assert.equal(visible.length, 1);
    assert.equal(visible[0].attributes["data-revealed"], "true", `搜索 ${value} 后新结果必须被观察并显示`);
  }, favorite() {
    const before = observers.length;
    allElements(tree, (node) => node.type === "button" && node.props.className === "tool-favorite-button")[0].props.onClick();
    render(); flush(); assert.equal(observers.length, before, "非收藏筛选中点星标不应重播或重置动画");
  } };
}
for (const width of [390, 1440]) for (const view of ["cards", "groups", "table", "minimal"]) {
  test(`同数量搜索换词不隐藏新工具，收藏不重置动画：${width}px / ${view}`, () => {
    const app = home(view, width);
    try { app.search("时间戳"); app.search("文件哈希"); app.favorite(); } finally { app.component.unmount(); }
  });
}
