import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createTurnAlertTracker, createTurnFeedback, turnOpportunity } from "../public/turn-alerts.js";

function input(gameId = "rotating-rummy", mode = "solo") {
  return {
    room: { code: "ALERT", gameId, players: [{ seat: 0, isYou: true }] },
    view: { state: { round: 1, phase: "playing", activeSeat: 0, players: [
      { seat: 0, name: "Timmy", type: "human" },
      { seat: 1, name: "Sam", type: "human" },
      { seat: 2, name: "Byte", type: "bot" }
    ] } },
    mode,
    humanSeats: [{ seat: 0 }, { seat: 1 }]
  };
}

test("Every turn-based game alerts only its local human in Solo and Multiplayer", () => {
  for (const game of ["three-seven", "thirteen", "blackjack", "holdem", "five-card-draw", "juan", "rotating-rummy", "finders-makers"]) {
    for (const mode of ["solo", "multiplayer"]) {
      const state = input(game, mode);
      assert.equal(turnOpportunity(state).message, "Timmy, your turn!");
      state.view.state.activeSeat = 1;
      assert.equal(turnOpportunity(state), null);
      state.view.state.activeSeat = 2;
      assert.equal(turnOpportunity(state), null);
      state.view.state.activeSeat = null;
      assert.equal(turnOpportunity(state), null, "null must not become seat zero");
    }
  }
});

test("Hot Seat notifies the next human while keeping hands covered; revealing does not alert again", () => {
  const state = input("rotating-rummy", "hot-seat");
  const tracker = createTurnAlertTracker();
  assert.ok(tracker.update(state));
  state.view.state.activeSeat = 1;
  assert.equal(tracker.update(state).message, "Sam, your turn!");
  state.room.players = [{ seat: 1, isYou: true }];
  state.view.hand = [{ id: "private-card" }];
  assert.equal(tracker.update(state), null);
  state.view.state.activeSeat = 2;
  assert.equal(tracker.update(state), null);
});

test("Repeated snapshots, selection, draws and Route plays do not repeat an alert", () => {
  const state = input();
  const tracker = createTurnAlertTracker();
  assert.ok(tracker.update(state));
  assert.equal(tracker.update(structuredClone(state)), null);
  state.view.state.turnStage = "play";
  state.view.state.lastMoveText = "Completed a Route";
  assert.equal(tracker.update(state), null);
  state.view.state.activeSeat = 2;
  assert.equal(tracker.update(state), null);
  state.view.state.activeSeat = 0;
  assert.ok(tracker.update(state));
  state.view.state.roundOver = true;
  assert.equal(tracker.update(state), null);
  state.view.state.roundOver = false;
  state.view.state.round++;
  assert.ok(tracker.update(state));
  tracker.reset();
  assert.ok(tracker.update(state));
});

test("Insurance, new poker streets and JUAN challenge decisions count, dealer and ended phases do not", () => {
  const state = input("blackjack");
  const tracker = createTurnAlertTracker();
  state.view.state.phase = "insurance";
  assert.ok(tracker.update(state));
  state.view.state.phase = "player-turn";
  assert.ok(tracker.update(state));
  for (const phase of ["dealer-turn", "dealing", "showdown", "complete", "finished", "waiting"]) {
    state.view.state.phase = phase;
    assert.equal(tracker.update(state), null);
  }
  state.room.gameId = "holdem";
  for (const phase of ["preflop", "flop", "turn", "river"]) {
    state.view.state.phase = phase;
    assert.ok(tracker.update(state));
  }
  state.room.gameId = "juan";
  state.view.state.phase = "playing";
  state.view.state.activeSeat = 1;
  state.view.state.prismBurstChallenge = { targetSeat: 0 };
  assert.ok(tracker.update(state));
  state.view.state.roundOver = true;
  assert.equal(tracker.update(state), null);
});

test("Snap alerts ready-up only, never reveals whether to SNAP", () => {
  const state = input("snap");
  state.view.state.activeSeat = undefined;
  state.view.state.phase = "waiting-for-ready";
  state.view.state.actions = { ready: true };
  assert.equal(turnOpportunity(state).message, "Timmy, ready for the next reveal!");
  state.view.state.actions.ready = false;
  assert.equal(turnOpportunity(state), null);
  for (const phase of ["countdown", "reaction", "finished"]) {
    state.view.state.phase = phase;
    state.view.state.actions = { ready: true, snap: true };
    assert.equal(turnOpportunity(state), null);
  }
});

function fakeAudio(state = "running") {
  const calls = [];
  const audio = { state, currentTime: 3, destination: {},
    resume() { calls.push("resume"); return Promise.resolve(); },
    createOscillator() { return { frequency: {}, connect() {}, disconnect() {}, start() { calls.push("tone"); }, stop() {} }; },
    createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
  };
  return { audio, calls, AudioContext: function () { return audio; } };
}

test("Vibration is preferred and always accompanied by a visible accessible notice", () => {
  const patterns = [];
  const messages = [];
  const fake = fakeAudio();
  const feedback = createTurnFeedback({ ...fake, navigator: { vibrate: (pattern) => { patterns.push(pattern); return true; } }, notify: (message) => messages.push(message) });
  feedback.unlock();
  feedback.play("Timmy, your turn!");
  assert.deepEqual(patterns, [[100, 60, 140]]);
  assert.deepEqual(messages, ["Timmy, your turn!"]);
  assert.deepEqual(fake.calls, []);
});

test("Unavailable, rejected or throwing vibration falls back to a short chime", () => {
  for (const navigator of [{}, { vibrate: () => false }, { vibrate: () => { throw new Error("blocked"); } }]) {
    const fake = fakeAudio();
    const feedback = createTurnFeedback({ ...fake, navigator });
    feedback.unlock();
    feedback.play("Your turn");
    assert.deepEqual(fake.calls, ["tone", "tone"]);
  }
});

test("Disabled alerts and blocked audio are safe and never queue stale chimes", () => {
  let enabled = false;
  const notices = [];
  const fake = fakeAudio("suspended");
  const feedback = createTurnFeedback({ ...fake, navigator: {}, enabled: () => enabled, notify: (message) => notices.push(message) });
  feedback.unlock();
  feedback.play("muted");
  assert.deepEqual(fake.calls, []);
  assert.deepEqual(notices, []);
  enabled = true;
  feedback.play("visible only");
  feedback.unlock();
  assert.deepEqual(fake.calls, ["resume"]);
  assert.deepEqual(notices, ["visible only"]);
});

test("The shared app wires default-on preferences, user activation, and offline delivery", () => {
  const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  const sw = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
  assert.match(app, /getItem\(storageKeys.turnAlerts\) !== "false"/);
  assert.match(app, /if \(event.isTrusted\) turnFeedback.unlock\(\)/);
  assert.match(app, /restoreGameScrollPosition\(gameScrollPosition\);\s+syncTurnAlert\(\)/);
  assert.match(app, /toggle-turn-alerts/);
  assert.match(sw, /turn-alerts\.js\?v=1/);
});
