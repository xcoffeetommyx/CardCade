(function exposeHotSeatFlow(root, factory) {
  const hotSeatFlow = factory();
  if (typeof module === "object" && module.exports) module.exports = hotSeatFlow;
  root.CardcadeHotSeat = hotSeatFlow;
})(typeof globalThis !== "undefined" ? globalThis : this, function createHotSeatFlow() {
  "use strict";

  function requiredSeat(match, seats = []) {
    if (!match || !Array.isArray(seats) || !seats.length) return null;

    if (!match.roundOver) {
      return hasSeat(seats, match.activeSeat) ? Number(match.activeSeat) : null;
    }

    if (match.mercyOfferPending && hasSeat(seats, match.mercyLeaderSeat)) {
      return Number(match.mercyLeaderSeat);
    }

    if (!match.matchOver) {
      const host = seats.find((seat) => seat.role === "host");
      return host && hasSeat(seats, host.seat) ? Number(host.seat) : null;
    }

    return null;
  }

  function hasSeat(seats, value) {
    const seat = Number(value);
    return Number.isInteger(seat) && seats.some((candidate) => Number(candidate.seat) === seat);
  }

  return Object.freeze({ requiredSeat });
});
