import standard52 from "../../../../shared/standard-52.js";
import rules from "../../../../shared/trick-rules.js";
import { requireRule as check, shuffle } from "./runtime.js";

export class TrickEngine {
  constructor(gameId, { shuffleDeck = shuffle, now = () => Date.now() } = {}) {
    this.gameId = gameId; this.shuffleDeck = shuffleDeck; this.now = now;
  }
  create(players) {
    check(players.length === 4, "This game requires four seats.");
    const m = { gameId: this.gameId, players: players.map((p, i) => ({ ...p, team: i % 2, score: 0 })),
      round: 0, dealer: 3, teams: [{ id: 0, score: 0, bags: 0 }, { id: 1, score: 0, bags: 0 }], winners: [] };
    this.deal(m); return m;
  }
  deal(m) {
    const deck = this.shuffleDeck(standard52.makeDeck());
    m.round++; m.dealer = (m.dealer + 1) % 4;
    m.players.forEach((p, i) => { p.hand = deck.slice(i * 13, i * 13 + 13); p.bid = null; p.tricks = 0; p.penalty = 0; p.pass = null; });
    m.trick = []; m.captured = []; m.trickNumber = 1; m.broken = false; m.roundOver = false; m.matchOver = false;
    m.resolveAt = null; m.lastTrick = null;
    m.passOffset = [1, 3, 2, 0][(m.round - 1) % 4];
    m.phase = this.gameId === "spades" ? "bidding" : m.passOffset ? "passing" : "playing";
    m.activeSeat = m.players[(m.dealer + 1) % 4].seat;
    if (m.phase === "playing") m.activeSeat = m.players.find(p => p.hand.some(c => c.id === "2C")).seat;
    m.lastMoveText = m.phase === "bidding" ? "Bid your expected tricks. Zero is nil." : m.phase === "passing" ? "Choose three cards to pass." : "The two of clubs leads.";
  }
  legal(m, p) {
    if (m.phase !== "playing" || m.activeSeat !== p.seat) return [];
    if (this.gameId === "hearts" && m.trickNumber === 1 && !m.trick.length) return p.hand.filter(c => c.id === "2C");
    let cards = rules.legal(p.hand, m.trick, this.gameId, m.broken);
    if (this.gameId === "hearts" && m.trickNumber === 1) {
      const safe = cards.filter(c => !rules.points(c));
      if (safe.length) cards = safe;
    }
    return cards;
  }
  act(m, seat, a, room = {}) {
    const p = m.players.find(p => p.seat === seat);
    check(p, "Unknown seat.");
    if (a.type === "next_round") { check(m.roundOver && !m.matchOver, "There is no next hand yet."); this.deal(m); return; }
    check(!m.roundOver, "The hand is over.");
    if (a.type === "pass_cards") {
      check(m.phase === "passing" && !p.pass, "Cards are already committed.");
      if (room.gameSettings?.sharedDevice) check(m.activeSeat === seat, "Pass the device to the active player.");
      check(Array.isArray(a.cardIds) && a.cardIds.length === 3 && new Set(a.cardIds).size === 3 && a.cardIds.every(id => p.hand.some(c => c.id === id)), "Select three different cards from your hand.");
      p.pass = a.cardIds.slice();
      const pending = m.players.find(p => !p.pass);
      if (pending) { m.activeSeat = pending.seat; m.lastMoveText = `${p.name} has committed three cards.`; return; }
      const outgoing = m.players.map(p => p.hand.filter(c => p.pass.includes(c.id)));
      m.players.forEach((p, i) => { p.hand = p.hand.filter(c => !p.pass.includes(c.id)).concat(outgoing[(i - m.passOffset + 4) % 4]); p.pass = null; });
      m.phase = "playing"; m.activeSeat = m.players.find(p => p.hand.some(c => c.id === "2C")).seat;
      m.lastMoveText = "Pass complete. The two of clubs leads."; return;
    }
    check(m.activeSeat === seat, "Wait for your turn.");
    const next = () => m.players[(m.players.indexOf(p) + 1) % 4].seat;
    if (a.type === "bid") {
      check(m.phase === "bidding" && p.bid === null && Number.isInteger(a.bid) && a.bid >= 0 && a.bid <= 13, "Choose a bid from zero to thirteen.");
      p.bid = a.bid; m.activeSeat = next(); m.lastMoveText = `${p.name} bids ${a.bid === 0 ? "nil" : a.bid}.`;
      if (m.players.every(p => p.bid !== null)) { m.phase = "playing"; m.activeSeat = m.players[(m.dealer + 1) % 4].seat; }
      return;
    }
    check(a.type === "play", "Unknown action.");
    const card = this.legal(m, p).find(c => c.id === a.cardId);
    check(card, "Follow suit and the opening restrictions.");
    p.hand = p.hand.filter(c => c.id !== card.id); m.trick.push({ seat, card });
    if (card.suit === (this.gameId === "spades" ? "S" : "H")) m.broken = true;
    m.lastMoveText = `${p.name} plays ${standard52.cardLabel(card)}.`;
    if (m.trick.length === 4) {
      m.phase = "trick-result"; m.trickWinner = rules.winner(m.trick, this.gameId === "spades" ? "S" : null);
      m.resolveAt = this.now() + 1200;
      m.lastMoveText = `${m.players.find(p => p.seat === m.trickWinner).name} takes the trick.`;
    } else m.activeSeat = next();
  }
  resolve(m) {
    const winner = m.players.find(p => p.seat === m.trickWinner);
    winner.tricks++; winner.penalty += m.trick.reduce((n, p) => n + rules.points(p.card), 0);
    m.lastTrick = m.trick; m.captured.push(...m.trick.map(p => p.card)); m.trick = []; m.resolveAt = null;
    m.activeSeat = winner.seat;
    if (m.trickNumber < 13) { m.trickNumber++; m.phase = "playing"; return; }
    m.roundOver = true; m.phase = "complete";
    if (this.gameId === "spades") {
      m.teams = rules.scoreSpades(m.players, m.teams);
      m.players.forEach(p => { p.score = m.teams[p.team].score; });
      const [a, b] = m.teams;
      m.matchOver = Math.max(a.score, b.score) >= 500 && a.score !== b.score;
      if (m.matchOver) m.winners = m.players.filter(p => p.score === Math.max(a.score, b.score)).map(p => p.seat);
    } else {
      const moon = m.players.find(p => p.penalty === 26);
      m.players.forEach(p => { p.delta = moon ? p === moon ? 0 : 26 : p.penalty; p.score += p.delta; });
      m.matchOver = m.players.some(p => p.score >= 100);
      if (m.matchOver) m.winners = m.players.filter(p => p.score === Math.min(...m.players.map(p => p.score))).map(p => p.seat);
    }
    m.lastMoveText = m.matchOver ? "Match complete." : "Hand complete. Review the scores before the next deal.";
  }
  delay(m, delay) {
    if (m.roundOver) return null;
    if (m.resolveAt !== null) return Math.max(0, m.resolveAt - this.now());
    if (m.phase === "passing") return m.players.some(p => p.type === "bot" && !p.pass) ? delay : null;
    return m.players.find(p => p.seat === m.activeSeat)?.type === "bot" ? delay : null;
  }
  step(m) {
    if (m.roundOver) return false;
    if (m.resolveAt !== null) { if (this.now() < m.resolveAt) return false; this.resolve(m); return true; }
    const p = m.phase === "passing" ? m.players.find(p => p.type === "bot" && !p.pass) : m.players.find(p => p.seat === m.activeSeat && p.type === "bot");
    if (!p) return false;
    if (m.phase === "passing") this.act(m, p.seat, { type: "pass_cards", cardIds: p.hand.slice().sort((a, b) => (rules.points(b) * 2 + rules.value(b)) - (rules.points(a) * 2 + rules.value(a))).slice(0, 3).map(c => c.id) });
    else if (m.phase === "bidding") {
      const estimate = p.hand.reduce((n, c) => n + (c.suit === "S" ? rules.value(c) >= 8 ? 0.9 : 0.4 : c.rank === "A" ? 0.9 : c.rank === "K" ? 0.5 : 0), 0);
      this.act(m, p.seat, { type: "bid", bid: estimate < 1 ? 0 : Math.max(1, Math.min(13, Math.round(estimate))) });
    } else {
      const legal = this.legal(m, p).slice().sort((a, b) => rules.value(a) - rules.value(b));
      let card = legal[0];
      if (this.gameId === "hearts") {
        if (m.trick.length && legal.every(c => c.suit !== m.trick[0].card.suit)) card = legal.slice().sort((a, b) => rules.points(b) - rules.points(a) || rules.value(b) - rules.value(a))[0];
        else if (m.trick.length) card = legal.filter(c => rules.winner([...m.trick, { seat: p.seat, card: c }]) !== p.seat).at(-1) || legal[0];
        const moonThreat = m.players.find(q => q !== p && q.penalty >= 13 && m.players.every(other => other === q || other.penalty === 0));
        if (moonThreat && m.trick.some(play => rules.points(play.card))) card = legal.find(c => rules.winner([...m.trick, { seat: p.seat, card: c }]) === p.seat) || card;
      } else {
        const currentWinner = m.trick.length ? m.players.find(q => q.seat === rules.winner(m.trick, "S")) : null;
        const partner = m.players.find(q => q.team === p.team && q !== p);
        const winning = legal.filter(c => rules.winner([...m.trick, { seat: p.seat, card: c }], "S") === p.seat);
        const losing = legal.filter(c => !winning.includes(c));
        if (p.bid === 0) card = losing.at(-1) || legal[0];
        else if (partner.bid === 0 && currentWinner === partner || currentWinner?.team !== p.team && p.tricks + (partner.bid ? partner.tricks : 0) < p.bid + partner.bid) card = winning[0] || legal[0];
        else card = losing.at(-1) || legal[0];
      }
      this.act(m, p.seat, { type: "play", cardId: card.id });
    }
    return true;
  }
  view(m, seat, room = {}) {
    const p = m.players.find(p => p.seat === seat); check(p, "Unknown seat.");
    return { type: `${this.gameId}_match_state`, hand: p.hand.slice(), state: {
      gameId: this.gameId, revision: m.revision, phase: m.phase, round: m.round, activeSeat: m.activeSeat,
      players: m.players.map(({ hand, pass, ...p }) => ({ ...p, cardCount: hand.length, committed: !!pass })),
      teams: m.teams, trick: m.trick, lastTrick: m.lastTrick, trickNumber: m.trickNumber, broken: m.broken,
      passOffset: m.passOffset, roundOver: m.roundOver, matchOver: m.matchOver, winners: m.winners, lastMoveText: m.lastMoveText,
      actions: { legalCardIds: this.legal(m, p).map(c => c.id), bid: m.phase === "bidding" && m.activeSeat === seat,
        pass: m.phase === "passing" && !p.pass && (!room.gameSettings?.sharedDevice || m.activeSeat === seat) }
    } };
  }
}
