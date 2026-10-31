import { test } from "node:test";
import assert from "node:assert/strict";
import { placeMenu } from "../apps/web/src/menu-position.js";
test("a single project near the top opens downward, keeping both menu actions visible", () => {
  const position = placeMenu(
    { top: 310, bottom: 338, right: 200 },
    { width: 150, height: 86 },
    { width: 1200, height: 800 },
  );
  assert.equal(position.top, 344);
  assert.equal(position.left, 50);
  assert.ok(position.top + 86 < 800);
});
test("a project near the viewport bottom opens upward within the viewport", () => {
  const position = placeMenu(
    { top: 730, bottom: 758, right: 200 },
    { width: 150, height: 86 },
    { width: 1200, height: 800 },
  );
  assert.equal(position.top, 638);
  assert.ok(position.top + 86 < 730);
});
test("popup clamps to viewport edges on small screens", () => {
  for (const anchor of [
    { top: 1, bottom: 20, right: 5 },
    { top: 310, bottom: 330, right: 500 },
  ]) {
    const p = placeMenu(
      anchor,
      { width: 150, height: 86 },
      { width: 360, height: 340 },
    );
    assert.ok(p.top >= 8);
    assert.ok(p.top + 86 <= 332);
    assert.ok(p.left >= 8);
    assert.ok(p.left + 150 <= 352);
  }
});
