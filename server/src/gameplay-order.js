import { randomInt } from "node:crypto";

export function secureRandomIndex(length) {
  if (!Number.isInteger(length) || length <= 0) {
    throw new RangeError("A positive player count is required.");
  }
  return randomInt(length);
}

export function randomSeat(players, randomIndex = secureRandomIndex) {
  if (!Array.isArray(players) || !players.length) return null;
  const index = Number(randomIndex(players.length));
  if (!Number.isInteger(index) || index < 0 || index >= players.length) {
    throw new RangeError("The gameplay-origin randomizer returned an invalid player index.");
  }
  return players[index].seat;
}

export function seatAtOffset(players, originSeat, offset = 0) {
  if (!Array.isArray(players) || !players.length) return null;
  const originIndex = players.findIndex((player) => player.seat === Number(originSeat));
  if (originIndex < 0) return null;
  const normalizedOffset = Number.isInteger(offset) ? offset : 0;
  const index = ((originIndex + normalizedOffset) % players.length + players.length) % players.length;
  return players[index].seat;
}
