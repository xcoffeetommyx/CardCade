import { randomUUID } from "node:crypto";
import deck from "../../../../shared/juan-fleep-deck.js";
import { requireRule as check, shuffle } from "./runtime.js";

const player = (m, seat) => m.players.find(p => p.seat === seat);
const face = (m, card) => ({ id: card.id, ...card[m.side] });
const top = m => face(m, m.discard.at(-1));
const nextSeat = (m, seat, steps = 1) => m.players[(m.players.findIndex(p => p.seat === seat) + m.direction * steps + m.players.length * 4) % m.players.length].seat;

export class FleepEngine {
  constructor({ shuffleDeck = shuffle, now = () => Date.now() } = {}) { this.shuffleDeck = shuffleDeck; this.now = now; }
  create(players) {
    check(players.length >= 2 && players.length <= 4, "JUAN FLEEP needs two to four players.");
    const dark = this.shuffleDeck(deck.inventory("dark"));
    const cards = deck.inventory("light").map((light, i) => ({ id: randomUUID(), light, dark: dark[i] }));
    const m = { gameId: "juan-fleep", players: players.map(p => ({ ...p, score: 0, hand: [] })), round: 0, winners: [] };
    this.deal(m, cards); return m;
  }
  deal(m, cards = [...m.stock, ...m.discard, ...m.players.flatMap(p => p.hand)]) {
    m.round++; m.side = "light"; m.direction = 1; m.phase = "playing"; m.roundOver = false; m.matchOver = false;
    m.stock = this.shuffleDeck(cards); m.discard = []; m.pending = null; m.call = null; m.drawnId = null; m.stalls = 0;
    m.announcement = null; m.challengeReveal = null; m.reviewResume = null; m.flipSequence = 0;
    m.players.forEach(p => { p.hand = m.stock.splice(0, 7); });
    const dealer = m.players[(m.round - 1) % m.players.length];
    m.activeSeat = nextSeat(m, dealer.seat);
    let card = m.stock.pop();
    while (card.light.kind === "wild-two") { m.stock.unshift(card); card = m.stock.pop(); }
    m.discard = [card]; m.activeColor = card.light.color;
    m.lastMoveText = "Light side. Match a color, number, or action.";
    if (card.light.kind === "prism") m.phase = "choose-color";
    else if (card.light.kind === "fleep") this.flip(m);
    else if (card.light.kind === "turnabout") { m.direction = -1; m.activeSeat = dealer.seat; }
    else if (card.light.kind === "pause") m.activeSeat = nextSeat(m, m.activeSeat);
    else if (card.light.kind === "draw-one") { this.drawCards(m, m.activeSeat, 1); m.activeSeat = nextSeat(m, m.activeSeat); }
  }
  take(m) {
    if (!m.stock.length && m.discard.length > 1) {
      const last = m.discard.pop(); m.stock = this.shuffleDeck(m.discard); m.discard = [last];
    }
    return m.stock.pop() || null;
  }
  drawCards(m, seat, count, color = null) {
    const p = player(m, seat); let drawn = 0;
    // Exhaustion terminates even when every card of the requested color is held.
    while (color ? true : drawn < count) {
      const card = this.take(m); if (!card) break;
      p.hand.push(card); drawn++;
      if (color && card[m.side].color === color) break;
    }
    return drawn;
  }
  flip(m) {
    m.side = m.side === "light" ? "dark" : "light";
    m.stock.reverse(); m.discard.reverse(); m.flipSequence++;
    m.activeColor = top(m).color;
    if (!m.activeColor) m.phase = "choose-color";
    m.lastMoveText = `FLEEP! ${m.side === "dark" ? "Dark" : "Light"} side is active.`;
  }
  legal(m, p) {
    if (m.phase !== "playing" || m.pending || m.roundOver || m.activeSeat !== p.seat) return [];
    return p.hand.map(c => face(m, c)).filter(c => (!m.drawnId || c.id === m.drawnId) && deck.canPlay(c, top(m), m.activeColor));
  }
  missedCall(m) {
    if (!m.call) return;
    this.drawCards(m, m.call.seat, 2); m.lastMoveText = `${player(m, m.call.seat).name} missed Call JUAN and draws two.`; m.call = null;
  }
  finish(m) {
    if (m.pending || m.phase === "choose-color") return;
    const winner = m.players.find(p => !p.hand.length);
    if (!winner) return;
    const points = m.players.filter(p => p !== winner).reduce((n, p) => n + p.hand.reduce((sum, c) => sum + deck.points(c[m.side]), 0), 0);
    winner.score += points; m.roundOver = true; m.phase = "complete"; m.call = null;
    m.matchOver = m.round >= 4;
    m.lastMoveText = `${winner.name} wins ${points} points on the ${m.side} side.`;
    if (m.matchOver) m.winners = m.players.filter(p => p.score === Math.max(...m.players.map(p => p.score))).map(p => p.seat);
  }
  act(m, seat, a) {
    const p = player(m, seat); check(p, "Unknown seat.");
    if (a.type === "next_round") { check(m.roundOver && !m.matchOver, "There is no next round yet."); this.deal(m); return; }
    check(!m.roundOver, "The round has ended.");
    if (a.type === "acknowledge_challenge") {
      check(m.phase === "challenge-review" && m.challengeReveal?.seat === seat, "There is no evidence to acknowledge.");
      Object.assign(m, m.reviewResume); m.reviewResume = null; m.challengeReveal = null; return;
    }
    check(m.phase !== "challenge-review", "The challenger is reviewing the evidence.");
    if (a.type === "juan_call" || a.type === "juan_catch") {
      check(m.call && (a.type === "juan_call" ? m.call.seat === seat : m.call.seat !== seat), "There is no call to resolve.");
      if (a.type === "juan_catch") this.drawCards(m, m.call.seat, 2);
      m.announcement = { seat, text: a.type === "juan_call" ? `${p.name}: JUAN!` : `${p.name} catches a missed JUAN!`, id: (m.announcement?.id || 0) + 1 };
      m.lastMoveText = m.announcement.text; m.call = null; return;
    }
    check(m.activeSeat === seat, "Wait for your turn.");
    if (a.type === "choose_color") {
      check(m.phase === "choose-color" && deck.COLORS[m.side].includes(a.color), "Choose a color on the active side.");
      m.activeColor = a.color; m.phase = "playing"; this.finish(m); return;
    }
    if (a.type === "accept" || a.type === "challenge") {
      check(m.pending?.targetSeat === seat, "There is no challenge window.");
      this.missedCall(m);
      const pending = m.pending; const guilty = a.type === "challenge" && pending.illegal;
      const recipient = guilty ? pending.sourceSeat : seat;
      if (pending.kind === "wild-color") this.drawCards(m, recipient, 0, pending.color);
      else this.drawCards(m, recipient, 2);
      if (a.type === "challenge" && !guilty) this.drawCards(m, seat, 2);
      if (a.type === "challenge") m.challengeReveal = { seat, hand: pending.evidence, guilty };
      m.lastMoveText = a.type === "accept" ? `${p.name} accepts the draw.` : guilty ? "Challenge succeeds; the source draws." : "Challenge fails; two extra cards drawn.";
      m.pending = null; m.activeSeat = guilty ? seat : nextSeat(m, seat); m.phase = "playing";
      this.finish(m);
      if (a.type === "challenge" && p.type === "human") {
        m.reviewResume = { activeSeat: m.activeSeat, phase: m.phase, roundOver: m.roundOver, matchOver: m.matchOver };
        m.activeSeat = seat; m.phase = "challenge-review"; m.roundOver = false; m.matchOver = false;
      }
      return;
    }
    check(m.phase === "playing" && !m.pending, "Resolve the pending decision first.");
    if (a.type === "draw") {
      check(!m.drawnId, "Play or keep the card you just drew.");
      this.missedCall(m); m.challengeReveal = null;
      const card = this.take(m);
      if (card) { p.hand.push(card); m.stalls = 0; }
      else m.stalls++;
      if (card && deck.canPlay(face(m, card), top(m), m.activeColor)) m.drawnId = card.id;
      else m.activeSeat = nextSeat(m, seat);
      m.lastMoveText = `${p.name} ${card ? "draws a card" : "cannot draw; passes"}.`;
      if (m.stalls >= m.players.length) {
        m.roundOver = true; m.phase = "complete"; m.matchOver = m.round >= 4;
        m.lastMoveText = "No cards can be drawn or played. Round ends without points.";
        if (m.matchOver) m.winners = m.players.filter(p => p.score === Math.max(...m.players.map(p => p.score))).map(p => p.seat);
      }
      return;
    }
    if (a.type === "end_turn") {
      check(m.drawnId, "Draw a card first."); this.missedCall(m); m.drawnId = null; m.activeSeat = nextSeat(m, seat); return;
    }
    check(a.type === "play", "Unknown action.");
    const c = this.legal(m, p).find(c => c.id === a.cardId); check(c, "That card does not match.");
    if (!c.color) check(deck.COLORS[m.side].includes(a.chosenColor), "Choose a color before playing a Wild.");
    this.missedCall(m); m.challengeReveal = null; m.stalls = 0;
    const evidence = p.hand.filter(card => card.id !== c.id).map(card => face(m, card));
    const illegal = evidence.some(card => card.color === m.activeColor);
    const physical = p.hand.find(card => card.id === c.id);
    p.hand = p.hand.filter(card => card.id !== c.id); m.discard.push(physical); m.drawnId = null;
    m.activeColor = c.color || a.chosenColor; m.activeSeat = nextSeat(m, seat);
    m.lastMoveText = `${p.name} plays ${deck.label(c)}.`;
    if (c.kind === "turnabout") { m.direction *= -1; m.activeSeat = m.players.length === 2 ? seat : nextSeat(m, seat); }
    if (c.kind === "pause") m.activeSeat = nextSeat(m, seat, 2);
    if (c.kind === "pause-all") m.activeSeat = seat;
    if (c.kind === "draw-one" || c.kind === "draw-five") { this.drawCards(m, m.activeSeat, c.kind === "draw-one" ? 1 : 5); m.activeSeat = nextSeat(m, m.activeSeat); }
    if (c.kind === "wild-two" || c.kind === "wild-color") {
      m.pending = { sourceSeat: seat, targetSeat: m.activeSeat, kind: c.kind, color: a.chosenColor, illegal, evidence };
      m.phase = "challenge";
    }
    if (c.kind === "fleep") this.flip(m);
    if (p.hand.length === 1) {
      if (a.declareJuan === true) m.announcement = { seat, text: `${p.name}: JUAN!`, id: (m.announcement?.id || 0) + 1 };
      else m.call = { seat, at: this.now() + 2600 };
    }
    this.finish(m);
  }
  delay(m, delay) {
    if (m.roundOver) return null;
    if (m.call?.at != null) return Math.max(0, m.call.at - this.now());
    return player(m, m.activeSeat)?.type === "bot" ? delay : null;
  }
  step(m) {
    if (m.roundOver) return false;
    if (m.call) {
      if (m.call.at > this.now()) return false;
      const caller = player(m, m.call.seat);
      if (caller.type === "bot") { this.act(m, caller.seat, { type: "juan_call" }); return true; }
      const catcher = m.players.find(p => p.type === "bot" && p !== caller);
      if (catcher) { this.act(m, catcher.seat, { type: "juan_catch" }); return true; }
      // Humans can still call/catch until another action; no busy timer.
      m.call.at = null; return true;
    }
    const p = player(m, m.activeSeat); if (p.type !== "bot") return false;
    if (m.phase === "challenge-review") { this.act(m, p.seat, { type: "acknowledge_challenge" }); return true; }
    const color = deck.COLORS[m.side].slice().sort((a, b) => p.hand.filter(c => c[m.side].color === b).length - p.hand.filter(c => c[m.side].color === a).length)[0];
    if (m.phase === "choose-color") this.act(m, p.seat, { type: "choose_color", color });
    else if (m.pending) this.act(m, p.seat, { type: "accept" });
    else {
      const card = this.legal(m, p).sort((a, b) => deck.points(b) - deck.points(a))[0];
      this.act(m, p.seat, card ? { type: "play", cardId: card.id, chosenColor: color } : { type: m.drawnId ? "end_turn" : "draw" });
    }
    return true;
  }
  view(m, seat) {
    const p = player(m, seat); check(p, "Unknown seat.");
    const opposite = m.side === "light" ? "dark" : "light";
    return { type: "juan_fleep_match_state", hand: p.hand.map(c => face(m, c)),
      challengeHand: m.challengeReveal?.seat === seat ? m.challengeReveal.hand : null,
      state: { gameId: m.gameId, revision: m.revision, round: m.round, totalRounds: 4, activeSeat: m.activeSeat, phase: m.phase,
        players: m.players.map(({ hand, ...p }) => ({ ...p, cardCount: hand.length, outward: p.seat === seat ? [] : hand.map(c => ({ id: c.id, ...c[opposite] })) })),
        side: m.side, direction: m.direction, activeColor: m.activeColor, topCard: top(m), stockCount: m.stock.length,
        stockFace: m.stock.length ? { ...m.stock.at(-1)[opposite] } : null, flipSequence: m.flipSequence,
        drawnId: m.activeSeat === seat ? m.drawnId : null,
        pending: m.pending ? { sourceSeat: m.pending.sourceSeat, targetSeat: m.pending.targetSeat, kind: m.pending.kind, color: m.pending.color } : null,
        call: m.call ? { seat: m.call.seat } : null, announcement: m.announcement,
        actions: { legalCardIds: this.legal(m, p).map(c => c.id) }, roundOver: m.roundOver, matchOver: m.matchOver, winners: m.winners, lastMoveText: m.lastMoveText
      } };
  }
}
