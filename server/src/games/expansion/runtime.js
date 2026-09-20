import { randomInt } from "node:crypto";
import { GameError } from "../../game-error.js";

export function requireRule(condition, message, code = "ILLEGAL_ACTION") {
  if (!condition) throw new GameError(message, code, 409);
}

export function shuffle(cards) {
  const result = cards.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// These games share only the room adapter. Engines own their rules and views.
export class ExpansionRuntime {
  constructor({ gameId, engine, restoredMatches = [], botActionDelayMs = 1100 }) {
    this.gameId = gameId;
    this.engine = engine;
    this.botActionDelayMs = botActionDelayMs;
    this.matches = new Map(restoredMatches.filter(record => record?.gameId === gameId && record.state?.players)
      .map(record => [record.code, structuredClone(record.state)]));
  }
  has(code) { return this.matches.has(code); }
  remove(code) { return this.matches.delete(code); }
  get(code) {
    requireRule(this.has(code), "No active match exists.", "MATCH_NOT_ACTIVE");
    return this.matches.get(code);
  }
  start(room) {
    requireRule(room.gameId === this.gameId, "Wrong game.", "WRONG_GAME");
    requireRule(!this.has(room.code), "The match already started.", "MATCH_STARTED");
    const players = room.players.map(p => ({ seat: p.seat, name: p.name, type: "human" }));
    for (let i = 0; i < room.gameSettings.botCount; i++) {
      const seat = Array.from({ length: room.capacity }, (_, n) => n).find(n => !players.some(p => p.seat === n));
      players.push({ seat, name: ["Pip", "Juno", "Rook"][i] || `CPU ${i + 1}`, type: "bot" });
    }
    players.sort((a, b) => a.seat - b.seat);
    const match = this.engine.create(players, room.gameSettings);
    match.revision = 0;
    this.matches.set(room.code, match);
    return match;
  }
  view(room) {
    const viewer = room.players.find(p => p.isYou);
    requireRule(viewer, "No private seat exists.", "SEAT_NOT_FOUND");
    return this.engine.view(this.get(room.code), viewer.seat, room);
  }
  act(room, action) {
    const current = this.get(room.code);
    const viewer = room.players.find(p => p.isYou);
    requireRule(viewer, "No private seat exists.", "SEAT_NOT_FOUND");
    requireRule(action.revision === current.revision, "The table changed. Try again.", "STALE_ACTION");
    if (action.type === "next_round") requireRule(viewer.role === "host", "Only the host can deal.", "HOST_ONLY");
    const next = structuredClone(current);
    this.engine.act(next, viewer.seat, action, room);
    next.revision = current.revision + 1;
    this.matches.set(room.code, next);
    return next;
  }
  nextActionDelay(code) { return this.engine.delay(this.get(code), this.botActionDelayMs); }
  runScheduledStep(code) {
    const current = this.get(code);
    const next = structuredClone(current);
    if (!this.engine.step(next)) return false;
    next.revision = current.revision + 1;
    this.matches.set(code, next);
    return true;
  }
  runBotTurn(code) { return this.runScheduledStep(code); }
  replaceHumanWithBot(code, seat) {
    if (this.gameId === "solitaire" || !this.has(code)) return false;
    const match = this.get(code);
    const player = match.players.find(p => p.seat === seat);
    if (!player || player.type !== "human") return false;
    player.type = "bot";
    player.name += " · CPU";
    match.revision++;
    return true;
  }
  snapshot(code) { return structuredClone(this.get(code)); }
}
