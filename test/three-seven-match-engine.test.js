import assert from 'node:assert/strict';
import test from 'node:test';
import rules from '../shared/three-seven-rules.js';
import { MatchEngine } from '../server/src/games/three-seven/match-engine.js';
import { GameError as RoomError } from '../server/src/game-error.js';

const { SCORE_BY_PLACE, getLegalMoves, makeDeck } = rules;
const human = (seat, name) => ({ seat, name });
const identityShuffle = deck => deck.slice();
const cardById = new Map(makeDeck().map(card => [card.id, card]));

test('deals seven cards each and keeps the remainder as a draw stock', () => {
  const engine = new MatchEngine({ shuffleDeck: identityShuffle });
  const two = engine.createMatch([human(1, 'One'), human(2, 'Two')]);
  assert.equal(two.players.length, 2);
  assert.deepEqual(two.players.map(player => player.hand.length), [7, 7]);
  assert.equal(two.drawPile.length, 38);

  const three = engine.createMatch([human(1, 'One'), human(2, 'Two'), human(3, 'Three')]);
  assert.equal(three.players.length, 3);
  assert.deepEqual(three.players.map(player => player.hand.length), [7, 7, 7]);
  assert.equal(three.drawPile.length, 31);

  const four = engine.createMatch([
    human(1, 'One'), human(2, 'Two'), human(3, 'Three'), human(4, 'Four')
  ]);
  assert.deepEqual(four.players.map(player => player.hand.length), [7, 7, 7, 7]);
  assert.equal(four.drawPile.length, 24);
  assert.equal(four.players.some(player => player.type === 'bot'), false);
});

test('rotates suit order and required seven opener across four rounds', () => {
  const engine = new MatchEngine({ shuffleDeck: identityShuffle });
  const players = [human(1, 'One'), human(2, 'Two'), human(3, 'Three'), human(4, 'Four')];
  const expected = [
    { round: 1, card: '7S', seat: 1, suits: ['S', 'C', 'D', 'H'] },
    { round: 2, card: '7H', seat: 4, suits: ['H', 'S', 'C', 'D'] },
    { round: 3, card: '7D', seat: 3, suits: ['D', 'H', 'S', 'C'] },
    { round: 4, card: '7C', seat: 2, suits: ['C', 'D', 'H', 'S'] }
  ];
  for (const entry of expected) {
    const match = engine.createMatch(players, { round: entry.round });
    assert.equal(match.openingCardId, entry.card);
    assert.equal(match.activeSeat, entry.seat);
    assert.deepEqual(match.suitOrder, entry.suits);
    assert.equal(match.openingRequired, true);
  }
});

test('uses the player left of the rotating dealer when the opening seven is in stock', () => {
  const engine = new MatchEngine({ shuffleDeck: identityShuffle });
  const players = [human(1, 'One'), human(2, 'Two')];
  const expected = [
    { round: 1, dealer: 2, active: 1 },
    { round: 2, dealer: 1, active: 2 },
    { round: 3, dealer: 2, active: 1 },
    { round: 4, dealer: 1, active: 2 }
  ];
  for (const entry of expected) {
    const match = engine.createMatch(players, { round: entry.round });
    assert.equal(match.dealerSeat, entry.dealer);
    assert.equal(match.activeSeat, entry.active);
    assert.equal(match.openingAvailable, false);
    assert.equal(match.openingRequired, false);
    assert.match(match.lastMoveText, /left of dealer/);
  }
});

test('turn order follows actual players when lobby seat numbers have gaps', () => {
  const engine = new MatchEngine({ shuffleDeck: identityShuffle });
  const match = engine.createMatch([human(1, 'One'), human(3, 'Three')]);
  engine.play(match, 1, [match.players[0].hand[0].id]);
  assert.equal(match.activeSeat, 3);
  const handBeforePass = match.players[1].hand.length;
  engine.pass(match, 3);
  assert.equal(match.players[1].hand.length, handBeforePass + 1);
  assert.equal(match.drawPile.length, 37);
  assert.equal(match.activeSeat, 1);
  assert.equal(match.currentLead, null);
});

test('enforces turn ownership, required opening seven, and open-pile play', () => {
  const engine = new MatchEngine({ shuffleDeck: identityShuffle });
  const match = engine.createMatch([
    human(1, 'One'), human(2, 'Two'), human(3, 'Three'), human(4, 'Four')
  ]);

  assertRoomError(() => engine.play(match, 2, ['7C']), 'NOT_YOUR_TURN');
  assertRoomError(() => engine.play(match, 1, ['7C']), 'CARD_NOT_OWNED');
  assertRoomError(() => engine.play(match, 1, ['8S']), 'OPENING_CARD_REQUIRED');
  assertRoomError(() => engine.pass(match, 1), 'CANNOT_PASS_OPEN_PILE');

  engine.play(match, 1, ['7S']);
  assert.equal(match.openingRequired, false);
  assert.equal(match.activeSeat, 2);
  assert.equal(match.currentLead.cards[0].id, '7S');
});

test('authoritative play accepts a same-rank triple', () => {
  const engine = new MatchEngine({ shuffleDeck: identityShuffle });
  const match = engine.createMatch([human(1, 'One'), human(2, 'Two')]);
  const player = match.players.find(candidate => candidate.seat === 1);
  player.hand = ['8S', '8C', '8D', 'AS'].map(id => cardById.get(id));
  match.activeSeat = player.seat;
  match.openingRequired = false;

  engine.play(match, player.seat, ['8S', '8C', '8D']);

  assert.equal(match.currentLead.combo.type, 'triple');
  assert.deepEqual(match.currentLead.cards.map(card => card.id), ['8S', '8C', '8D']);
  assert.match(match.lastMoveText, /Triple 8s/);
});

test('authoritative play lets triple 9s beat triple 2s', () => {
  const engine = new MatchEngine({ shuffleDeck: identityShuffle });
  const match = engine.createMatch([human(1, 'One'), human(2, 'Two')]);
  const player = match.players.find(candidate => candidate.seat === 2);
  player.hand = ['9S', '9C', '9D', 'KH'].map(id => cardById.get(id));
  match.activeSeat = player.seat;
  match.openingRequired = false;
  match.currentLead = {
    playerSeat: 1,
    playerName: 'One',
    cards: ['2S', '2C', '2H'].map(id => cardById.get(id)),
    combo: rules.detectCombo(['2S', '2C', '2H'].map(id => cardById.get(id)), match.round)
  };

  engine.play(match, player.seat, ['9S', '9C', '9D']);

  assert.equal(match.currentLead.combo.type, 'triple');
  assert.equal(match.currentLead.combo.highRank, rules.RANKS.indexOf('9'));
});

test('authoritative play accepts four of a kind as a bomb over any combination', () => {
  const engine = new MatchEngine({ shuffleDeck: identityShuffle });
  const match = engine.createMatch([human(1, 'One'), human(2, 'Two')]);
  const player = match.players.find(candidate => candidate.seat === 2);
  player.hand = ['4S', '4C', '4D', '4H', 'KH'].map(id => cardById.get(id));
  match.activeSeat = player.seat;
  match.openingRequired = false;
  match.currentLead = {
    playerSeat: 1,
    playerName: 'One',
    cards: ['QS', 'KC', 'AH'].map(id => cardById.get(id)),
    combo: rules.detectCombo(['QS', 'KC', 'AH'].map(id => cardById.get(id)), match.round)
  };

  engine.play(match, player.seat, ['4S', '4C', '4D', '4H']);

  assert.equal(match.currentLead.combo.type, 'four');
  assert.equal(match.currentLead.combo.bomb, true);
  assert.match(match.lastMoveText, /Bomb/);
});

test('private views expose only the requesting player hand', () => {
  const engine = new MatchEngine({ shuffleDeck: identityShuffle });
  const match = engine.createMatch([human(1, 'Host'), human(2, 'Guest')]);
  const view = engine.viewFor(match, 1, new Map([[1, true], [2, true]]));
  const serialized = JSON.stringify(view);

  assert.equal(view.hand.length, 7);
  assert.equal(view.state.drawCount, 38);
  assert.equal(Object.hasOwn(view.state, 'drawPile'), false);
  assert.ok(view.state.players.every(player => !Object.hasOwn(player, 'hand')));
  for (const card of match.players[1].hand) {
    assert.equal(serialized.includes(`"${card.id}"`), false, `Leaked guest card ${card.id}`);
  }
  for (const card of match.drawPile) {
    if (card.id === match.openingCardId) continue; // the round's designated opener is public metadata
    assert.equal(serialized.includes(`"${card.id}"`), false, `Leaked stock card ${card.id}`);
  }
});

test('completes deterministic rounds with correct placement scoring', () => {
  for (const count of [2, 3, 4]) {
    const engine = new MatchEngine({ shuffleDeck: identityShuffle });
    const match = engine.createMatch(
      Array.from({ length: count }, (_, index) => human(index + 1, `P${index + 1}`))
    );
    playRoundToEnd(engine, match);
    assert.equal(match.roundOver, true);
    assert.equal(match.placements.length, count);
    assert.equal(new Set(match.placements).size, count);
    assert.deepEqual(
      match.placements.map(seat => match.players.find(player => player.seat === seat).score),
      [4, 3, 2, 1].slice(0, count)
    );
  }
});

test('carries scores and placement history and ends after Round 4', () => {
  const engine = new MatchEngine({ shuffleDeck: identityShuffle });
  const players = [human(1, 'One'), human(2, 'Two')];
  const match = engine.createMatch(players, {
    round: 4,
    carryScores: new Map([[1, 10], [2, 11]]),
    carryPlacements: new Map([[1, [1, 2, 2]], [2, [2, 1, 1]]])
  });
  playRoundToEnd(engine, match);

  assert.equal(match.matchOver, true);
  assert.equal(match.finalStandings.length, 2);
  assert.ok(match.winners.length >= 1);
  assert.ok(match.players.every(player => player.placementHistory.length === 4));
  assertRoomError(() => engine.createMatch(players, { round: 5 }), 'INVALID_ROUND');
});

test('ends after Round 3 when the leader is guaranteed to win', () => {
  const engine = new MatchEngine({ shuffleDeck: identityShuffle });
  const players = [human(1, 'Leader'), human(2, 'Two'), human(3, 'Three'), human(4, 'Four')];
  const match = engine.createMatch(players, {
    round: 3,
    carryScores: new Map([[1, 20], [2, 3], [3, 2], [4, 1]]),
    carryPlacements: new Map([[1, [1, 1]], [2, [2, 2]], [3, [3, 3]], [4, [4, 4]]])
  });
  playRoundToEnd(engine, match);

  assert.equal(match.matchOver, true);
  assert.equal(match.endedByMercy, true);
  assert.equal(match.round, 3);
  assert.deepEqual(match.winners, [1]);
});

test('offers and settles double or nothing for a guaranteed human leader', () => {
  const engine = new MatchEngine({ shuffleDeck: identityShuffle });
  const players = [human(1, 'Leader'), human(2, 'Two'), human(3, 'Three'), human(4, 'Four')];
  const roundThree = engine.createMatch(players, {
    round: 3,
    carryScores: new Map([[1, 20], [2, 3], [3, 2], [4, 1]]),
    carryPlacements: new Map([[1, [1, 1]], [2, [2, 2]], [3, [3, 3]], [4, [4, 4]]]),
    doubleOrNothingEnabled: true
  });
  playRoundToEnd(engine, roundThree);

  assert.equal(roundThree.matchOver, false);
  assert.equal(roundThree.mercyOfferPending, true);
  assert.equal(roundThree.mercyLeaderSeat, 1);
  assertRoomError(() => engine.resolveMercyOffer(roundThree, 2, true), 'MERCY_LEADER_REQUIRED');
  engine.resolveMercyOffer(roundThree, 1, true);
  const wager = roundThree.doubleOrNothing;
  assert.deepEqual(wager, { leaderSeat: 1, amount: roundThree.players[0].score });

  const carriedScores = new Map(roundThree.players.map(player => [player.seat, player.score]));
  const carriedPlacements = new Map(roundThree.players.map(player => [player.seat, player.placementHistory]));
  const roundFour = engine.createMatch(players, {
    round: 4,
    carryScores: carriedScores,
    carryPlacements: carriedPlacements,
    doubleOrNothingEnabled: true,
    doubleOrNothingWager: wager
  });
  playRoundToEnd(engine, roundFour);

  const roundWinnerSeat = roundFour.placements[0];
  const leader = roundFour.players.find(player => player.seat === 1);
  const leaderPlace = roundFour.placements.indexOf(1);
  const expectedLeader = carriedScores.get(1) + (SCORE_BY_PLACE[leaderPlace] || 0)
    + (roundWinnerSeat === 1 ? wager.amount : -wager.amount);
  assert.equal(leader.score, expectedLeader);
  if (roundWinnerSeat !== 1) {
    const winner = roundFour.players.find(player => player.seat === roundWinnerSeat);
    assert.equal(winner.score, carriedScores.get(roundWinnerSeat) + SCORE_BY_PLACE[0] + wager.amount);
  }
  assert.equal(roundFour.matchOver, true);
});

test('a guaranteed leader can take the mercy-rule win instead of wagering', () => {
  const engine = new MatchEngine({ shuffleDeck: identityShuffle });
  const match = engine.createMatch([human(1, 'Leader'), human(2, 'Other')], {
    round: 3,
    carryScores: new Map([[1, 20], [2, 0]]),
    carryPlacements: new Map([[1, [1, 1]], [2, [2, 2]]]),
    doubleOrNothingEnabled: true
  });
  playRoundToEnd(engine, match);
  engine.resolveMercyOffer(match, 1, false);

  assert.equal(match.matchOver, true);
  assert.equal(match.endedByMercy, true);
  assert.deepEqual(match.winners, [1]);
});

test('double or nothing transfers a losing leader wager to the Round 4 winner', () => {
  const engine = new MatchEngine({ shuffleDeck: identityShuffle });
  const match = engine.createMatch([human(1, 'Leader'), human(2, 'Chaser')], {
    round: 4,
    carryScores: new Map([[1, 10], [2, 10]]),
    carryPlacements: new Map([[1, [1, 1, 1]], [2, [2, 2, 2]]]),
    doubleOrNothingWager: { leaderSeat: 1, amount: 10 }
  });
  playRoundToEnd(engine, match);

  assert.deepEqual(match.placements, [2, 1]);
  assert.equal(match.players.find(player => player.seat === 1).score, 3);
  assert.equal(match.players.find(player => player.seat === 2).score, 24);
});

test('double or nothing awards a winning leader an equal bonus wager', () => {
  const engine = new MatchEngine({ shuffleDeck: identityShuffle });
  const match = engine.createMatch([human(1, 'Chaser'), human(2, 'Leader')], {
    round: 4,
    carryScores: new Map([[1, 10], [2, 10]]),
    carryPlacements: new Map([[1, [2, 2, 2]], [2, [1, 1, 1]]]),
    doubleOrNothingWager: { leaderSeat: 2, amount: 10 }
  });
  playRoundToEnd(engine, match);

  assert.deepEqual(match.placements, [2, 1]);
  assert.equal(match.players.find(player => player.seat === 2).score, 24);
  assert.equal(match.players.find(player => player.seat === 1).score, 13);
});

test('a departing human can be replaced by a bot without losing the seat', () => {
  const engine = new MatchEngine({ shuffleDeck: identityShuffle });
  const match = engine.createMatch([human(1, 'Host'), human(2, 'Leaving')]);
  assert.equal(engine.replaceWithBot(match, 2), true);
  const replacement = match.players.find(player => player.seat === 2);
  assert.equal(replacement.type, 'bot');
  assert.match(replacement.name, /Leaving · Bot/);
  assert.equal(replacement.hand.length, 7);
});

test('last actions remain public while unplayed hands stay private', () => {
  const engine = new MatchEngine({ shuffleDeck: identityShuffle });
  const match = engine.createMatch([human(1, 'Host'), human(2, 'Guest')]);
  const leadId = match.players[0].hand[0].id;
  engine.play(match, 1, [leadId]);
  engine.pass(match, 2);

  const view = engine.viewFor(match, 1, new Map([[1, true], [2, true]]));
  const seatOne = view.state.players.find(player => player.seat === 1);
  const seatTwo = view.state.players.find(player => player.seat === 2);
  assert.deepEqual(seatOne.lastPlay.cards.map(card => card.id), [leadId]);
  assert.equal(seatOne.lastPlayedCard.id, leadId);
  assert.equal(seatTwo.lastPlay.kind, 'pass');
  assert.equal(seatTwo.lastPlayedCard, null);
  assert.equal(match.players[1].hand.length, 8);
  assert.equal(view.state.drawCount, 37);

  const serialized = JSON.stringify(view);
  for (const card of match.players[1].hand) {
    assert.equal(serialized.includes(`"${card.id}"`), false, `Leaked guest card ${card.id}`);
  }
});

test('an empty stock still permits a required pass without changing the hand', () => {
  const engine = new MatchEngine({ shuffleDeck: identityShuffle });
  const match = engine.createMatch([human(1, 'Host'), human(2, 'Guest')]);
  engine.play(match, 1, [match.players[0].hand[0].id]);
  match.drawPile = [];
  const before = match.players[1].hand.map(card => card.id);
  engine.pass(match, 2);
  assert.deepEqual(match.players[1].hand.map(card => card.id), before);
  assert.ok(match.log.some(entry => /stock empty/.test(entry)));
});

function playRoundToEnd(engine, match) {
  let actions = 0;
  while (!match.roundOver && actions < 2_000) {
    const player = match.players.find(candidate => candidate.seat === match.activeSeat);
    const currentCombo = match.currentLead && match.currentLead.combo;
    const moves = getLegalMoves(
      player.hand,
      currentCombo,
      match.openingRequired ? match.openingCardId : null,
      match.round
    );
    if (moves.length) {
      const move = moves.find(candidate => candidate.count === player.hand.length) || moves[0];
      engine.play(match, player.seat, move.cards.map(card => card.id));
    } else {
      engine.pass(match, player.seat);
    }
    actions += 1;
  }
  assert.ok(actions < 2_000, 'round should terminate');
}

function assertRoomError(action, code) {
  assert.throws(action, error => error instanceof RoomError && error.code === code);
}
