import { randomInt } from 'node:crypto';
import rules from '../../../../shared/three-seven-rules.js';
import { GameError as RoomError } from '../../game-error.js';

const {
  SCORE_BY_PLACE,
  TOTAL_ROUNDS,
  makeDeck,
  sortCards,
  detectCombo,
  canBeat,
  comboDescription,
  comboShort,
  getLegalMoves,
  moveCost,
  suitOrder,
  roundStarterCard,
  STARTING_HAND_SIZE,
  finalStandings,
  finalWinners,
  guaranteedWinnerAfterRound
} = rules;

const TABLE_SIZE = 4;
export class MatchEngine {
  constructor({ shuffleDeck = secureShuffle } = {}) {
    this.shuffleDeck = shuffleDeck;
  }

  // `carryScores` seeds each seat's running total and `round` continues the
  // count, so a room can play a series of rounds whose points accumulate
  // rather than resetting on every deal. Absent, this is round 1 from zero.
  createMatch(roomPlayers, {
    carryScores = null,
    carryPlacements = null,
    round = 1,
    doubleOrNothingEnabled = false,
    doubleOrNothingWager = null
  } = {}) {
    if (!Array.isArray(roomPlayers) || roomPlayers.length < 2 || roomPlayers.length > TABLE_SIZE) {
      throw new RoomError('A match requires two to four players.', 'INVALID_PLAYER_COUNT');
    }
    if (!Number.isInteger(round) || round < 1 || round > TOTAL_ROUNDS) {
      throw new RoomError(`A match has exactly ${TOTAL_ROUNDS} rounds.`, 'INVALID_ROUND');
    }

    const scoreForSeat = seat => {
      if (!carryScores) return 0;
      const carried = carryScores instanceof Map ? carryScores.get(seat) : carryScores[seat];
      return Number.isFinite(carried) ? carried : 0;
    };
    const placementsForSeat = seat => {
      if (!carryPlacements) return [];
      const carried = carryPlacements instanceof Map ? carryPlacements.get(seat) : carryPlacements[seat];
      return Array.isArray(carried) ? carried.slice() : [];
    };

    const players = roomPlayers
      .slice()
      .sort((a, b) => a.seat - b.seat)
      .map(player => createMatchPlayer({
        seat: player.seat,
        name: player.name,
        avatar: initialsForName(player.name, `P${player.seat}`),
        type: player.type === 'bot' ? 'bot' : 'human',
        style: player.style || (player.type === 'bot' ? 'steady' : 'human'),
        score: scoreForSeat(player.seat),
        placementHistory: placementsForSeat(player.seat)
      }));
    players.sort((a, b) => a.seat - b.seat);

    const deck = this.shuffleDeck(makeDeck());
    validateDeck(deck);
    const dealtCardCount = players.length * STARTING_HAND_SIZE;
    for (let index = 0; index < dealtCardCount; index += 1) {
      players[index % players.length].hand.push(deck[index]);
    }
    for (const player of players) player.hand = sortCards(player.hand, 'rank', round);

    const openingCardId = roundStarterCard(round);
    const starter = players.find(player => player.hand.some(card => card.id === openingCardId));
    const dealerIndex = (round - 2 + players.length) % players.length;
    const dealer = players[dealerIndex];
    const fallbackStarter = players[(dealerIndex + 1) % players.length];
    const activeStarter = starter || fallbackStarter;
    const openingAvailable = Boolean(starter);

    return {
      round,
      phase: 'playing',
      players,
      activeSeat: activeStarter.seat,
      dealerSeat: dealer.seat,
      drawPile: deck.slice(dealtCardCount),
      currentLead: null,
      openingRequired: openingAvailable,
      openingAvailable,
      openingCardId,
      suitOrder: suitOrder(round),
      placements: [],
      roundOver: false,
      matchOver: false,
      endedByMercy: false,
      mercyOfferPending: false,
      mercyLeaderSeat: null,
      doubleOrNothingEnabled: doubleOrNothingEnabled === true,
      doubleOrNothing: normalizeWager(doubleOrNothingWager, players),
      finalStandings: [],
      winners: [],
      lastMoveText: openingAvailable
        ? `Opening lead must include ${cardText(openingCardId)}.`
        : `${activeStarter.name}, left of dealer, leads any combo.`,
      log: [openingAvailable
        ? `${activeStarter.name} has ${cardText(openingCardId)} and leads first.`
        : `${cardText(openingCardId)} is in the stock. ${activeStarter.name}, left of ${dealer.name}, leads first.`]
    };
  }

  play(match, seat, cardIds) {
    const player = requireActivePlayer(match, seat);
    if (!Array.isArray(cardIds) || cardIds.length === 0) {
      throw new RoomError('Select at least one card.', 'CARDS_REQUIRED');
    }

    const ids = new Set(cardIds.map(id => String(id)));
    if (ids.size !== cardIds.length) {
      throw new RoomError('A play cannot contain duplicate card identifiers.', 'DUPLICATE_CARD');
    }

    const cards = player.hand.filter(card => ids.has(card.id));
    if (cards.length !== ids.size) {
      throw new RoomError('One or more selected cards are not in your hand.', 'CARD_NOT_OWNED');
    }

    const combo = detectCombo(cards, match.round);
    if (!combo) throw new RoomError('Those cards are not a legal combination.', 'INVALID_COMBO');
    if (match.openingRequired && !ids.has(match.openingCardId)) {
      throw new RoomError(
        `The opening play must include ${cardText(match.openingCardId)}.`,
        'OPENING_CARD_REQUIRED'
      );
    }
    if (!canBeat(combo, match.currentLead && match.currentLead.combo)) {
      throw new RoomError(
        match.currentLead
          ? `That play does not beat ${comboDescription(match.currentLead.combo)}.`
          : 'That combination cannot lead the pile.',
        'PLAY_DOES_NOT_BEAT_PILE'
      );
    }

    if (!match.currentLead) resetPassedFlags(match);
    player.hand = player.hand.filter(card => !ids.has(card.id));
    player.passed = false;
    match.currentLead = {
      playerSeat: player.seat,
      playerName: player.name,
      cards: sortCards(cards, 'rank', match.round),
      combo
    };
    match.openingRequired = false;
    player.lastPlay = {
      kind: 'play',
      label: comboShort(combo),
      cards: match.currentLead.cards.map(card => ({ ...card }))
    };
    match.lastMoveText = `${player.name} played ${comboDescription(combo)}.`;
    match.log.unshift(`${player.name}: ${comboShort(combo)}`);

    if (player.hand.length === 0) placePlayer(match, player);
    advanceAfterMove(match, player.seat);
    return match;
  }

  pass(match, seat) {
    const player = requireActivePlayer(match, seat);
    if (!match.currentLead) {
      throw new RoomError('You control an open pile and must play.', 'CANNOT_PASS_OPEN_PILE');
    }

    const drawnCard = drawCard(match, player);
    player.passed = true;
    player.lastPlay = { kind: 'pass', label: 'Passed', cards: [] };
    match.lastMoveText = drawnCard
      ? `${player.name} passed and drew a card.`
      : `${player.name} passed; the stock is empty.`;
    match.log.unshift(drawnCard ? `${player.name}: Pass · drew 1` : `${player.name}: Pass · stock empty`);

    if (allPassedExceptLead(match)) {
      clearPileAndLead(match);
    } else {
      const next = nextResponderAfter(match, player.seat);
      if (next) match.activeSeat = next.seat;
      else clearPileAndLead(match);
    }
    return match;
  }

  // Plays exactly one bot turn if a bot is on turn, and reports whether it
  // did. The server drives bots a turn at a time so each one is broadcast on
  // its own; resolving a whole chain before broadcasting collapses several
  // turns into a single state, and players only ever see the last of them.
  runBotTurn(match) {
    if (!match || match.roundOver) return false;
    const player = getPlayer(match, match.activeSeat);
    if (!player || player.type !== 'bot') return false;

    const currentCombo = match.currentLead && match.currentLead.combo;
    const legalMoves = getLegalMoves(
      player.hand,
      currentCombo,
      match.openingRequired ? match.openingCardId : null,
      match.round
    );
    const move = chooseBotMove(player, legalMoves, Boolean(currentCombo));
    if (move) this.play(match, player.seat, move.cards.map(card => card.id));
    else this.pass(match, player.seat);
    return true;
  }

  // Resolves every consecutive bot turn at once. Still used where pacing is
  // not wanted, and by the engine tests.
  runBots(match) {
    let turns = 0;
    while (this.runBotTurn(match)) {
      turns += 1;
      if (turns >= 256) {
        throw new RoomError('Bot turn limit exceeded.', 'BOT_TURN_LIMIT', 500);
      }
    }
    return match;
  }

  replaceWithBot(match, seat) {
    const player = getPlayer(match, seat);
    if (!player || player.type !== 'human') return false;
    player.type = 'bot';
    player.style = 'steady';
    player.name = `${player.name} · Bot`;
    match.log.unshift(`${player.name} took over the disconnected seat.`);
    if (match.mercyOfferPending && match.mercyLeaderSeat === player.seat) {
      completeMatch(match, true);
      match.log.unshift(match.lastMoveText);
    }
    return true;
  }

  resolveMercyOffer(match, seat, accept) {
    if (!match || !match.roundOver || !match.mercyOfferPending) {
      throw new RoomError('No double-or-nothing decision is pending.', 'MERCY_OFFER_NOT_PENDING', 409);
    }
    const leader = getPlayer(match, match.mercyLeaderSeat);
    if (!leader || leader.seat !== Number(seat)) {
      throw new RoomError('Only the guaranteed leader can make this decision.', 'MERCY_LEADER_REQUIRED', 403);
    }
    match.mercyOfferPending = false;
    if (accept === true) {
      match.doubleOrNothing = { leaderSeat: leader.seat, amount: leader.score };
      match.lastMoveText = `${leader.name} called double or nothing. Round 4 will decide it.`;
      match.log.unshift(match.lastMoveText);
      return match;
    }
    completeMatch(match, true);
    match.log.unshift(match.lastMoveText);
    return match;
  }

  viewFor(match, seat, connections = new Map()) {
    const viewer = getPlayer(match, seat);
    if (!viewer || viewer.type !== 'human') {
      throw new RoomError('No private match view exists for this seat.', 'SEAT_NOT_FOUND', 404);
    }

    return {
      type: 'match_state',
      state: {
        phase: match.phase,
        round: match.round,
        totalRounds: TOTAL_ROUNDS,
        suitOrder: match.suitOrder.slice(),
        activeSeat: match.activeSeat,
        dealerSeat: match.dealerSeat,
        drawCount: Array.isArray(match.drawPile) ? match.drawPile.length : 0,
        openingRequired: match.openingRequired,
        openingAvailable: match.openingAvailable !== false,
        openingCardId: match.openingCardId,
        currentLead: publicLead(match.currentLead),
        players: match.players.map(player => ({
          seat: player.seat,
          name: player.name,
          avatar: player.avatar,
          type: player.type,
          cardCount: player.hand.length,
          passed: player.passed,
          finished: player.finished,
          place: player.place,
          // Played cards only -- already public the moment they hit the table,
          // so this carries no hand information.
          lastPlay: player.lastPlay
            ? {
                kind: player.lastPlay.kind,
                label: player.lastPlay.label,
                cards: player.lastPlay.cards.map(card => ({ ...card }))
              }
            : null,
          score: player.score,
          placementHistory: player.placementHistory.slice(),
          connected: player.type === 'bot' ? true : connections.get(player.seat) === true
        })),
        placements: match.placements.slice(),
        roundOver: match.roundOver,
        matchOver: match.matchOver,
        endedByMercy: match.endedByMercy === true,
        mercyOfferPending: match.mercyOfferPending === true,
        mercyLeaderSeat: match.mercyLeaderSeat,
        doubleOrNothingEnabled: match.doubleOrNothingEnabled === true,
        doubleOrNothing: match.doubleOrNothing ? { ...match.doubleOrNothing } : null,
        finalStandings: match.finalStandings.slice(),
        winners: match.winners.slice(),
        lastMoveText: match.lastMoveText,
        log: match.log.slice(0, 18)
      },
      hand: viewer.hand.map(card => ({ ...card }))
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
    // The seat's most recent action this round. Every action a client makes is
    // answered with a single broadcast that already has the bots' turns
    // resolved into it, so without recording this per seat the intermediate
    // turns are unrecoverable and only the final pile is ever visible.
    lastPlay: null,
    score,
    placementHistory
  };
}

function validateDeck(deck) {
  if (!Array.isArray(deck) || deck.length !== 52) {
    throw new RoomError('A match requires a complete 52-card deck.', 'INVALID_DECK', 500);
  }
  if (new Set(deck.map(card => card.id)).size !== 52) {
    throw new RoomError('The match deck contains duplicate cards.', 'INVALID_DECK', 500);
  }
}

function requireActivePlayer(match, seat) {
  if (!match || match.roundOver || match.phase !== 'playing') {
    throw new RoomError('No match is currently active.', 'MATCH_NOT_ACTIVE', 409);
  }
  const player = getPlayer(match, seat);
  if (!player) throw new RoomError('Seat not found.', 'SEAT_NOT_FOUND', 404);
  if (player.finished) throw new RoomError('This player has already gone out.', 'PLAYER_FINISHED', 409);
  if (match.activeSeat !== player.seat) {
    throw new RoomError('It is not your turn.', 'NOT_YOUR_TURN', 409);
  }
  return player;
}

function getPlayer(match, seat) {
  return match.players.find(player => player.seat === Number(seat));
}

function resetPassedFlags(match) {
  for (const player of match.players) player.passed = false;
}

function drawCard(match, player) {
  if (!Array.isArray(match.drawPile) || match.drawPile.length === 0) return null;
  const card = match.drawPile.shift();
  player.hand.push(card);
  player.hand = sortCards(player.hand, 'rank', match.round);
  return card;
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
  return match.players.filter(player => !player.finished);
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
  match.phase = 'complete';
  match.activeSeat = null;
  match.currentLead = null;
  for (let index = 0; index < match.placements.length; index += 1) {
    const player = getPlayer(match, match.placements[index]);
    player.score += SCORE_BY_PLACE[index] || 0;
    player.placementHistory.push(index + 1);
  }
  const winner = getPlayer(match, match.placements[0]);
  if (match.round === TOTAL_ROUNDS && match.doubleOrNothing) {
    settleDoubleOrNothing(match, winner);
  }
  if (match.round === TOTAL_ROUNDS) {
    completeMatch(match);
  } else if (match.round === TOTAL_ROUNDS - 1) {
    const guaranteed = guaranteedWinnerAfterRound(match.players);
    if (guaranteed) {
      match.mercyLeaderSeat = guaranteed.seat;
      if (match.doubleOrNothingEnabled && guaranteed.type === 'human') {
        match.mercyOfferPending = true;
        match.lastMoveText = `${guaranteed.name} has clinched the match and may call double or nothing.`;
      } else {
        completeMatch(match, true);
      }
    } else {
      match.lastMoveText = `${winner.name} wins Round ${match.round}.`;
    }
  } else {
    match.lastMoveText = `${winner.name} wins Round ${match.round}.`;
  }
  match.log.unshift(match.lastMoveText);
}

function completeMatch(match, endedByMercy = false) {
  match.matchOver = true;
  match.endedByMercy = endedByMercy;
  match.mercyOfferPending = false;
  const standings = finalStandings(match.players);
  match.finalStandings = standings.map(player => player.seat);
  match.winners = finalWinners(match.players).map(player => player.seat);
  const names = match.winners.map(seat => getPlayer(match, seat).name);
  match.lastMoveText = names.length === 1
    ? `${names[0]} wins 3s & 7s${endedByMercy ? ' by the mercy rule' : ''}!`
    : `${names.join(' & ')} share the win!`;
}

function settleDoubleOrNothing(match, roundWinner) {
  const wager = match.doubleOrNothing;
  const leader = getPlayer(match, wager.leaderSeat);
  if (!leader || !Number.isFinite(wager.amount) || wager.amount < 0) return;
  if (roundWinner.seat === leader.seat) {
    leader.score += wager.amount;
    match.log.unshift(`${leader.name} won double or nothing and gained ${wager.amount} points.`);
  } else {
    leader.score -= wager.amount;
    roundWinner.score += wager.amount;
    match.log.unshift(`${roundWinner.name} won ${wager.amount} points from ${leader.name}.`);
  }
}

function normalizeWager(wager, players) {
  if (!wager || !Number.isInteger(wager.leaderSeat) || !Number.isFinite(wager.amount) || wager.amount < 0) {
    return null;
  }
  if (!players.some(player => player.seat === wager.leaderSeat)) return null;
  return { leaderSeat: wager.leaderSeat, amount: wager.amount };
}

function allPassedExceptLead(match) {
  if (!match.currentLead) return false;
  const leadSeat = match.currentLead.playerSeat;
  return match.players.every(player =>
    player.finished || player.seat === leadSeat || player.passed
  );
}

function nextResponderAfter(match, fromSeat) {
  const leadSeat = match.currentLead && match.currentLead.playerSeat;
  const fromIndex = match.players.findIndex(player => player.seat === Number(fromSeat));
  if (fromIndex < 0) return null;
  for (let step = 1; step <= match.players.length; step += 1) {
    const player = match.players[(fromIndex + step) % match.players.length];
    if (!player.finished && !player.passed && player.seat !== leadSeat) return player;
  }
  return null;
}

function nextActiveAfter(match, fromSeat) {
  const fromIndex = match.players.findIndex(player => player.seat === Number(fromSeat));
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
  match.activeSeat = next ? next.seat : null;
  match.lastMoveText = `${leader ? leader.name : 'Next player'}'s play holds. Pile cleared.`;
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
  candidates.sort((a, b) => {
    const aGoesOut = a.count === player.hand.length;
    const bGoesOut = b.count === player.hand.length;
    if (aGoesOut !== bGoesOut) return aGoesOut ? -1 : 1;
    if (!responding && a.count !== b.count) return b.count - a.count;
    return moveCost(a, player) - moveCost(b, player) || a.count - b.count;
  });
  return candidates[0];
}

function publicLead(lead) {
  if (!lead) return null;
  const { cards: _comboCards, ...combo } = lead.combo;
  return {
    playerSeat: lead.playerSeat,
    playerName: lead.playerName,
    cards: lead.cards.map(card => ({ ...card })),
    combo,
    label: lead.combo.label
  };
}

function initialsForName(name, fallback) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  const letters = parts.length >= 2
    ? parts[0][0] + parts[1][0]
    : (parts[0] || fallback || 'P').slice(0, 2);
  return letters.toUpperCase();
}

function ordinal(place) {
  if (place === 1) return '1st';
  if (place === 2) return '2nd';
  if (place === 3) return '3rd';
  return `${place}th`;
}

function cardText(cardId) {
  const suit = { S: '♠', C: '♣', D: '♦', H: '♥' }[String(cardId).slice(-1)] || '';
  return `${String(cardId).slice(0, -1)}${suit}`;
}
