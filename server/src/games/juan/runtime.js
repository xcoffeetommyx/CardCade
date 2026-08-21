import { GameError } from "../../game-error.js";
import { MatchEngine } from "./match-engine.js";

const BOT_NAMES = ["Juno", "Pip", "Rook", "Mox", "Sol", "Kit", "Dex"];
const BOT_STYLES = ["steady", "pressure", "patient"];

export class JuanRuntime {
  #matches = new Map();
  #engine;

  constructor({ matchEngine = new MatchEngine(), restoredMatches = [] } = {}) {
    this.#engine = matchEngine;
    for (const record of restoredMatches) {
      if (record?.gameId !== "juan" || typeof record.code !== "string" || !record.state?.players) continue;
      this.#matches.set(record.code, structuredClone(record.state));
    }
  }

  has(roomCode) {
    return this.#matches.has(roomCode);
  }

  remove(roomCode) {
    return this.#matches.delete(roomCode);
  }

  start(room) {
    if (room.gameId !== "juan") throw new GameError("That room is not configured for JUAN.", "WRONG_GAME", 409);
    if (this.#matches.has(room.code)) throw new GameError("This JUAN match has already started.", "MATCH_STARTED", 409);

    const players = room.players.map((player) => ({ seat: player.seat, name: player.name, type: "human" }));
    const occupied = new Set(players.map((player) => player.seat));
    for (let index = 0; index < room.gameSettings.botCount; index += 1) {
      const seat = Array.from({ length: room.capacity }, (_, candidate) => candidate).find((candidate) => !occupied.has(candidate));
      if (seat === undefined) break;
      occupied.add(seat);
      players.push({
        seat,
        name: BOT_NAMES[index] || `CPU ${index + 1}`,
        type: "bot",
        style: BOT_STYLES[index % BOT_STYLES.length]
      });
    }
    players.sort((left, right) => left.seat - right.seat);

    const match = this.#engine.createMatch(players);
    this.#matches.set(room.code, match);
    return match;
  }

  view(room) {
    const match = this.#requireMatch(room.code);
    const viewer = room.players.find((player) => player.isYou);
    if (!viewer) throw new GameError("No player view exists for this JUAN session.", "SEAT_NOT_FOUND", 404);
    const connections = new Map(room.players.map((player) => [player.seat, player.connected]));
    return this.#engine.viewFor(match, viewer.seat, connections);
  }

  act(room, action) {
    const match = this.#requireMatch(room.code);
    const viewer = room.players.find((player) => player.isYou);
    if (!viewer) throw new GameError("No player view exists for this JUAN session.", "SEAT_NOT_FOUND", 404);

    switch (action.type) {
      case "play":
        this.#engine.play(match, viewer.seat, action.cardId, action.chosenColor);
        break;
      case "draw":
        this.#engine.draw(match, viewer.seat);
        break;
      case "end_turn":
        this.#engine.endTurn(match, viewer.seat);
        break;
      default:
        throw new GameError("That JUAN action is not supported.", "UNKNOWN_GAME_ACTION");
    }
    return match;
  }

  runBotTurn(roomCode) {
    return this.#engine.runBotTurn(this.#requireMatch(roomCode));
  }

  replaceHumanWithBot(roomCode, seat) {
    if (!this.#matches.has(roomCode)) return false;
    return this.#engine.replaceWithBot(this.#matches.get(roomCode), seat);
  }

  snapshot(roomCode) {
    return structuredClone(this.#requireMatch(roomCode));
  }

  #requireMatch(roomCode) {
    const match = this.#matches.get(roomCode);
    if (!match) throw new GameError("No JUAN match is active in this room.", "MATCH_NOT_ACTIVE", 409);
    return match;
  }
}
