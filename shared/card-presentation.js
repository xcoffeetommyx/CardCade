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
    2: Object.freeze(['west', 'north']),
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

  // A hand seen almost edge-on cannot reuse the head-on fan. Translating cards
  // along a line and leaning them slightly works while the viewer faces the fan,
  // but once a seat yaws toward its opposite that line collapses into a slab:
  // the spacing foreshortens away and the shallow curve flattens out. Side seats
  // splay radially about the grip below the cards, the way a held fan actually
  // works, so the arc survives the projection and still reads as separate cards
  // from across the table.
  function calculateSideFanLayout({
    count,
    cardWidth,
    cardHeight = Number(cardWidth) * 1.42,
    degreesPerCard = 4.6,
    maximumSpread = 44,
    radiusRatio = 1.5,
    stackThickness = 1.1,
    // The seat's yaw already points the whole fan across the table, so from the
    // viewer's side the hand is a stack of card EDGES, not card faces. The bow
    // is deliberately small: it rocks the ends a few degrees either side of
    // edge-on so the stack has some life and the outermost cards catch a sliver
    // of their back or their blank leaf. Opening it wider does not reveal more
    // of the hand, it just scatters the slivers to conflicting angles and the
    // fan stops reading as one object. bowEasing keeps the middle square.
    bowDegrees = 13,
    bowPerCard = 2.4,
    bowEasing = 2.2,
    leadsWithFirstCard = false
  }) {
    const safeCount = Math.max(0, Math.floor(Number(count) || 0));
    const safeCardWidth = positiveNumber(cardWidth, 1);
    const safeCardHeight = positiveNumber(cardHeight, safeCardWidth * 1.42);
    const radius = safeCardHeight * positiveNumber(radiusRatio, 1.5);
    const density = fanDensity(safeCount);
    const spread = safeCount <= 1
      ? 0
      : Math.min(positiveNumber(maximumSpread, 44), positiveNumber(degreesPerCard, 4.6) * (safeCount - 1));
    // Two cards are all ends and no middle, so a short hand rocks less than a
    // full one -- otherwise a two-card hold'em hand splays like a full fan.
    const bowLimit = safeCount <= 1
      ? 0
      : Math.min(Math.max(0, Number(bowDegrees) || 0), Math.max(0, Number(bowPerCard) || 0) * (safeCount - 1));
    const easing = positiveNumber(bowEasing, 3.2);
    const baseThickness = Math.max(0, Number(stackThickness) || 0);
    // The bow is NOT mirrored here. West and east already mirror through their
    // seat yaw, which points one hand's backs east and the other's west, so
    // flipping the bow as well double-negates it: the two seats end up showing
    // opposite faces at the same end, and the pair stops reading as a mirror.
    // Local bow, mirrored yaw, mirrored result.

    const geometry = Array.from({ length: safeCount }, (_, index) => {
      const normalized = safeCount === 1 ? 0 : (index - (safeCount - 1) / 2) / ((safeCount - 1) / 2);
      const angle = normalized * (spread / 2);
      const radians = angle * Math.PI / 180;
      const stackOrder = leadsWithFirstCard ? safeCount - index : index + 1;
      return {
        index,
        angle,
        rotation: angle,
        bow: Math.sign(normalized) * bowLimit * Math.pow(Math.abs(normalized), easing),
        x: radius * Math.sin(radians),
        y: radius * (1 - Math.cos(radians)),
        zIndex: stackOrder,
        stackOrder
      };
    });

    // Neighbouring cards now differ in bow by wildly different amounts -- almost
    // nothing across the flat middle, a lot at the curled end -- so a single
    // spacing cannot serve the whole fan. Walk the stack instead and give each
    // pair just enough room that their planes cannot pinch together and let the
    // compositor slice one card through the next.
    const byStack = [...geometry].sort((a, b) => a.stackOrder - b.stackOrder);
    let depth = 0;
    byStack.forEach((card, order) => {
      if (order > 0) {
        const previous = byStack[order - 1];
        const turn = Math.abs(card.bow - previous.bow) * Math.PI / 180;
        depth += baseThickness + (safeCardWidth / 2) * Math.sin(Math.min(turn, Math.PI / 2)) * 1.35;
      }
      card.z = depth;
    });

    const cards = Object.freeze(geometry.map((card) => Object.freeze({
      index: card.index,
      angle: card.angle,
      bow: card.bow,
      x: card.x,
      y: card.y,
      z: card.z,
      rotation: card.rotation,
      zIndex: card.zIndex
    })));

    return Object.freeze({
      count: safeCount,
      density: density.name,
      spread,
      radius,
      bowLimit,
      depth,
      cardWidth: safeCardWidth,
      cardHeight: safeCardHeight,
      span: safeCount <= 1 ? safeCardWidth : 2 * radius * Math.sin((spread / 2) * Math.PI / 180) + safeCardWidth,
      cards
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
    calculateSideFanLayout,
    fanIndexAtX,
    fanIndexAtPoint
  });
});
