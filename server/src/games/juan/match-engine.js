import { randomInt } from "node:crypto";
import juanDeck from "../../../../shared/juan-deck.js";
import rules from "../../../../shared/juan-rules.js";
import { GameError as RoomError } from "../../game-error.js";

const DEAL_COUNT = 7;

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
      drawnCardId: null,
      drawnSeat: null,
      pendingJuan: null,
      pendingPrismBurst: null,
      placements: [],
      roundOver: false,
      matchOver: false,
      lastMoveText: `${players[0].name} leads the JUAN table.`,
      log: [`Opening card: ${juanDeck.cardLabel(openingCard)}.`]
    };
  }

  play(match, seat, cardId, chosenColor = null, declareJuan = false) {
    const player = requireActivePlayer(match, seat);
    requireNoPendingPrismBurst(match);
    const card = player.hand.find((candidate) => candidate.id === String(cardId));
    if (!card) throw new RoomError("That card is not in your hand.", "CARD_NOT_OWNED");
    const topCard = match.discardPile.at(-1);
    if (!rules.canPlay(card, topCard, match.activeColor)) {
      throw new RoomError("Match the active color or printed face, or play a Prism.", "CARD_DOES_NOT_MATCH");
    }
    if (match.drawnSeat === player.seat && match.drawnCardId && card.id !== match.drawnCardId) {
      throw new RoomError("After drawing, play the drawn card or keep your hand.", "DRAWN_CARD_ONLY");
    }
    if ((card.kind === "prism" || card.kind === "prism-burst") && !juanDeck.COLORS.includes(chosenColor)) {
      throw new RoomError("Choose a color lane for the Prism.", "COLOR_REQUIRED");
    }

    const missedJuan = this.#resolveMissedJuan(match);
    const prismBurst = card.kind === "prism-burst" ? {
      sourceSeat: player.seat,
      priorColor: match.activeColor,
      sourceHadPriorColor: player.hand.some((candidate) => candidate.id !== card.id && candidate.color === match.activeColor)
    } : null;
    player.hand = player.hand.filter((candidate) => candidate.id !== card.id);
    clearDrawChoice(match);
    player.juan = false;
    match.discardPile.push(card);
    match.activeColor = card.kind === "prism" || card.kind === "prism-burst" ? chosenColor : card.color;
    player.lastPlay = { kind: "play", label: juanDeck.cardLabel(card), cards: [{ ...card }] };
    player.lastPlayedCard = { ...card };
    let juanCall = "";
    if (player.hand.length === 1) {
      if (player.type === "bot" || declareJuan === true) {
        player.juan = true;
        juanCall = " JUAN!";
      } else {
        match.pendingJuan = { seat: player.seat };
        juanCall = " One card remains — call JUAN!";
      }
    }
    match.lastMoveText = `${missedJuan}${player.name} played ${juanDeck.cardLabel(card)}.${juanCall}`;
    match.log.unshift(match.lastMoveText);

    if (player.hand.length === 0 && card.kind !== "prism-burst") {
      finishMatch(match, player);
      return match;
    }

    this.#advanceAfterCard(match, player, card, prismBurst);
    return match;
  }

  draw(match, seat) {
    const player = requireActivePlayer(match, seat);
    requireNoPendingPrismBurst(match);
    if (match.drawnSeat === player.seat && match.drawnCardId) {
      throw new RoomError("Play the drawn card or keep your hand before drawing again.", "ALREADY_DREW", 409);
    }
    const missedJuan = this.#resolveMissedJuan(match);
    const drawn = this.#drawCards(match, player, 1);
    syncJuanAfterDraw(match, player);
    const drawnCard = drawn[0] || null;
    const playable = drawnCard && rules.canPlay(drawnCard, match.discardPile.at(-1), match.activeColor);
    player.lastPlay = { kind: "draw", label: drawnCard ? "Drew 1" : "Stock empty", cards: [] };
    match.lastMoveText = playable
      ? `${missedJuan}${player.name} drew a playable card.`
      : drawnCard ? `${missedJuan}${player.name} drew a card.` : `${missedJuan}${player.name} found the stock empty.`;
    match.log.unshift(match.lastMoveText);
    if (playable) {
      match.drawnCardId = drawnCard.id;
      match.drawnSeat = player.seat;
    } else {
      clearDrawChoice(match);
      match.activeSeat = nextPlayer(match, player.seat)?.seat ?? null;
    }
    return match;
  }

  endTurn(match, seat) {
    const player = requireActivePlayer(match, seat);
    requireNoPendingPrismBurst(match);
    if (match.drawnSeat !== player.seat || !match.drawnCardId) {
      throw new RoomError("Draw a playable card before choosing to keep it.", "DRAW_CHOICE_NOT_ACTIVE", 409);
    }
    const missedJuan = this.#resolveMissedJuan(match);
    clearDrawChoice(match);
    match.lastMoveText = `${missedJuan}${player.name} kept the drawn card.`;
    match.log.unshift(match.lastMoveText);
    match.activeSeat = nextPlayer(match, player.seat)?.seat ?? null;
    return match;
  }

  callJuan(match, seat) {
    requirePlayingMatch(match);
    const player = requirePlayer(match, seat);
    const pending = match.pendingJuan;
    if (!pending || pending.seat !== player.seat || player.hand.length !== 1) {
      throw new RoomError("JUAN can only be called when you have exactly one uncalled card.", "JUAN_CALL_NOT_AVAILABLE", 409);
    }
    player.juan = true;
    match.pendingJuan = null;
    match.lastMoveText = `${player.name} called JUAN!`;
    match.log.unshift(match.lastMoveText);
    return match;
  }

  catchJuan(match, seat) {
    requirePlayingMatch(match);
    const caller = requirePlayer(match, seat);
    const pending = match.pendingJuan;
    if (!pending) throw new RoomError("No JUAN call is waiting to be caught.", "JUAN_CATCH_NOT_AVAILABLE", 409);
    if (pending.seat === caller.seat) throw new RoomError("You cannot catch your own JUAN call.", "JUAN_CATCH_SELF", 409);
    const target = getPlayer(match, pending.seat);
    if (!target || target.hand.length !== 1) {
      match.pendingJuan = null;
      throw new RoomError("That JUAN call is no longer available.", "JUAN_CATCH_NOT_AVAILABLE", 409);
    }

    match.pendingJuan = null;
    const count = this.#drawCards(match, target, 2).length;
    syncJuanAfterDraw(match, target);
    target.lastPlay = { kind: "penalty", label: `Missed JUAN · drew ${count}`, cards: [] };
    match.lastMoveText = `${caller.name} caught ${target.name} without JUAN. ${target.name} draws ${count}.`;
    match.log.unshift(match.lastMoveText);
    return match;
  }

  acceptPrismBurst(match, seat) {
    const { source, target } = this.#requirePrismBurstTarget(match, seat);
    const missedJuan = this.#resolveMissedJuan(match);
    match.pendingPrismBurst = null;
    const count = this.#drawCards(match, target, 4).length;
    syncJuanAfterDraw(match, target);
    target.lastPlay = { kind: "draw", label: `Drew ${count}`, cards: [] };
    match.lastMoveText = `${missedJuan}${target.name} takes the four-card Prism Burst and loses the turn.`;
    match.log.unshift(match.lastMoveText);
    if (source.hand.length === 0) {
      finishMatch(match, source);
      return match;
    }
    match.activeSeat = nextPlayer(match, target.seat)?.seat ?? null;
    return match;
  }

  challengePrismBurst(match, seat) {
    const { pending, source, target } = this.#requirePrismBurstTarget(match, seat);
    const missedJuan = this.#resolveMissedJuan(match);
    match.pendingPrismBurst = null;

    if (pending.sourceHadPriorColor) {
      const count = this.#drawCards(match, source, 4).length;
      syncJuanAfterDraw(match, source);
      source.lastPlay = { kind: "penalty", label: `Lost +4 challenge · drew ${count}`, cards: [] };
      match.lastMoveText = `${missedJuan}${target.name} won the Prism Burst challenge. ${source.name} draws ${count}, and ${target.name} keeps the turn.`;
      match.log.unshift(match.lastMoveText);
      match.activeSeat = target.seat;
      return match;
    }

    const count = this.#drawCards(match, target, 6).length;
    syncJuanAfterDraw(match, target);
    target.lastPlay = { kind: "penalty", label: `Lost +4 challenge · drew ${count}`, cards: [] };
    match.lastMoveText = `${missedJuan}${target.name} lost the Prism Burst challenge, draws ${count}, and loses the turn.`;
    match.log.unshift(match.lastMoveText);
    if (source.hand.length === 0) {
      finishMatch(match, source);
      return match;
    }
    match.activeSeat = nextPlayer(match, target.seat)?.seat ?? null;
    return match;
  }

  runBotTurn(match) {
    if (!match || match.roundOver) return false;
    const pendingJuan = match.pendingJuan;
    if (pendingJuan) {
      const caller = getPlayer(match, pendingJuan.seat);
      if (caller?.type === "bot" && caller.hand.length === 1) {
        this.callJuan(match, caller.seat);
        return true;
      }
    }
    const player = getPlayer(match, match.activeSeat);
    if (!player || player.type !== "bot") return false;
    if (match.pendingJuan && match.pendingJuan.seat !== player.seat) {
      this.catchJuan(match, player.seat);
      return true;
    }
    if (match.pendingPrismBurst) {
      this.acceptPrismBurst(match, player.seat);
      return true;
    }
    const topCard = match.discardPile.at(-1);
    const legal = rules.getLegalCards(player.hand, topCard, match.activeColor);
    if (!legal.length) {
      this.draw(match, player.seat);
      if (match.drawnSeat === player.seat && match.drawnCardId) {
        const drawnCard = player.hand.find((card) => card.id === match.drawnCardId);
        const chosenColor = drawnCard.kind === "prism" || drawnCard.kind === "prism-burst"
          ? rules.chooseColor(player.hand.filter((candidate) => candidate.id !== drawnCard.id))
          : null;
        this.play(match, player.seat, drawnCard.id, chosenColor);
      }
      return true;
    }
    const card = chooseBotCard(player, legal);
    const chosenColor = card.kind === "prism" || card.kind === "prism-burst"
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
    if (match.pendingJuan?.seat === player.seat && player.hand.length === 1) this.callJuan(match, player.seat);
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
        drawnCardId: match.drawnSeat === viewer.seat ? match.drawnCardId : null,
        juanCall: match.pendingJuan ? { seat: match.pendingJuan.seat } : null,
        prismBurstChallenge: match.pendingPrismBurst ? {
          sourceSeat: match.pendingPrismBurst.sourceSeat,
          targetSeat: match.pendingPrismBurst.targetSeat,
          priorColor: match.pendingPrismBurst.priorColor,
          chosenColor: match.pendingPrismBurst.chosenColor
        } : null,
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
          lastPlayedCard: player.lastPlayedCard ? { ...player.lastPlayedCard } : null,
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

  #advanceAfterCard(match, player, card, prismBurst = null) {
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
      const count = this.#drawCards(match, target, 2).length;
      syncJuanAfterDraw(match, target);
      target.lastPlay = { kind: "draw", label: `Drew ${count}`, cards: [] };
      match.lastMoveText += ` ${target.name} draws ${count} and loses the turn.`;
      match.activeSeat = nextPlayer(match, target.seat)?.seat ?? null;
      return;
    }

    if (card.kind === "prism-burst") {
      match.pendingPrismBurst = {
        sourceSeat: player.seat,
        targetSeat: target.seat,
        priorColor: prismBurst?.priorColor || match.activeColor,
        chosenColor: match.activeColor,
        sourceHadPriorColor: prismBurst?.sourceHadPriorColor === true
      };
      match.lastMoveText += ` ${target.name} may challenge the Prism Burst or take four.`;
      match.activeSeat = target.seat;
      return;
    }

    match.activeSeat = target.seat;
  }

  #drawCards(match, player, requestedCount) {
    const drawnCards = [];
    for (let index = 0; index < requestedCount; index += 1) {
      if (!match.stock.length) this.#recycleDiscard(match);
      const card = match.stock.pop();
      if (!card) break;
      player.hand.push(card);
      drawnCards.push(card);
    }
    player.hand = rules.sortCards(player.hand, "color");
    return drawnCards;
  }

  #resolveMissedJuan(match) {
    const pending = match.pendingJuan;
    if (!pending) return "";
    const target = getPlayer(match, pending.seat);
    match.pendingJuan = null;
    if (!target || target.hand.length !== 1) return "";
    const count = this.#drawCards(match, target, 2).length;
    syncJuanAfterDraw(match, target);
    target.lastPlay = { kind: "penalty", label: `Missed JUAN · drew ${count}`, cards: [] };
    const text = `${target.name} missed JUAN and draws ${count}. `;
    return text;
  }

  #recycleDiscard(match) {
    if (match.discardPile.length <= 1) return;
    const topCard = match.discardPile.pop();
    match.stock = this.shuffleDeck(match.discardPile);
    match.discardPile = [topCard];
    match.log.unshift("The discard stack returned to the stock.");
  }

  #requirePrismBurstTarget(match, seat) {
    requirePlayingMatch(match);
    const target = requirePlayer(match, seat);
    const pending = match.pendingPrismBurst;
    if (!pending) throw new RoomError("No Prism Burst challenge is waiting.", "PRISM_BURST_NOT_PENDING", 409);
    if (pending.targetSeat !== target.seat || match.activeSeat !== target.seat) {
      throw new RoomError("Only the Prism Burst target can resolve it.", "PRISM_BURST_TARGET_ONLY", 409);
    }
    const source = getPlayer(match, pending.sourceSeat);
    if (!source) throw new RoomError("The Prism Burst source is unavailable.", "PRISM_BURST_SOURCE_MISSING", 409);
    return { pending, source, target };
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
  return { seat, name, avatar, type, style, hand: [], juan: false, lastPlay: null, lastPlayedCard: null, score: 0 };
}

function validateDeck(deck) {
  if (!Array.isArray(deck) || deck.length !== 108) throw new RoomError("JUAN requires its complete 108-card deck.", "INVALID_DECK", 500);
  if (new Set(deck.map((card) => card.id)).size !== 108) throw new RoomError("The JUAN deck contains duplicate cards.", "INVALID_DECK", 500);
}

function requirePlayingMatch(match) {
  if (!match || match.roundOver || match.phase !== "playing") throw new RoomError("No JUAN match is currently active.", "MATCH_NOT_ACTIVE", 409);
}

function requirePlayer(match, seat) {
  const player = getPlayer(match, seat);
  if (!player) throw new RoomError("Seat not found.", "SEAT_NOT_FOUND", 404);
  return player;
}

function requireActivePlayer(match, seat) {
  requirePlayingMatch(match);
  const player = requirePlayer(match, seat);
  if (match.activeSeat !== player.seat) throw new RoomError("It is not your turn.", "NOT_YOUR_TURN", 409);
  return player;
}

function requireNoPendingPrismBurst(match) {
  if (match.pendingPrismBurst) {
    throw new RoomError("Resolve the Prism Burst by challenging it or taking four first.", "PRISM_BURST_RESPONSE_REQUIRED", 409);
  }
}

function syncJuanAfterDraw(match, player) {
  if (player.hand.length !== 1) {
    player.juan = false;
    if (match.pendingJuan?.seat === player.seat) match.pendingJuan = null;
  }
}

function getPlayer(match, seat) {
  return match.players.find((player) => player.seat === Number(seat));
}

function clearDrawChoice(match) {
  match.drawnCardId = null;
  match.drawnSeat = null;
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
  match.pendingJuan = null;
  match.pendingPrismBurst = null;
  clearDrawChoice(match);
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
