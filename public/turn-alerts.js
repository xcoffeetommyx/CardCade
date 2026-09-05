// Only public turn state is used; Hot Seat alerts never reveal a private hand.
export function turnOpportunity({ room, view, mode, humanSeats = [] } = {}) {
  const match = view?.state;
  if (!room?.code || !match || match.roundOver || match.matchOver) return null;
  const viewer = room.players?.find((player) => player.isYou);
  let seat = match.prismBurstChallenge?.targetSeat ?? match.activeSeat;
  let prompt = "your turn";
  let stage = match.phase;

  if (room.gameId === "snap") {
    // Snap is simultaneous: notify readiness, never give away a matching pile.
    if (match.phase !== "waiting-for-ready" || !match.actions?.ready) return null;
    seat = viewer?.seat;
    stage = `ready-${match.revealSequence}`;
    prompt = "ready for the next reveal";
  } else if (["dealing", "dealer-turn", "waiting", "complete", "finished", "showdown"].includes(match.phase)) {
    return null;
  }

  if (!Number.isInteger(seat)) return null;
  const player = match.players?.find((candidate) => candidate.seat === seat);
  if (!player || player.type === "bot") return null;
  if (mode === "hot-seat") {
    if (!humanSeats.some((candidate) => Number(candidate.seat) === seat)) return null;
  } else if (viewer?.seat !== seat) return null;

  return {
    key: JSON.stringify([room.code, room.gameId, match.round, seat, stage]),
    message: `${player.name || "Player"}, ${prompt}!`
  };
}

export function createTurnAlertTracker() {
  let previousKey = null;
  return {
    update(input) {
      const opportunity = turnOpportunity(input);
      const key = opportunity?.key ?? null;
      const changed = key !== previousKey;
      previousKey = key;
      return changed ? opportunity : null;
    },
    reset() { previousKey = null; }
  };
}

export function createTurnFeedback({
  navigator = globalThis.navigator,
  AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext,
  notify = () => {},
  enabled = () => true
} = {}) {
  let audio = null;
  return {
    // Browsers require an actual user gesture to unlock audio. Never queue a
    // stale chime for a later gesture if the browser refuses playback.
    unlock() {
      if (!enabled() || !AudioContext) return;
      try {
        if (!audio || audio.state === "closed") audio = new AudioContext();
        if (audio.state === "suspended" || audio.state === "interrupted") {
          audio.resume().catch(() => {});
        }
      } catch { /* Visible alerts still work when audio is unavailable. */ }
    },
    play(message) {
      if (!enabled()) return;
      notify(message);
      try {
        if (navigator?.vibrate?.([100, 60, 140])) return;
      } catch { /* Fall back to the short chime and visible alert. */ }
      if (audio?.state !== "running") return;
      try {
        const start = audio.currentTime;
        for (const [offset, frequency] of [[0, 660], [0.16, 880]]) {
          const tone = audio.createOscillator();
          const gain = audio.createGain();
          tone.type = "sine";
          tone.frequency.value = frequency;
          gain.gain.setValueAtTime(0, start + offset);
          gain.gain.linearRampToValueAtTime(0.08, start + offset + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.001, start + offset + 0.13);
          tone.connect(gain);
          gain.connect(audio.destination);
          tone.onended = () => { tone.disconnect(); gain.disconnect(); };
          tone.start(start + offset);
          tone.stop(start + offset + 0.14);
        }
      } catch { /* Device audio can disappear while the app is open. */ }
    }
  };
}
