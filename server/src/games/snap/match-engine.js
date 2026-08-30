import { randomInt } from "node:crypto";
import standard52 from "../../../../shared/standard-52.js";
import rules from "../../../../shared/snap-rules.js";
import { GameError as RoomError } from "../../game-error.js";

export const COUNTDOWN_MS = 3_000;
export const REACTION_WINDOW_MS = 1_500;
export const BOT_REACTION_MIN_MS = 850;
export const BOT_REACTION_MAX_MS = 1_300;

export class MatchEngine {
  constructor({
    shuffleDeck = secureShuffle,
    now = () => Date.now(),
    randomDelay = (minimum, maximum) => randomInt(minimum, maximum + 1),
    botMistake = () => randomInt(100) < 4,
    countdownMs = COUNTDOWN_MS,
    reactionWindowMs = REACTION_WINDOW_MS
  } = {}) {
    this.shuffleDeck = shuffleDeck;
    this.now = now;
    this.randomDelay = randomDelay;
    this.botMistake = botMistake;
    this.countdownMs = countdownMs;
    this.reactionWindowMs = reactionWindowMs;
  }

  createMatch(roomPlayers) {
    if (!Array.isArray(roomPlayers) || roomPlayers.length < 2 || roomPlayers.length > 4) {
      throw new RoomError("Snap requires between two and four occupied seats.", "INVALID_PLAYER_COUNT");
    }

    const players = roomPlayers
      .slice()
      .sort((left, right) => left.seat - right.seat)
      .map((player) => ({
        seat: player.seat,
        name: player.name,
        avatar: initialsForName(player.name, `P${player.seat}`),
        type: player.type === "bot" ? "bot" : "human",
        style: player.style || (player.type === "bot" ? "steady" : "human"),
        drawPile: [],
        capturedCount: 0,
        ready: false,
        skipNextReveal: false,
        botReadyAt: null,
        botSnapAt: null
      }));

    const deck = this.shuffleDeck(standard52.makeDeck());
    validateDeck(deck);
    deck.forEach((card, index) => players[index % players.length].drawPile.push(card));

    const match = {
      phase: rules.PHASES.WAITING_FOR_READY,
      players,
      centerPile: [],
      revealOrderIndex: 0,
      pendingRevealSeat: null,
      lastRevealSeat: null,
      lastSkippedSeats: [],
      countdownStartedAt: null,
      countdownEndsAt: null,
      reactionEndsAt: null,
      revealSequence: 0,
      reactionId: null,
      isMatch: false,
      matchType: null,
      snapSubmissions: [],
      snapWinnerSeat: null,
      failedSnapSeats: [],
      lastResolution: null,
      finishedAt: null,
      winners: [],
      finalStandings: [],
      lastMoveText: "The opening card is face up. Lock in for the first SNAP reveal.",
      log: []
    };
    const opening = selectNextRevealSource(match);
    const openingCard = opening.player?.drawPile.shift();
    if (!opening.player || !openingCard) {
      throw new RoomError("Snap could not deal its opening card.", "DECK_EMPTY", 500);
    }
    match.centerPile.push(openingCard);
    match.lastRevealSeat = opening.player.seat;
    match.lastMoveText = `${opening.player.name} opens with ${standard52.cardLabel(openingCard)}. Lock in for the next card.`;
    match.log.unshift(match.lastMoveText);
    this.#scheduleBotReady(match, this.now());
    return match;
  }

  ready(match, seat, now = this.now()) {
    requirePhase(match, rules.PHASES.WAITING_FOR_READY, "READY is only available before a reveal.", "READY_NOT_AVAILABLE");
    const player = requirePlayer(match, seat);
    if (player.ready) return match;
    player.ready = true;
    player.botReadyAt = null;
    match.lastMoveText = `${player.name} is ready.`;
    match.log.unshift(match.lastMoveText);
    if (match.players.every((candidate) => candidate.ready)) this.#startCountdown(match, now);
    return match;
  }

  snap(match, seat, reactionId, now = this.now()) {
    requirePhase(match, rules.PHASES.REACTION, "SNAP is not available before the reveal.", "SNAP_NOT_AVAILABLE");
    const player = requirePlayer(match, seat);
    if (reactionId !== match.reactionId) {
      throw new RoomError("That SNAP belongs to an earlier reveal.", "STALE_REACTION", 409);
    }
    if (now >= match.reactionEndsAt) {
      throw new RoomError("That SNAP arrived after the reaction window closed.", "REACTION_CLOSED", 409);
    }
    if (match.centerPile.length < 2) {
      throw new RoomError("Two revealed cards are needed before SNAP is available.", "SNAP_NOT_AVAILABLE", 409);
    }
    if (match.snapSubmissions.includes(player.seat)) return match;
    match.snapSubmissions.push(player.seat);
    player.botSnapAt = null;

    if (match.isMatch) {
      match.snapWinnerSeat = player.seat;
      const captured = match.centerPile.length;
      player.capturedCount += captured;
      match.centerPile = [];
      match.lastResolution = {
        type: "snap",
        seat: player.seat,
        captured,
        reactionId: match.reactionId,
        text: `${player.name} wins ${captured} cards.`
      };
      match.lastMoveText = `SNAP! ${player.name} wins the pile.`;
      match.log.unshift(match.lastMoveText);
      this.#finishReaction(match, now);
      return match;
    }

    player.skipNextReveal = true;
    match.failedSnapSeats.push(player.seat);
    match.lastResolution = {
      type: "failed-snap",
      seat: player.seat,
      captured: 0,
      reactionId: match.reactionId,
      text: `${player.name} must skip their next reveal contribution.`
    };
    match.lastMoveText = `FAILED SNAP. ${player.name} skips their next reveal.`;
    match.log.unshift(match.lastMoveText);
    return match;
  }

  advanceTime(match, now = this.now()) {
    if (!match || match.phase === rules.PHASES.FINISHED) return false;
    let changed = false;

    if (match.phase === rules.PHASES.WAITING_FOR_READY) {
      const dueBots = match.players
        .filter((player) => player.type === "bot" && !player.ready && Number.isFinite(player.botReadyAt) && player.botReadyAt <= now)
        .sort((left, right) => left.botReadyAt - right.botReadyAt);
      for (const bot of dueBots) {
        this.ready(match, bot.seat, now);
        changed = true;
        if (match.phase !== rules.PHASES.WAITING_FOR_READY) break;
      }
    }

    if (match.phase === rules.PHASES.COUNTDOWN && match.countdownEndsAt <= now) {
      this.#reveal(match, match.countdownEndsAt);
      changed = true;
    }

    if (match.phase === rules.PHASES.REACTION) {
      const dueBots = match.players
        .filter((player) => Number.isFinite(player.botSnapAt) && player.botSnapAt <= now)
        .sort((left, right) => left.botSnapAt - right.botSnapAt);
      for (const bot of dueBots) {
        if (match.phase !== rules.PHASES.REACTION) break;
        const submittedAt = Math.min(bot.botSnapAt, match.reactionEndsAt - 1);
        this.snap(match, bot.seat, match.reactionId, submittedAt);
        changed = true;
      }
    }

    if (match.phase === rules.PHASES.REACTION && match.reactionEndsAt <= now) {
      this.#finishReaction(match, match.reactionEndsAt);
      changed = true;
    }
    return changed;
  }

  nextActionDelay(match, now = this.now()) {
    if (!match || match.phase === rules.PHASES.FINISHED) return null;
    const times = [];
    if (match.phase === rules.PHASES.WAITING_FOR_READY) {
      for (const player of match.players) {
        if (player.type === "bot" && !player.ready && Number.isFinite(player.botReadyAt)) times.push(player.botReadyAt);
      }
    } else if (match.phase === rules.PHASES.COUNTDOWN) {
      times.push(match.countdownEndsAt);
    } else if (match.phase === rules.PHASES.REACTION) {
      times.push(match.reactionEndsAt);
      for (const player of match.players) {
        if (Number.isFinite(player.botSnapAt)) times.push(player.botSnapAt);
      }
    }
    if (!times.length) return null;
    return Math.max(0, Math.min(...times) - now);
  }

  replaceWithBot(match, seat, now = this.now()) {
    const player = getPlayer(match, seat);
    if (!player || player.type !== "human") return false;
    player.type = "bot";
    player.style = "steady";
    player.name = `${player.name} · Bot`;
    if (match.phase === rules.PHASES.WAITING_FOR_READY && !player.ready) {
      player.botReadyAt = now + this.randomDelay(250, 800);
    }
    if (match.phase === rules.PHASES.REACTION && match.centerPile.length >= 2 && !match.snapSubmissions.includes(player.seat)) {
      this.#scheduleBotSnap(match, player, now);
    }
    match.log.unshift(`${player.name} took over the disconnected seat.`);
    return true;
  }

  viewFor(match, seat, connections = new Map()) {
    const viewer = getPlayer(match, seat);
    if (!viewer || viewer.type !== "human") throw new RoomError("No private Snap view exists for this seat.", "SEAT_NOT_FOUND", 404);
    const currentCard = match.centerPile.at(-1) || null;
    const previousCard = match.centerPile.at(-2) || null;
    const twoBackCard = match.centerPile.at(-3) || null;
    return {
      type: "snap_match_state",
      state: {
        phase: match.phase,
        players: match.players.map((player) => ({
          seat: player.seat,
          name: player.name,
          avatar: player.avatar,
          type: player.type,
          connected: player.type === "bot" ? true : connections.get(player.seat) === true,
          drawCount: player.drawPile.length,
          capturedCount: player.capturedCount,
          ready: player.ready,
          skipNextReveal: player.skipNextReveal
        })),
        centerCount: match.centerPile.length,
        currentCard: currentCard ? { ...currentCard } : null,
        previousCard: previousCard ? { ...previousCard } : null,
        twoBackCard: twoBackCard ? { ...twoBackCard } : null,
        upcomingRevealSeat: peekNextRevealSeat(match),
        revealSourceSeat: match.pendingRevealSeat ?? match.lastRevealSeat,
        lastSkippedSeats: match.lastSkippedSeats.slice(),
        countdownStartedAt: match.countdownStartedAt,
        countdownEndsAt: match.countdownEndsAt,
        reactionEndsAt: match.reactionEndsAt,
        revealSequence: match.revealSequence,
        reactionId: match.reactionId,
        isMatch: match.phase === rules.PHASES.REACTION ? match.isMatch : null,
        matchType: match.phase === rules.PHASES.REACTION ? match.matchType : null,
        snapSubmissions: match.snapSubmissions.slice(),
        snapWinnerSeat: match.snapWinnerSeat,
        failedSnapSeats: match.failedSnapSeats.slice(),
        lastResolution: match.lastResolution ? { ...match.lastResolution } : null,
        winners: match.winners.slice(),
        finalStandings: match.finalStandings.slice(),
        finishedAt: match.finishedAt,
        lastMoveText: match.lastMoveText,
        log: match.log.slice(0, 18),
        actions: {
          ready: match.phase === rules.PHASES.WAITING_FOR_READY && !viewer.ready,
          snap: match.phase === rules.PHASES.REACTION
            && match.centerPile.length >= 2
            && !match.snapSubmissions.includes(viewer.seat)
        }
      }
    };
  }

  #startCountdown(match, now) {
    const selection = selectNextRevealSource(match);
    if (!selection.player) {
      this.#finishMatch(match, now);
      return;
    }
    match.phase = rules.PHASES.COUNTDOWN;
    match.pendingRevealSeat = selection.player.seat;
    match.lastSkippedSeats = selection.skippedSeats;
    match.countdownStartedAt = now;
    match.countdownEndsAt = now + this.countdownMs;
    match.reactionEndsAt = null;
    match.snapWinnerSeat = null;
    match.failedSnapSeats = [];
    match.lastMoveText = selection.skippedSeats.length
      ? `${selection.skippedSeats.map((seat) => getPlayer(match, seat)?.name).join(", ")} skipped. ${selection.player.name} reveals next.`
      : `${selection.player.name} reveals next. Get ready.`;
    match.log.unshift(match.lastMoveText);
  }

  #reveal(match, revealTime) {
    const source = getPlayer(match, match.pendingRevealSeat);
    const card = source?.drawPile.shift();
    if (!source || !card) throw new RoomError("Snap could not reveal the scheduled card.", "DECK_EMPTY", 500);
    match.centerPile.push(card);
    match.phase = rules.PHASES.REACTION;
    match.lastRevealSeat = source.seat;
    match.pendingRevealSeat = null;
    match.countdownStartedAt = null;
    match.countdownEndsAt = null;
    match.revealSequence += 1;
    match.reactionId = `snap-${match.revealSequence}`;
    match.reactionEndsAt = revealTime + this.reactionWindowMs;
    match.matchType = rules.matchType(match.centerPile);
    match.isMatch = match.matchType !== null;
    match.snapSubmissions = [];
    match.snapWinnerSeat = null;
    match.failedSnapSeats = [];
    match.lastMoveText = `${source.name} reveals ${standard52.cardLabel(card)}.`;
    match.log.unshift(match.lastMoveText);
    for (const player of match.players) this.#scheduleBotSnap(match, player, revealTime);
  }

  #scheduleBotSnap(match, player, revealTime) {
    player.botSnapAt = null;
    if (player.type !== "bot" || match.centerPile.length < 2 || match.snapSubmissions.includes(player.seat)) return;
    if (!match.isMatch && !this.botMistake(player, match)) return;
    const styleAdjustment = player.style === "pressure" ? -100 : player.style === "patient" ? 100 : 0;
    const delay = Math.max(750, this.randomDelay(BOT_REACTION_MIN_MS, BOT_REACTION_MAX_MS) + styleAdjustment);
    player.botSnapAt = revealTime + delay;
  }

  #finishReaction(match, now) {
    for (const player of match.players) player.botSnapAt = null;
    match.reactionEndsAt = null;
    match.isMatch = false;
    match.matchType = null;
    if (!hasDrawCards(match)) {
      this.#finishMatch(match, now);
      return;
    }
    match.phase = rules.PHASES.WAITING_FOR_READY;
    match.pendingRevealSeat = null;
    for (const player of match.players) player.ready = false;
    if (!match.lastResolution || match.lastResolution.reactionId !== match.reactionId) {
      match.lastResolution = {
        type: "no-snap",
        seat: null,
        captured: 0,
        reactionId: match.reactionId,
        text: "No SNAP. Ready for the next reveal."
      };
      match.lastMoveText = "No SNAP. Lock in for the next reveal.";
      match.log.unshift(match.lastMoveText);
    }
    this.#scheduleBotReady(match, now);
  }

  #scheduleBotReady(match, now) {
    for (const player of match.players) {
      player.botSnapAt = null;
      player.botReadyAt = player.type === "bot" && !player.ready
        ? now + this.randomDelay(250, 900)
        : null;
    }
  }

  #finishMatch(match, now) {
    for (const player of match.players) {
      player.ready = false;
      player.botReadyAt = null;
      player.botSnapAt = null;
    }
    match.phase = rules.PHASES.FINISHED;
    match.pendingRevealSeat = null;
    match.countdownStartedAt = null;
    match.countdownEndsAt = null;
    match.reactionEndsAt = null;
    match.finishedAt = now;
    const ordered = match.players.slice().sort((left, right) => right.capturedCount - left.capturedCount || left.seat - right.seat);
    const highScore = ordered[0]?.capturedCount ?? 0;
    match.winners = ordered.filter((player) => player.capturedCount === highScore).map((player) => player.seat);
    match.finalStandings = ordered.map((player) => player.seat);
    match.lastMoveText = match.winners.length === 1
      ? `${getPlayer(match, match.winners[0]).name} wins Snap with ${highScore} captured cards.`
      : `Snap ends in a ${match.winners.length}-way tie at ${highScore} captured cards.`;
    match.log.unshift(match.lastMoveText);
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

function validateDeck(deck) {
  const expected = new Set(standard52.makeDeck().map((card) => card.id));
  if (!Array.isArray(deck) || deck.length !== 52 || new Set(deck.map((card) => card.id)).size !== 52) {
    throw new RoomError("Snap requires Cardcade's complete 52-card deck.", "INVALID_DECK", 500);
  }
  if (deck.some((card) => !expected.has(card.id))) {
    throw new RoomError("Snap received a card outside the Standard 52 deck.", "INVALID_DECK", 500);
  }
}

function requirePhase(match, phase, message, code) {
  if (!match || match.phase !== phase) throw new RoomError(message, code, 409);
}

function requirePlayer(match, seat) {
  const player = getPlayer(match, seat);
  if (!player) throw new RoomError("Seat not found.", "SEAT_NOT_FOUND", 404);
  return player;
}

function getPlayer(match, seat) {
  return match.players.find((player) => player.seat === Number(seat));
}

function hasDrawCards(match) {
  return match.players.some((player) => player.drawPile.length > 0);
}

function selectNextRevealSource(match) {
  const skippedSeats = [];
  const maximumChecks = match.players.length * 2;
  for (let checked = 0; checked < maximumChecks; checked += 1) {
    const player = match.players[match.revealOrderIndex];
    match.revealOrderIndex = (match.revealOrderIndex + 1) % match.players.length;
    if (player.skipNextReveal) {
      player.skipNextReveal = false;
      skippedSeats.push(player.seat);
      continue;
    }
    if (player.drawPile.length > 0) return { player, skippedSeats };
  }
  return { player: null, skippedSeats };
}

function peekNextRevealSeat(match) {
  if (!hasDrawCards(match)) return null;
  let index = match.revealOrderIndex;
  for (let checked = 0; checked < match.players.length * 2; checked += 1) {
    const player = match.players[index];
    index = (index + 1) % match.players.length;
    if (player.skipNextReveal || player.drawPile.length === 0) continue;
    return player.seat;
  }
  return match.players.find((player) => player.drawPile.length > 0)?.seat ?? null;
}

function initialsForName(name, fallback) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  const letters = parts.length >= 2 ? parts[0][0] + parts[1][0] : (parts[0] || fallback || "P").slice(0, 2);
  return letters.toUpperCase();
}
