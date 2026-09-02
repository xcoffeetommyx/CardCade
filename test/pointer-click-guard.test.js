import assert from "node:assert/strict";
import test from "node:test";
import { createPointerClickGuard } from "../public/pointer-click-guard.js";

const touchClick = { detail: 1, pointerType: "touch" };

test("a deck-opening touch consumes its click even when retargeted to a game", () => {
  const guard = createPointerClickGuard({ now: () => 100 });
  guard.startGesture();
  guard.markHandled();
  assert.equal(guard.consumeClick({ ...touchClick, target: { action: "select-library-game" } }), true);
  assert.equal(guard.consumeClick(touchClick), false, "only the compatibility click is consumed");
});

test("the intentional next tap can select a game without waiting", () => {
  const guard = createPointerClickGuard({ now: () => 100 });
  guard.startGesture();
  guard.markHandled();
  assert.equal(guard.consumeClick(touchClick), true);
  guard.startGesture();
  assert.equal(guard.consumeClick(touchClick), false);
});

test("a fresh tap works even when the browser omitted the earlier click", () => {
  const guard = createPointerClickGuard({ now: () => 100 });
  guard.markHandled();
  guard.startGesture();
  assert.equal(guard.consumeClick(touchClick), false);
});

test("delayed legacy touch clicks are consumed beyond the old 160ms window", () => {
  let time = 100;
  const guard = createPointerClickGuard({ now: () => time });
  guard.markHandled();
  time += 350;
  assert.equal(guard.consumeClick({ detail: 1 }), true);
});

test("handled mouse and pen gestures do not activate twice", () => {
  const guard = createPointerClickGuard({ now: () => 100 });
  for (const pointerType of ["mouse", "pen"]) {
    guard.startGesture();
    guard.markHandled();
    assert.equal(guard.consumeClick({ detail: 1, pointerType }), true);
  }
});

test("keyboard and controller clicks remain independent of pointer suppression", () => {
  const guard = createPointerClickGuard({ now: () => 100 });
  guard.markHandled();
  assert.equal(guard.consumeClick({ detail: 0, pointerType: "" }), false);
  assert.equal(guard.consumeClick({ detail: 0 }), false);
  assert.equal(guard.consumeClick(touchClick), true);
});

test("pointer metadata identifies clicks even when detail is zero", () => {
  const guard = createPointerClickGuard({ now: () => 100 });
  guard.markHandled();
  assert.equal(guard.consumeClick({ detail: 0, pointerType: "touch" }), true);
});

test("stale suppression expires and unhandled clicks pass through", () => {
  let time = 100;
  const guard = createPointerClickGuard({ now: () => time });
  assert.equal(guard.consumeClick(touchClick), false);
  guard.markHandled();
  time += 1001;
  assert.equal(guard.consumeClick(touchClick), false);
});
