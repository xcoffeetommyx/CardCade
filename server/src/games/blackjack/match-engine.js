import { randomInt } from "node:crypto";
import standard52 from "../../../../shared/standard-52.js";
import rules from "../../../../shared/blackjack-rules.js";
import { GameError as RoomError } from "../../game-error.js";

const MIN_PLAYERS = 1;
const MAX_PLAYERS = 4;

export class MatchEngine {
  constructor({ shuffleDeck = secureShuffle } = {}) {
    this.shuffleDeck = shuffleDeck;
  }

  createMatch(roomPlayers, { carryScores = null, round = 1 } = {}) {
    if (!Array.isArray(roomPlayers) || roomPlayers.length < MIN_PLAYERS || roomPlayers.length > MAX_PLAYERS) {
      throw new RoomError("Blackjack supports between one and four occupied seats.", "INVALID_PLAYER_COUNT");
    }

    const scoreForSeat = (seat) => {
      if (!carryScores) return 0;
      const score = carryScores instanceof Map ? carryScores.get(seat) : carryScores[seat];
      return Number.isFinite(score) ? score : 0;
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
        score: scoreForSeat(player.seat)
      }));

    const stock = this.shuffleDeck(standard52.makeDeck());
    validateDeck(stock);
    const match = {
      round,
      phase: "dealing",
      players,
      dealer: { cards: [], revealed: false, peeked: false },
      stock,
      discard: [],
      activeSeat: null,
      activeHandIndex: null,
      roundOver: false,
      lastMoveText: "The dealer is dealing the opening cards.",
      log: []
    };

    for (const player of players) player.hands[0].cards.push(drawCard(match));
    match.dealer.cards.push(drawCard(match));
    for (const player of players) player.hands[0].cards.push(drawCard(match));
    match.dealer.cards.push(drawCard(match));

    const dealerUpcard = match.dealer.cards[0];
    match.lastMoveText = `Dealer shows ${standard52.cardLabel(dealerUpcard)}.`;
    match.log.unshift(match.lastMoveText);
    beginInitialDecision(match);
    return match;
  }

  hit(match, seat) {
    const { player, hand } = requireActiveHand(match, seat);
    hand.cards.push(drawCard(match));
    hand.actionsTaken += 1;
    player.lastAction = action("hit", `Hit ${standard52.cardLabel(hand.cards.at(-1))}`, match.activeHandIndex);
    match.lastMoveText = `${player.name} hits.`;
    match.log.unshift(`${player.name} hit ${standard52.cardLabel(hand.cards.at(-1))}.`);
    if (finishForcedHand(hand)) advanceAfterHand(match, player.seat, match.activeHandIndex);
    return match;
  }

  stand(match, seat) {
    const { player, hand } = requireActiveHand(match, seat);
    if (!rules.availableActions({ cards: hand.cards, actionsTaken: hand.actionsTaken }).stand) {
      throw new RoomError("That hand cannot stand now.", "ACTION_NOT_ALLOWED");
    }
    hand.complete = true;
    hand.finishReason = "stand";
    hand.actionsTaken += 1;
    player.lastAction = action("stand", "Stand", match.activeHandIndex);
    match.lastMoveText = `${player.name} stands.`;
    match.log.unshift(match.lastMoveText);
    advanceAfterHand(match, player.seat, match.activeHandIndex);
    return match;
  }

  double(match, seat) {
    const { player, hand } = requireActiveHand(match, seat);
    if (!rules.canDoubleDown({ cards: hand.cards, actionsTaken: hand.actionsTaken })) {
      throw new RoomError("Double down is only available on a fresh two-card hand.", "DOUBLE_NOT_ALLOWED");
    }
    hand.wager *= 2;
    hand.doubled = true;
    hand.actionsTaken += 1;
    hand.cards.push(drawCard(match));
    hand.complete = true;
    hand.finishReason = rules.handValue(hand.cards).bust ? "bust" : "double";
    player.lastAction = action("double", `Double · ${standard52.cardLabel(hand.cards.at(-1))}`, match.activeHandIndex);
    match.lastMoveText = `${player.name} doubles down.`;
    match.log.unshift(`${player.name} doubled and drew ${standard52.cardLabel(hand.cards.at(-1))}.`);
    advanceAfterHand(match, player.seat, match.activeHandIndex);
    return match;
  }

  split(match, seat) {
    const { player, hand, handIndex } = requireActiveHand(match, seat);
    if (!rules.canSplitHand({ cards: hand.cards, handCount: player.hands.length })) {
      throw new RoomError("This hand cannot be split.", "SPLIT_NOT_ALLOWED");
    }

    const [leftCard, rightCard] = hand.cards;
    const left = createHand({ cards: [leftCard], wager: hand.wager, isSplitHand: true, blackjackEligible: false });
    const right = createHand({ cards: [rightCard], wager: hand.wager, isSplitHand: true, blackjackEligible: false });
    player.hands.splice(handIndex, 1, left, right);
    left.cards.push(drawCard(match));
    right.cards.push(drawCard(match));
    player.lastAction = action("split", `Split ${standard52.cardLabel(leftCard)}s`, handIndex);
    match.lastMoveText = `${player.name} splits a pair.`;
    match.log.unshift(`${player.name} splits ${standard52.cardLabel(leftCard)} and ${standard52.cardLabel(rightCard)}.`);

    const splitAces = rules.splitValue(leftCard) === 11;
    if (splitAces) {
      left.complete = true;
      left.finishReason = "split-aces";
      right.complete = true;
      right.finishReason = "split-aces";
      advanceAfterHand(match, player.seat, handIndex);
      return match;
    }

    finishForcedHand(left);
    finishForcedHand(right);
    if (left.complete) advanceAfterHand(match, player.seat, handIndex);
    else setActiveHand(match, player.seat, handIndex);
    return match;
  }

  surrender(match, seat) {
    const { player, hand } = requireActiveHand(match, seat);
    if (!rules.canSurrender({ cards: hand.cards, actionsTaken: hand.actionsTaken, isSplitHand: hand.isSplitHand })) {
      throw new RoomError("Surrender is only available on an original two-card hand.", "SURRENDER_NOT_ALLOWED");
    }
    hand.surrendered = true;
    hand.complete = true;
    hand.finishReason = "surrender";
    hand.actionsTaken += 1;
    player.lastAction = action("surrender", "Surrender", match.activeHandIndex);
    match.lastMoveText = `${player.name} surrenders.`;
    match.log.unshift(match.lastMoveText);
    advanceAfterHand(match, player.seat, match.activeHandIndex);
    return match;
  }

  insurance(match, seat, takeInsurance) {
    const player = requireInsurancePlayer(match, seat);
    player.insurance.decisionMade = true;
    player.insurance.taken = takeInsurance === true;
    player.lastAction = action(takeInsurance ? "insurance" : "decline-insurance", takeInsurance ? "Took insurance" : "Declined insurance");
    match.lastMoveText = takeInsurance ? `${player.name} takes insurance.` : `${player.name} declines insurance.`;
    match.log.unshift(match.lastMoveText);

    const next = match.players.find((candidate) => !candidate.insurance.decisionMade);
    if (next) {
      match.activeSeat = next.seat;
      match.activeHandIndex = null;
      return match;
    }

    match.dealer.peeked = true;
    if (rules.isBlackjack(match.dealer.cards)) {
      prepareDealerTurn(match, "Dealer checks Blackjack.");
    } else {
      markNaturalHands(match);
      startPlayerTurns(match);
    }
    return match;
  }

  runDealerTurn(match) {
    if (!match || match.roundOver || match.phase !== "dealer-turn") return false;
    match.dealer.revealed = true;

    if (hasContestedHand(match) && rules.dealerShouldHit(match.dealer.cards)) {
      const drawn = drawCard(match);
      match.dealer.cards.push(drawn);
      match.lastMoveText = `Dealer draws ${standard52.cardLabel(drawn)}.`;
      match.log.unshift(match.lastMoveText);
      if (rules.dealerShouldHit(match.dealer.cards)) return true;
    }

    settleRound(match);
    return true;
  }

  runBotTurn(match) {
    if (!match || match.roundOver) return false;
    if (match.phase === "dealer-turn") return this.runDealerTurn(match);
    if (match.phase === "insurance") {
      const player = getPlayer(match, match.activeSeat);
      if (!player || player.type !== "bot") return false;
      this.insurance(match, player.seat, false);
      return true;
    }
    if (match.phase !== rules.PLAYER_PHASE) return false;
    const player = getPlayer(match, match.activeSeat);
    const hand = player?.hands[match.activeHandIndex];
    if (!player || !hand || player.type !== "bot") return false;

    const decision = rules.chooseBotAction({
      cards: hand.cards,
      dealerUpcard: match.dealer.cards[0],
      actionsTaken: hand.actionsTaken,
      isSplitHand: hand.isSplitHand,
      handCount: player.hands.length
    });
    if (decision === "split") this.split(match, player.seat);
    else if (decision === "double") this.double(match, player.seat);
    else if (decision === "surrender") this.surrender(match, player.seat);
    else if (decision === "hit") this.hit(match, player.seat);
    else this.stand(match, player.seat);
    return true;
  }

  runBots(match) {
    let turns = 0;
    while (this.runBotTurn(match)) {
      turns += 1;
      if (turns >= 512) throw new RoomError("Blackjack CPU turn limit exceeded.", "BOT_TURN_LIMIT", 500);
    }
    return match;
  }

  replaceWithBot(match, seat) {
    const player = getPlayer(match, seat);
    if (!player || player.type !== "human") return false;
    player.type = "bot";
    player.style = "steady";
    player.name = `${player.name} · Bot`;
    match.log.unshift(`${player.name} took over the seat.`);
    return true;
  }

  nextRound(match) {
    if (!match?.roundOver) throw new RoomError("Finish the current Blackjack round first.", "ROUND_IN_PROGRESS", 409);
    const carryScores = new Map(match.players.map((player) => [player.seat, player.score]));
    return this.createMatch(match.players.map((player) => ({
      seat: player.seat,
      name: player.name,
      type: player.type,
      style: player.style
    })), { carryScores, round: match.round + 1 });
  }

  viewFor(match, seat, connections = new Map()) {
    const viewer = getPlayer(match, seat);
    if (!viewer || viewer.type !== "human") throw new RoomError("No private Blackjack view exists for this seat.", "SEAT_NOT_FOUND", 404);
    const activeHand = match.activeSeat === viewer.seat ? viewer.hands[match.activeHandIndex] : null;
    const playerActions = activeHand && match.phase === rules.PLAYER_PHASE
      ? rules.availableActions({
          cards: activeHand.cards,
          dealerUpcard: match.dealer.cards[0],
          phase: match.phase,
          actionsTaken: activeHand.actionsTaken,
          isSplitHand: activeHand.isSplitHand,
          handCount: viewer.hands.length,
          insuranceTaken: viewer.insurance.taken
        })
      : emptyActions();
    const insuranceActions = match.phase === "insurance" && match.activeSeat === viewer.seat
      ? { take: true, decline: true }
      : { take: false, decline: false };
    const dealerCards = match.dealer.revealed
      ? match.dealer.cards.map(cloneCard)
      : match.dealer.cards.slice(0, 1).map(cloneCard);

    return {
      type: "blackjack_match_state",
      state: {
        phase: match.phase,
        round: match.round,
        activeSeat: match.activeSeat,
        activeHandIndex: match.activeHandIndex,
        dealer: {
          cards: dealerCards,
          cardCount: match.dealer.cards.length,
          revealed: match.dealer.revealed,
          total: match.dealer.revealed ? rules.handValue(match.dealer.cards).total : null,
          label: match.dealer.revealed ? rules.handLabel(match.dealer.cards) : null
        },
        stockCount: match.stock.length,
        players: match.players.map((player) => publicPlayer(player, connections.get(player.seat) === true)),
        roundOver: match.roundOver,
        lastMoveText: match.lastMoveText,
        log: match.log.slice(0, 18),
        actions: playerActions,
        insuranceActions
      },
      hands: viewer.hands.map(privateHand),
      insurance: {
        decisionMade: viewer.insurance.decisionMade,
        taken: viewer.insurance.taken,
        outcome: viewer.insurance.outcome,
        points: viewer.insurance.points
      }
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

function createMatchPlayer({ seat, name, avatar, type, style, score = 0 }) {
  return {
    seat,
    name,
    avatar,
    type,
    style,
    score,
    hands: [createHand()],
    insurance: { decisionMade: false, taken: false, outcome: null, points: 0 },
    lastAction: null
  };
}

function createHand({ cards = [], wager = rules.BASE_TABLE_POINTS, isSplitHand = false, blackjackEligible = true } = {}) {
  return {
    cards: cards.slice(),
    wager,
    actionsTaken: 0,
    isSplitHand,
    blackjackEligible,
    doubled: false,
    surrendered: false,
    complete: false,
    finishReason: null,
    outcome: null,
    points: 0
  };
}

function beginInitialDecision(match) {
  const dealerUpcard = match.dealer.cards[0];
  if (rules.insuranceOffered({ dealerUpcard })) {
    match.phase = "insurance";
    match.activeSeat = match.players[0].seat;
    match.activeHandIndex = null;
    match.lastMoveText = "Dealer shows an Ace. Insurance is available.";
    match.log.unshift(match.lastMoveText);
    return;
  }
  match.dealer.peeked = true;
  if (rules.isBlackjack(match.dealer.cards)) {
    prepareDealerTurn(match, "Dealer checks Blackjack.");
    return;
  }
  markNaturalHands(match);
  startPlayerTurns(match);
}

function markNaturalHands(match) {
  for (const player of match.players) {
    for (const hand of player.hands) {
      if (hand.blackjackEligible && rules.isBlackjack(hand.cards)) {
        hand.complete = true;
        hand.finishReason = "blackjack";
        player.lastAction = action("blackjack", "Blackjack");
        match.log.unshift(`${player.name} has Blackjack.`);
      }
    }
  }
}

function startPlayerTurns(match) {
  const next = nextOpenHand(match);
  if (next) {
    setActiveHand(match, next.seat, next.handIndex);
    const player = getPlayer(match, next.seat);
    match.lastMoveText = `${player.name}'s turn.`;
    return;
  }
  prepareDealerTurn(match, "All player hands are settled. Dealer reveals.");
}

function prepareDealerTurn(match, message) {
  match.phase = "dealer-turn";
  match.activeSeat = null;
  match.activeHandIndex = null;
  match.dealer.revealed = true;
  match.lastMoveText = message;
  match.log.unshift(message);
}

function requireActiveHand(match, seat) {
  if (!match || match.roundOver || match.phase !== rules.PLAYER_PHASE) {
    throw new RoomError("No player hand is awaiting an action.", "MATCH_NOT_ACTIVE", 409);
  }
  const player = getPlayer(match, seat);
  if (!player) throw new RoomError("Seat not found.", "SEAT_NOT_FOUND", 404);
  if (player.seat !== match.activeSeat) throw new RoomError("It is not your turn.", "NOT_YOUR_TURN", 409);
  const handIndex = match.activeHandIndex;
  const hand = player.hands[handIndex];
  if (!hand || hand.complete) throw new RoomError("That hand is no longer active.", "HAND_NOT_ACTIVE", 409);
  return { player, hand, handIndex };
}

function requireInsurancePlayer(match, seat) {
  if (!match || match.roundOver || match.phase !== "insurance") {
    throw new RoomError("Insurance is not available now.", "INSURANCE_NOT_AVAILABLE", 409);
  }
  const player = getPlayer(match, seat);
  if (!player) throw new RoomError("Seat not found.", "SEAT_NOT_FOUND", 404);
  if (player.seat !== match.activeSeat) throw new RoomError("It is not your insurance decision.", "NOT_YOUR_TURN", 409);
  if (player.insurance.decisionMade) throw new RoomError("Insurance was already decided.", "INSURANCE_ALREADY_DECIDED", 409);
  return player;
}

function finishForcedHand(hand) {
  const value = rules.handValue(hand.cards);
  if (!value.bust && value.total !== rules.BLACKJACK_TOTAL) return false;
  hand.complete = true;
  hand.finishReason = value.bust ? "bust" : "twenty-one";
  return true;
}

function advanceAfterHand(match, seat, handIndex) {
  const next = nextOpenHand(match, seat, handIndex);
  if (next) {
    setActiveHand(match, next.seat, next.handIndex);
    const player = getPlayer(match, next.seat);
    match.lastMoveText = `${player.name}'s turn.`;
    return;
  }
  prepareDealerTurn(match, "All player hands are complete. Dealer reveals.");
}

function nextOpenHand(match, afterSeat = null, afterHandIndex = null) {
  const entries = match.players.flatMap((player) => player.hands.map((hand, handIndex) => ({ player, hand, handIndex })));
  if (!entries.length) return null;
  const currentIndex = afterSeat == null
    ? -1
    : entries.findIndex((entry) => entry.player.seat === Number(afterSeat) && entry.handIndex === Number(afterHandIndex));
  const start = currentIndex >= 0 ? currentIndex : -1;
  for (let step = 1; step <= entries.length; step += 1) {
    const candidate = entries[(start + step) % entries.length];
    if (!candidate.hand.complete) return { seat: candidate.player.seat, handIndex: candidate.handIndex };
  }
  return null;
}

function setActiveHand(match, seat, handIndex) {
  match.phase = rules.PLAYER_PHASE;
  match.activeSeat = seat;
  match.activeHandIndex = handIndex;
}

function hasContestedHand(match) {
  return match.players.some((player) => player.hands.some((hand) => {
    const value = rules.handValue(hand.cards);
    return !hand.surrendered && !value.bust;
  }));
}

function settleRound(match) {
  if (match.roundOver) return;
  match.dealer.revealed = true;
  const dealerValue = rules.handValue(match.dealer.cards);
  for (const player of match.players) {
    let roundPoints = 0;
    for (const hand of player.hands) {
      const result = rules.resolveMainHand({
        playerCards: hand.cards,
        dealerCards: match.dealer.cards,
        stake: hand.wager,
        surrendered: hand.surrendered,
        blackjackEligible: hand.blackjackEligible
      });
      hand.complete = true;
      hand.outcome = result.outcome;
      hand.points = result.points;
      roundPoints += result.points;
    }
    const insurance = rules.resolveInsurance({
      insuranceTaken: player.insurance.taken,
      dealerCards: match.dealer.cards
    });
    player.insurance.outcome = insurance.outcome;
    player.insurance.points = insurance.points;
    roundPoints += insurance.points;
    player.score = normalizePoints(player.score + roundPoints);
  }
  match.roundOver = true;
  match.phase = "complete";
  match.activeSeat = null;
  match.activeHandIndex = null;
  match.lastMoveText = dealerValue.bust
    ? `Dealer busts with ${dealerValue.total}.`
    : `Dealer stands on ${rules.handLabel(match.dealer.cards)}.`;
  match.log.unshift(match.lastMoveText);
}

function publicPlayer(player, connected) {
  return {
    seat: player.seat,
    name: player.name,
    avatar: player.avatar,
    type: player.type,
    score: player.score,
    connected: player.type === "bot" ? true : connected,
    handCount: player.hands.length,
    cardCount: player.hands.reduce((total, hand) => total + hand.cards.length, 0),
    hands: player.hands.map((hand) => ({
      cardCount: hand.cards.length,
      wager: hand.wager,
      complete: hand.complete,
      surrendered: hand.surrendered,
      doubled: hand.doubled,
      outcome: hand.outcome,
      points: hand.points
    })),
    insuranceDecisionMade: player.insurance.decisionMade,
    lastAction: player.lastAction ? { ...player.lastAction } : null
  };
}

function privateHand(hand) {
  return {
    cards: hand.cards.map(cloneCard),
    wager: hand.wager,
    actionsTaken: hand.actionsTaken,
    isSplitHand: hand.isSplitHand,
    blackjackEligible: hand.blackjackEligible,
    doubled: hand.doubled,
    surrendered: hand.surrendered,
    complete: hand.complete,
    finishReason: hand.finishReason,
    outcome: hand.outcome,
    points: hand.points,
    value: rules.handValue(hand.cards),
    label: rules.handLabel(hand.cards)
  };
}

function emptyActions() {
  return { hit: false, stand: false, double: false, split: false, surrender: false, insurance: false };
}

function action(type, label, handIndex = null) {
  return { type, label, handIndex };
}

function drawCard(match) {
  const card = match.stock.pop();
  if (!card) throw new RoomError("The Blackjack deck is empty.", "DECK_EMPTY", 500);
  return card;
}

function getPlayer(match, seat) {
  return match.players.find((player) => player.seat === Number(seat));
}

function cloneCard(card) {
  return { ...card };
}

function validateDeck(deck) {
  const expectedIds = new Set(standard52.makeDeck().map((card) => card.id));
  if (!Array.isArray(deck) || deck.length !== expectedIds.size) {
    throw new RoomError("Blackjack requires Cardcade's complete 52-card deck.", "INVALID_DECK", 500);
  }
  if (new Set(deck.map((card) => card.id)).size !== expectedIds.size || deck.some((card) => !expectedIds.has(card.id))) {
    throw new RoomError("The Blackjack deck is not the shared standard deck.", "INVALID_DECK", 500);
  }
  if (deck.some((card) => Object.keys(card).some((key) => !["id", "rank", "suit"].includes(key)))) {
    throw new RoomError("Blackjack must use Cardcade's rules-neutral deck objects.", "INVALID_DECK", 500);
  }
}

function initialsForName(name, fallback) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  const letters = parts.length >= 2 ? parts[0][0] + parts[1][0] : (parts[0] || fallback || "P").slice(0, 2);
  return letters.toUpperCase();
}

function normalizePoints(points) {
  return Math.round(Number(points) * 2) / 2;
}
