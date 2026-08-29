(function exposeCardcadeControllerInput(root, factory) {
  const controllerInput = factory();
  if (typeof module === "object" && module.exports) module.exports = controllerInput;
  root.CardcadeControllerInput = controllerInput;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCardcadeControllerInput() {
  "use strict";

  const BUTTONS = Object.freeze({
    activate: 0,
    back: 1,
    dpadUp: 12,
    dpadDown: 13,
    dpadLeft: 14,
    dpadRight: 15
  });

  const CONTROLS = Object.freeze([
    Object.freeze({ action: "activate", button: BUTTONS.activate }),
    Object.freeze({ action: "back", button: BUTTONS.back }),
    Object.freeze({ action: "up", button: BUTTONS.dpadUp, repeats: true }),
    Object.freeze({ action: "down", button: BUTTONS.dpadDown, repeats: true }),
    Object.freeze({ action: "left", button: BUTTONS.dpadLeft, repeats: true }),
    Object.freeze({ action: "right", button: BUTTONS.dpadRight, repeats: true })
  ]);

  function stickVector(axes, deadZone = 0.22) {
    const x = clamp(Number(axes?.[0]) || 0, -1, 1);
    const y = clamp(Number(axes?.[1]) || 0, -1, 1);
    const magnitude = Math.min(1, Math.hypot(x, y));
    const safeDeadZone = clamp(Number(deadZone) || 0, 0, 0.95);
    if (magnitude <= safeDeadZone) return Object.freeze({ x: 0, y: 0, magnitude: 0 });
    const scaledMagnitude = (magnitude - safeDeadZone) / (1 - safeDeadZone);
    return Object.freeze({
      x: (x / magnitude) * scaledMagnitude,
      y: (y / magnitude) * scaledMagnitude,
      magnitude: scaledMagnitude
    });
  }

  function buttonPressed(button) {
    if (typeof button === "number") return button > 0.5;
    return Boolean(button?.pressed || Number(button?.value) > 0.5);
  }

  function selectGamepad(gamepads, activeIndex = null) {
    const connected = Array.from(gamepads || []).filter((gamepad) => gamepad && gamepad.connected !== false);
    if (!connected.length) return null;
    return connected.find((gamepad) => gamepad.index === activeIndex)
      || connected.find((gamepad) => gamepad.mapping === "standard")
      || connected[0];
  }

  function createGamepadInput({
    getGamepads = defaultGetGamepads,
    requestFrame = defaultRequestFrame,
    cancelFrame = defaultCancelFrame,
    onConnect = () => {},
    onDisconnect = () => {},
    onMove = () => {},
    onButton = () => {},
    onActivity = () => {},
    deadZone = 0.22,
    minimumSpeed = 260,
    maximumSpeed = 1180,
    repeatDelay = 360,
    repeatInterval = 105
  } = {}) {
    let running = false;
    let frame = null;
    let activeIndex = null;
    let lastTime = null;
    let previousButtons = new Map();
    let nextRepeats = new Map();

    function resetButtonState() {
      previousButtons = new Map();
      nextRepeats = new Map();
    }

    function poll(timestamp = defaultNow()) {
      const time = Number.isFinite(Number(timestamp)) ? Number(timestamp) : defaultNow();
      const gamepad = selectGamepad(getGamepads(), activeIndex);
      if (!gamepad) {
        if (activeIndex !== null) onDisconnect();
        activeIndex = null;
        lastTime = time;
        resetButtonState();
        return null;
      }

      if (activeIndex !== gamepad.index) {
        activeIndex = gamepad.index;
        lastTime = time;
        resetButtonState();
        onConnect(gamepad);
      }

      const elapsed = lastTime === null ? 0 : clamp((time - lastTime) / 1000, 0, 0.05);
      lastTime = time;
      const stick = stickVector(gamepad.axes, deadZone);
      if (stick.magnitude > 0 && elapsed > 0) {
        const speed = Number(minimumSpeed) + (Number(maximumSpeed) - Number(minimumSpeed)) * stick.magnitude;
        onMove({ x: stick.x * speed * elapsed, y: stick.y * speed * elapsed, stick, gamepad });
        onActivity(gamepad);
      }

      for (const control of CONTROLS) {
        const pressed = buttonPressed(gamepad.buttons?.[control.button]);
        const wasPressed = previousButtons.get(control.action) === true;
        if (pressed && !wasPressed) {
          onButton(control.action, { repeat: false, gamepad });
          onActivity(gamepad);
          if (control.repeats) nextRepeats.set(control.action, time + Number(repeatDelay));
        } else if (pressed && control.repeats && time >= (nextRepeats.get(control.action) || Infinity)) {
          onButton(control.action, { repeat: true, gamepad });
          onActivity(gamepad);
          nextRepeats.set(control.action, time + Number(repeatInterval));
        } else if (!pressed) {
          nextRepeats.delete(control.action);
        }
        previousButtons.set(control.action, pressed);
      }
      return gamepad;
    }

    function tick(timestamp) {
      if (!running) return;
      poll(timestamp);
      frame = requestFrame(tick);
    }

    return Object.freeze({
      start() {
        if (running) return;
        running = true;
        frame = requestFrame(tick);
      },
      stop() {
        running = false;
        if (frame !== null) cancelFrame(frame);
        frame = null;
        activeIndex = null;
        lastTime = null;
        resetButtonState();
      },
      poll,
      get activeIndex() { return activeIndex; }
    });
  }

  function defaultGetGamepads() {
    return typeof navigator !== "undefined" && typeof navigator.getGamepads === "function"
      ? navigator.getGamepads()
      : [];
  }

  function defaultRequestFrame(callback) {
    return typeof requestAnimationFrame === "function"
      ? requestAnimationFrame(callback)
      : setTimeout(() => callback(defaultNow()), 16);
  }

  function defaultCancelFrame(frame) {
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
    else clearTimeout(frame);
  }

  function defaultNow() {
    return typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, Number(value) || 0));
  }

  return Object.freeze({ BUTTONS, stickVector, buttonPressed, selectGamepad, createGamepadInput });
});
