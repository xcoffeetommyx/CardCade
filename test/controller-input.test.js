import assert from "node:assert/strict";
import test from "node:test";
import controllerInput from "../shared/controller-input.js";

function buttons(pressed = {}) {
  return Array.from({ length: 16 }, (_, index) => ({ pressed: pressed[index] === true, value: pressed[index] ? 1 : 0 }));
}

test("normalizes the left stick with a controller-friendly dead zone", () => {
  assert.deepEqual(controllerInput.stickVector([0.12, 0], 0.22), { x: 0, y: 0, magnitude: 0 });
  const vector = controllerInput.stickVector([1, 0], 0.22);
  assert.equal(vector.x, 1);
  assert.equal(vector.y, 0);
  assert.equal(vector.magnitude, 1);
});

test("prefers a standard-layout controller and reports only input edges", () => {
  let pads = [
    { index: 0, connected: true, mapping: "", axes: [0, 0], buttons: buttons() },
    { index: 1, connected: true, mapping: "standard", axes: [0, 0], buttons: buttons() }
  ];
  const actions = [];
  const input = controllerInput.createGamepadInput({
    getGamepads: () => pads,
    onButton: (action, details) => actions.push({ action, repeat: details.repeat })
  });

  assert.equal(input.poll(0).index, 1);
  pads[1].buttons = buttons({ 0: true, 14: true });
  input.poll(16);
  input.poll(32);

  assert.deepEqual(actions, [
    { action: "activate", repeat: false },
    { action: "left", repeat: false }
  ]);
});

test("moves the virtual cursor from the left stick and repeats held d-pad directions", () => {
  const moves = [];
  const actions = [];
  const gamepad = { index: 0, connected: true, mapping: "standard", axes: [1, 0], buttons: buttons({ 13: true }) };
  const input = controllerInput.createGamepadInput({
    getGamepads: () => [gamepad],
    repeatDelay: 100,
    repeatInterval: 50,
    onMove: (move) => moves.push(move),
    onButton: (action, details) => actions.push({ action, repeat: details.repeat })
  });

  input.poll(0);
  input.poll(16);
  input.poll(120);

  assert.ok(moves.some((move) => move.x > 0 && move.y === 0));
  assert.deepEqual(actions, [
    { action: "down", repeat: false },
    { action: "down", repeat: true }
  ]);
});

test("chooses the nearest control in the requested d-pad direction", () => {
  const targets = [
    { id: "left", left: 0, right: 40, top: 40, bottom: 80 },
    { id: "right", left: 90, right: 130, top: 40, bottom: 80 },
    { id: "below", left: 35, right: 75, top: 115, bottom: 155 }
  ];

  assert.equal(controllerInput.directionalTarget(targets, { x: 20, y: 60 }, "right").id, "right");
  assert.equal(controllerInput.directionalTarget(targets, { x: 20, y: 60 }, "down").id, "below");
  assert.equal(controllerInput.directionalTarget(targets, { x: 110, y: 60 }, "left").id, "left");
});
