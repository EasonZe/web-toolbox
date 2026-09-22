import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const component = await readFile(
  new URL("../app/components/tool-card-link.tsx", import.meta.url),
  "utf8",
);
const homeRestorer = await readFile(
  new URL("../app/components/home-scroll-restorer.tsx", import.meta.url),
  "utf8",
);
const toolGrid = await readFile(
  new URL("../app/components/tool-search-grid.tsx", import.meta.url),
  "utf8",
);
const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("plays entry feedback only for a short stationary touch", () => {
  assert.match(component, /const MOVE_TOLERANCE = 12;/);
  assert.match(component, /const LONG_PRESS_DELAY = 460;/);
  assert.match(
    component,
    /const isShortTap = !gesture\.moved && elapsed < LONG_PRESS_DELAY;/,
  );
  assert.match(component, /setIsTouchEntering\(true\);/);
  assert.match(
    component,
    /if \(!navigationPendingRef\.current\) setIsTouchEntering\(false\);/,
  );
  assert.match(component, /suppressClickRef\.current = !isShortTap;/);
});

test("schedules internal navigation directly from a valid touch release", () => {
  assert.match(component, /const ENTER_DELAY = 560;/);
  assert.match(
    component,
    /const scheduleInternalNavigation = \(\) => \{[\s\S]*?navigationPendingRef\.current = true;\s*setIsTouchEntering\(true\);[\s\S]*?navigationTimerRef\.current = setTimeout\(\(\) => \{\s*navigationTimerRef\.current = null;\s*router\.push\(href\);\s*\}, ENTER_DELAY\);/,
  );
  assert.match(
    component,
    /if \(isShortTap\) \{[\s\S]*?if \(external\) \{\s*resetFeedbackLater\(\);\s*\} else \{\s*scheduleInternalNavigation\(\);\s*\}\s*\}/,
  );
  assert.match(
    component,
    /if \(navigationPendingRef\.current\) \{\s*event\.preventDefault\(\);\s*return;\s*\}/,
  );
  assert.match(
    component,
    /className=\{`tool-card\$\{isTouchEntering \? " is-touch-entering" : ""\}`\}/,
  );
});

test("supports touch browsers and hybrid tablets that report incomplete pointer capabilities", () => {
  assert.match(
    component,
    /const isCompactTouchViewport = \(\) => \{[\s\S]*?"\(max-width: 900px\)"[\s\S]*?navigator\.maxTouchPoints > 0[\s\S]*?"ontouchstart" in window/,
  );
  assert.match(component, /if \(!touchPreview \|\| !window\.matchMedia/);
  assert.match(component, /pointerType === "touch" \|\| pointerType === "pen"/);
  assert.match(component, /if \(!isTouchLikePointer\(event\.pointerType\)\) \{/);
  assert.match(
    component,
    /shouldPreviewTouchNavigation[\s\S]*?isCompactTouchViewport\(\)[\s\S]*?scheduleInternalNavigation\(\);/,
  );
  assert.match(toolGrid, /touchPreview=\{view === "cards"\}/);
  assert.match(styles, /\.tool-card\.is-touch-entering\s*\{[^}]*transform:\s*translateY\(-5px\);/s);
  assert.match(
    styles,
    /@media \(hover: none\) and \(pointer: coarse\)[\s\S]*?\r?\n\}\r?\n\r?\n\.tool-card\.is-touch-entering\s*\{/,
  );
});

test("keeps the arrow expanded while an internal route is loading", () => {
  assert.match(component, /const navigationPendingRef = useRef\(false\);/);
  assert.match(
    component,
    /if \(external\) \{\s*resetFeedbackLater\(\);\s*\} else \{\s*scheduleInternalNavigation\(\);\s*\}/,
  );
  assert.match(
    component,
    /const cancelGesture = \(\) => \{[\s\S]*?if \(!navigationPendingRef\.current\) \{\s*setIsTouchEntering\(false\);\s*\}/,
  );
  assert.doesNotMatch(
    component,
    /if \(isShortTap\) \{\s*setIsTouchEntering\(true\);\s*resetFeedbackLater\(\);/,
  );
});

test("limits delayed touch navigation to compact card-grid layouts", () => {
  assert.match(component, /touchPreview\?: boolean;/);
  assert.match(component, /touchPreview = false/);
  assert.match(component, /touchPreview && event\.detail > 0 && isCompactTouchViewport\(\)/);
  assert.match(toolGrid, /touchPreview=\{view === "cards"\}/);
});

test("saves the home scroll position before internal navigation", () => {
  assert.match(component, /const HOME_SCROLL_KEY = "eason-toolbox-home-scroll"/);
  assert.match(component, /sessionStorage\.setItem\([\s\S]*?top: window\.scrollY[\s\S]*?savedAt: Date\.now\(\)/);
  assert.match(component, /setIsTouchEntering\(true\);\s*rememberHomePosition\(\);/);
  assert.match(component, /if \(!external && isPlainLeftClick\) \{\s*rememberHomePosition\(\);\s*\}/);
  assert.match(homeRestorer, /data-home-scroll-restored/);
  assert.match(styles, /html\[data-home-scroll-restored="true"\] \.tool-card\s*\{\s*animation:\s*none;/);
});
