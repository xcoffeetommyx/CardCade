import assert from "node:assert/strict";
import test from "node:test";
import hotSeatFlow from "../shared/hot-seat-flow.js";

const seats = [
  { playerId: "host", seat: 0, role: "host" },
  { playerId: "guest-1", seat: 1, role: "guest" },
  { playerId: "guest-2", seat: 2, role: "guest" }
];

test("hands an active Hot Seat turn to that private seat", () => {
  assert.equal(hotSeatFlow.requiredSeat({ roundOver: false, activeSeat: 2 }, seats), 2);
});

test("hands a 3s & 7s mercy decision to the guaranteed leader", () => {
  assert.equal(hotSeatFlow.requiredSeat({
    roundOver: true,
    matchOver: false,
    mercyOfferPending: true,
    mercyLeaderSeat: 1
  }, seats), 1);
});

test("returns a completed round to the table host", () => {
  assert.equal(hotSeatFlow.requiredSeat({
    roundOver: true,
    matchOver: false,
    mercyOfferPending: false
  }, seats), 0);
});

test("does not force another private handoff after final standings", () => {
  assert.equal(hotSeatFlow.requiredSeat({ roundOver: true, matchOver: true }, seats), null);
});

test("rejects a turn seat that is not part of this shared device", () => {
  assert.equal(hotSeatFlow.requiredSeat({ roundOver: false, activeSeat: 9 }, seats), null);
});
