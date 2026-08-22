import { randomInt } from "node:crypto";
import standard52 from "../../../../shared/standard-52.js";
import rules from "../../../../shared/holdem-rules.js";
import { GameError as RoomError } from "../../game-error.js";

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 4;

/**
 * Authoritative fixed-limit Texas Hold'em match engine.
 *
 * Cardcade's shared deck owns the cards and rendering. This engine only owns
 * table points, betting state, public cards, private hole cards, and turn
 * order so the same table can run Solo, rooms, and Hot Seat unchanged.
 */
export class MatchEngine {
  constructor({ shuffleDeck = secureShuffle } = {}) {
    this.shuffleDeck = shuffleDeck;
  }

  createMatch(roomPlayers) {
    if (!Array.isArray(roomPlayers) || roomPlayers.length < MIN_PLAYERS || roomPlayers.length > MAX_PLAYERS) {
      throw new RoomError("Texas Hold'em supports between two and four occupied seats.", "INVALID_PLAYER_COUNT");
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

    const match = {
      round: 0,
      phase: "waiting",
      players,
      dealerSeat: players[0].seat,
      smallBlindSeat: null,
      bigBlindSeat: null,
      activeSeat: null,
      stock: [],
      burnedCards: [],
      communityCards: [],
      pot: 0,
      currentBet: 0,
      betCount: 0,
      raiseLocked: false,
      roundOver: false,
      matchOver: false,
      winnerSeat: null,
      showdown: null,
      lastMoveText: "The Poker table is opening.",
      log: []
    };

    this.#startHand(match, { dealerSeat: players[0].seat });
    return match;
  }

  fold(match, seat) {
    const player = requireActivePlayer(match, seat);
    player.folded = true;
    player.actedThisStreet = true;
    setLastAction(player, "fold", "Fold");
    match.lastMoveText = `${player.name} folds.`;
    match.log.unshift(match.lastMoveText);
    this.#advanceAfterAction(match, player.seat);
    return match;
  }

  check(match, seat) {
    const player = requireActivePlayer(match, seat);
    const actions = actionsFor(match, player);
    if (!actions.check) throw new RoomError("A check is only available when no points are due.", "CHECK_NOT_ALLOWED");
    player.actedThisStreet = true;
    setLastAction(player, "check", "Check");
    match.lastMoveText = `${player.name} checks.`;
    match.log.unshift(match.lastMoveText);
    this.#advanceAfterAction(match, player.seat);
    return match;
  }

  call(match, seat) {
    const player = requireActivePlayer(match, seat);
    const actions = actionsFor(match, player);
    if (!actions.call) throw new RoomError("There is no bet to call.", "CALL_NOT_ALLOWED");
    const paid = commitPoints(match, player, actions.callAmount);
    player.actedThisStreet = true;
    const allIn = player.allIn && paid < actions.toCall;
    setLastAction(player, allIn ? "all-in-call" : "call", allIn ? `All in · Call ${paid}` : `Call ${paid}`, paid);
    match.lastMoveText = allIn ? `${player.name} is all in for ${paid}.` : `${player.name} calls ${paid}.`;
    match.log.unshift(match.lastMoveText);
    this.#advanceAfterAction(match, player.seat);
    return match;
  }

  bet(match, seat) {
    const player = requireActivePlayer(match, seat);
    const actions = actionsFor(match, player);
    if (!actions.bet) throw new RoomError("A fixed-limit bet is not available now.", "BET_NOT_ALLOWED");
    const paid = commitPoints(match, player, actions.betAmount);
    const fullBet = paid >= actions.betSize;
    match.currentBet = Math.max(match.currentBet, player.contributionRound);
    if (fullBet) {
      match.betCount = Math.max(1, match.betCount);
      resetForAggression(match, player.seat);
    } else {
      match.raiseLocked = true;
      resetForShortAllIn(match, player.seat);
    }
    const label = player.allIn ? `All in · Bet ${paid}` : `Bet ${paid}`;
    setLastAction(player, player.allIn ? "all-in-bet" : "bet", label, paid);
    match.lastMoveText = player.allIn ? `${player.name} is all in for ${paid}.` : `${player.name} bets ${paid}.`;
    match.log.unshift(match.lastMoveText);
    this.#advanceAfterAction(match, player.seat);
    return match;
  }

  raise(match, seat) {
    const player = requireActivePlayer(match, seat);
    const actions = actionsFor(match, player);
    if (!actions.raise) throw new RoomError("A raise is not available now.", "RAISE_NOT_ALLOWED");
    const oldBet = match.currentBet;
    const paid = commitPoints(match, player, actions.raiseAmount);
    const newBet = player.contributionRound;
    const fullRaise = newBet >= oldBet + actions.betSize;
    match.currentBet = Math.max(oldBet, newBet);
    if (fullRaise) {
      match.betCount += 1;
      resetForAggression(match, player.seat);
    } else {
      // A short all-in can increase the amount due, but it does not reopen
      // fixed-limit raising. Everyone still gets a chance to call it.
      match.raiseLocked = true;
      resetForShortAllIn(match, player.seat);
    }
    const label = player.allIn ? `All in · Raise to ${newBet}` : `Raise to ${newBet}`;
    setLastAction(player, player.allIn ? "all-in-raise" : "raise", label, paid);
    match.lastMoveText = player.allIn ? `${player.name} is all in, raising to ${newBet}.` : `${player.name} raises to ${newBet}.`;
    match.log.unshift(match.lastMoveText);
    this.#advanceAfterAction(match, player.seat);
    return match;
  }

  runBotTurn(match) {
    if (!match || match.roundOver || !rules.STREETS.includes(match.phase)) return false;
    const player = getPlayer(match, match.activeSeat);
    if (!player || player.type !== "bot") return false;

    const actions = actionsFor(match, player);
    const decision = chooseBotAction(match, player, actions);
    if (decision === "fold") this.fold(match, player.seat);
    else if (decision === "check") this.check(match, player.seat);
    else if (decision === "call") this.call(match, player.seat);
    else if (decision === "bet") this.bet(match, player.seat);
    else if (decision === "raise") this.raise(match, player.seat);
    else throw new RoomError("Poker CPU chose an unsupported action.", "BOT_ACTION_INVALID", 500);
    return true;
  }

  runBots(match) {
    let turns = 0;
    while (this.runBotTurn(match)) {
      turns += 1;
      if (turns >= 512) throw new RoomError("Poker CPU turn limit exceeded.", "BOT_TURN_LIMIT", 500);
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

  nextHand(match) {
    if (!match?.roundOver) throw new RoomError("Finish the current Poker hand first.", "ROUND_IN_PROGRESS", 409);
    if (match.matchOver) throw new RoomError("This table has a winner and does not allow rebuys.", "MATCH_COMPLETE", 409);
    if (activePlayers(match).length < MIN_PLAYERS) throw new RoomError("This table no longer has enough points in play.", "MATCH_COMPLETE", 409);
    this.#startHand(match, { dealerSeat: nextEligibleSeatAfter(match, match.dealerSeat) });
    return match;
  }

  viewFor(match, seat, connections = new Map()) {
    const viewer = getPlayer(match, seat);
    if (!viewer || viewer.type !== "human") throw new RoomError("No private Poker view exists for this seat.", "SEAT_NOT_FOUND", 404);
    const viewerActions = match.activeSeat === viewer.seat && rules.STREETS.includes(match.phase)
      ? actionsFor(match, viewer)
      : inactiveActions(match.phase);
    const revealHands = Boolean(match.showdown?.revealed);

    return {
      type: "holdem_match_state",
      state: {
        phase: match.phase,
        round: match.round,
        activeSeat: match.activeSeat,
        dealerSeat: match.dealerSeat,
        smallBlindSeat: match.smallBlindSeat,
        bigBlindSeat: match.bigBlindSeat,
        communityCards: match.communityCards.map(cloneCard),
        stockCount: match.stock.length,
        pot: match.pot,
        currentBet: match.currentBet,
        betCount: match.betCount,
        raiseLocked: match.raiseLocked,
        betSize: rules.streetBetSize(match.phase),
        players: match.players.map((player) => publicPlayer(player, connections.get(player.seat) === true, revealHands)),
        roundOver: match.roundOver,
        matchOver: match.matchOver,
        winnerSeat: match.winnerSeat,
        showdown: publicShowdown(match.showdown),
        lastMoveText: match.lastMoveText,
        log: match.log.slice(0, 24),
        actions: viewerActions
      },
      hand: viewer.holeCards.map(cloneCard)
    };
  }

  #startHand(match, { dealerSeat }) {
    const playersInHand = activePlayers(match);
    if (playersInHand.length < MIN_PLAYERS) {
      match.roundOver = true;
      match.matchOver = true;
      match.phase = "complete";
      match.activeSeat = null;
      match.winnerSeat = playersInHand[0]?.seat ?? null;
      return;
    }

    const activeSeats = playersInHand.map((player) => player.seat);
    const positions = rules.blindPositions(activeSeats, dealerSeat);
    const stock = this.shuffleDeck(standard52.makeDeck());
    validateDeck(stock);

    match.round += 1;
    match.phase = "preflop";
    match.dealerSeat = positions.dealerSeat;
    match.smallBlindSeat = positions.smallBlindSeat;
    match.bigBlindSeat = positions.bigBlindSeat;
    match.activeSeat = null;
    match.stock = stock;
    match.burnedCards = [];
    match.communityCards = [];
    match.pot = 0;
    match.currentBet = 0;
    match.betCount = 0;
    match.raiseLocked = false;
    match.roundOver = false;
    match.matchOver = false;
    match.winnerSeat = null;
    match.showdown = null;

    for (const player of match.players) resetPlayerForHand(player);
    const dealOrder = orderedSeatsFrom(activeSeats, positions.smallBlindSeat);
    for (let cardIndex = 0; cardIndex < 2; cardIndex += 1) {
      for (const playerSeat of dealOrder) getPlayer(match, playerSeat).holeCards.push(drawCard(match));
    }

    const smallBlind = getPlayer(match, positions.smallBlindSeat);
    const bigBlind = getPlayer(match, positions.bigBlindSeat);
    const smallPosted = commitPoints(match, smallBlind, rules.SMALL_BLIND);
    const bigPosted = commitPoints(match, bigBlind, rules.BIG_BLIND);
    setLastAction(smallBlind, "small-blind", `Small blind · ${smallPosted}`, smallPosted);
    setLastAction(bigBlind, "big-blind", `Big blind · ${bigPosted}`, bigPosted);
    match.currentBet = Math.max(smallBlind.contributionRound, bigBlind.contributionRound);
    match.betCount = match.currentBet > 0 ? 1 : 0;
    match.lastMoveText = `${smallBlind.name} posts ${smallPosted}; ${bigBlind.name} posts ${bigPosted}.`;
    match.log = [`Hand ${match.round}. ${match.lastMoveText}`];
    match.activeSeat = nextActionableSeat(match, positions.firstPreflopSeat, true);

    if (match.activeSeat === null) this.#runOutOrSettle(match);
  }

  #advanceAfterAction(match, actorSeat) {
    if (contenders(match).length === 1) {
      settleUncontested(match, contenders(match)[0]);
      return;
    }
    if (!actionablePlayers(match).length) {
      this.#runOutOrSettle(match);
      return;
    }
    if (bettingStreetComplete(match)) {
      this.#advanceStreet(match);
      return;
    }
    match.activeSeat = nextActionableSeat(match, actorSeat, false);
    if (match.activeSeat === null) this.#runOutOrSettle(match);
  }

  #advanceStreet(match) {
    if (contenders(match).length === 1) {
      settleUncontested(match, contenders(match)[0]);
      return;
    }
    if (match.phase === "river") {
      settleShowdown(match);
      return;
    }

    if (match.phase === "preflop") dealFlop(match);
    else dealTurnOrRiver(match);
    match.phase = rules.nextStreet(match.phase);
    resetStreetBetting(match);
    const firstPostflop = rules.blindPositions(activeSeatsForHand(match), match.dealerSeat).firstPostflopSeat;
    match.lastMoveText = match.phase === "flop" ? "The flop is on the table." : `The ${match.phase} card is on the table.`;
    match.log.unshift(match.lastMoveText);
    match.activeSeat = nextActionableSeat(match, firstPostflop, true);
    if (match.activeSeat === null) this.#runOutOrSettle(match);
  }

  #runOutOrSettle(match) {
    if (contenders(match).length === 1) {
      settleUncontested(match, contenders(match)[0]);
      return;
    }
    while (match.phase !== "river") {
      if (match.phase === "preflop") dealFlop(match);
      else dealTurnOrRiver(match);
      match.phase = rules.nextStreet(match.phase);
    }
    settleShowdown(match);
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
  return {
    seat,
    name,
    avatar,
    type,
    style,
    stack: rules.STARTING_TABLE_POINTS,
    eliminated: false,
    holeCards: [],
    folded: false,
    allIn: false,
    contributionRound: 0,
    contributionHand: 0,
    actedThisStreet: false,
    lastAction: null,
    payout: 0
  };
}

function resetPlayerForHand(player) {
  player.holeCards = [];
  player.folded = false;
  player.allIn = false;
  player.contributionRound = 0;
  player.contributionHand = 0;
  player.actedThisStreet = false;
  player.lastAction = null;
  player.payout = 0;
}

function requireActivePlayer(match, seat) {
  if (!match || match.roundOver || !rules.STREETS.includes(match.phase)) {
    throw new RoomError("No Poker action is awaiting a player.", "MATCH_NOT_ACTIVE", 409);
  }
  const player = getPlayer(match, seat);
  if (!player) throw new RoomError("Seat not found.", "SEAT_NOT_FOUND", 404);
  if (player.seat !== match.activeSeat) throw new RoomError("It is not your turn.", "NOT_YOUR_TURN", 409);
  if (!isActionable(player)) throw new RoomError("That Poker seat cannot act now.", "PLAYER_NOT_ACTIVE", 409);
  return player;
}

function actionsFor(match, player) {
  return rules.availableActions({
    street: match.phase,
    currentBet: match.currentBet,
    contribution: player.contributionRound,
    stack: player.stack,
    betCount: match.raiseLocked ? rules.MAX_BETS_PER_STREET : match.betCount,
    canAct: isActionable(player)
  });
}

function inactiveActions(street) {
  return rules.availableActions({ street, canAct: false });
}

function commitPoints(match, player, requested) {
  const amount = Math.min(Math.max(0, Number(requested) || 0), player.stack);
  player.stack -= amount;
  player.contributionRound += amount;
  player.contributionHand += amount;
  match.pot += amount;
  if (player.stack === 0) player.allIn = true;
  return amount;
}

function resetForAggression(match, actingSeat) {
  for (const player of actionablePlayers(match)) player.actedThisStreet = player.seat === actingSeat;
}

function resetForShortAllIn(match, actingSeat) {
  for (const player of actionablePlayers(match)) {
    player.actedThisStreet = player.seat === actingSeat || player.contributionRound >= match.currentBet;
  }
}

function resetStreetBetting(match) {
  match.currentBet = 0;
  match.betCount = 0;
  match.raiseLocked = false;
  for (const player of match.players) {
    player.contributionRound = 0;
    player.actedThisStreet = false;
  }
}

function bettingStreetComplete(match) {
  const players = actionablePlayers(match);
  return players.length > 0 && players.every((player) => player.actedThisStreet && player.contributionRound === match.currentBet);
}

function activePlayers(match) {
  return match.players.filter((player) => !player.eliminated && player.stack > 0);
}

function activeSeatsForHand(match) {
  return match.players.filter((player) => !player.eliminated).map((player) => player.seat);
}

function contenders(match) {
  return match.players.filter((player) => !player.eliminated && !player.folded);
}

function actionablePlayers(match) {
  return contenders(match).filter(isActionable);
}

function isActionable(player) {
  return !player.folded && !player.allIn && !player.eliminated && player.stack > 0;
}

function nextActionableSeat(match, fromSeat, includeFrom) {
  const seats = activeSeatsForHand(match);
  if (!seats.length) return null;
  const startIndex = seats.indexOf(fromSeat);
  const initial = startIndex >= 0 ? startIndex : 0;
  const firstOffset = includeFrom ? 0 : 1;
  for (let offset = firstOffset; offset < seats.length + firstOffset; offset += 1) {
    const player = getPlayer(match, seats[(initial + offset) % seats.length]);
    if (isActionable(player)) return player.seat;
  }
  return null;
}

function orderedSeatsFrom(seats, startingSeat) {
  const startIndex = Math.max(0, seats.indexOf(startingSeat));
  return seats.map((_, index) => seats[(startIndex + index) % seats.length]);
}

function nextSeat(seats, fromSeat) {
  const index = seats.indexOf(fromSeat);
  return seats[(Math.max(0, index) + 1) % seats.length];
}

function nextEligibleSeatAfter(match, fromSeat) {
  const seats = match.players.map((player) => player.seat);
  const startIndex = Math.max(0, seats.indexOf(fromSeat));
  for (let offset = 1; offset <= seats.length; offset += 1) {
    const player = getPlayer(match, seats[(startIndex + offset) % seats.length]);
    if (!player.eliminated && player.stack > 0) return player.seat;
  }
  return null;
}

function dealFlop(match) {
  burnCard(match);
  match.communityCards.push(drawCard(match), drawCard(match), drawCard(match));
}

function dealTurnOrRiver(match) {
  burnCard(match);
  match.communityCards.push(drawCard(match));
}

function burnCard(match) {
  match.burnedCards.push(drawCard(match));
}

function settleUncontested(match, winner) {
  const amount = match.pot;
  winner.stack += amount;
  winner.payout += amount;
  completeHand(match, {
    revealed: false,
    pots: [{ amount, cap: null, contributorSeats: match.players.filter((player) => player.contributionHand > 0).map((player) => player.seat), eligibleSeats: [winner.seat], winnerSeats: [winner.seat] }],
    winnerSeats: [winner.seat]
  });
  match.lastMoveText = `${winner.name} wins ${amount} table points when everyone else folds.`;
  match.log.unshift(match.lastMoveText);
}

function settleShowdown(match) {
  const pots = rules.buildSidePots(match.players.map((player) => ({
    seat: player.seat,
    amount: player.contributionHand,
    folded: player.folded
  })));
  const evaluated = new Map();
  const settledPots = pots.map((pot) => {
    const eligible = pot.eligibleSeats.map((seat) => getPlayer(match, seat)).filter(Boolean);
    let winners = [];
    for (const player of eligible) {
      const hand = rules.bestHand([...player.holeCards, ...match.communityCards]);
      evaluated.set(player.seat, hand);
      if (!winners.length || rules.compareHands(hand, evaluated.get(winners[0].seat)) > 0) winners = [player];
      else if (rules.compareHands(hand, evaluated.get(winners[0].seat)) === 0) winners.push(player);
    }
    awardPot(match, pot.amount, winners);
    return { ...pot, winnerSeats: winners.map((player) => player.seat) };
  });

  const winnerSeats = [...new Set(settledPots.flatMap((pot) => pot.winnerSeats))];
  completeHand(match, { revealed: true, pots: settledPots, winnerSeats, evaluations: evaluated });
  const names = winnerSeats.map((seat) => getPlayer(match, seat)?.name).filter(Boolean);
  match.lastMoveText = names.length > 1 ? `${names.join(" and ")} split the showdown.` : `${names[0] || "The table"} wins the showdown.`;
  match.log.unshift(match.lastMoveText);
}

function awardPot(match, amount, winners) {
  if (!winners.length || amount <= 0) return;
  const baseShare = Math.floor(amount / winners.length);
  const remainder = amount % winners.length;
  const ordered = orderedSeatsFrom(winners.map((player) => player.seat), nextSeat(activeSeatsForHand(match), match.dealerSeat))
    .map((seat) => getPlayer(match, seat));
  ordered.forEach((player, index) => {
    const payout = baseShare + (index < remainder ? 1 : 0);
    player.stack += payout;
    player.payout += payout;
  });
}

function completeHand(match, showdown) {
  for (const player of match.players) player.eliminated = player.stack <= 0;
  const playersStillIn = activePlayers(match);
  match.roundOver = true;
  match.phase = "complete";
  match.activeSeat = null;
  match.matchOver = playersStillIn.length <= 1;
  match.winnerSeat = match.matchOver ? playersStillIn[0]?.seat ?? null : null;
  match.showdown = {
    revealed: showdown.revealed,
    pots: showdown.pots.map((pot) => ({
      amount: pot.amount,
      cap: pot.cap,
      contributorSeats: pot.contributorSeats.slice(),
      eligibleSeats: pot.eligibleSeats.slice(),
      winnerSeats: pot.winnerSeats.slice()
    })),
    winnerSeats: showdown.winnerSeats.slice(),
    evaluations: [...(showdown.evaluations || new Map()).entries()].map(([seat, hand]) => ({ seat, hand }))
  };
}

function chooseBotAction(match, player, actions) {
  const strength = botStrength(match, player);
  const toCallRatio = actions.betSize > 0 ? actions.toCall / actions.betSize : 0;
  const pressure = player.style === "pressure" ? 0.08 : player.style === "patient" ? -0.08 : 0;

  if (actions.toCall > 0) {
    if (actions.raise && strength + pressure >= 0.82) return "raise";
    if (strength + pressure < 0.26 && toCallRatio >= 1) return "fold";
    return "call";
  }
  if (actions.bet && strength + pressure >= 0.66) return "bet";
  return "check";
}

function botStrength(match, player) {
  if (match.communityCards.length < 3) {
    const values = player.holeCards.map(rules.rankValue).sort((left, right) => right - left);
    const [high = 0, low = 0] = values;
    const pair = high === low;
    const suited = player.holeCards[0]?.suit === player.holeCards[1]?.suit;
    const connected = high - low <= 2;
    return Math.min(0.98, (pair ? 0.52 + high / 45 : high / 30 + low / 80) + (suited ? 0.05 : 0) + (connected ? 0.04 : 0));
  }
  const hand = rules.bestHand([...player.holeCards, ...match.communityCards]);
  return Math.min(0.98, 0.14 + hand.categoryValue * 0.13 + (hand.tiebreakers[0] || 0) / 100);
}

function setLastAction(player, type, label, amount = 0) {
  player.lastAction = { type, label, amount };
}

function publicPlayer(player, connected, revealHands) {
  return {
    seat: player.seat,
    name: player.name,
    avatar: player.avatar,
    type: player.type,
    connected: player.type === "bot" ? true : connected,
    stack: player.stack,
    eliminated: player.eliminated,
    folded: player.folded,
    allIn: player.allIn,
    holeCardCount: player.holeCards.length,
    contributionRound: player.contributionRound,
    contributionHand: player.contributionHand,
    payout: player.payout,
    lastAction: player.lastAction ? { ...player.lastAction } : null,
    revealedCards: revealHands && !player.folded ? player.holeCards.map(cloneCard) : null
  };
}

function publicShowdown(showdown) {
  if (!showdown) return null;
  return {
    revealed: showdown.revealed,
    pots: showdown.pots.map((pot) => ({
      amount: pot.amount,
      cap: pot.cap,
      contributorSeats: pot.contributorSeats.slice(),
      eligibleSeats: pot.eligibleSeats.slice(),
      winnerSeats: pot.winnerSeats.slice()
    })),
    winnerSeats: showdown.winnerSeats.slice(),
    evaluations: showdown.evaluations.map(({ seat, hand }) => ({
      seat,
      category: hand.category,
      label: hand.label,
      tiebreakers: hand.tiebreakers.slice(),
      cardIds: hand.cardIds.slice()
    }))
  };
}

function drawCard(match) {
  const card = match.stock.pop();
  if (!card) throw new RoomError("The Poker deck is empty.", "DECK_EMPTY", 500);
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
    throw new RoomError("Texas Hold'em requires Cardcade's complete 52-card deck.", "INVALID_DECK", 500);
  }
  if (new Set(deck.map((card) => card.id)).size !== expectedIds.size || deck.some((card) => !expectedIds.has(card.id))) {
    throw new RoomError("Texas Hold'em must use Cardcade's shared standard deck.", "INVALID_DECK", 500);
  }
  if (deck.some((card) => Object.keys(card).some((key) => !["id", "rank", "suit"].includes(key)))) {
    throw new RoomError("Texas Hold'em must use rules-neutral shared deck objects.", "INVALID_DECK", 500);
  }
}

function initialsForName(name, fallback) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  const letters = parts.length >= 2 ? parts[0][0] + parts[1][0] : (parts[0] || fallback || "P").slice(0, 2);
  return letters.toUpperCase();
}
