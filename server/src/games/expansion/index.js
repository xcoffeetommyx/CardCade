import { ExpansionRuntime } from "./runtime.js";
import { TrickEngine } from "./trick-engine.js";
import { SolitaireEngine } from "./solitaire-engine.js";
import { FleepEngine } from "./fleep-engine.js";

export function createExpansionRuntimes(options = {}) {
  return new Map([
    ["spades", new TrickEngine("spades")], ["hearts", new TrickEngine("hearts")],
    ["solitaire", new SolitaireEngine()], ["juan-fleep", new FleepEngine()]
  ].map(([gameId, engine]) => [gameId, new ExpansionRuntime({ ...options, gameId, engine })]));
}
