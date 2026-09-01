(function exposeCardcadePresentation(root, factory) {
  const presentation = factory();
  if (typeof module === 'object' && module.exports) module.exports = presentation;
  root.CardcadePresentation = presentation;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCardcadePresentation() {
  'use strict';

  const DENSITY_RANGES = Object.freeze([
    Object.freeze({ maximum: 5, name: 'loose', visibleRatio: 0.72 }),
    Object.freeze({ maximum: 8, name: 'normal', visibleRatio: 0.58 }),
    Object.freeze({ maximum: 11, name: 'tight', visibleRatio: 0.44 }),
    Object.freeze({ maximum: 14, name: 'dense', visibleRatio: 0.34 }),
    Object.freeze({ maximum: Infinity, name: 'very-dense', visibleRatio: 0.24 })
  ]);

  const TABLE_SEAT_SLOTS = Object.freeze({
    0: Object.freeze([]),
    1: Object.freeze(['north']),
    2: Object.freeze(['north-west', 'north-east']),
    3: Object.freeze(['west', 'north', 'east']),
    4: Object.freeze(['west', 'north-west', 'north-east', 'east']),
    5: Object.freeze(['west', 'north-west', 'north', 'north-east', 'east']),
    6: Object.freeze(['west-near', 'west', 'north-west', 'north-east', 'east', 'east-near']),
    7: Object.freeze(['west-near', 'west', 'north-west', 'north', 'north-east', 'east', 'east-near'])
  });

  function fanDensity(count) {
    const safeCount = Math.max(0, Math.floor(Number(count) || 0));
    return DENSITY_RANGES.find(range => safeCount <= range.maximum) || DENSITY_RANGES.at(-1);
  }

  function tableSeatSlots(opponentCount) {
    const safeCount = clamp(Math.floor(Number(opponentCount) || 0), 0, 7);
    return TABLE_SEAT_SLOTS[safeCount] || TABLE_SEAT_SLOTS[7];
  }

  function resolveTableSeats(playerSeats, viewerSeat) {
    const seats = Array.isArray(playerSeats)
      ? playerSeats.filter((seat, index, values) => values.indexOf(seat) === index)
      : [];
    if (!seats.length) return Object.freeze([]);

    const viewerIndex = seats.findIndex(seat => seat === viewerSeat);
    const pivot = viewerIndex >= 0 ? viewerIndex : 0;
    const clockwise = seats.slice(pivot + 1).concat(seats.slice(0, pivot));
    const opponents = clockwise.filter(seat => seat !== viewerSeat).slice(0, 7);
    const slots = tableSeatSlots(opponents.length);

    return Object.freeze(opponents.map((seat, index) => Object.freeze({
      seat,
      slot: slots[index],
      order: index
    })));
  }

  function calculateFanLayout({
    count,
    containerWidth,
    cardWidth,
    cardHeight = Number(cardWidth) * 1.42,
    sidePadding = 8,
    minimumVisibleIndex = 18,
    maximumRotation = 11,
    curveRatio = 0.12,
    focusLiftRatio = 0.48,
    selectedLiftRatio = 0.28,
    focusedIndex = -1
  }) {
    const safeCount = Math.max(0, Math.floor(Number(count) || 0));
    const safeContainerWidth = positiveNumber(containerWidth, 1);
    const safeCardWidth = positiveNumber(cardWidth, 1);
    const safeCardHeight = positiveNumber(cardHeight, safeCardWidth * 1.42);
    const safePadding = clamp(Number(sidePadding) || 0, 0, safeContainerWidth / 2);
    const usableWidth = Math.max(1, safeContainerWidth - safePadding * 2);
    const density = fanDensity(safeCount);
    const focusLift = Math.round(safeCardHeight * clamp(focusLiftRatio, 0, 1));
    const selectedLift = Math.round(safeCardHeight * clamp(selectedLiftRatio, 0, 1));
    const curveDepth = Math.round(safeCardHeight * clamp(curveRatio, 0, 0.3));

    if (safeCount === 0) {
      return Object.freeze({
        count: 0,
        density: density.name,
        cardWidth: safeCardWidth,
        cardHeight: safeCardHeight,
        step: 0,
        span: 0,
        curveDepth,
        focusLift,
        selectedLift,
        rowHeight: Math.ceil(safeCardHeight + focusLift + curveDepth + 12),
        minimumVisibleIndex,
        preservesIndexWidth: true,
        cards: Object.freeze([])
      });
    }

    const desiredStep = safeCardWidth * density.visibleRatio;
    const fitStep = safeCount === 1
      ? 0
      : Math.max(1, (usableWidth - safeCardWidth) / (safeCount - 1));
    const step = safeCount === 1 ? 0 : Math.min(desiredStep, fitStep);
    const span = safeCardWidth + step * Math.max(0, safeCount - 1);
    const halfCount = Math.max(1, (safeCount - 1) / 2);
    const rotationLimit = Math.min(
      positiveNumber(maximumRotation, 11),
      4.5 + Math.min(1, Math.max(0, (safeCount - 1) / 13)) * 6.5
    );
    const safeFocusedIndex = Number.isInteger(focusedIndex) && focusedIndex >= 0 && focusedIndex < safeCount
      ? focusedIndex
      : -1;

    const cards = Array.from({ length: safeCount }, (_, index) => {
      const normalized = safeCount === 1 ? 0 : (index - (safeCount - 1) / 2) / halfCount;
      const x = (index - (safeCount - 1) / 2) * step;
      const y = Math.pow(Math.abs(normalized), 1.65) * curveDepth;
      const rotation = normalized * rotationLimit;
      let focusOffsetX = 0;

      if (index === safeFocusedIndex) {
        const baseLeft = safeContainerWidth / 2 - safeCardWidth / 2 + x;
        const centerwardBias = -normalized * Math.min(safeCardWidth * 0.18, step * 1.4);
        const boundedLeft = clamp(
          baseLeft + centerwardBias,
          safePadding,
          Math.max(safePadding, safeContainerWidth - safePadding - safeCardWidth)
        );
        focusOffsetX = boundedLeft - baseLeft;
      }

      return Object.freeze({
        index,
        normalized,
        x,
        y,
        rotation,
        zIndex: index + 1,
        focusOffsetX
      });
    });

    return Object.freeze({
      count: safeCount,
      density: density.name,
      cardWidth: safeCardWidth,
      cardHeight: safeCardHeight,
      step,
      span,
      curveDepth,
      focusLift,
      selectedLift,
      rowHeight: Math.ceil(safeCardHeight + focusLift + curveDepth + 12),
      minimumVisibleIndex,
      preservesIndexWidth: safeCount <= 1 || step >= minimumVisibleIndex,
      cards: Object.freeze(cards)
    });
  }

  function fanIndexAtX(layout, localX) {
    if (!layout || !Array.isArray(layout.cards) || !layout.cards.length) return -1;
    const pointerX = Number(localX);
    if (!Number.isFinite(pointerX)) return -1;
    return layout.cards.reduce((closest, card) => {
      const distance = Math.abs(pointerX - card.x);
      return !closest || distance < closest.distance ? { index: card.index, distance } : closest;
    }, null).index;
  }

  function fanIndexAtPoint(rects, clientX, clientY, raisedIndices = [], indexRects = []) {
    if (!Array.isArray(rects) || !rects.length) return -1;
    const pointerX = Number(clientX);
    const pointerY = Number(clientY);
    if (!Number.isFinite(pointerX) || !Number.isFinite(pointerY)) return -1;
    const measured = rects.map(rect => ({
      left: Number(rect && rect.left),
      right: Number(rect && rect.right),
      top: Number(rect && rect.top),
      bottom: Number(rect && rect.bottom)
    }));
    if (measured.some(rect => !Object.values(rect).every(Number.isFinite))) return -1;
    const containsPoint = rect => (
      pointerX >= rect.left && pointerX <= rect.right && pointerY >= rect.top && pointerY <= rect.bottom
    );
    if (!measured.some(containsPoint)) return -1;

    const raised = new Set((Array.isArray(raisedIndices) ? raisedIndices : [])
      .filter(index => Number.isInteger(index) && index >= 0 && index < measured.length));

    // Dense hands expose the rank/suit corners rather than each card's full
    // face. Their transformed corner centers are the most faithful tap
    // anchors; axis-aligned card bounds drift as the fan rotates and curves.
    const measuredIndices = Array.isArray(indexRects) && indexRects.length === measured.length
      ? indexRects.map(rect => ({
          left: Number(rect && rect.left),
          right: Number(rect && rect.right),
          top: Number(rect && rect.top),
          bottom: Number(rect && rect.bottom)
        }))
      : [];
    if (measuredIndices.length && measuredIndices.every(rect => Object.values(rect).every(Number.isFinite))) {
      const indexTop = Math.min(...measuredIndices.map(rect => rect.top));
      const indexBottom = Math.max(...measuredIndices.map(rect => rect.bottom));
      const averageHeight = measuredIndices.reduce((total, rect) => total + rect.bottom - rect.top, 0) / measuredIndices.length;
      const verticalSlop = clamp(averageHeight * 0.55, 8, 22);
      if (pointerY >= indexTop - verticalSlop && pointerY <= indexBottom + verticalSlop) {
        return measuredIndices.reduce((closest, rect, index) => {
          const centerX = (rect.left + rect.right) / 2;
          const centerY = (rect.top + rect.bottom) / 2;
          const distanceX = pointerX - centerX;
          const distanceY = (pointerY - centerY) * 0.55;
          const distance = distanceX * distanceX + distanceY * distanceY;
          return !closest || distance < closest.distance ? { index, distance } : closest;
        }, null).index;
      }
    }

    if (raised.size) {
      const restingTops = measured.flatMap((rect, index) => raised.has(index) ? [] : [rect.top]);
      const restingTop = restingTops.length
        ? Math.min(...restingTops)
        : Math.max(...[...raised].map(index => measured[index].top));
      for (let index = measured.length - 1; index >= 0; index -= 1) {
        if (raised.has(index) && pointerY < restingTop && containsPoint(measured[index])) return index;
      }
    }

    // In an overlapped left-to-right stack, a card's visible body begins at
    // its leading edge and ends where the next card begins.
    let targetIndex = 0;
    for (let index = 1; index < measured.length; index += 1) {
      if (pointerX < measured[index].left) break;
      targetIndex = index;
    }
    return targetIndex;
  }

  function positiveNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, Number(value) || 0));
  }

  return Object.freeze({
    DENSITY_RANGES,
    TABLE_SEAT_SLOTS,
    fanDensity,
    tableSeatSlots,
    resolveTableSeats,
    calculateFanLayout,
    fanIndexAtX,
    fanIndexAtPoint
  });
});
