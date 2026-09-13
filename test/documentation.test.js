import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { games } from "../server/src/game-catalog.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");

test("exhaustive playable-game documentation includes the canonical catalog", () => {
  const readme = read("README.md");
  const architecture = read("docs/architecture.md");
  const available = games.filter((game) => game.status === "available");

  for (const game of available) {
    assert.ok(readme.includes(game.name), `README lists ${game.name}`);
    assert.ok(architecture.includes(game.name), `architecture lists ${game.name}`);
  }
  assert.match(readme, /server\/src\/game-catalog\.js.*canonical source/);
  assert.match(architecture, /canonical.*server\/src\/game-catalog\.js/);
  assert.match(readme, /Finders Makers.*Solo, Multiplayer.*Hot Seat/);
  assert.ok(available.find((game) => game.id === "finders-makers")?.supportsBots);
});

test("JUAN documentation defines a four-round cumulative match and intentional ties", () => {
  const juan = read("docs/juan.md");

  assert.match(juan, /match is exactly four rounds/i);
  assert.match(juan, /Scores are cumulative/i);
  assert.match(juan, /joint winners/i);
  assert.match(juan, /Round 1 chooses one opening player at random/i);
  assert.match(juan, /number scores its printed value plus one.*Pause scores 12.*Prism Burst scores 35/is);
  assert.doesNotMatch(juan, /Emptying the hand wins the match/i);
});

test("custom-game documentation matches implemented inventory and round structure", () => {
  const rummy = read("docs/rotating-rummy.md");
  const finders = read("docs/finders-makers.md");

  assert.match(rummy, /8 Glitches/);
  assert.match(rummy, /4 Locks/);
  assert.match(finders, /normal match lasts four rounds/i);
  assert.match(finders, /exactly three Pieces/i);
  assert.match(finders, /2–2 tie.*Sudden Death/is);
});
