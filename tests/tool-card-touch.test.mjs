import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const component = await readFile(
  new URL("../app/components/tool-card-link.tsx", import.meta.url),
  "utf8",
);

test("plays entry feedback only for a short stationary touch", () => {
  assert.match(component, /const MOVE_TOLERANCE = 12;/);
  assert.match(component, /const LONG_PRESS_DELAY = 460;/);
  assert.match(
    component,
    /const isShortTap = !gesture\.moved && elapsed < LONG_PRESS_DELAY;/,
  );
  assert.match(component, /setIsTouchEntering\(true\);/);
  assert.match(component, /suppressClickRef\.current = !isShortTap;/);
});

test("schedules internal navigation directly from a valid touch release", () => {
  assert.match(component, /const ENTER_DELAY = 220;/);
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
