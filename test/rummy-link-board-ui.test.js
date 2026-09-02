import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../public/app.css", import.meta.url), "utf8");
const source = app.slice(app.indexOf("function renderRummyLinkBoard("), app.indexOf("function renderRotatingRummyGame("));
const render = runInNewContext(`${source}; renderRummyLinkBoard`, {
  escapeHtml: (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;"),
  renderRotatingRummyCard: (card) => `<span>${card.value}</span>`
});
const targets = Array.from({ length: 8 }, (_, index) => ({
  player: { seat: Math.floor(index / 2), name: `Player ${Math.floor(index / 2)}` },
  groupIndex: index % 2,
  group: [{ value: 4 }, { value: 4 }]
}));
const options = { viewerSeat: 0, selection: { linkTarget: null }, canSelectLinkTarget: false, routeComplete: false, tableStatus: "Timmy, draw a card" };

test("Rummy reserves a links strip before completion without a visible turn box", () => {
  const html = render({ ...options, linkTargets: [] });
  assert.match(html, /class="rummy-link-board"/);
  assert.match(html, /Completed Route groups will appear here/);
  assert.match(html, /class="sr-only" role="status">Timmy, draw a card/);
  assert.doesNotMatch(html, /class="game-status"|data-action="rummy-select-link-target"/);
  const game = app.slice(app.indexOf("function renderRotatingRummyGame("), app.indexOf("function findersPlayerLabel("));
  assert.match(game, /tableStatusMarkup: renderRummyLinkBoard/);
  assert.doesNotMatch(game.slice(game.indexOf("centerMarkup:"), game.indexOf("handMarkup:")), /rummy-link-board|linkTargets/);
});

test("all completed groups remain reachable, with linking gated by the current turn", () => {
  const locked = render({ ...options, linkTargets: targets });
  assert.equal((locked.match(/data-action="rummy-select-link-target"/g) || []).length, 8);
  assert.equal((locked.match(/ disabled>/g) || []).length, 8);
  assert.match(locked, /Swipe for more groups/);
  assert.match(locked, /tabindex="0" aria-label="Route groups/);
  const active = render({ ...options, linkTargets: targets, canSelectLinkTarget: true, routeComplete: true, selection: { linkTarget: targets[7] } });
  assert.equal((active.match(/aria-pressed="true"/g) || []).length, 1);
  assert.match(active, /data-rummy-link-seat="3" data-rummy-link-group="1" aria-pressed="true"/);
  assert.doesNotMatch(active, / disabled>/);
  assert.match(active, /Link to Your Route/);
});

test("Rummy fits a dynamic viewport and keeps help and group scrolling inside it", () => {
  const layout = css.slice(css.indexOf("/* Rummy owns five viewport rows:"));
  assert.match(layout, /--game-viewport-height: 100dvh/);
  assert.match(layout, /grid-template-rows: auto auto auto minmax\(0, 1fr\) auto/);
  assert.match(layout, /container-type: size;\s*min-height: 0/);
  assert.match(layout, /\.rummy-pattern-help > div:not\(\[hidden\]\) \{\s*position: absolute/);
  assert.match(layout, /grid-auto-flow: column;[\s\S]*?overflow-x: auto/);
  assert.match(layout, /orientation: landscape[\s\S]*?grid-auto-flow: row/);
  assert.match(layout, /\.rummy-pile-zone \{ container-type: size/);
  assert.match(layout, /height: min\(114px, 100cqh\)/);
  assert.doesNotMatch(css, /\.rummy-link-group-card(?:\.selected)? button/);
  assert.match(app, /const rummyViewportFit = state\.room\?\.gameId === "rotating-rummy";/);
  assert.match(app, /rummyLinks: rummyLinks \? \{ left: rummyLinks\.scrollLeft, top: rummyLinks\.scrollTop \}/);
  assert.match(app, /scrollTo\(position\.rummyLinks\.left, position\.rummyLinks\.top\)/);
});
