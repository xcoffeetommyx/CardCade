import { randomInt } from "node:crypto";
import juanDeck from "../../../../shared/juan-deck.js";
import rules from "../../../../shared/juan-rules.js";
import { GameError as RoomError } from "../../game-error.js";

const DEAL_COUNT = 6;

export class MatchEngine {
  constructor({ shuffleDeck = secureShuffle } = {}) {
    this.shuffleDeck = shuffleDeck;
  }

  createMatch(roomPlayers) {
    if (!Array.isArray(roomPlayers) || roomPlayers.length < 2 || roomPlayers.length > 8) {
      throw new RoomError("JUAN requires between two and eight occupied seats.", "INVALID_PLAYER_COUNT");
    }

    const players = roomPlayers
      .slice()
      .sort((left, right) => left.seat - right.seat)
      .map((player) => createMatchPlayer({
        seat: player.seat,
        name: player.name,
        avatar: initialsForName(player.name, `P${player.seat}`),
        type: player.type === "bot" ? "bot" : "human",
        style: player.style || (player.type === "bot" ? "steady" : "human")
      }));

    const stock = this.shuffleDeck(juanDeck.makeDeck());
    validateDeck(stock);
    for (let cardIndex = 0; cardIndex < DEAL_COUNT; cardIndex += 1) {
      for (const player of players) player.hand.push(stock.pop());
    }
    for (const player of players) player.hand = rules.sortCards(player.hand, "color");

    const openerIndex = stock.findLastIndex((card) => card.kind === "number");
    if (openerIndex < 0) throw new RoomError("JUAN could not find a numbered opening card.", "INVALID_DECK", 500);
    const [openingCard] = stock.splice(openerIndex, 1);

    return {
      round: 1,
      phase: "playing",
      players,
      activeSeat: players[0].seat,
      direction: 1,
      stock,
      discardPile: [openingCard],
      activeColor: openingCard.color,
      placements: [],
      roundOver: false,
      matchOver: false,
      lastMoveText: `${players[0].name} leads the JUAN table.`,
      log: [`Opening card: ${juanDeck.cardLabel(openingCard)}.`]
    };
  }

  play(match, seat, cardId, chosenColor = null) {
    const player = requireActivePlayer(match, seat);
    const card = player.hand.find((candidate) => candidate.id === String(cardId));
    if (!card) throw new RoomError("That card is not in your hand.", "CARD_NOT_OWNED");
    const topCard = match.discardPile.at(-1);
    if (!rules.canPlay(card, topCard, match.activeColor)) {
      throw new RoomError("Match the active color or printed face, or play a Prism.", "CARD_DOES_NOT_MATCH");
    }
    if (card.kind === "prism" && !juanDeck.COLORS.includes(chosenColor)) {
      throw new RoomError("Choose a color lane for the Prism.", "COLOR_REQUIRED");
    }

    player.hand = player.hand.filter((candidate) => candidate.id !== card.id);
    player.juan = player.hand.length === 1;
    match.discardPile.push(card);
    match.activeColor = card.kind === "prism" ? chosenColor : card.color;
    player.lastPlay = { kind: "play", label: juanDeck.cardLabel(card), cards: [{ ...card }] };
    const juanCall = player.juan ? " JUAN — one card remains!" : "";
    match.lastMoveText = `${player.name} played ${juanDeck.cardLabel(card)}.${juanCall}`;
    match.log.unshift(match.lastMoveText);

    if (player.hand.length === 0) {
      finishMatch(match, player);
      return match;
    }

    this.#advanceAfterCard(match, player, card);
    return match;
  }

  draw(match, seat) {
    const player = requireActivePlayer(match, seat);
    const drawn = this.#drawCards(match, player, 1);
    player.juan = player.hand.length === 1;
    player.lastPlay = { kind: "draw", label: drawn ? "Drew 1" : "Stock empty", cards: [] };
    match.lastMoveText = drawn ? `${player.name} drew a card.` : `${player.name} found the stock empty.`;
    match.log.unshift(match.lastMoveText);
    match.activeSeat = nextPlayer(match, player.seat)?.seat ?? null;
    return match;
  }

  runBotTurn(match) {
    if (!match || match.roundOver) return false;
    const player = getPlayer(match, match.activeSeat);
    if (!player || player.type !== "bot") return false;
    const topCard = match.discardPile.at(-1);
    const legal = rules.getLegalCards(player.hand, topCard, match.activeColor);
    if (!legal.length) {
      this.draw(match, player.seat);
      return true;
    }
    const card = chooseBotCard(player, legal);
    const chosenColor = card.kind === "prism"
      ? rules.chooseColor(player.hand.filter((candidate) => candidate.id !== card.id))
      : null;
    this.play(match, player.seat, card.id, chosenColor);
    return true;
  }

  runBots(match) {
    let turns = 0;
    while (this.runBotTurn(match)) {
      turns += 1;
      if (turns >= 512) throw new RoomError("JUAN CPU turn limit exceeded.", "BOT_TURN_LIMIT", 500);
    }
    return match;
  }

  replaceWithBot(match, seat) {
    const player = getPlayer(match, seat);
    if (!player || player.type !== "human") return false;
    player.type = "bot";
    player.style = "steady";
    player.name = `${player.name} · Bot`;
    match.log.unshift(`${player.name} took over the disconnected seat.`);
    return true;
  }

  viewFor(match, seat, connections = new Map()) {
    const viewer = getPlayer(match, seat);
    if (!viewer || viewer.type !== "human") throw new RoomError("No private JUAN view exists for this seat.", "SEAT_NOT_FOUND", 404);
    const topCard = match.discardPile.at(-1);
    return {
      type: "juan_match_state",
      state: {
        phase: match.phase,
        round: match.round,
        activeSeat: match.activeSeat,
        direction: match.direction,
        activeColor: match.activeColor,
        topCard: { ...topCard },
        stockCount: match.stock.length,
        players: match.players.map((player) => ({
          seat: player.seat,
          name: player.name,
          avatar: player.avatar,
          type: player.type,
          cardCount: player.hand.length,
          juan: player.juan,
          lastPlay: player.lastPlay ? {
            kind: player.lastPlay.kind,
            label: player.lastPlay.label,
            cards: player.lastPlay.cards.map((card) => ({ ...card }))
          } : null,
          score: player.score,
          connected: player.type === "bot" ? true : connections.get(player.seat) === true
        })),
        placements: match.placements.slice(),
        roundOver: match.roundOver,
        matchOver: match.matchOver,
        lastMoveText: match.lastMoveText,
        log: match.log.slice(0, 18)
      },
      hand: viewer.hand.map((card) => ({ ...card }))
    };
  }

  #advanceAfterCard(match, player, card) {
    if (card.kind === "turnabout") {
      match.direction *= -1;
      match.lastMoveText += ` Direction now runs ${match.direction === 1 ? "forward" : "backward"}.`;
    }

    const target = nextPlayer(match, player.seat);
    if (!target) {
      match.activeSeat = null;
      return;
    }

    if (card.kind === "pause") {
      match.lastMoveText += ` ${target.name} is paused.`;
      match.activeSeat = nextPlayer(match, target.seat)?.seat ?? null;
      return;
    }

    if (card.kind === "double-draw") {
      const count = this.#drawCards(match, target, 2);
      target.juan = target.hand.length === 1;
      target.lastPlay = { kind: "draw", label: `Drew ${count}`, cards: [] };
      match.lastMoveText += ` ${target.name} draws ${count} and loses the turn.`;
      match.activeSeat = nextPlayer(match, target.seat)?.seat ?? null;
      return;
    }

    match.activeSeat = target.seat;
  }

  #drawCards(match, player, requestedCount) {
    let count = 0;
    for (let index = 0; index < requestedCount; index += 1) {
      if (!match.stock.length) this.#recycleDiscard(match);
      const card = match.stock.pop();
      if (!card) break;
      player.hand.push(card);
      count += 1;
    }
    player.hand = rules.sortCards(player.hand, "color");
    return count;
  }

  #recycleDiscard(match) {
    if (match.discardPile.length <= 1) return;
    const topCard = match.discardPile.pop();
    match.stock = this.shuffleDeck(match.discardPile);
    match.discardPile = [topCard];
    match.log.unshift("The discard stack returned to the stock.");
  }
}

export function secureShuffle(deck) {
  const shuffled = deck.slice();
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function createMatchPlayer({ seat, name, avatar, type, style }) {
  return { seat, name, avatar, type, style, hand: [], juan: false, lastPlay: null, score: 0 };
}

function validateDeck(deck) {
  if (!Array.isArray(deck) || deck.length !== 80) throw new RoomError("JUAN requires its complete 80-card deck.", "INVALID_DECK", 500);
  if (new Set(deck.map((card) => card.id)).size !== 80) throw new RoomError("The JUAN deck contains duplicate cards.", "INVALID_DECK", 500);
}

function requireActivePlayer(match, seat) {
  if (!match || match.roundOver || match.phase !== "playing") throw new RoomError("No JUAN match is currently active.", "MATCH_NOT_ACTIVE", 409);
  const player = getPlayer(match, seat);
  if (!player) throw new RoomError("Seat not found.", "SEAT_NOT_FOUND", 404);
  if (match.activeSeat !== player.seat) throw new RoomError("It is not your turn.", "NOT_YOUR_TURN", 409);
  return player;
}

function getPlayer(match, seat) {
  return match.players.find((player) => player.seat === Number(seat));
}

function nextPlayer(match, fromSeat) {
  const fromIndex = match.players.findIndex((player) => player.seat === Number(fromSeat));
  if (fromIndex < 0) return null;
  const nextIndex = (fromIndex + match.direction + match.players.length) % match.players.length;
  return match.players[nextIndex];
}

function chooseBotCard(player, legal) {
  return legal.slice().sort((left, right) => {
    const leftOut = player.hand.length === 1;
    const rightOut = player.hand.length === 1;
    if (leftOut !== rightOut) return leftOut ? -1 : 1;
    return rules.moveCost(left, player.hand) - rules.moveCost(right, player.hand) || left.id.localeCompare(right.id);
  })[0];
}

function finishMatch(match, winner) {
  const others = match.players
    .filter((player) => player.seat !== winner.seat)
    .sort((left, right) => left.hand.length - right.hand.length || left.seat - right.seat);
  match.placements = [winner.seat, ...others.map((player) => player.seat)];
  const points = others.flatMap((player) => player.hand).reduce((total, card) => total + rules.cardPoints(card), 0);
  winner.score += points;
  winner.juan = false;
  match.roundOver = true;
  match.matchOver = true;
  match.phase = "complete";
  match.activeSeat = null;
  match.lastMoveText = `${winner.name} wins JUAN with ${points} points.`;
  match.log.unshift(match.lastMoveText);
}

function initialsForName(name, fallback) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  const letters = parts.length >= 2 ? parts[0][0] + parts[1][0] : (parts[0] || fallback || "P").slice(0, 2);
  return letters.toUpperCase();
}
