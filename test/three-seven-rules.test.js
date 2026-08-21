import assert from 'node:assert/strict';
import test from 'node:test';
import rules from '../shared/three-seven-rules.js';

const {
  RANKS,
  SCORE_BY_PLACE,
  SUIT_ORDERS,
  ROUND_STARTERS,
  STARTING_HAND_SIZE,
  makeDeck,
  sortCards,
  detectCombo,
  canBeat,
  getLegalMoves,
  finalStandings,
  finalWinners,
  guaranteedWinnerAfterRound
} = rules;

const deck = makeDeck();
const byId = new Map(deck.map(card => [card.id, card]));
const cards = (...ids) => ids.map(id => byId.get(id));
const combo = (round, ...ids) => detectCombo(cards(...ids), round);

test('builds the standard deck with 2 low and ace high', () => {
  assert.equal(STARTING_HAND_SIZE, 7);
  assert.equal(deck.length, 52);
  assert.equal(new Set(deck.map(card => card.id)).size, 52);
  assert.deepEqual(RANKS, ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']);
  assert.deepEqual(deck.slice(0, 4).map(card => card.id), ['2S', '2C', '2D', '2H']);
  assert.deepEqual(deck.slice(-4).map(card => card.id), ['AS', 'AC', 'AD', 'AH']);
});

test('defines all four rotating suit orders and required opening sevens', () => {
  assert.deepEqual(SUIT_ORDERS, [
    ['S', 'C', 'D', 'H'],
    ['H', 'S', 'C', 'D'],
    ['D', 'H', 'S', 'C'],
    ['C', 'D', 'H', 'S']
  ]);
  assert.deepEqual(ROUND_STARTERS, ['7S', '7H', '7D', '7C']);
  assert.deepEqual(SCORE_BY_PLACE, [4, 3, 2, 1]);
});

test('sorts equal ranks using the active round suit order', () => {
  const hand = cards('7H', '2C', '7S', '7D', '7C');
  assert.deepEqual(sortCards(hand, 'rank', 1).map(card => card.id), ['2C', '7S', '7C', '7D', '7H']);
  assert.deepEqual(sortCards(hand, 'rank', 2).map(card => card.id), ['2C', '7H', '7S', '7C', '7D']);
  assert.deepEqual(sortCards(hand, 'rank', 4).map(card => card.id), ['2C', '7C', '7D', '7H', '7S']);
});

test('recognizes singles, same-rank pairs, triples, four-of-a-kind bombs, and exact 3-card straights', () => {
  assert.equal(combo(1, '2S').type, 'single');
  assert.equal(combo(1, '9S', '9H').type, 'pair');
  assert.equal(combo(1, '4S', '4C', '4D').type, 'triple');
  assert.equal(combo(1, '4S', '4C', '4D', '4H').type, 'four');
  assert.equal(combo(1, '4S', '4C', '4D', '4H').bomb, true);
  assert.equal(combo(1, '5S', '6D', '7C').type, 'straight');
  assert.equal(combo(1, 'QS', 'KH', 'AC').type, 'straight');

  assert.equal(combo(1, '4S', '5H'), null, 'no 2-card straight');
  assert.equal(combo(1, '4S', '5H', '6C', '7D'), null, 'no 4-card straight');
  assert.equal(combo(1, 'KS', 'AH', '2C'), null, 'ace never wraps');
});

test('compares rank before suit and rotates equal-rank suit strength', () => {
  assert.equal(canBeat(combo(1, '6S'), combo(1, '5H')), true);
  assert.equal(canBeat(combo(1, '8H'), combo(1, '8S')), true);
  assert.equal(canBeat(combo(2, '8H'), combo(2, '8S')), false);
  assert.equal(canBeat(combo(2, '8D'), combo(2, '8C')), true);

  assert.equal(canBeat(combo(1, '10S', '10H'), combo(1, '9C', '9D')), true);
  assert.equal(canBeat(combo(1, '10S', '10C'), combo(1, '10S', '10H')), false);
  assert.equal(canBeat(combo(1, '10S', '10C', '10D'), combo(1, '9S', '9D', '9H')), true);
  assert.equal(canBeat(combo(1, '10S', '10C', '10D'), combo(1, '10S', '10C', '10H')), false);
});

test('generates every same-rank triple as a legal move', () => {
  const hand = cards('8S', '8C', '8D', '8H', 'AS');
  const triples = getLegalMoves(hand, null, null, 1).filter(move => move.type === 'triple');
  assert.equal(triples.length, 4);
  assert.ok(triples.every(move => move.count === 3));
});

test('treats 2 as the lowest rank when comparing and generating triples', () => {
  const tripleTwos = combo(1, '2S', '2C', '2H');
  const tripleNines = combo(1, '9S', '9C', '9D');
  assert.equal(canBeat(tripleNines, tripleTwos), true);
  assert.equal(canBeat(tripleTwos, tripleNines), false);

  const responses = getLegalMoves(cards('9S', '9C', '9D', 'KH'), tripleTwos, null, 1);
  assert.deepEqual(responses.map(move => move.type), ['triple']);
  assert.deepEqual(responses[0].cards.map(card => card.id), ['9S', '9C', '9D']);
});

test('four of a kind is a bomb over any play and only a higher bomb beats it', () => {
  const fourFours = combo(1, '4S', '4C', '4D', '4H');
  const fourNines = combo(1, '9S', '9C', '9D', '9H');
  const fourKings = combo(1, 'KS', 'KC', 'KD', 'KH');

  assert.equal(canBeat(fourNines, combo(1, 'AH')), true, 'bomb beats a single');
  assert.equal(canBeat(fourNines, combo(1, 'AS', 'AH')), true, 'bomb beats a pair');
  assert.equal(canBeat(fourNines, combo(1, 'AS', 'AC', 'AH')), true, 'bomb beats a triple');
  assert.equal(canBeat(fourNines, combo(1, 'QS', 'KD', 'AH')), true, 'bomb beats a straight');
  assert.equal(canBeat(fourNines, fourFours), true, 'higher-ranked bomb wins');
  assert.equal(canBeat(fourFours, fourNines), false, 'lower-ranked bomb loses');
  assert.equal(canBeat(fourNines, fourNines), false, 'same-ranked bomb cannot win');
  assert.equal(canBeat(combo(1, 'AH'), fourNines), false, 'ordinary play cannot beat a bomb');

  const responses = getLegalMoves(
    cards('4S', '4C', '4D', '4H', 'KS', 'KC', 'KD', 'KH', 'AS'),
    fourNines,
    null,
    1
  );
  assert.deepEqual(responses.map(move => move.type), ['four']);
  assert.equal(responses[0].highRank, fourKings.highRank);
});

test('compares straights by high rank then the high card suit', () => {
  assert.equal(canBeat(combo(1, '6S', '7S', '8S'), combo(1, '5H', '6H', '7H')), true);
  assert.equal(canBeat(combo(1, '5H', '6C', '7H'), combo(1, '5S', '6D', '7S')), true);
  assert.equal(canBeat(combo(2, '5H', '6C', '7H'), combo(2, '5S', '6D', '7S')), false);
  assert.equal(canBeat(combo(1, '8S'), combo(1, '5S', '6D', '7S')), false, 'response type must match');
});

test('generates legal opening plays that all contain the required seven', () => {
  const hand = cards('5S', '6D', '7S', '7C', '8H', '9D', 'AS');
  const moves = getLegalMoves(hand, null, '7S', 1);
  assert.ok(moves.length > 0);
  assert.ok(moves.every(move => move.cards.some(card => card.id === '7S')));
  assert.deepEqual(new Set(moves.map(move => move.type)), new Set(['single', 'pair', 'straight']));

  const responses = getLegalMoves(hand, combo(1, '6H'), null, 1);
  assert.ok(responses.every(move => move.type === 'single'));
  assert.ok(responses.every(move => canBeat(move, combo(1, '6H'))));
});

test('final standings use score, then counts of 1sts, 2nds, and 3rds', () => {
  const players = [
    { name: 'A', score: 12, placementHistory: [1, 4, 4, 1] },
    { name: 'B', score: 12, placementHistory: [2, 2, 2, 2] },
    { name: 'C', score: 10, placementHistory: [1, 1, 4, 4] }
  ];
  assert.deepEqual(finalStandings(players).map(player => player.name), ['A', 'B', 'C']);

  const tied = [
    { name: 'X', score: 10, placementHistory: [1, 2, 3, 4] },
    { name: 'Y', score: 10, placementHistory: [4, 3, 2, 1] }
  ];
  assert.deepEqual(finalWinners(tied).map(player => player.name), ['X', 'Y']);
});

test('detects a guaranteed winner before the final round across every placement', () => {
  const players = [
    { name: 'Leader', score: 12, placementHistory: [1, 1, 1] },
    { name: 'Second', score: 8, placementHistory: [2, 2, 2] },
    { name: 'Third', score: 5, placementHistory: [3, 3, 3] },
    { name: 'Fourth', score: 3, placementHistory: [4, 4, 4] }
  ];
  assert.equal(guaranteedWinnerAfterRound(players), players[0]);
  assert.deepEqual(players[0].placementHistory, [1, 1, 1], 'projection must not mutate scores');
});

test('does not trigger mercy when points or final tie-breakers can change the winner', () => {
  const catchable = [
    { name: 'Leader', score: 11, placementHistory: [2, 2, 2] },
    { name: 'Chaser', score: 9, placementHistory: [1, 3, 3] },
    { name: 'Third', score: 6, placementHistory: [3, 1, 4] },
    { name: 'Fourth', score: 4, placementHistory: [4, 4, 1] }
  ];
  assert.equal(guaranteedWinnerAfterRound(catchable), null);
});
