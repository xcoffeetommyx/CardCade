import test from 'node:test';
import assert from 'node:assert/strict';
import { createExpansionUI } from '../public/expansion-games.js';
import deck from '../shared/juan-fleep-deck.js';

function fixture() {
  const previousDocument = globalThis.document;
  globalThis.document = { addEventListener() {} };
  const m = { gameId: 'juan-fleep', round: 1, side: 'dark', flipSequence: 0, activeSeat: 0, phase: 'playing', activeColor: 'orchid', direction: 1, stockCount: 60, stockFace: null, topCard: { id: 'top', kind: 'number', color: 'orchid', value: 1, side: 'dark' }, players: [{ seat: 0, name: 'You', score: 0, cardCount: 4, outward: [] }, { seat: 1, name: 'CPU', score: 0, cardCount: 3, outward: [] }], actions: { legalCardIds: ['wild'] }, lastMoveText: 'Ready' };
  const state = { gameView: { state: m, hand: [{ id: 'wild', kind: 'prism', color: null, side: 'dark' }] }, room: { gameId: 'juan-fleep', code: 'TEST', players: [{ seat: 0, isYou: true, role: 'host' }] }, gameMode: 'solo', selectedCards: new Set(), dealtHandOwners: new Set(), gameSort: 'color' };
  const pickerCalls = [], notices = [];
  const ctx = { getState: () => state, escapeHtml: String, render() {}, sendRoom: () => true, showToast: text => notices.push(text), reducedMotion: () => false, tableClass: () => 'test-table', renderTableScene: options => `<div class="${options.className}">${options.tableStatusMarkup}${options.centerMarkup}${options.handMarkup}</div>`, renderTableOpponent: () => '', renderJuanCard: () => '<button class="playing-card"></button>', juanColorChooser: (card, options) => { pickerCalls.push({ card, options }); return ''; } };
  try { return { ui: createExpansionUI(ctx), state, m, pickerCalls, notices }; }
  finally { globalThis.document = previousDocument; }
}

test('FLEEP uses the shared JUAN table, picker, action bar, and stable hand identity', () => {
  const { ui, state, m, pickerCalls } = fixture();
  const html = ui.render();
  assert.match(html, /juan-table-scene/); assert.match(html, /game-actions juan-actions/); assert.match(html, /juan-lane-bar/);
  const owner = html.match(/data-hand-owner="([^"]+)"/)[1];
  m.lastMoveText = 'A much longer pending explanation that must not create a new table row.';
  m.announcement = { text: 'CPU: JUAN!' }; m.side = 'light';
  assert.equal(ui.render().match(/data-hand-owner="([^"]+)"/)[1], owner);
  m.side = 'dark'; ui.render(); state.selectedCards.add('wild'); ui.render();
  assert.equal(pickerCalls.at(-1).card.id, 'wild');
  assert.deepEqual(pickerCalls.at(-1).options.colors, deck.COLORS.dark);
  assert.equal(pickerCalls.at(-1).options.action, 'exp-color');
});

test('FLEEP call and draw decisions stay in the JUAN overlay, including both at once', () => {
  const { ui, m } = fixture();
  m.call = { seat: 0 }; m.pending = { targetSeat: 0, sourceSeat: 1, kind: 'wild-color', color: 'dusk', priorColor: 'orchid' };
  m.phase = 'challenge';
  const table = ui.render(), overlay = ui.renderFleepOverlay();
  assert.doesNotMatch(table, /data-action="exp-(call|accept|challenge)"/);
  assert.match(overlay, /juan-gameplay-overlay/);
  for (const action of ['call', 'accept', 'challenge']) assert.ok(overlay.includes(`data-action="exp-${action}"`));
  assert.match(overlay, /Draw until Dusk, including that card/);
  assert.match(overlay, /held Orchid/);
});

test('FLEEP draw notices report the actual added cards and do not repeat on unchanged snapshots', () => {
  const { ui, state, m, notices } = fixture();
  const before = { state: structuredClone(m) };
  m.drawEvents = [{ id: '1:1', seat: 0, count: 7, reason: 'Wild Draw Color', handCount: 11 }, { id: '1:2', seat: 0, count: 2, reason: 'Failed challenge', handCount: 13 }];
  ui.observeFleepDraws(before, state.gameView, state.room);
  assert.match(notices[0], /You drew 9 cards/); assert.match(notices[0], /Failed challenge/);
  ui.observeFleepDraws(state.gameView, state.gameView, state.room); assert.equal(notices.length, 1);
  const opponents = structuredClone(before); opponents.state.drawEvents = [{ id: '1:3', seat: 1, count: 5, reason: 'Draw Five' }];
  ui.observeFleepDraws(before, opponents, state.room); assert.equal(notices.length, 1);
});
