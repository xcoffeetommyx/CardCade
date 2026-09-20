import standard52 from "../../../../shared/standard-52.js";
import { requireRule as check, shuffle } from "./runtime.js";

const rank = c => standard52.RANKS.indexOf(c.rank) + 1;
const red = c => c.suit === "H" || c.suit === "D";
const boardKeys = ["tableau", "stock", "waste", "foundations", "moves", "roundOver", "matchOver"];
const saveBoard = m => Object.fromEntries(boardKeys.map(key => [key, structuredClone(m[key])]));

export class SolitaireEngine {
  constructor({ shuffleDeck = shuffle } = {}) { this.shuffleDeck = shuffleDeck; }
  create(players, settings = {}) {
    check(players.length === 1 && players[0].type === "human", "Solitaire needs one human player.");
    const drawCount = settings.drawCount ?? 1;
    check(drawCount === 1 || drawCount === 3, "Draw count must be one or three.");
    const m = { gameId: "solitaire", players, activeSeat: players[0].seat, round: 1, drawCount, phase: "playing" };
    this.deal(m); return m;
  }
  deal(m) {
    const cards = this.shuffleDeck(standard52.makeDeck());
    m.tableau = Array.from({ length: 7 }, (_, i) => cards.splice(0, i + 1).map((c, n) => ({ ...c, faceUp: n === i })));
    m.stock = cards; m.waste = []; m.foundations = [[], [], [], []]; m.moves = 0;
    m.roundOver = false; m.matchOver = false; m.history = []; m.original = saveBoard(m);
  }
  pile(m, loc) {
    check(loc && typeof loc === "object", "Choose a pile.");
    if (loc.pile === "waste") return m.waste;
    check(["tableau", "foundations"].includes(loc.pile) && Number.isInteger(loc.column) && loc.column >= 0 && loc.column < m[loc.pile].length, "Unknown pile.");
    return m[loc.pile][loc.column];
  }
  canMove(m, from, to) {
    try {
      const source = this.pile(m, from), target = this.pile(m, to);
      if (source === target || to.pile === "waste") return false;
      const index = from.pile === "tableau" ? from.index : source.length - 1;
      if (!Number.isInteger(index) || index < 0 || index >= source.length) return false;
      const run = source.slice(index), first = run[0];
      if (from.pile === "tableau" && run.some((c, i) => !c.faceUp || i > 0 && (red(c) === red(run[i - 1]) || rank(c) !== rank(run[i - 1]) - 1))) return false;
      const top = target.at(-1);
      if (to.pile === "foundations") return run.length === 1 && (!top ? rank(first) === 1 : top.suit === first.suit && rank(first) === rank(top) + 1);
      return !top ? rank(first) === 13 : top.faceUp && red(first) !== red(top) && rank(first) === rank(top) - 1;
    } catch { return false; }
  }
  move(m, from, to) {
    check(this.canMove(m, from, to), "That sequence cannot move there.");
    const source = this.pile(m, from), target = this.pile(m, to);
    const index = from.pile === "tableau" ? from.index : source.length - 1;
    target.push(...source.splice(index).map(c => ({ ...c, faceUp: true })));
    if (from.pile === "tableau" && source.length) source.at(-1).faceUp = true;
  }
  moves(m) {
    const sources = [{ pile: "waste" }, ...m.foundations.map((_, column) => ({ pile: "foundations", column })),
      ...m.tableau.flatMap((pile, column) => pile.flatMap((c, index) => c.faceUp ? [{ pile: "tableau", column, index }] : []))];
    const targets = [...m.foundations.map((_, column) => ({ pile: "foundations", column })), ...m.tableau.map((_, column) => ({ pile: "tableau", column }))];
    return sources.flatMap(from => targets.filter(to => this.canMove(m, from, to)).map(to => ({ from, to })));
  }
  autoReady(m) { return !m.stock.length && !m.waste.length && m.tableau.every(p => p.every(c => c.faceUp)); }
  act(m, seat, a) {
    check(seat === m.activeSeat, "This is a private Solitaire game.");
    if (a.type === "undo") {
      check(m.history.length, "Nothing to undo."); Object.assign(m, m.history.pop()); return;
    }
    if (a.type === "restart") { Object.assign(m, structuredClone(m.original)); m.history = []; return; }
    if (a.type === "new_deal") { m.round++; this.deal(m); return; }
    check(!m.matchOver, "This deal is complete.");
    const before = saveBoard(m);
    if (a.type === "move") this.move(m, a.from, a.to);
    else if (a.type === "draw") {
      check(m.stock.length || m.waste.length, "The stock and waste are empty.");
      if (!m.stock.length) { m.stock = m.waste.reverse().map(({ faceUp, ...c }) => c); m.waste = []; }
      else for (let i = 0; i < m.drawCount && m.stock.length; i++) m.waste.push(m.stock.pop());
    } else if (a.type === "auto_finish") {
      check(this.autoReady(m), "Expose all tableau cards and empty the stock and waste first.");
      for (let i = 0; i < 52; i++) {
        const move = this.moves(m).find(move => move.from.pile === "tableau" && move.to.pile === "foundations");
        if (!move) break;
        this.move(m, move.from, move.to);
      }
    } else check(false, "Unknown Solitaire action.");
    m.history.push(before); m.moves++;
    m.matchOver = m.foundations.every(p => p.length === 13); m.roundOver = m.matchOver;
  }
  delay() { return null; }
  step() { return false; }
  view(m) {
    const available = this.moves(m);
    // Prefer revealing a card, then foundations; never inspect future stock cards.
    const hint = available.find(a => a.from.pile === "tableau" && a.from.index > 0 && !m.tableau[a.from.column][a.from.index - 1].faceUp)
      || available.find(a => a.to.pile === "foundations")
      || available.find(a => a.from.pile !== "foundations" && !(a.from.pile === "tableau" && a.from.index === 0 && !m.tableau[a.to.column]?.length))
      || (m.stock.length || m.waste.length ? { type: "draw" } : null);
    return { type: "solitaire_match_state", hand: [], state: {
      gameId: "solitaire", revision: m.revision, round: m.round, phase: m.matchOver ? "complete" : "playing",
      players: m.players.map(p => ({ ...p, score: m.foundations.reduce((n, p) => n + p.length, 0) })), activeSeat: m.activeSeat,
      tableau: m.tableau.map(p => p.map(c => c.faceUp ? c : { faceUp: false })), foundations: m.foundations,
      waste: m.waste.slice(-m.drawCount), wasteCount: m.waste.length, stockCount: m.stock.length,
      moves: m.moves, drawCount: m.drawCount, roundOver: m.roundOver, matchOver: m.matchOver,
      actions: { undo: !!m.history.length, autoFinish: !m.matchOver && this.autoReady(m), hint },
      lastMoveText: m.matchOver ? "All four suits complete. You won!" : "Build alternating colors downward; foundations rise by suit."
    } };
  }
}
