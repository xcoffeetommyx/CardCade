const app = document.querySelector("#app");
const toast = document.querySelector("#toast");

const storageKeys = {
  name: "cardcade.playerName.v1",
  room: "cardcade.roomSession.v1",
  reducedMotion: "cardcade.reducedMotion.v1"
};

const state = {
  screen: "home",
  catalog: { families: [] },
  mode: null,
  multiplayerTab: "host",
  selectedGameId: null,
  localBots: 3,
  session: null,
  room: null,
  socket: null,
  socketIntentionalClose: false
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function playerName() {
  return localStorage.getItem(storageKeys.name) || "Player 1";
}

function savePlayerName(value) {
  const name = String(value || "").trim();
  if (name) localStorage.setItem(storageKeys.name, name);
  return name;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.remove("show"), 2600);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error?.message || "Cardcade could not complete that request.");
  }
  return body;
}

function screenHeader(title, copy, back = "home") {
  return `
    <div class="screen-head">
      <button class="back-button" type="button" data-action="${back}" aria-label="Go back">←</button>
      <div>
        <p class="eyebrow">Cardcade</p>
        <h2>${escapeHtml(title)}</h2>
        <p class="lede">${escapeHtml(copy)}</p>
      </div>
    </div>`;
}

function statusLabel(status) {
  return {
    "available": "Playable now",
    "migration-ready": "Next to migrate",
    "planned": "Planned"
  }[status] || status;
}

function gameCard(game, mode) {
  const isPlanned = game.status === "planned";
  const action = mode === "multiplayer" ? "select-room-game" : "select-local-game";
  return `
    <button class="game-card" type="button" data-action="${action}" data-game-id="${escapeHtml(game.id)}" data-accent="${escapeHtml(game.accent)}" ${isPlanned ? "disabled" : ""}>
      <span>
        <span class="badge">${escapeHtml(statusLabel(game.status))}</span>
        <h3>${escapeHtml(game.name)}</h3>
        <p>${escapeHtml(game.description)}</p>
        <small>${game.players.min}–${game.players.max} players · ${escapeHtml(game.eyebrow)}</small>
      </span>
      <span class="mini-card" aria-hidden="true">${game.deckFamilyId === "standard-52" ? "A♠" : "↻"}</span>
    </button>`;
}

function catalogMarkup(mode) {
  const families = state.catalog.families
    .map((family) => {
      const compatibleGames = family.games.filter((game) => game.modes.includes(mode));
      if (!compatibleGames.length) return "";
      return `
        <section class="family-section">
          <div class="family-header">
            <div><span class="family-kicker">${escapeHtml(family.shortName)}</span><h3>${escapeHtml(family.name)}</h3></div>
            <p>${escapeHtml(family.description)}</p>
          </div>
          <div class="game-grid">${compatibleGames.map((game) => gameCard(game, mode === "multiplayer" ? "multiplayer" : "local")).join("")}</div>
        </section>`;
    })
    .join("");
  return families || `<div class="empty-state">No games support this mode yet.</div>`;
}

function renderHome() {
  return `
    <section class="home-grid">
      <div class="home-copy">
        <h1>Every table starts here.</h1>
        <p class="lede">Pick a game, gather around one room code, and handle cards that feel like physical objects—not tiny buttons in a panel.</p>
        <div class="home-actions">
          <button class="arcade-button primary" type="button" data-action="open-solo">
            <span class="button-icon">▶</span><span><span class="button-label">Single / Solo</span><span class="button-copy">Choose a game and fill seats with smart rivals</span></span><span class="button-arrow">›</span>
          </button>
          <button class="arcade-button" type="button" data-action="open-multiplayer">
            <span class="button-icon">♟</span><span><span class="button-label">Multiplayer</span><span class="button-copy">Host one global room or join with a code</span></span><span class="button-arrow">›</span>
          </button>
          <button class="arcade-button" type="button" data-action="open-settings">
            <span class="button-icon">⚙</span><span><span class="button-label">Options</span><span class="button-copy">Player name, motion, sound, and accessibility</span></span><span class="button-arrow">›</span>
          </button>
        </div>
      </div>
      <div class="hero-table" aria-label="A fanned hand of three playing cards">
        <div class="hero-card one"><span>3</span><span class="suit">♣</span></div>
        <div class="hero-card two red"><span>7</span><span class="suit">♥</span></div>
        <div class="hero-card three"><span>K</span><span class="suit">♠</span></div>
      </div>
    </section>`;
}

function renderLibrary() {
  const modeName = state.mode === "hot-seat" ? "Hot Seat" : "Solo";
  return `
    ${screenHeader(`${modeName} library`, "Choose a deck family, then choose the game that owns the rules.", state.mode === "hot-seat" ? "open-multiplayer" : "home")}
    ${catalogMarkup(state.mode)}`;
}

function selectedGame() {
  for (const family of state.catalog.families) {
    const game = family.games.find((candidate) => candidate.id === state.selectedGameId);
    if (game) return game;
  }
  return null;
}

function renderLocalLobby() {
  const game = selectedGame();
  if (!game) return renderLibrary();
  const maxBots = Math.max(0, game.players.max - 1);
  state.localBots = Math.min(state.localBots, maxBots);
  const modeLabel = state.mode === "hot-seat" ? "Hot Seat" : "Solo";
  return `
    ${screenHeader(`${game.name} lobby`, `${modeLabel} setup stays local to this device.`, "back-to-library")}
    <div class="solo-panel">
      <div class="family-header">
        <div><span class="family-kicker">${escapeHtml(game.eyebrow)}</span><h3>${escapeHtml(game.name)}</h3></div>
        <span class="badge">${escapeHtml(statusLabel(game.status))}</span>
      </div>
      <div class="field">
        <label for="local-name">Your name</label>
        <input id="local-name" maxlength="24" value="${escapeHtml(playerName())}" autocomplete="nickname">
      </div>
      ${state.mode === "solo" ? `
        <label><strong>CPU players</strong></label>
        <div class="stepper">
          <button type="button" data-action="local-bot-down" aria-label="Remove CPU player">−</button>
          <output>${state.localBots} CPU${state.localBots === 1 ? "" : "s"}</output>
          <button type="button" data-action="local-bot-up" aria-label="Add CPU player" ${state.localBots >= maxBots ? "disabled" : ""}>+</button>
        </div>` : `
        <div class="callout">Hot Seat seat naming and pass-the-device privacy will be connected when this game's rules module is migrated.</div>`}
      <div class="callout coral">${escapeHtml(game.name)} is the next playable-game migration. This platform milestone proves the launcher, catalog, and shared lobby without duplicating its rules.</div>
      <div class="button-row" style="margin-top: 1rem">
        <button class="action-button" type="button" data-action="back-to-library">Choose another game</button>
        <button class="action-button primary" type="button" data-action="not-playable-yet" disabled>Start game</button>
      </div>
    </div>`;
}

function renderMultiplayer() {
  const savedSession = JSON.parse(localStorage.getItem(storageKeys.room) || "null");
  return `
    ${screenHeader("Multiplayer", "The room code comes first. The host chooses the game after everyone arrives.")}
    ${savedSession ? `<div class="callout" style="max-width:620px;margin:0 auto 1rem">A private session for room <strong>${escapeHtml(savedSession.code)}</strong> is saved on this device. <button class="action-button" type="button" data-action="resume-room" style="margin-left:.6rem;min-height:38px;padding:.4rem .7rem">Resume</button></div>` : ""}
    <div class="form-panel">
      <div class="segmented">
        <button type="button" data-action="multiplayer-tab" data-tab="host" class="${state.multiplayerTab === "host" ? "active" : ""}">Host</button>
        <button type="button" data-action="multiplayer-tab" data-tab="join" class="${state.multiplayerTab === "join" ? "active" : ""}">Join</button>
      </div>
      ${state.multiplayerTab === "host" ? `
        <form data-form="host-room">
          <div class="field"><label for="host-name">Your name</label><input id="host-name" name="name" maxlength="24" value="${escapeHtml(playerName())}" autocomplete="nickname" required><span class="field-help">You can choose the game after the room opens.</span></div>
          <button class="action-button primary" type="submit">Create global room</button>
        </form>` : `
        <form data-form="join-room">
          <div class="field"><label for="join-code">Room code</label><input id="join-code" name="code" maxlength="6" inputmode="text" autocapitalize="characters" autocomplete="off" placeholder="ABC234" required></div>
          <div class="field"><label for="join-name">Your name</label><input id="join-name" name="name" maxlength="24" value="${escapeHtml(playerName())}" autocomplete="nickname" required></div>
          <button class="action-button primary" type="submit">Join room</button>
        </form>`}
      <hr style="border:0;border-top:1px solid var(--line);margin:1.4rem 0">
      <button class="action-button" type="button" data-action="open-hot-seat" style="width:100%">Hot Seat · share this device</button>
    </div>`;
}

function compactGamePicker(room, isHost) {
  if (!isHost) {
    return room.game
      ? `<div class="callout">The host selected <strong>${escapeHtml(room.game.name)}</strong>.</div>`
      : `<div class="empty-state">Waiting for the host to choose a game.</div>`;
  }
  return state.catalog.families.map((family) => `
    <div class="family-section">
      <span class="family-kicker">${escapeHtml(family.shortName)}</span>
      <div class="compact-games">
        ${family.games.filter((game) => game.modes.includes("multiplayer")).map((game) => `
          <button class="compact-game ${room.gameId === game.id ? "selected" : ""}" type="button" data-action="select-room-game" data-game-id="${escapeHtml(game.id)}" ${game.status === "planned" ? "disabled" : ""}>
            <span><strong>${escapeHtml(game.name)}</strong><br><small>${escapeHtml(game.eyebrow)}</small></span><span class="badge">${escapeHtml(statusLabel(game.status))}</span>
          </button>`).join("")}
      </div>
    </div>`).join("");
}

function initials(name) {
  return String(name).split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function renderRoom() {
  const room = state.room;
  if (!room) return `<div class="empty-state">Connecting to the room…</div>`;
  const you = room.players.find((player) => player.isYou);
  const isHost = you?.role === "host";
  const botCount = room.gameSettings.botCount || 0;
  const maxBots = room.game ? Math.max(0, room.game.players.max - room.players.length) : 0;
  const playerRows = room.players.map((player) => `
    <div class="player-row">
      <span class="player-avatar">${escapeHtml(initials(player.name))}</span>
      <span><strong>${escapeHtml(player.name)}${player.isYou ? " · You" : ""}</strong><small><span class="connection-dot ${player.connected ? "online" : ""}"></span>${player.role === "host" ? "Host" : "Guest"} · ${player.connected ? "connected" : "reconnecting"}</small></span>
      <span class="ready-pill ${player.ready ? "ready" : ""}">${player.ready ? "Ready" : "Wait"}</span>
    </div>`).join("");
  const botRows = Array.from({ length: botCount }, (_, index) => `
    <div class="player-row">
      <span class="player-avatar">CPU</span><span><strong>CPU ${index + 1}</strong><small>Computer player</small></span><span class="ready-pill ready">Ready</span>
    </div>`).join("");

  return `
    ${screenHeader("Room lobby", isHost ? "Share the code, choose a game, then configure the table." : "The host controls the game and table settings.", "open-multiplayer")}
    <div class="room-layout">
      <section class="room-panel">
        <div class="room-code-box">
          <span class="room-code-label">Private table code</span>
          <div class="room-code">${escapeHtml(room.code)}</div>
          <div class="button-row">
            <button class="action-button" type="button" data-action="copy-code">Copy code</button>
            <button class="action-button" type="button" data-action="share-code">Share</button>
          </div>
        </div>
        <h3>Players · ${room.players.length + botCount}/${room.capacity}</h3>
        <div class="player-list">${playerRows}${botRows}</div>
        ${isHost && room.game ? `
          <label><strong>CPU players</strong></label>
          <div class="stepper">
            <button type="button" data-action="room-bot-down" aria-label="Remove CPU player" ${botCount <= 0 ? "disabled" : ""}>−</button>
            <output>${botCount} CPU${botCount === 1 ? "" : "s"}</output>
            <button type="button" data-action="room-bot-up" aria-label="Add CPU player" ${botCount >= maxBots ? "disabled" : ""}>+</button>
          </div>` : ""}
      </section>
      <section class="room-panel">
        <div class="family-header"><div><span class="family-kicker">Game cabinet</span><h3>${room.game ? escapeHtml(room.game.name) : "Choose a game"}</h3></div>${room.game ? `<span class="badge">${escapeHtml(statusLabel(room.game.status))}</span>` : ""}</div>
        ${compactGamePicker(room, isHost)}
      </section>
      <section class="room-panel full-width">
        <div class="callout coral">${escapeHtml(room.startBlocker || "The table is ready.")}</div>
        <div class="button-row" style="margin-top:1rem">
          <button class="action-button" type="button" data-action="toggle-ready" ${!room.game ? "disabled" : ""}>${you?.ready ? "Not ready" : "Mark ready"}</button>
          <button class="action-button primary" type="button" data-action="start-room" ${room.canStart ? "" : "disabled"}>Start ${room.game ? escapeHtml(room.game.name) : "game"}</button>
          <button class="action-button" type="button" data-action="leave-room">Leave room</button>
        </div>
      </section>
    </div>`;
}

function renderSettings() {
  const reducedMotion = localStorage.getItem(storageKeys.reducedMotion) === "true";
  return `
    ${screenHeader("Options", "Readable first, physical second, pixelated with restraint.")}
    <div class="form-panel">
      <form data-form="settings">
        <div class="field"><label for="settings-name">Default player name</label><input id="settings-name" name="name" maxlength="24" value="${escapeHtml(playerName())}" autocomplete="nickname"></div>
        <div class="settings-grid">
          <label class="setting-row"><span><strong>Reduce card motion</strong><p>Use gentler transitions when game modules are connected.</p></span><input type="checkbox" name="reducedMotion" ${reducedMotion ? "checked" : ""}></label>
          <div class="setting-row"><span><strong>Sound</strong><p>Audio controls arrive with the shared game runtime.</p></span><span class="badge">Coming later</span></div>
        </div>
        <button class="action-button primary" type="submit" style="margin-top:1rem">Save options</button>
      </form>
    </div>`;
}

function render() {
  const screens = {
    home: renderHome,
    library: renderLibrary,
    "local-lobby": renderLocalLobby,
    multiplayer: renderMultiplayer,
    room: renderRoom,
    settings: renderSettings
  };
  app.innerHTML = (screens[state.screen] || renderHome)();
}

function navigate(screen) {
  state.screen = screen;
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
  app.focus({ preventScroll: true });
}

function sendRoom(message) {
  if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
    showToast("The room is reconnecting. Try again in a moment.");
    return;
  }
  state.socket.send(JSON.stringify(message));
}

function connectRoom(session) {
  if (state.socket) {
    state.socketIntentionalClose = true;
    state.socket.close();
  }
  state.socketIntentionalClose = false;
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(`${protocol}//${location.host}/ws`);
  state.socket = socket;
  socket.addEventListener("open", () => {
    socket.send(JSON.stringify({ type: "authenticate", code: session.code, token: session.token }));
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "room_state") {
      state.room = message.room;
      if (state.screen === "room") render();
    } else if (message.type === "error") {
      showToast(message.error?.message || "The room rejected that action.");
    }
  });
  socket.addEventListener("close", () => {
    if (!state.socketIntentionalClose && state.screen === "room") showToast("Room connection closed. Use Resume to reconnect.");
  });
}

function enterRoom(session) {
  state.session = { code: session.code, token: session.token, playerId: session.playerId };
  state.room = session.room;
  localStorage.setItem(storageKeys.room, JSON.stringify(state.session));
  connectRoom(state.session);
  navigate("room");
}

async function resumeRoom() {
  const saved = JSON.parse(localStorage.getItem(storageKeys.room) || "null");
  if (!saved) return;
  try {
    const session = await api(`/api/rooms/${encodeURIComponent(saved.code)}/reconnect`, { method: "POST", body: JSON.stringify({ token: saved.token }) });
    enterRoom({ ...session, token: saved.token });
  } catch (error) {
    localStorage.removeItem(storageKeys.room);
    showToast(error.message);
    render();
  }
}

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;

  if (action === "home") navigate("home");
  if (action === "open-solo") { state.mode = "solo"; state.selectedGameId = null; navigate("library"); }
  if (action === "open-hot-seat") { state.mode = "hot-seat"; state.selectedGameId = null; navigate("library"); }
  if (action === "open-multiplayer") navigate("multiplayer");
  if (action === "open-settings") navigate("settings");
  if (action === "back-to-library") navigate("library");
  if (action === "multiplayer-tab") { state.multiplayerTab = button.dataset.tab; render(); }
  if (action === "select-local-game") { state.selectedGameId = button.dataset.gameId; navigate("local-lobby"); }
  if (action === "local-bot-down") { state.localBots = Math.max(0, state.localBots - 1); render(); }
  if (action === "local-bot-up") { state.localBots += 1; render(); }
  if (action === "select-room-game") sendRoom({ type: "select_game", gameId: button.dataset.gameId });
  if (action === "room-bot-down") sendRoom({ type: "set_bot_count", botCount: Math.max(0, state.room.gameSettings.botCount - 1) });
  if (action === "room-bot-up") sendRoom({ type: "set_bot_count", botCount: state.room.gameSettings.botCount + 1 });
  if (action === "toggle-ready") {
    const you = state.room.players.find((player) => player.isYou);
    sendRoom({ type: "set_ready", ready: !you?.ready });
  }
  if (action === "start-room" || action === "not-playable-yet") showToast(state.room?.startBlocker || "The first game migration is the next milestone.");
  if (action === "resume-room") resumeRoom();
  if (action === "copy-code") {
    await navigator.clipboard.writeText(state.room.code);
    showToast("Room code copied.");
  }
  if (action === "share-code") {
    const share = { title: "Join my Cardcade room", text: `Join my Cardcade room with code ${state.room.code}.` };
    if (navigator.share) await navigator.share(share).catch(() => {});
    else { await navigator.clipboard.writeText(share.text); showToast("Invite copied."); }
  }
  if (action === "leave-room") {
    sendRoom({ type: "leave_room" });
    state.socketIntentionalClose = true;
    localStorage.removeItem(storageKeys.room);
    state.session = null;
    state.room = null;
    navigate("multiplayer");
  }
});

document.addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-form]");
  if (!form) return;
  event.preventDefault();
  const data = new FormData(form);
  const formType = form.dataset.form;
  const submit = form.querySelector("button[type=submit]");
  submit?.setAttribute("disabled", "");

  try {
    if (formType === "host-room") {
      const name = savePlayerName(data.get("name"));
      enterRoom(await api("/api/rooms", { method: "POST", body: JSON.stringify({ name }) }));
    }
    if (formType === "join-room") {
      const name = savePlayerName(data.get("name"));
      const code = String(data.get("code") || "").trim().toUpperCase();
      enterRoom(await api(`/api/rooms/${encodeURIComponent(code)}/join`, { method: "POST", body: JSON.stringify({ name }) }));
    }
    if (formType === "settings") {
      savePlayerName(data.get("name"));
      localStorage.setItem(storageKeys.reducedMotion, data.get("reducedMotion") === "on" ? "true" : "false");
      showToast("Options saved.");
      navigate("home");
    }
  } catch (error) {
    showToast(error.message);
  } finally {
    submit?.removeAttribute("disabled");
  }
});

async function boot() {
  try {
    state.catalog = await api("/api/catalog");
    render();
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  } catch (error) {
    app.innerHTML = `<div class="empty-state"><h2>Cardcade could not start.</h2><p class="error-text">${escapeHtml(error.message)}</p></div>`;
  }
}

boot();
