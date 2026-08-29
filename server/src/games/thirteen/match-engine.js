import { randomInt } from "node:crypto";
import standard52 from "../../../../shared/standard-52.js";
import rules from "../../../../shared/thirteen-rules.js";
import { GameError as RoomError } from "../../game-error.js";

const {
  SCORE_BY_PLACE,
  TOTAL_ROUNDS,
  sortCards,
  detectCombo,
  canBeat,
  comboDescription,
  comboShort,
  getLegalMoves,
  moveCost,
  finalStandings,
  finalWinners
} = rules;

const TABLE_SIZE = 4;

export class MatchEngine {
  constructor({ shuffleDeck = secureShuffle } = {}) {
    this.shuffleDeck = shuffleDeck;
  }

  createMatch(roomPlayers, { carryScores = null, carryPlacements = null, round = 1 } = {}) {
    if (!Array.isArray(roomPlayers) || roomPlayers.length !== TABLE_SIZE) {
      throw new RoomError("Thirteen requires exactly four occupied seats.", "INVALID_PLAYER_COUNT");
    }
    if (!Number.isInteger(round) || round < 1 || round > TOTAL_ROUNDS) {
      throw new RoomError(`Thirteen has exactly ${TOTAL_ROUNDS} rounds.`, "INVALID_ROUND");
    }

    const scoreForSeat = (seat) => {
      if (!carryScores) return 0;
      const carried = carryScores instanceof Map ? carryScores.get(seat) : carryScores[seat];
      return Number.isFinite(carried) ? carried : 0;
    };
    const placementsForSeat = (seat) => {
      if (!carryPlacements) return [];
      const carried = carryPlacements instanceof Map ? carryPlacements.get(seat) : carryPlacements[seat];
      return Array.isArray(carried) ? carried.slice() : [];
    };

    const players = roomPlayers
      .slice()
      .sort((left, right) => left.seat - right.seat)
      .map((player) => createMatchPlayer({
        seat: player.seat,
        name: player.name,
        avatar: initialsForName(player.name, `P${player.seat}`),
        type: player.type === "bot" ? "bot" : "human",
        style: player.style || (player.type === "bot" ? "steady" : "human"),
        score: scoreForSeat(player.seat),
        placementHistory: placementsForSeat(player.seat)
      }));

    const deck = this.shuffleDeck(standard52.makeDeck());
    validateDeck(deck);
    for (let index = 0; index < deck.length; index += 1) {
      players[index % players.length].hand.push(deck[index]);
    }
    for (const player of players) player.hand = sortCards(player.hand, "rank");

    const starter = players.find((player) => player.hand.some((card) => card.id === "3S"));
    if (!starter) throw new RoomError("The shuffled deck did not contain 3♠.", "INVALID_DECK", 500);

    return {
      round,
      totalRounds: TOTAL_ROUNDS,
      phase: "playing",
      players,
      activeSeat: starter.seat,
      currentLead: null,
      openingRequired: true,
      openingCardId: "3S",
      placements: [],
      roundOver: false,
      matchOver: false,
      finalStandings: [],
      winners: [],
      lastMoveText: "Opening lead must include 3♠.",
      log: [`${starter.name} has 3♠ and leads first.`]
    };
  }

  hydrate(match) {
    if (!match || !Array.isArray(match.players)) return match;
    match.totalRounds = TOTAL_ROUNDS;
    if (!Array.isArray(match.placements)) match.placements = [];
    if (!Array.isArray(match.finalStandings)) match.finalStandings = [];
    if (!Array.isArray(match.winners)) match.winners = [];
    if (typeof match.matchOver !== "boolean") match.matchOver = false;
    for (const player of match.players) {
      if (!Array.isArray(player.placementHistory)) player.placementHistory = [];
    }
    if (match.roundOver && Number(match.round) >= TOTAL_ROUNDS && !match.matchOver) completeMatch(match);
    return match;
  }

  play(match, seat, cardIds) {
    const player = requireActivePlayer(match, seat);
    if (!Array.isArray(cardIds) || cardIds.length === 0) {
      throw new RoomError("Select at least one card.", "CARDS_REQUIRED");
    }

    const ids = new Set(cardIds.map((id) => String(id)));
    if (ids.size !== cardIds.length) throw new RoomError("A play cannot contain duplicate card identifiers.", "DUPLICATE_CARD");

    const cards = player.hand.filter((card) => ids.has(card.id));
    if (cards.length !== ids.size) throw new RoomError("One or more selected cards are not in your hand.", "CARD_NOT_OWNED");

    const combo = detectCombo(cards);
    if (!combo) throw new RoomError("Those cards are not a legal combination.", "INVALID_COMBO");
    if (match.openingRequired && !ids.has(match.openingCardId)) {
      throw new RoomError("The opening play must include 3♠.", "OPENING_CARD_REQUIRED");
    }
    if (!canBeat(combo, match.currentLead?.combo || null)) {
      throw new RoomError(
        match.currentLead ? `That play does not beat ${comboDescription(match.currentLead.combo)}.` : "That combination cannot lead the pile.",
        "PLAY_DOES_NOT_BEAT_PILE"
      );
    }

    if (!match.currentLead) resetPassedFlags(match);
    player.hand = player.hand.filter((card) => !ids.has(card.id));
    player.passed = false;
    match.currentLead = {
      playerSeat: player.seat,
      playerName: player.name,
      cards: sortCards(cards, "rank"),
      combo
    };
    match.openingRequired = false;
    player.lastPlay = { kind: "play", label: comboShort(combo), cards: match.currentLead.cards.map((card) => ({ ...card })) };
    player.lastPlayedCard = { ...match.currentLead.cards.at(-1) };
    match.lastMoveText = `${player.name} played ${comboDescription(combo)}.`;
    match.log.unshift(`${player.name}: ${comboShort(combo)}`);

    if (player.hand.length === 0) placePlayer(match, player);
    advanceAfterMove(match, player.seat);
    return match;
  }

  pass(match, seat) {
    const player = requireActivePlayer(match, seat);
    if (!match.currentLead) throw new RoomError("You control an open pile and must play.", "CANNOT_PASS_OPEN_PILE");

    player.passed = true;
    player.lastPlay = { kind: "pass", label: "Passed", cards: [] };
    match.lastMoveText = `${player.name} passed.`;
    match.log.unshift(`${player.name}: Pass`);

    if (allPassedExceptLead(match)) {
      clearPileAndLead(match);
    } else {
      const next = nextResponderAfter(match, player.seat);
      if (next) match.activeSeat = next.seat;
      else clearPileAndLead(match);
    }
    return match;
  }

  runBotTurn(match) {
    if (!match || match.roundOver) return false;
    const player = getPlayer(match, match.activeSeat);
    if (!player || player.type !== "bot") return false;
    const currentCombo = match.currentLead?.combo || null;
    const legalMoves = getLegalMoves(player.hand, currentCombo, match.openingRequired);
    const move = chooseBotMove(player, legalMoves, Boolean(currentCombo));
    if (move) this.play(match, player.seat, move.cards.map((card) => card.id));
    else this.pass(match, player.seat);
    return true;
  }

  runBots(match) {
    let turns = 0;
    while (this.runBotTurn(match)) {
      turns += 1;
      if (turns >= 256) throw new RoomError("Bot turn limit exceeded.", "BOT_TURN_LIMIT", 500);
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
    if (!viewer || viewer.type !== "human") throw new RoomError("No private match view exists for this seat.", "SEAT_NOT_FOUND", 404);

    return {
      type: "match_state",
      state: {
        phase: match.phase,
        round: match.round,
        totalRounds: match.totalRounds || TOTAL_ROUNDS,
        activeSeat: match.activeSeat,
        openingRequired: match.openingRequired,
        openingCardId: match.openingCardId,
        currentLead: publicLead(match.currentLead),
        players: match.players.map((player) => ({
          seat: player.seat,
          name: player.name,
          avatar: player.avatar,
          type: player.type,
          cardCount: player.hand.length,
          passed: player.passed,
          finished: player.finished,
          place: player.place,
          lastPlay: player.lastPlay ? {
            kind: player.lastPlay.kind,
            label: player.lastPlay.label,
            cards: player.lastPlay.cards.map((card) => ({ ...card }))
          } : null,
          lastPlayedCard: player.lastPlayedCard ? { ...player.lastPlayedCard } : null,
          score: player.score,
          placementHistory: Array.isArray(player.placementHistory) ? player.placementHistory.slice() : [],
          connected: player.type === "bot" ? true : connections.get(player.seat) === true
        })),
        placements: match.placements.slice(),
        roundOver: match.roundOver,
        matchOver: match.matchOver === true,
        finalStandings: Array.isArray(match.finalStandings) ? match.finalStandings.slice() : [],
        winners: Array.isArray(match.winners) ? match.winners.slice() : [],
        lastMoveText: match.lastMoveText,
        log: match.log.slice(0, 18)
      },
      hand: viewer.hand.map((card) => ({ ...card }))
    };
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

function createMatchPlayer({ seat, name, avatar, type, style, score = 0, placementHistory = [] }) {
  return {
    seat,
    name,
    avatar,
    type,
    style,
    hand: [],
    passed: false,
    finished: false,
    place: null,
    lastPlay: null,
    lastPlayedCard: null,
    score,
    placementHistory
  };
}

function validateDeck(deck) {
  if (!Array.isArray(deck) || deck.length !== 52) throw new RoomError("A match requires a complete 52-card deck.", "INVALID_DECK", 500);
  if (new Set(deck.map((card) => card.id)).size !== 52) throw new RoomError("The match deck contains duplicate cards.", "INVALID_DECK", 500);
  if (deck.some((card) => Object.keys(card).some((key) => !["id", "rank", "suit"].includes(key)))) {
    throw new RoomError("Thirteen must use Cardcade's rules-neutral standard deck.", "INVALID_DECK", 500);
  }
}

function requireActivePlayer(match, seat) {
  if (!match || match.roundOver || match.phase !== "playing") throw new RoomError("No match is currently active.", "MATCH_NOT_ACTIVE", 409);
  const player = getPlayer(match, seat);
  if (!player) throw new RoomError("Seat not found.", "SEAT_NOT_FOUND", 404);
  if (player.finished) throw new RoomError("This player has already gone out.", "PLAYER_FINISHED", 409);
  if (match.activeSeat !== player.seat) throw new RoomError("It is not your turn.", "NOT_YOUR_TURN", 409);
  return player;
}

function getPlayer(match, seat) {
  return match.players.find((player) => player.seat === Number(seat));
}

function resetPassedFlags(match) {
  for (const player of match.players) player.passed = false;
}

function placePlayer(match, player) {
  if (player.finished) return;
  player.finished = true;
  player.passed = true;
  player.place = match.placements.length + 1;
  match.placements.push(player.seat);
  match.log.unshift(`${player.name} goes out in ${ordinal(player.place)}.`);
}

function unfinishedPlayers(match) {
  return match.players.filter((player) => !player.finished);
}

function checkRoundOver(match) {
  const remaining = unfinishedPlayers(match);
  if (remaining.length > 1) return false;
  if (remaining.length === 1) placePlayer(match, remaining[0]);
  finishRound(match);
  return true;
}

function finishRound(match) {
  match.roundOver = true;
  match.phase = "complete";
  match.activeSeat = null;
  match.currentLead = null;
  for (let index = 0; index < match.placements.length; index += 1) {
    const player = getPlayer(match, match.placements[index]);
    player.score += SCORE_BY_PLACE[index] || 0;
    if (!Array.isArray(player.placementHistory)) player.placementHistory = [];
    player.placementHistory.push(index + 1);
  }
  const winner = getPlayer(match, match.placements[0]);
  if (match.round === TOTAL_ROUNDS) completeMatch(match);
  else match.lastMoveText = `${winner.name} wins Round ${match.round}.`;
  match.log.unshift(match.lastMoveText);
}

function completeMatch(match) {
  match.matchOver = true;
  const standings = finalStandings(match.players);
  match.finalStandings = standings.map((player) => player.seat);
  match.winners = finalWinners(match.players).map((player) => player.seat);
  const names = match.winners.map((seat) => getPlayer(match, seat)?.name || "Player");
  match.lastMoveText = names.length === 1
    ? `${names[0]} wins the Thirteen match!`
    : `${names.join(" & ")} share the Thirteen win!`;
}

function allPassedExceptLead(match) {
  if (!match.currentLead) return false;
  const leadSeat = match.currentLead.playerSeat;
  return match.players.every((player) => player.finished || player.seat === leadSeat || player.passed);
}

function nextResponderAfter(match, fromSeat) {
  const leadSeat = match.currentLead?.playerSeat;
  const fromIndex = match.players.findIndex((player) => player.seat === Number(fromSeat));
  if (fromIndex < 0) return null;
  for (let step = 1; step <= match.players.length; step += 1) {
    const player = match.players[(fromIndex + step) % match.players.length];
    if (!player.finished && !player.passed && player.seat !== leadSeat) return player;
  }
  return null;
}

function nextActiveAfter(match, fromSeat) {
  const fromIndex = match.players.findIndex((player) => player.seat === Number(fromSeat));
  if (fromIndex < 0) return null;
  for (let step = 1; step <= match.players.length; step += 1) {
    const player = match.players[(fromIndex + step) % match.players.length];
    if (!player.finished) return player;
  }
  return null;
}

function clearPileAndLead(match) {
  const leadSeat = match.currentLead ? match.currentLead.playerSeat : match.activeSeat;
  const leader = getPlayer(match, leadSeat);
  match.currentLead = null;
  resetPassedFlags(match);
  const next = leader && !leader.finished ? leader : nextActiveAfter(match, leadSeat);
  match.activeSeat = next?.seat ?? null;
  match.lastMoveText = `${leader ? leader.name : "Next player"}'s play holds. Pile cleared.`;
  if (next) match.log.unshift(`${next.name} leads the next pile.`);
}

function advanceAfterMove(match, playerSeat) {
  if (checkRoundOver(match)) return;
  if (allPassedExceptLead(match)) {
    clearPileAndLead(match);
    return;
  }
  const next = nextResponderAfter(match, playerSeat);
  if (next) match.activeSeat = next.seat;
  else clearPileAndLead(match);
}

function chooseBotMove(player, moves, responding) {
  if (!moves.length) return null;
  const candidates = moves.slice();
  candidates.sort((left, right) => {
    const leftGoesOut = left.count === player.hand.length;
    const rightGoesOut = right.count === player.hand.length;
    if (leftGoesOut !== rightGoesOut) return leftGoesOut ? -1 : 1;
    if (!responding && left.count !== right.count) return right.count - left.count;
    return moveCost(left, player) - moveCost(right, player) || left.count - right.count;
  });
  return candidates[0];
}

function publicLead(lead) {
  if (!lead) return null;
  const { cards: _comboCards, ...combo } = lead.combo;
  return {
    playerSeat: lead.playerSeat,
    playerName: lead.playerName,
    cards: lead.cards.map((card) => ({ ...card })),
    combo,
    label: lead.combo.label
  };
}

function initialsForName(name, fallback) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  const letters = parts.length >= 2 ? parts[0][0] + parts[1][0] : (parts[0] || fallback || "P").slice(0, 2);
  return letters.toUpperCase();
}

function ordinal(place) {
  if (place === 1) return "1st";
  if (place === 2) return "2nd";
  if (place === 3) return "3rd";
  return `${place}th`;
}
