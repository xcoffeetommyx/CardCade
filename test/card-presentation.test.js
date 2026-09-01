import assert from 'node:assert/strict';
import test from 'node:test';
import presentation from '../shared/card-presentation.js';

const { calculateFanLayout, fanDensity, fanIndexAtX, fanIndexAtPoint, resolveTableSeats, tableSeatSlots } = presentation;
const STRESS_COUNTS = [5, 7, 10, 13, 15, 20];

test('maps hand sizes onto the intended adaptive density bands', () => {
  assert.equal(fanDensity(5).name, 'loose');
  assert.equal(fanDensity(7).name, 'normal');
  assert.equal(fanDensity(10).name, 'tight');
  assert.equal(fanDensity(13).name, 'dense');
  assert.equal(fanDensity(20).name, 'very-dense');
});

test('lays out stress-test hands inside a narrow portrait viewport without shrinking cards', () => {
  for (const count of STRESS_COUNTS) {
    const layout = calculateFanLayout({
      count,
      containerWidth: 360,
      cardWidth: 94,
      cardHeight: 134,
      sidePadding: 8
    });

    assert.equal(layout.cards.length, count);
    assert.equal(layout.cardWidth, 94);
    assert.ok(layout.span <= 344.0001, `${count} cards should fit the usable viewport width`);
    assert.ok(layout.step > 0);
    assert.ok(layout.rowHeight > layout.cardHeight);
  }
});

test('produces a shallow symmetric curve and outward rotations', () => {
  const layout = calculateFanLayout({ count: 13, containerWidth: 360, cardWidth: 94, cardHeight: 134 });
  const first = layout.cards[0];
  const center = layout.cards[6];
  const last = layout.cards.at(-1);

  assert.ok(first.rotation < 0);
  assert.equal(center.rotation, 0);
  assert.ok(last.rotation > 0);
  assert.ok(Math.abs(first.rotation + last.rotation) < 0.0001);
  assert.ok(Math.abs(first.x + last.x) < 0.0001);
  assert.ok(Math.abs(first.y - last.y) < 0.0001);
  assert.ok(first.y > center.y);
  assert.ok(Math.abs(first.rotation) <= 11);
});

test('resolves two, three, and four-player tables around a consistent south viewer seat', () => {
  assert.deepEqual(tableSeatSlots(1), ['north']);
  assert.deepEqual(tableSeatSlots(2), ['north-west', 'north-east']);
  assert.deepEqual(tableSeatSlots(3), ['west', 'north', 'east']);

  assert.deepEqual(resolveTableSeats([0, 1], 0), [
    { seat: 1, slot: 'north', order: 0 }
  ]);
  assert.deepEqual(resolveTableSeats([0, 1, 2], 0), [
    { seat: 1, slot: 'north-west', order: 0 },
    { seat: 2, slot: 'north-east', order: 1 }
  ]);
  assert.deepEqual(resolveTableSeats([0, 1, 2, 3], 0), [
    { seat: 1, slot: 'west', order: 0 },
    { seat: 2, slot: 'north', order: 1 },
    { seat: 3, slot: 'east', order: 2 }
  ]);
});

test('rotates seat order around the viewer and supports a full eight-player JUAN table', () => {
  assert.deepEqual(resolveTableSeats([0, 1, 2, 3], 2), [
    { seat: 3, slot: 'west', order: 0 },
    { seat: 0, slot: 'north', order: 1 },
    { seat: 1, slot: 'east', order: 2 }
  ]);
  assert.deepEqual(resolveTableSeats([0, 1, 2, 3, 4, 5, 6, 7], 0).map(({ slot }) => slot), [
    'west-near', 'west', 'north-west', 'north', 'north-east', 'east', 'east-near'
  ]);
});

test('fits a 13-card table combination inside a narrow pile while preserving a shallow fan', () => {
  const containerWidth = 340;
  const cardWidth = 72;
  const sidePadding = 18;
  const layout = calculateFanLayout({
    count: 13,
    containerWidth,
    cardWidth,
    cardHeight: 102,
    sidePadding,
    minimumVisibleIndex: 14,
    maximumRotation: 7,
    curveRatio: 0.08,
    focusLiftRatio: 0,
    selectedLiftRatio: 0
  });
  const first = layout.cards[0];
  const center = layout.cards[6];
  const last = layout.cards.at(-1);

  assert.ok(layout.span <= containerWidth - sidePadding * 2 + 0.0001);
  assert.ok(layout.step >= 14, 'each card keeps a visible leading corner strip');
  assert.ok(first.rotation < 0 && last.rotation > 0);
  assert.equal(center.rotation, 0);
  assert.ok(first.y > center.y);
  assert.ok(Math.abs(first.rotation) <= 7);
});

test('moves an edge-focused card inward far enough to expose its complete face', () => {
  const layout = calculateFanLayout({
    count: 20,
    containerWidth: 320,
    cardWidth: 88,
    cardHeight: 125,
    sidePadding: 8,
    focusedIndex: 0
  });
  const focused = layout.cards[0];
  const focusedLeft = 160 - 44 + focused.x + focused.focusOffsetX;

  assert.ok(focused.focusOffsetX > 0);
  assert.ok(focusedLeft >= 8);
});

test('reports when density necessarily compresses below the desired corner-index width', () => {
  const readable = calculateFanLayout({ count: 13, containerWidth: 390, cardWidth: 94, minimumVisibleIndex: 18 });
  const compressed = calculateFanLayout({ count: 20, containerWidth: 320, cardWidth: 88, minimumVisibleIndex: 18 });

  assert.equal(readable.preservesIndexWidth, true);
  assert.equal(compressed.preservesIndexWidth, false);
});

test('maps overlapping pointer positions back to the intended card anchor', () => {
  for (const count of STRESS_COUNTS) {
    const layout = calculateFanLayout({ count, containerWidth: 360, cardWidth: 94, cardHeight: 134 });
    for (const card of layout.cards) {
      assert.equal(fanIndexAtX(layout, card.x), card.index, `${count}-card hand should target card ${card.index}`);
    }
  }
});

test('uses the midpoint between adjacent anchors as the fallback touch boundary', () => {
  const layout = calculateFanLayout({ count: 13, containerWidth: 360, cardWidth: 94, cardHeight: 134 });

  for (let index = 0; index < layout.cards.length - 1; index += 1) {
    const left = layout.cards[index];
    const right = layout.cards[index + 1];
    const midpoint = (left.x + right.x) / 2;

    assert.equal(fanIndexAtX(layout, midpoint - 0.01), left.index);
    assert.equal(fanIndexAtX(layout, midpoint + 0.01), right.index);
  }
});

test('aligns pointer targets with visible fan strips beside a raised card', () => {
  const cardWidth = 94;
  const cardHeight = 134;
  const step = 43;
  const rects = Array.from({ length: 7 }, (_, index) => ({
    left: index * step,
    right: index * step + cardWidth,
    top: index === 4 ? -36 : 0,
    bottom: index === 4 ? cardHeight - 36 : cardHeight
  }));

  assert.equal(fanIndexAtPoint(rects, 4 * step + 12, 40, [4]), 4, 'the raised card keeps its visible strip');
  assert.equal(fanIndexAtPoint(rects, 3 * step + 12, 40, [4]), 3, 'its left neighbor owns the strip before the raised card begins');
  assert.equal(fanIndexAtPoint(rects, 5 * step + 12, 40, [4]), 5, 'its right neighbor owns the next visible strip');
  assert.equal(fanIndexAtPoint(rects, 4 * step + 60, -12, [4]), 4, 'the raised card owns its protruding face');
  assert.equal(fanIndexAtPoint(rects, -20, 40, [4]), -1, 'blank hand space does not select an edge card');
});

test('uses transformed rank corners as precise targets in a dense 13-card fan', () => {
  const cardWidth = 94;
  const cardHeight = 134;
  const step = 22;
  const rects = Array.from({ length: 13 }, (_, index) => ({
    left: index * step - Math.abs(index - 6) * 0.7,
    right: index * step + cardWidth + Math.abs(index - 6) * 0.7,
    top: Math.abs(index - 6) * 1.4,
    bottom: Math.abs(index - 6) * 1.4 + cardHeight
  }));
  const indexRects = rects.map((rect, index) => ({
    left: index * step + 7,
    right: index * step + 29,
    top: rect.top + 6,
    bottom: rect.top + 39
  }));

  for (let index = 0; index < indexRects.length; index += 1) {
    const target = indexRects[index];
    assert.equal(
      fanIndexAtPoint(rects, (target.left + target.right) / 2, (target.top + target.bottom) / 2, [], indexRects),
      index,
      `the visible corner for dense card ${index} should own its tap`
    );
  }
});

test('lets an adjacent visible corner win beside a raised dense-hand card', () => {
  const cardWidth = 94;
  const cardHeight = 134;
  const step = 22;
  const raisedIndex = 7;
  const rects = Array.from({ length: 13 }, (_, index) => ({
    left: index * step,
    right: index * step + cardWidth,
    top: index === raisedIndex ? -38 : 0,
    bottom: index === raisedIndex ? cardHeight - 38 : cardHeight
  }));
  const indexRects = rects.map((rect, index) => ({
    left: index * step + 7,
    right: index * step + 29,
    top: index === raisedIndex ? -32 : 6,
    bottom: index === raisedIndex ? 1 : 39
  }));
  const neighbor = indexRects[raisedIndex + 1];

  assert.equal(
    fanIndexAtPoint(rects, (neighbor.left + neighbor.right) / 2, (neighbor.top + neighbor.bottom) / 2, [raisedIndex], indexRects),
    raisedIndex + 1,
    'tapping the neighboring printed index must not reselect the raised card'
  );
});
