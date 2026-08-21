const app = document.querySelector("#app");
const toast = document.querySelector("#toast");
const installButton = document.querySelector("#install-button");
const installDialog = document.querySelector("#install-dialog");
const installDialogCopy = document.querySelector("#install-dialog-copy");
const networkStatus = document.querySelector("#network-status");
const systemBanner = document.querySelector("#system-banner");
const systemBannerMessage = document.querySelector("#system-banner-message");
const systemBannerAction = systemBanner?.querySelector('[data-action="apply-app-update"]');

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
  hotSeatPlayerCount: 1,
  hotSeatBots: 2,
  hotSeatNames: [],
  hotSeatSeats: [],
  hotSeatPendingPlayerId: null,
  hotSeatForceHandoff: false,
  hotSeatWaitingForCpu: false,
  session: null,
  room: null,
  socket: null,
  socketIntentionalClose: false,
  reconnectTimer: null,
  reconnectAttempts: 0,
  gameView: null,
  gameMode: null,
  gameSort: "rank",
  selectedCards: new Set(),
  juanChosenColor: null,
  gameActionLock: false,
  dealtHandOwners: new Set(),
  lastPileSignature: null
};

const pwaState = {
  online: navigator.onLine,
  roomConnection: "idle",
  deferredInstallPrompt: null,
  serviceWorkerRegistration: null,
  updateAvailable: false,
  updateRequested: false
};

const threeSevenRules = globalThis.ThreeSevenRules;
const thirteenRules = globalThis.ThirteenRules;
const cardPresentation = globalThis.CardcadePresentation;
const standard52 = globalThis.CardcadeStandard52;
const hotSeatFlow = globalThis.CardcadeHotSeat;
const juanDeck = globalThis.CardcadeJuanDeck;
const juanRules = globalThis.JuanRules;

const standardGameAdapters = {
  "three-seven": {
    rules: threeSevenRules,
    passLabel: "Pass + Draw",
    noMoveText: "No legal play. Pass and draw."
  },
  thirteen: {
    rules: thirteenRules,
    passLabel: "Pass",
    noMoveText: "No legal play. Pass."
  }
};

const juanGameAdapter = {
  gameId: "juan",
  rules: juanRules,
  deck: juanDeck,
  passLabel: "Draw",
  noMoveText: "No matching card. Draw one.",
  sortModes: ["color", "face"],
  defaultSort: "color"
};

function supportsGame(gameId) {
  return Boolean(standardGameAdapters[gameId]) || gameId === "juan";
}

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
  let response;
  try {
    response = await fetch(path, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) }
    });
  } catch {
    throw new Error(navigator.onLine
      ? "Cardcade could not reach the server. Check the connection and try again."
      : "Cardcade is offline. Reconnect before starting or joining a table.");
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error?.message || "Cardcade could not complete that request.");
  }
  return body;
}

function isStandaloneApp() {
  return matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
}

function isAppleMobileDevice() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function updateInstallButton() {
  if (!installButton) return;
  const canExplainIosInstall = isAppleMobileDevice() && !isStandaloneApp();
  installButton.hidden = isStandaloneApp() || (!pwaState.deferredInstallPrompt && !canExplainIosInstall);
  installButton.textContent = isAppleMobileDevice() ? "Add to Home" : "Install app";
}

function showInstallHelp() {
  if (!installDialog || !installDialogCopy) return;
  installDialogCopy.innerHTML = isAppleMobileDevice()
    ? `<ol class="install-steps"><li>Open the browser's <strong>Share</strong> menu.</li><li>Choose <strong>Add to Home Screen</strong>.</li><li>Keep <strong>Open as Web App</strong> enabled when that option appears, then tap <strong>Add</strong>.</li></ol><p>Launch Cardcade from its Home Screen icon for the full standalone layout.</p>`
    : `<p>Open your browser menu and choose <strong>Install Cardcade</strong> or <strong>Add to Home screen</strong>. Installation requires HTTPS outside local development.</p>`;
  if (typeof installDialog.showModal === "function") installDialog.showModal();
  else installDialog.setAttribute("open", "");
}

async function requestAppInstall() {
  const promptEvent = pwaState.deferredInstallPrompt;
  if (!promptEvent) {
    showInstallHelp();
    return;
  }
  await promptEvent.prompt();
  await promptEvent.userChoice.catch(() => null);
  pwaState.deferredInstallPrompt = null;
  updateInstallButton();
}

function renderShellStatus() {
  const label = networkStatus?.querySelector("span:last-child");
  const status = !pwaState.online
    ? { kind: "offline", label: "Offline", message: "Offline — the launcher is available, but games and rooms need a connection.", action: false }
    : pwaState.roomConnection === "reconnecting"
      ? { kind: "reconnecting", label: "Reconnecting", message: "Reconnecting to your private table…", action: false }
      : pwaState.updateAvailable
        ? { kind: "update", label: "Update ready", message: "A new Cardcade build is ready.", action: true }
        : { kind: "online", label: isStandaloneApp() ? "App mode" : "Online", message: "", action: false };

  if (networkStatus) networkStatus.dataset.status = status.kind;
  if (label) label.textContent = status.label;
  if (!systemBanner || !systemBannerMessage || !systemBannerAction) return;
  systemBanner.dataset.status = status.kind;
  systemBanner.hidden = !status.message;
  systemBannerMessage.textContent = status.message;
  systemBannerAction.hidden = !status.action;
}

function setRoomConnection(status) {
  pwaState.roomConnection = status;
  renderShellStatus();
}

function markAppUpdateAvailable(registration) {
  if (!navigator.serviceWorker.controller) return;
  pwaState.serviceWorkerRegistration = registration;
  pwaState.updateAvailable = true;
  renderShellStatus();
}

async function registerCardcadeServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.register("/sw.js");
    pwaState.serviceWorkerRegistration = registration;
    if (registration.waiting) markAppUpdateAvailable(registration);
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      worker?.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          markAppUpdateAvailable(registration);
        }
      });
    });
    if (document.visibilityState === "visible") registration.update().catch(() => {});
  } catch {
    // Cardcade still works as a normal website when service workers are unavailable.
  }
}

function setupPwaShell() {
  document.documentElement.classList.toggle("standalone-app", isStandaloneApp());
  updateInstallButton();
  renderShellStatus();

  addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    pwaState.deferredInstallPrompt = event;
    updateInstallButton();
  });
  addEventListener("appinstalled", () => {
    pwaState.deferredInstallPrompt = null;
    updateInstallButton();
    showToast("Cardcade was added to your device.");
  });
  addEventListener("online", () => {
    pwaState.online = true;
    renderShellStatus();
    if (roomReconnectEligible()) scheduleRoomReconnect(0);
  });
  addEventListener("offline", () => {
    pwaState.online = false;
    renderShellStatus();
  });
  matchMedia("(display-mode: standalone)").addEventListener?.("change", () => {
    document.documentElement.classList.toggle("standalone-app", isStandaloneApp());
    updateInstallButton();
    renderShellStatus();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      pwaState.serviceWorkerRegistration?.update().catch(() => {});
    }
  });
  navigator.serviceWorker?.addEventListener("controllerchange", () => {
    if (!pwaState.updateRequested) return;
    pwaState.updateRequested = false;
    location.reload();
  });
  registerCardcadeServiceWorker();
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

function ensureHotSeatSetup(game) {
  const count = Math.max(1, Math.min(state.hotSeatPlayerCount, game.players.max));
  state.hotSeatPlayerCount = count;
  state.hotSeatBots = Math.max(0, Math.min(state.hotSeatBots, game.players.max - count));
  if (count + state.hotSeatBots < game.players.min) {
    state.hotSeatBots = game.players.min - count;
  }
  while (state.hotSeatNames.length < count) {
    const index = state.hotSeatNames.length;
    state.hotSeatNames.push(index === 0 ? playerName() : `Player ${index + 1}`);
  }
  state.hotSeatNames = state.hotSeatNames.slice(0, count);
}

function captureHotSeatNames() {
  const inputs = [...document.querySelectorAll("[data-hot-seat-name]")];
  if (!inputs.length) return;
  state.hotSeatNames = inputs.map((input, index) => String(input.value || `Player ${index + 1}`).trim());
}

function renderLocalLobby() {
  const game = selectedGame();
  if (!game) return renderLibrary();
  const isHotSeat = state.mode === "hot-seat";
  if (isHotSeat) ensureHotSeatSetup(game);
  const maxBots = Math.max(0, game.players.max - 1);
  const minBots = Math.max(0, game.players.min - 1);
  state.localBots = Math.max(minBots, Math.min(state.localBots, maxBots));
  const modeLabel = state.mode === "hot-seat" ? "Hot Seat" : "Solo";
  const hotSeatTotal = state.hotSeatPlayerCount + state.hotSeatBots;
  return `
    ${screenHeader(`${game.name} lobby`, `${modeLabel} setup stays local to this device.`, "back-to-library")}
    <div class="solo-panel">
      <div class="family-header">
        <div><span class="family-kicker">${escapeHtml(game.eyebrow)}</span><h3>${escapeHtml(game.name)}</h3></div>
        <span class="badge">${escapeHtml(statusLabel(game.status))}</span>
      </div>
      ${state.mode === "solo" ? `
        <div class="field">
          <label for="local-name">Your name</label>
          <input id="local-name" maxlength="24" value="${escapeHtml(playerName())}" autocomplete="nickname">
        </div>
        <label><strong>CPU players</strong></label>
        <div class="stepper">
          <button type="button" data-action="local-bot-down" aria-label="Remove CPU player" ${state.localBots <= minBots ? "disabled" : ""}>−</button>
          <output>${state.localBots} CPU${state.localBots === 1 ? "" : "s"}</output>
          <button type="button" data-action="local-bot-up" aria-label="Add CPU player" ${state.localBots >= maxBots ? "disabled" : ""}>+</button>
        </div>
        <div class="callout coral">${escapeHtml(game.name)} is ready. Cardcade will create a private local table and fill the open seats with CPUs.</div>` : `
        <label><strong>Human players</strong></label>
        <div class="stepper">
          <button type="button" data-action="hot-seat-player-down" aria-label="Remove Hot Seat player" ${state.hotSeatPlayerCount <= 1 ? "disabled" : ""}>−</button>
          <output>${state.hotSeatPlayerCount} human${state.hotSeatPlayerCount === 1 ? "" : "s"}</output>
          <button type="button" data-action="hot-seat-player-up" aria-label="Add Hot Seat player" ${state.hotSeatPlayerCount >= game.players.max || (state.hotSeatBots === 0 && hotSeatTotal >= game.players.max) ? "disabled" : ""}>+</button>
        </div>
        <div class="hot-seat-names">
          ${state.hotSeatNames.map((name, index) => `
            <div class="field">
              <label for="hot-seat-name-${index}">Seat ${index + 1}${index === 0 ? " · table host" : ""}</label>
              <input id="hot-seat-name-${index}" data-hot-seat-name maxlength="24" value="${escapeHtml(name)}" autocomplete="off" required>
            </div>`).join("")}
        </div>
        <label><strong>CPU players</strong></label>
        <div class="stepper">
          <button type="button" data-action="hot-seat-bot-down" aria-label="Remove Hot Seat CPU" ${state.hotSeatBots <= 0 || hotSeatTotal <= game.players.min ? "disabled" : ""}>−</button>
          <output>${state.hotSeatBots} CPU${state.hotSeatBots === 1 ? "" : "s"}</output>
          <button type="button" data-action="hot-seat-bot-up" aria-label="Add Hot Seat CPU" ${hotSeatTotal >= game.players.max ? "disabled" : ""}>+</button>
        </div>
        <div class="callout coral">${escapeHtml(game.name)} will use ${hotSeatTotal} total seats. Cardcade hides human hands between turns; CPU turns play automatically on the covered table.</div>`}
      <div class="button-row" style="margin-top: 1rem">
        <button class="action-button" type="button" data-action="back-to-library">Choose another game</button>
        <button class="action-button primary" type="button" data-action="${game.status === "available" ? (isHotSeat ? "start-hot-seat" : "start-local-game") : "not-playable-yet"}" ${game.status === "available" ? "" : "disabled"}>Start ${isHotSeat ? `${hotSeatTotal}-seat ` : ""}game</button>
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

function currentStandardGame() {
  const gameId = state.room?.gameId;
  const adapter = standardGameAdapters[gameId];
  return adapter ? { gameId, ...adapter } : null;
}

function gameSelection() {
  const view = state.gameView;
  const game = currentStandardGame();
  if (!view || !game?.rules) return { ok: false, reason: "Game unavailable" };
  const match = view.state;
  const cards = view.hand.filter((card) => state.selectedCards.has(card.id));
  if (!cards.length) return { ok: false, reason: "Select cards to play" };
  const combo = game.rules.detectCombo(cards, match.round);
  if (!combo) return { ok: false, reason: "Not a legal combination" };
  if (match.openingRequired && !state.selectedCards.has(match.openingCardId)) {
    return { ok: false, reason: `Opening play needs ${standardCardLabel(match.openingCardId)}` };
  }
  if (!game.rules.canBeat(combo, match.currentLead?.combo || null)) {
    return { ok: false, reason: "Does not beat the active pile" };
  }
  return { ok: true, reason: game.rules.comboDescription(combo), combo };
}

function standardCardLabel(cardId) {
  return standard52.cardLabel(cardId);
}

function legalMovesForGame(game, match) {
  if (game.gameId === "thirteen") {
    return game.rules.getLegalMoves(
      state.gameView.hand,
      match.currentLead?.combo || null,
      match.openingRequired
    );
  }
  return game.rules.getLegalMoves(
    state.gameView.hand,
    match.currentLead?.combo || null,
    match.openingRequired ? match.openingCardId : null,
    match.round
  );
}

function gameLadder(gameId, match) {
  if (gameId === "thirteen") {
    return `
      <div class="suit-ladder rank-ladder">
        <span>Low</span><span class="rank-run"><b>3</b> · 4 · 5 · 6 · 7 · 8 · 9 · 10 · J · Q · K · A · <b class="high-card">2</b></span><span>High</span>
      </div>`;
  }
  const orderedSuits = match.suitOrder
    .map((suit, index) => `<span class="suit-rank ${index === match.suitOrder.length - 1 ? "high" : ""}"><b>${index + 1}</b>${standard52.SUIT_SYMBOL[suit]}</span>`)
    .join("<i>›</i>");
  return `<div class="suit-ladder"><span>Low</span>${orderedSuits}<span>High</span></div>`;
}

function placeLabel(place) {
  if (place === 1) return "1st";
  if (place === 2) return "2nd";
  if (place === 3) return "3rd";
  return `${place}th`;
}

function renderPlayingCard(card, index, { played = false, enter = false, selectable = false, dealt = false } = {}) {
  const suit = standard52.SUIT_SYMBOL[card.suit];
  const red = card.suit === "H" || card.suit === "D";
  const selected = !played && state.selectedCards.has(card.id);
  const faceId = { J: "card-face-jack", Q: "card-face-queen", K: "card-face-king" }[card.rank];
  const center = faceId
    ? `<span class="card-center court"><svg viewBox="0 0 100 140" aria-hidden="true"><use href="#${faceId}"></use></svg></span>`
    : `<span class="card-center">${suit}</span>`;
  const classes = [
    "playing-card",
    red ? "red" : "black",
    selected ? "selected" : "",
    played ? "played" : "",
    played && enter ? "enter" : "",
    selectable && !played ? "selectable" : "",
    dealt && !played ? "dealt" : ""
  ].filter(Boolean).join(" ");
  const delay = (played && enter) || dealt
    ? `style="animation-delay:${Math.min(index, dealt ? 12 : 5) * (dealt ? 24 : 35)}ms"`
    : "";
  return `
    <button class="${classes}" type="button" ${played ? "disabled" : ""} ${delay}
      ${played ? "" : `data-game-card="${escapeHtml(card.id)}" data-card-index="${index}" tabindex="${selectable ? "0" : "-1"}"`}
      aria-label="${escapeHtml(standard52.cardLong(card))}" aria-pressed="${selected}">
      <span class="card-corner"><strong>${escapeHtml(card.rank)}</strong><i>${suit}</i></span>
      ${center}
      <span class="card-corner bottom"><strong>${escapeHtml(card.rank)}</strong><i>${suit}</i></span>
    </button>`;
}

function renderStandardGame() {
  const view = state.gameView;
  if (!view) return `<div class="empty-state">Dealing the cards…</div>`;
  const game = currentStandardGame();
  if (!game) return `<div class="empty-state">This game does not have a Cardcade table renderer yet.</div>`;
  const match = view.state;
  const viewer = state.room?.players.find((player) => player.isYou);
  const viewerSeat = viewer?.seat;
  const yourPlayer = match.players.find((player) => player.seat === viewerSeat);
  const opponents = match.players.filter((player) => player.seat !== viewerSeat);
  const isYourTurn = match.activeSeat === viewerSeat && !match.roundOver;
  const evaluation = gameSelection();
  const sortedHand = game.rules.sortCards(view.hand, state.gameSort, match.round);
  const activePlayer = match.players.find((player) => player.seat === match.activeSeat);
  const lead = match.currentLead;
  const canPass = isYourTurn && Boolean(lead) && state.selectedCards.size === 0 && !state.gameActionLock;
  const isHost = viewer?.role === "host";
  const pileSignature = lead ? lead.cards.map((card) => card.id).sort().join(",") : "";
  const pileIsNew = Boolean(lead) && pileSignature !== state.lastPileSignature;
  state.lastPileSignature = pileSignature;
  const handOwner = `${game.gameId}:${state.room?.code || "table"}:${viewerSeat ?? "viewer"}:round-${match.round}`;
  const isDealing = !state.dealtHandOwners.has(handOwner);
  state.dealtHandOwners.add(handOwner);
  const title = state.room?.game?.name || (game.gameId === "thirteen" ? "Thirteen" : "3s & 7s");
  const roundLabel = game.gameId === "three-seven" ? `Round ${match.round}/${match.totalRounds}` : `Round ${match.round}`;
  const tableCount = game.gameId === "three-seven" ? `Stock ${match.drawCount}` : "13-card deal";

  return `
    <section class="standard-card-game" data-game-id="${escapeHtml(game.gameId)}">
      <header class="game-topbar">
        <button class="back-button" type="button" data-action="leave-game" aria-label="${state.gameMode === "multiplayer" ? "Return to room lobby" : "Leave game"}">←</button>
        <div><span class="family-kicker">${state.gameMode === "solo" ? "Solo table" : state.gameMode === "hot-seat" ? "Hot Seat table" : `Room ${escapeHtml(state.room.code)}`}</span><h2>${escapeHtml(title)}</h2><p>${roundLabel} · ${escapeHtml(match.lastMoveText)}</p></div>
        <button class="game-score" type="button" disabled><span>Score</span><strong>${yourPlayer?.score ?? 0}</strong></button>
      </header>
      ${gameLadder(game.gameId, match)}
      <div class="game-opponents">
        ${opponents.map((player) => `
          <article class="game-seat ${match.activeSeat === player.seat ? "active" : ""}">
            <span class="player-avatar">${escapeHtml(player.avatar)}</span>
            <span><strong>${escapeHtml(player.name)}</strong><small>${player.finished ? `${placeLabel(player.place)} place` : `${player.cardCount} cards${player.passed ? " · passed" : ""}`}</small></span>
            <span class="mini-deck" aria-hidden="true">${Math.min(player.cardCount, 7)}</span>
          </article>`).join("")}
      </div>
      <section class="game-table">
        <div class="game-status"><span><strong>${match.roundOver ? "Round complete" : isYourTurn ? `${escapeHtml(yourPlayer?.name || "You")}, your turn` : `${escapeHtml(activePlayer?.name || "Player")} is thinking`}</strong><small>${tableCount} · ${lead ? `${escapeHtml(lead.playerName)} controls the pile` : "open lead"}</small></span><span class="badge">${lead ? escapeHtml(lead.label) : "Open lead"}</span></div>
        <div class="active-pile">${lead ? lead.cards.map((card, index) => renderPlayingCard(card, index, { played: true, enter: pileIsNew })).join("") : `<div class="empty-pile"><strong>No active pile</strong><span>${match.openingRequired ? `Lead must include ${standardCardLabel(match.openingCardId)}.` : "Lead with any legal combination."}</span></div>`}</div>
      </section>
      <section class="physical-hand ${isYourTurn ? "your-turn" : ""}">
        <div class="hand-heading"><span><strong>Your hand</strong><small>${view.hand.length} cards · ${escapeHtml(state.gameSort)} sort</small></span><span class="selection-status ${evaluation.ok ? "valid" : state.selectedCards.size ? "invalid" : ""}">${escapeHtml(evaluation.reason)}</span></div>
        <div class="game-hand" data-hand-owner="${escapeHtml(handOwner)}" aria-label="Your fanned hand">${sortedHand.map((card, index) => renderPlayingCard(card, index, { selectable: isYourTurn && !state.gameActionLock, dealt: isDealing })).join("")}</div>
      </section>
      <nav class="game-actions">
        <button type="button" data-action="game-hint" ${isYourTurn && !state.gameActionLock ? "" : "disabled"}>Hint</button>
        <button type="button" data-action="game-sort" ${state.gameActionLock ? "disabled" : ""}>Sort</button>
        <button type="button" data-action="game-pass" ${canPass ? "" : "disabled"}>${game.passLabel}</button>
        <button class="primary" type="button" data-action="game-play" ${isYourTurn && evaluation.ok && !state.gameActionLock ? "" : "disabled"}>▶ Play</button>
      </nav>
      ${match.roundOver ? `
        <div class="round-result">
          <div><span class="family-kicker">${match.matchOver ? "Final standings" : `Round ${match.round} complete`}</span><h3>${escapeHtml(match.lastMoveText)}</h3><p>${match.placements.map((seat, index) => `${index + 1}. ${escapeHtml(match.players.find((player) => player.seat === seat)?.name || "Player")}`).join(" · ")}</p></div>
          ${game.gameId === "three-seven" && !match.matchOver && match.mercyOfferPending && match.mercyLeaderSeat === viewerSeat ? `<div class="button-row"><button class="action-button" data-action="mercy-take-win">Take the win</button><button class="action-button primary" data-action="mercy-double">Double or nothing</button></div>` : ""}
          ${!match.matchOver && !match.mercyOfferPending ? `<button class="action-button primary" type="button" data-action="next-round" ${isHost ? "" : "disabled"}>${isHost ? "Deal next round" : "Waiting for host"}</button>` : ""}
          ${match.matchOver ? `<button class="action-button" type="button" data-action="leave-game">Return to Cardcade</button>` : ""}
        </div>` : ""}
    </section>`;
}

function juanSelection() {
  const view = state.gameView;
  if (!view || !juanRules || !juanDeck) return { ok: false, reason: "JUAN unavailable" };
  const selected = view.hand.filter((card) => state.selectedCards.has(card.id));
  if (!selected.length) {
    return { ok: false, reason: view.state.drawnCardId ? "Play the drawn card or keep it" : "Select one card to play" };
  }
  if (selected.length !== 1) return { ok: false, reason: "JUAN plays one card at a time" };
  const [card] = selected;
  if (view.state.drawnCardId && card.id !== view.state.drawnCardId) {
    return { ok: false, reason: "Play the drawn card or keep it" };
  }
  if (!juanRules.canPlay(card, view.state.topCard, view.state.activeColor)) {
    return { ok: false, reason: "Match the color lane or printed face" };
  }
  if ((card.kind === "prism" || card.kind === "prism-burst") && !juanDeck.COLORS.includes(state.juanChosenColor)) {
    return { ok: false, reason: "Choose the Prism's next color" };
  }
  const color = card.kind === "prism" || card.kind === "prism-burst" ? ` · ${juanDeck.COLOR_NAME[state.juanChosenColor]} next` : "";
  return { ok: true, reason: `${juanDeck.cardLong(card)}${color}`, card };
}

function renderJuanCard(card, index, { played = false, enter = false, selectable = false, dealt = false, turnDrawn = false } = {}) {
  const selected = !played && state.selectedCards.has(card.id);
  const action = juanDeck.ACTION_FACE[card.kind];
  const isNumber = card.kind === "number";
  const face = card.kind === "number" ? String(card.value) : action?.symbol || "?";
  const short = card.kind === "number" ? String(card.value) : action?.short || "?";
  const name = card.kind === "number" ? juanDeck.COLOR_NAME[card.color] : action?.name || card.kind;
  const colorClass = card.color ? `juan-${card.color}` : "juan-prism";
  const classes = [
    "playing-card",
    "juan-card",
    `juan-kind-${card.kind}`,
    colorClass,
    selected ? "selected" : "",
    turnDrawn ? "turn-drawn" : "",
    played ? "played" : "",
    played && enter ? "enter" : "",
    selectable && !played ? "selectable" : "",
    dealt && !played ? "dealt" : ""
  ].filter(Boolean).join(" ");
  const delay = (played && enter) || dealt
    ? `style="animation-delay:${Math.min(index, dealt ? 12 : 5) * (dealt ? 24 : 35)}ms"`
    : "";
  return `
    <button class="${classes}" type="button" ${played ? "disabled" : ""} ${delay}
      ${played ? "" : `data-game-card="${escapeHtml(card.id)}" data-card-index="${index}" tabindex="${selectable ? "0" : "-1"}`}
      aria-label="${escapeHtml(juanDeck.cardLong(card))}" aria-pressed="${selected}">
      <span class="juan-card-ink" aria-hidden="true"></span>
      <span class="card-corner juan-corner"><strong class="${isNumber ? "juan-rank-glyph" : ""}">${escapeHtml(short)}</strong><i class="juan-lane-pip" aria-hidden="true"></i></span>
      <span class="juan-card-emblem"><b class="${isNumber ? "juan-rank-glyph" : ""}">${escapeHtml(face)}</b><small>${escapeHtml(name)}</small></span>
      <span class="juan-card-brand" aria-hidden="true">JUAN</span>
      <span class="card-corner bottom juan-corner"><strong class="${isNumber ? "juan-rank-glyph" : ""}">${escapeHtml(short)}</strong><i class="juan-lane-pip" aria-hidden="true"></i></span>
    </button>`;
}

function juanColorChooser(selectedCard) {
  if (!selectedCard || !["prism", "prism-burst"].includes(selectedCard.kind)) return "";
  return `
    <div class="juan-color-chooser" role="group" aria-label="Choose the Prism's next color">
      <span>Prism lane</span>
      ${juanDeck.COLORS.map((color) => `
        <button type="button" class="juan-color-choice juan-${color} ${state.juanChosenColor === color ? "active" : ""}" data-action="choose-juan-color" data-color="${color}" aria-pressed="${state.juanChosenColor === color}">
          <i aria-hidden="true"></i>${escapeHtml(juanDeck.COLOR_NAME[color])}
        </button>`).join("")}
    </div>`;
}

function renderJuanGame() {
  const view = state.gameView;
  if (!view || !juanRules || !juanDeck) return `<div class="empty-state">Dealing the JUAN deck…</div>`;
  const match = view.state;
  const viewer = state.room?.players.find((player) => player.isYou);
  const viewerSeat = viewer?.seat;
  const yourPlayer = match.players.find((player) => player.seat === viewerSeat);
  const opponents = match.players.filter((player) => player.seat !== viewerSeat);
  const isYourTurn = match.activeSeat === viewerSeat && !match.roundOver;
  const activePlayer = match.players.find((player) => player.seat === match.activeSeat);
  const evaluation = juanSelection();
  const sortedHand = juanRules.sortCards(view.hand, state.gameSort);
  const selectedCard = view.hand.find((card) => state.selectedCards.has(card.id));
  const hasDrawChoice = isYourTurn && Boolean(match.drawnCardId);
  const canDraw = isYourTurn && (!state.selectedCards.size || hasDrawChoice) && !state.gameActionLock;
  const pileSignature = `${match.topCard.id}:${match.activeColor}`;
  const pileIsNew = pileSignature !== state.lastPileSignature;
  state.lastPileSignature = pileSignature;
  const handOwner = `juan:${state.room?.code || "table"}:${viewerSeat ?? "viewer"}:round-${match.round}`;
  const isDealing = !state.dealtHandOwners.has(handOwner);
  state.dealtHandOwners.add(handOwner);

  return `
    <section class="standard-card-game juan-game" data-game-id="juan" data-active-color="${escapeHtml(match.activeColor)}">
      <header class="game-topbar">
        <button class="back-button" type="button" data-action="leave-game" aria-label="${state.gameMode === "multiplayer" ? "Return to room lobby" : "Leave game"}">←</button>
        <div><span class="family-kicker">${state.gameMode === "solo" ? "Solo table" : state.gameMode === "hot-seat" ? "Hot Seat table" : `Room ${escapeHtml(state.room.code)}`}</span><h2>JUAN</h2><p>Race to one · ${escapeHtml(match.lastMoveText)}</p></div>
        <button class="game-score" type="button" disabled><span>Score</span><strong>${yourPlayer?.score ?? 0}</strong></button>
      </header>
      <div class="juan-lane-bar">
        <span>Active color</span>
        ${juanDeck.COLORS.map((color) => `<i class="juan-lane juan-${color} ${match.activeColor === color ? "active" : ""}" title="${escapeHtml(juanDeck.COLOR_NAME[color])}"></i>`).join("")}
        <strong>${escapeHtml(juanDeck.COLOR_NAME[match.activeColor])}</strong>
        <span class="juan-direction" aria-label="Play direction ${match.direction === 1 ? "forward" : "backward"}">${match.direction === 1 ? "↻" : "↺"}</span>
      </div>
      <div class="game-opponents ${opponents.length <= 3 ? "fit-opponents" : ""}">
        ${opponents.map((player) => `
          <article class="game-seat ${match.activeSeat === player.seat ? "active" : ""} ${player.juan ? "juan-alert" : ""}">
            <span class="player-avatar">${escapeHtml(player.avatar)}</span>
            <span><strong>${escapeHtml(player.name)}</strong><small>${player.juan ? "JUAN! · 1 card" : `${player.cardCount} cards`}</small></span>
            <span class="mini-deck" aria-hidden="true">${Math.min(player.cardCount, 7)}</span>
          </article>`).join("")}
      </div>
      <section class="game-table juan-table">
        <div class="game-status"><span><strong>${match.roundOver ? "Match complete" : isYourTurn ? `${escapeHtml(yourPlayer?.name || "You")}, your turn` : `${escapeHtml(activePlayer?.name || "Player")} is thinking`}</strong><small>Stock ${match.stockCount} · match color or face</small></span><span class="badge">${escapeHtml(juanDeck.COLOR_NAME[match.activeColor])}</span></div>
        <div class="juan-pile-zone">
          <div class="juan-stock" aria-label="${match.stockCount} cards in stock"><span>JUAN</span><b>${match.stockCount}</b></div>
          <div class="active-pile">${renderJuanCard(match.topCard, 0, { played: true, enter: pileIsNew })}</div>
        </div>
      </section>
      <section class="physical-hand ${isYourTurn ? "your-turn" : ""}">
        <div class="hand-heading"><span><strong>Your hand${yourPlayer?.juan ? " · JUAN!" : ""}</strong><small>${view.hand.length} cards · ${escapeHtml(state.gameSort)} sort</small></span><span class="selection-status ${evaluation.ok ? "valid" : state.selectedCards.size ? "invalid" : ""}">${escapeHtml(evaluation.reason)}</span></div>
        ${juanColorChooser(selectedCard)}
        <div class="game-hand" data-hand-owner="${escapeHtml(handOwner)}" aria-label="Your fanned JUAN hand">${sortedHand.map((card, index) => renderJuanCard(card, index, {
          selectable: isYourTurn && !state.gameActionLock && (!match.drawnCardId || match.drawnCardId === card.id),
          dealt: isDealing,
          turnDrawn: match.drawnCardId === card.id
        })).join("")}</div>
      </section>
      <nav class="game-actions juan-actions">
        <button type="button" data-action="game-hint" ${isYourTurn && !state.gameActionLock ? "" : "disabled"}>Hint</button>
        <button type="button" data-action="game-sort" ${state.gameActionLock ? "disabled" : ""}>Sort</button>
        <button type="button" data-action="game-pass" ${canDraw ? "" : "disabled"}>${hasDrawChoice ? "Keep" : "Draw"}</button>
        <button class="primary" type="button" data-action="game-play" ${isYourTurn && evaluation.ok && !state.gameActionLock ? "" : "disabled"}>▶ Play</button>
      </nav>
      ${match.roundOver ? `
        <div class="round-result juan-result">
          <div><span class="family-kicker">JUAN complete</span><h3>${escapeHtml(match.lastMoveText)}</h3><p>${match.placements.map((seat, index) => `${index + 1}. ${escapeHtml(match.players.find((player) => player.seat === seat)?.name || "Player")}`).join(" · ")}</p></div>
          <button class="action-button" type="button" data-action="leave-game">Return to Cardcade</button>
        </div>` : ""}
    </section>`;
}

function renderHotSeatHandoff() {
  const nextSeat = state.hotSeatSeats.find((seat) => seat.playerId === state.hotSeatPendingPlayerId);
  const match = state.gameView?.state;
  const gameName = state.room?.game?.name || "Cardcade";
  const round = match?.round ? `Round ${match.round}` : "Private table";

  if (state.hotSeatWaitingForCpu) {
    const cpu = match?.players?.find((player) => player.seat === match.activeSeat);
    return `
      <section class="hot-seat-handoff">
        <div class="handoff-panel">
          <span class="family-kicker">Hot Seat · ${escapeHtml(gameName)} · ${escapeHtml(round)}</span>
          <div class="cpu-thinking" aria-hidden="true"><span>CPU</span><i></i><i></i><i></i></div>
          <p class="handoff-instruction">CPU turn</p>
          <h1>${escapeHtml(cpu?.name || "Cardcade CPU")}</h1>
          <p class="handoff-privacy">The human hand is covered while the CPU plays automatically. Cardcade will name the next person when it is time to pass the device.</p>
          <button class="action-button handoff-end" type="button" data-action="close-hot-seat">End table</button>
        </div>
      </section>`;
  }

  if (!nextSeat) {
    return `
      <section class="hot-seat-handoff">
        <div class="handoff-panel">
          <span class="family-kicker">Hot Seat · ${escapeHtml(gameName)}</span>
          <h1>Private seat unavailable.</h1>
          <p>Return to Cardcade and start a new shared-device table.</p>
          <button class="action-button primary" type="button" data-action="close-hot-seat">Return to Cardcade</button>
        </div>
      </section>`;
  }

  return `
    <section class="hot-seat-handoff">
      <div class="handoff-panel">
        <span class="family-kicker">Hot Seat · ${escapeHtml(gameName)} · ${escapeHtml(round)}</span>
        <div class="handoff-card-back" aria-hidden="true"><span>CC</span></div>
        <p class="handoff-instruction">Pass the device to</p>
        <h1>${escapeHtml(nextSeat.name)}</h1>
        <p class="handoff-privacy">Everyone else: look away. The previous hand has been hidden and only ${escapeHtml(nextSeat.name)}'s private seat will reconnect.</p>
        <div class="button-row handoff-actions">
          <button class="action-button" type="button" data-action="close-hot-seat">End table</button>
          <button class="action-button primary" type="button" data-action="reveal-hot-seat">Reveal ${escapeHtml(nextSeat.name)}'s hand</button>
        </div>
      </div>
    </section>`;
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
  const previousHand = captureStandardHandSnapshot();
  const screens = {
    home: renderHome,
    library: renderLibrary,
    "local-lobby": renderLocalLobby,
    multiplayer: renderMultiplayer,
    room: renderRoom,
    game: renderCurrentGame,
    "hot-seat-handoff": renderHotSeatHandoff,
    settings: renderSettings
  };
  document.body.classList.toggle("playing-game", ["game", "hot-seat-handoff"].includes(state.screen));
  document.body.classList.toggle("home-screen", state.screen === "home");
  app.innerHTML = (screens[state.screen] || renderHome)();
  if (state.screen === "game") {
    layoutStandardHand();
    animateStandardHandReflow(previousHand);
  }
}

function renderCurrentGame() {
  return state.room?.gameId === "juan" ? renderJuanGame() : renderStandardGame();
}

function captureStandardHandSnapshot() {
  const hand = app.querySelector(".game-hand");
  if (!hand) return null;
  const cards = [...hand.querySelectorAll("[data-game-card]")];
  return {
    owner: hand.dataset.handOwner || "",
    signature: cards.map((card) => [
      card.dataset.gameCard,
      card.classList.contains("selected") ? "selected" : ""
    ].join(":")).join("|"),
    cards: new Map(cards.map((card) => [card.dataset.gameCard, card.getBoundingClientRect()]))
  };
}

function animateStandardHandReflow(previousHand) {
  const hand = app.querySelector(".game-hand");
  if (!hand || !previousHand || previousHand.owner !== (hand.dataset.handOwner || "")) return;
  const cards = [...hand.querySelectorAll("[data-game-card]")];
  const currentSignature = cards.map((card) => [
    card.dataset.gameCard,
    card.classList.contains("selected") ? "selected" : ""
  ].join(":")).join("|");

  // This shared continuity guard keeps opponent/server updates from moving an
  // unchanged hand even when the surrounding table changes.
  if (currentSignature === previousHand.signature) return;

  const reduceMotion = localStorage.getItem(storageKeys.reducedMotion) === "true"
    || matchMedia("(prefers-reduced-motion: reduce)").matches;
  for (const card of cards) {
    const previousRect = previousHand.cards.get(card.dataset.gameCard);
    if (!previousRect) {
      if (!card.classList.contains("dealt")) card.classList.add("drawn");
      continue;
    }
    if (reduceMotion || typeof card.animate !== "function") continue;
    const nextRect = card.getBoundingClientRect();
    const deltaX = previousRect.left - nextRect.left;
    const deltaY = previousRect.top - nextRect.top;
    if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) continue;
    card.animate(
      [{ translate: `${deltaX}px ${deltaY}px` }, { translate: "0 0" }],
      { duration: 300, easing: "cubic-bezier(.2,.82,.2,1)" }
    );
  }
}

function layoutStandardHand() {
  const hand = app.querySelector(".game-hand");
  if (!hand || !cardPresentation) return;
  const cards = [...hand.querySelectorAll("[data-game-card]")];
  if (!cards.length) return;
  const containerWidth = hand.clientWidth;
  const cardWidth = cards[0].offsetWidth;
  const cardHeight = cards[0].offsetHeight || cardWidth * 1.42;
  if (!containerWidth || !cardWidth) return;
  const compactLandscape = innerWidth > innerHeight && innerHeight <= 640;
  const portraitPhone = innerWidth <= 520 && innerHeight > innerWidth;
  const layout = cardPresentation.calculateFanLayout({
    count: cards.length,
    containerWidth,
    cardWidth,
    cardHeight,
    sidePadding: portraitPhone ? 12 : 8,
    minimumVisibleIndex: Math.max(16, cardWidth * 0.2),
    maximumRotation: compactLandscape ? 8 : 11,
    curveRatio: compactLandscape ? 0.06 : 0.12,
    focusLiftRatio: compactLandscape ? 0.22 : 0.48,
    selectedLiftRatio: compactLandscape ? 0.14 : 0.28
  });
  hand.style.height = `${layout.rowHeight}px`;
  hand.dataset.density = layout.density;
  hand.style.setProperty("--fan-selected-lift", `${layout.selectedLift}px`);
  hand.style.setProperty("--fan-hover-lift", `${Math.max(12, Math.round(cardHeight * 0.13))}px`);
  cards.forEach((card, index) => {
    const position = layout.cards[index];
    card.style.setProperty("--fan-x", `${position.x}px`);
    card.style.setProperty("--fan-y", `${layout.focusLift + position.y}px`);
    card.style.setProperty("--fan-rotation", `${position.rotation}deg`);
    card.style.zIndex = String(position.zIndex);
    card.dataset.fanIndex = String(index);
  });

  // Settle a replacement row without transitions. Subsequent selection and
  // Sort changes are animated by the shared FLIP pass above.
  if (!hand.classList.contains("fan-ready")) {
    void hand.offsetWidth;
    hand.classList.add("fan-ready");
  }

  hand.onclick = (event) => {
    const match = state.gameView?.state;
    const viewer = state.room?.players.find((player) => player.isYou);
    if (state.gameActionLock || !match || match.roundOver || match.activeSeat !== viewer?.seat) return;
    const rects = cards.map((card) => card.getBoundingClientRect());
    const indexRects = cards.map((card) => card.querySelector(".card-corner:not(.bottom)")?.getBoundingClientRect());
    const raised = cards.flatMap((card, index) => state.selectedCards.has(card.dataset.gameCard) ? [index] : []);
    const index = cardPresentation.fanIndexAtPoint(rects, event.clientX, event.clientY, raised, indexRects);
    if (index < 0 || !cards[index]) return;
    event.preventDefault();
    toggleStandardCard(cards[index].dataset.gameCard);
  };
}

function toggleStandardCard(cardId) {
  const match = state.gameView?.state;
  const viewer = state.room?.players.find((player) => player.isYou);
  if (state.gameActionLock || !match || match.roundOver || match.activeSeat !== viewer?.seat) return;
  if (state.room?.gameId === "juan") {
    if (match.drawnCardId && match.drawnCardId !== cardId) return;
    if (state.selectedCards.has(cardId)) state.selectedCards.clear();
    else state.selectedCards = new Set([cardId]);
    state.juanChosenColor = null;
  } else if (state.selectedCards.has(cardId)) state.selectedCards.delete(cardId);
  else state.selectedCards.add(cardId);
  render();
}

function animateStandardHandExit(cardIds, onComplete) {
  const nodes = cardIds
    .map((id) => app.querySelector(`[data-game-card="${CSS.escape(id)}"]`))
    .filter(Boolean);
  if (!nodes.length) { onComplete(); return; }

  app.querySelectorAll('[data-action="game-play"], [data-action="game-pass"]')
    .forEach((button) => { button.disabled = true; });
  const reduceMotion = localStorage.getItem(storageKeys.reducedMotion) === "true"
    || matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pile = app.querySelector(".active-pile");
  const pileRect = pile?.getBoundingClientRect();
  if (reduceMotion || !pileRect || typeof nodes[0].animate !== "function") {
    nodes.forEach((node) => node.classList.add("card-exit"));
    setTimeout(onComplete, 170);
    return;
  }

  nodes.forEach((node, index) => {
    const rect = node.getBoundingClientRect();
    const width = node.offsetWidth || rect.width;
    const height = node.offsetHeight || rect.height;
    const startLeft = rect.left + (rect.width - width) / 2;
    const startTop = rect.top + (rect.height - height) / 2;
    const targetLeft = pileRect.left + pileRect.width / 2 - width / 2
      + (index - (nodes.length - 1) / 2) * Math.min(30, width * 0.28);
    const targetTop = pileRect.top + pileRect.height / 2 - height / 2;
    const startRotation = parseFloat(node.style.getPropertyValue("--fan-rotation")) || 0;
    const endRotation = (index - (nodes.length - 1) / 2) * 5;
    const clone = node.cloneNode(true);
    clone.className = `${clone.className.replace(/\b(selected|dealt|drawn|selectable)\b/g, "").replace(/\s+/g, " ").trim()} card-flight`;
    clone.removeAttribute("data-game-card");
    clone.removeAttribute("data-card-index");
    clone.removeAttribute("aria-pressed");
    clone.style.width = `${width}px`;
    clone.style.height = `${height}px`;
    document.body.appendChild(clone);
    node.classList.add("card-departing");

    const flight = clone.animate([
      { transform: `translate3d(${startLeft}px, ${startTop}px, 0) rotate(${startRotation}deg) scale(1)`, opacity: 1 },
      { offset: 0.72, transform: `translate3d(${targetLeft}px, ${targetTop - 18}px, 0) rotate(${endRotation}deg) scale(.82)`, opacity: 1 },
      { transform: `translate3d(${targetLeft}px, ${targetTop}px, 0) rotate(${endRotation}deg) scale(.7)`, opacity: 0.08 }
    ], {
      duration: 430,
      delay: index * 34,
      easing: "cubic-bezier(.2,.78,.22,1)",
      fill: "forwards"
    });
    if (flight.finished && typeof flight.finished.finally === "function") {
      flight.finished.catch(() => {}).finally(() => clone.remove());
    } else {
      setTimeout(() => clone.remove(), 500 + index * 34);
    }
  });

  setTimeout(onComplete, 430 + Math.max(0, nodes.length - 1) * 34);
}

function navigate(screen) {
  state.screen = screen;
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
  app.focus({ preventScroll: true });
}

function hotSeatSessionForSeat(seatNumber) {
  return state.hotSeatSeats.find((seat) => Number(seat.seat) === Number(seatNumber)) || null;
}

function saveHotSeatSession() {
  if (state.gameMode !== "hot-seat" || !state.room?.code || !state.hotSeatSeats.length) return;
  const fallback = state.hotSeatSeats.find((seat) => seat.role === "host") || state.hotSeatSeats[0];
  const active = state.session?.token ? state.session : fallback;
  localStorage.setItem(storageKeys.room, JSON.stringify({
    code: state.room.code,
    token: active.token,
    playerId: active.playerId,
    mode: "hot-seat",
    hotSeatSeats: state.hotSeatSeats,
    hotSeatPendingPlayerId: state.hotSeatPendingPlayerId
  }));
}

function disconnectRoomSocket() {
  clearTimeout(state.reconnectTimer);
  state.reconnectTimer = null;
  state.reconnectAttempts = 0;
  const socket = state.socket;
  if (!socket) {
    setRoomConnection("idle");
    return;
  }
  socket.cardcadeIntentionalClose = true;
  state.socketIntentionalClose = true;
  state.socket = null;
  socket.close();
  setRoomConnection("idle");
}

function hiddenPrivateView(view) {
  return view ? { ...view, hand: [] } : null;
}

function isHotSeatCpuTurn(view) {
  const match = view?.state;
  if (!match || match.roundOver) return false;
  return match.players?.some((player) => player.seat === match.activeSeat && player.type === "bot") === true;
}

function queueHotSeatCpuTurn({ room = state.room, view = state.gameView } = {}) {
  state.room = room;
  state.gameView = hiddenPrivateView(view);
  state.hotSeatPendingPlayerId = null;
  state.hotSeatWaitingForCpu = true;
  state.selectedCards = new Set();
  state.juanChosenColor = null;
  state.gameActionLock = false;
  state.dealtHandOwners = new Set();
  state.lastPileSignature = null;
  saveHotSeatSession();
  navigate("hot-seat-handoff");
}

function queueHotSeatHandoff(seatNumber, { room = state.room, view = state.gameView } = {}) {
  const nextSeat = hotSeatSessionForSeat(seatNumber);
  if (!nextSeat) return false;
  disconnectRoomSocket();
  state.room = room;
  state.gameView = hiddenPrivateView(view);
  state.hotSeatPendingPlayerId = nextSeat.playerId;
  state.hotSeatWaitingForCpu = false;
  state.selectedCards = new Set();
  state.juanChosenColor = null;
  state.gameActionLock = false;
  state.dealtHandOwners = new Set();
  state.lastPileSignature = null;
  saveHotSeatSession();
  navigate("hot-seat-handoff");
  return true;
}

function beginHotSeatSession(session) {
  state.gameMode = "hot-seat";
  state.hotSeatSeats = session.hotSeat?.seats || [];
  state.session = { code: session.code, token: session.token, playerId: session.playerId, mode: "hot-seat" };
  state.room = session.room;
  state.gameView = hiddenPrivateView(session.game?.view);
  state.hotSeatForceHandoff = false;
  state.hotSeatWaitingForCpu = false;
  state.gameSort = session.game?.gameId === "juan" ? juanGameAdapter.defaultSort : "rank";
  const targetSeat = hotSeatFlow?.requiredSeat(session.game?.view?.state, state.hotSeatSeats);
  if (isHotSeatCpuTurn(session.game?.view)) {
    connectRoom(state.session);
    queueHotSeatCpuTurn({ room: session.room, view: session.game?.view });
    return;
  }
  if (!queueHotSeatHandoff(targetSeat, { room: session.room, view: session.game?.view })) {
    throw new Error("Cardcade could not identify the first private Hot Seat turn.");
  }
}

async function revealHotSeatHand() {
  const nextSeat = state.hotSeatSeats.find((seat) => seat.playerId === state.hotSeatPendingPlayerId);
  if (!nextSeat || !state.room?.code) throw new Error("That private Hot Seat session is unavailable.");
  const session = await api(`/api/rooms/${encodeURIComponent(state.room.code)}/reconnect`, {
    method: "POST",
    body: JSON.stringify({ token: nextSeat.token })
  });
  if (!session.game?.view) throw new Error("That Hot Seat table is no longer in play.");

  state.session = { code: session.code, token: nextSeat.token, playerId: nextSeat.playerId, mode: "hot-seat" };
  state.room = session.room;
  state.gameView = session.game.view;
  state.hotSeatPendingPlayerId = null;
  state.hotSeatWaitingForCpu = false;
  state.selectedCards = new Set();
  state.juanChosenColor = null;
  state.gameActionLock = false;
  state.dealtHandOwners = new Set();
  state.lastPileSignature = null;
  saveHotSeatSession();
  connectRoom(state.session);
  navigate("game");
}

function clearGameSession() {
  disconnectRoomSocket();
  localStorage.removeItem(storageKeys.room);
  state.session = null;
  state.room = null;
  state.gameView = null;
  state.gameMode = null;
  state.hotSeatSeats = [];
  state.hotSeatPendingPlayerId = null;
  state.hotSeatForceHandoff = false;
  state.hotSeatWaitingForCpu = false;
  state.selectedCards = new Set();
  state.juanChosenColor = null;
  state.gameActionLock = false;
  state.dealtHandOwners = new Set();
  state.lastPileSignature = null;
}

async function closeHotSeatTable() {
  const roomCode = state.room?.code || state.session?.code;
  const host = state.hotSeatSeats.find((seat) => seat.role === "host");
  if (roomCode && host?.token) {
    disconnectRoomSocket();
    await api(`/api/hot-seat/${encodeURIComponent(roomCode)}/close`, {
      method: "POST",
      body: JSON.stringify({ token: host.token })
    });
  }
  clearGameSession();
  state.mode = null;
  state.selectedGameId = null;
  navigate("home");
}

function sendRoom(message) {
  if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
    showToast("The room is reconnecting. Try again in a moment.");
    return false;
  }
  state.socket.send(JSON.stringify(message));
  return true;
}

function roomReconnectEligible() {
  if (!state.session || state.socketIntentionalClose) return false;
  if (["room", "game"].includes(state.screen)) return true;
  return state.screen === "hot-seat-handoff" && state.hotSeatWaitingForCpu;
}

function scheduleRoomReconnect(delayOverride = null) {
  if (!roomReconnectEligible() || state.reconnectTimer) return;
  if (state.socket && [WebSocket.CONNECTING, WebSocket.OPEN].includes(state.socket.readyState)) return;
  setRoomConnection("reconnecting");
  const delay = delayOverride ?? Math.min(10_000, 750 * (2 ** state.reconnectAttempts));
  state.reconnectAttempts += 1;
  state.reconnectTimer = setTimeout(() => {
    state.reconnectTimer = null;
    if (!navigator.onLine || !roomReconnectEligible()) return;
    connectRoom(state.session);
  }, delay);
}

function connectRoom(session) {
  clearTimeout(state.reconnectTimer);
  state.reconnectTimer = null;
  state.socketIntentionalClose = false;
  if (!navigator.onLine) {
    setRoomConnection("reconnecting");
    scheduleRoomReconnect();
    return;
  }
  if (state.socket) {
    state.socket.cardcadeIntentionalClose = true;
    state.socketIntentionalClose = true;
    state.socket.close();
  }
  state.socketIntentionalClose = false;
  setRoomConnection("reconnecting");
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(`${protocol}//${location.host}/ws`);
  state.socket = socket;
  socket.addEventListener("open", () => {
    socket.send(JSON.stringify({ type: "authenticate", code: session.code, token: session.token }));
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (["room_state", "game_state"].includes(message.type)) {
      state.reconnectAttempts = 0;
      setRoomConnection("connected");
    }
    if (message.type === "room_state") {
      state.room = message.room;
      if (message.room.phase === "configuring" && state.screen === "game") {
        state.gameView = null;
        state.selectedCards = new Set();
        state.juanChosenColor = null;
        state.gameActionLock = false;
        state.dealtHandOwners = new Set();
        state.lastPileSignature = null;
        navigate("room");
      } else if (state.screen === "room") render();
    } else if (message.type === "game_state" && supportsGame(message.gameId)) {
      if (state.gameMode === "hot-seat" && state.hotSeatPendingPlayerId) return;
      if (state.gameMode === "hot-seat") {
        const viewer = message.room.players.find((player) => player.isYou);
        const requiredSeat = hotSeatFlow?.requiredSeat(message.view?.state, state.hotSeatSeats);
        const forceHandoff = state.hotSeatForceHandoff;
        state.hotSeatForceHandoff = false;
        if (isHotSeatCpuTurn(message.view)) {
          queueHotSeatCpuTurn({ room: message.room, view: message.view });
          return;
        }
        if (Number.isInteger(requiredSeat) && (Number(viewer?.seat) !== requiredSeat || forceHandoff || state.hotSeatWaitingForCpu)) {
          queueHotSeatHandoff(requiredSeat, { room: message.room, view: message.view });
          return;
        }
        state.hotSeatWaitingForCpu = false;
      }
      const previousGameId = state.room?.gameId;
      const previousRound = state.gameView?.state?.round;
      const incomingRound = message.view?.state?.round;
      if (previousGameId !== message.gameId || previousRound !== incomingRound) {
        state.dealtHandOwners = new Set();
        state.lastPileSignature = null;
      }
      if (message.gameId === "juan" && !juanGameAdapter.sortModes.includes(state.gameSort)) state.gameSort = juanGameAdapter.defaultSort;
      if (standardGameAdapters[message.gameId] && !["rank", "combo", "suit"].includes(state.gameSort)) state.gameSort = "rank";
      state.room = message.room;
      state.gameView = message.view;
      state.gameActionLock = false;
      const handIds = new Set(message.view.hand.map((card) => card.id));
      state.selectedCards = new Set([...state.selectedCards].filter((cardId) => handIds.has(cardId)));
      if (!state.selectedCards.size) state.juanChosenColor = null;
      state.screen = "game";
      render();
    } else if (message.type === "table_closed") {
      clearGameSession();
      navigate("home");
      showToast("The Hot Seat table was closed.");
    } else if (message.type === "error") {
      state.gameActionLock = false;
      state.hotSeatForceHandoff = false;
      showToast(message.error?.message || "The room rejected that action.");
      if (state.screen === "game") render();
    }
  });
  socket.addEventListener("close", () => {
    if (state.socket === socket) state.socket = null;
    if (!socket.cardcadeIntentionalClose && !state.socketIntentionalClose && roomReconnectEligible()) {
      if (navigator.onLine) showToast("Table connection interrupted. Cardcade is reconnecting.");
      scheduleRoomReconnect();
    }
  });
}

function enterRoom(session) {
  state.gameMode = session.mode || "multiplayer";
  state.session = { code: session.code, token: session.token, playerId: session.playerId, mode: state.gameMode };
  state.room = session.room;
  localStorage.setItem(storageKeys.room, JSON.stringify(state.session));
  connectRoom(state.session);
  navigate("room");
}

function enterGameSession(session, mode) {
  state.session = { code: session.code, token: session.token, playerId: session.playerId, mode };
  state.room = session.room;
  state.gameView = session.game?.view || null;
  state.gameMode = mode;
  state.selectedCards = new Set();
  state.juanChosenColor = null;
  state.gameSort = session.game?.gameId === "juan" ? juanGameAdapter.defaultSort : "rank";
  state.gameActionLock = false;
  state.dealtHandOwners = new Set();
  state.lastPileSignature = null;
  localStorage.setItem(storageKeys.room, JSON.stringify(state.session));
  connectRoom(state.session);
  navigate("game");
}

async function resumeRoom() {
  const saved = JSON.parse(localStorage.getItem(storageKeys.room) || "null");
  if (!saved) return;
  try {
    if (saved.mode === "hot-seat" && Array.isArray(saved.hotSeatSeats) && saved.hotSeatSeats.length) {
      state.gameMode = "hot-seat";
      state.hotSeatSeats = saved.hotSeatSeats;
      const requested = saved.hotSeatSeats.find((seat) => seat.playerId === saved.hotSeatPendingPlayerId)
        || saved.hotSeatSeats.find((seat) => seat.playerId === saved.playerId)
        || saved.hotSeatSeats.find((seat) => seat.role === "host")
        || saved.hotSeatSeats[0];
      const session = await api(`/api/rooms/${encodeURIComponent(saved.code)}/reconnect`, {
        method: "POST",
        body: JSON.stringify({ token: requested.token })
      });
      if (!session.game?.view) throw new Error("That Hot Seat table is no longer in play.");
      state.session = { code: saved.code, token: requested.token, playerId: requested.playerId, mode: "hot-seat" };
      state.room = session.room;
      state.gameView = hiddenPrivateView(session.game.view);
      const requiredSeat = hotSeatFlow?.requiredSeat(session.game.view.state, state.hotSeatSeats);
      if (isHotSeatCpuTurn(session.game.view)) {
        connectRoom(state.session);
        queueHotSeatCpuTurn({ room: session.room, view: session.game.view });
        return;
      }
      if (!queueHotSeatHandoff(requiredSeat ?? requested.seat, { room: session.room, view: session.game.view })) {
        throw new Error("Cardcade could not restore the next private Hot Seat turn.");
      }
      return;
    }

    const session = await api(`/api/rooms/${encodeURIComponent(saved.code)}/reconnect`, { method: "POST", body: JSON.stringify({ token: saved.token }) });
    if (supportsGame(session.game?.gameId)) enterGameSession({ ...session, token: saved.token }, saved.mode || "multiplayer");
    else enterRoom({ ...session, token: saved.token, mode: saved.mode });
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

  if (action === "install-pwa") await requestAppInstall();
  if (action === "dismiss-install-help") {
    if (typeof installDialog?.close === "function") installDialog.close();
    else installDialog?.removeAttribute("open");
  }
  if (action === "apply-app-update") {
    const waiting = pwaState.serviceWorkerRegistration?.waiting;
    if (!waiting) {
      pwaState.serviceWorkerRegistration?.update().catch(() => {});
      showToast("Cardcade is checking for the latest build.");
    } else {
      button.disabled = true;
      pwaState.updateRequested = true;
      waiting.postMessage({ type: "SKIP_WAITING" });
    }
  }
  if (action === "home") navigate("home");
  if (action === "open-solo") { state.mode = "solo"; state.selectedGameId = null; navigate("library"); }
  if (action === "open-hot-seat") {
    state.mode = "hot-seat";
    state.selectedGameId = null;
    state.hotSeatPlayerCount = 1;
    state.hotSeatBots = 2;
    state.hotSeatNames = [];
    navigate("library");
  }
  if (action === "open-multiplayer") navigate("multiplayer");
  if (action === "open-settings") navigate("settings");
  if (action === "back-to-library") navigate("library");
  if (action === "multiplayer-tab") { state.multiplayerTab = button.dataset.tab; render(); }
  if (action === "select-local-game") { state.selectedGameId = button.dataset.gameId; navigate("local-lobby"); }
  if (action === "local-bot-down") { state.localBots = Math.max(0, state.localBots - 1); render(); }
  if (action === "local-bot-up") { state.localBots += 1; render(); }
  if (action === "hot-seat-player-down") {
    captureHotSeatNames();
    const game = selectedGame();
    if (state.hotSeatPlayerCount > 1) {
      state.hotSeatPlayerCount -= 1;
      state.hotSeatBots += 1;
    }
    if (game) ensureHotSeatSetup(game);
    render();
  }
  if (action === "hot-seat-player-up") {
    captureHotSeatNames();
    const game = selectedGame();
    if (game && state.hotSeatPlayerCount < game.players.max) {
      state.hotSeatPlayerCount += 1;
      if (state.hotSeatBots > 0) state.hotSeatBots -= 1;
    }
    if (game) ensureHotSeatSetup(game);
    render();
  }
  if (action === "hot-seat-bot-down") {
    captureHotSeatNames();
    const game = selectedGame();
    if (game && state.hotSeatBots > 0 && state.hotSeatPlayerCount + state.hotSeatBots > game.players.min) {
      state.hotSeatBots -= 1;
    }
    render();
  }
  if (action === "hot-seat-bot-up") {
    captureHotSeatNames();
    const game = selectedGame();
    if (game && state.hotSeatPlayerCount + state.hotSeatBots < game.players.max) {
      state.hotSeatBots += 1;
    }
    render();
  }
  if (action === "start-local-game") {
    const name = savePlayerName(document.querySelector("#local-name")?.value || playerName());
    button.disabled = true;
    try {
      const session = await api(`/api/solo/${encodeURIComponent(state.selectedGameId)}`, { method: "POST", body: JSON.stringify({ name, botCount: state.localBots }) });
      enterGameSession(session, "solo");
    } catch (error) {
      showToast(error.message);
      button.disabled = false;
    }
  }
  if (action === "start-hot-seat") {
    captureHotSeatNames();
    const names = state.hotSeatNames.map((name) => String(name || "").trim());
    if (names.some((name) => !name)) {
      showToast("Give every Hot Seat player a name.");
      return;
    }
    if (new Set(names.map((name) => name.toLocaleLowerCase())).size !== names.length) {
      showToast("Each Hot Seat player needs a different name.");
      return;
    }
    savePlayerName(names[0]);
    button.disabled = true;
    try {
      const session = await api(`/api/hot-seat/${encodeURIComponent(state.selectedGameId)}`, {
        method: "POST",
        body: JSON.stringify({ players: names, botCount: state.hotSeatBots })
      });
      beginHotSeatSession(session);
    } catch (error) {
      showToast(error.message);
      button.disabled = false;
    }
  }
  if (action === "reveal-hot-seat") {
    button.disabled = true;
    try {
      await revealHotSeatHand();
    } catch (error) {
      showToast(error.message);
      button.disabled = false;
    }
  }
  if (action === "close-hot-seat") {
    button.disabled = true;
    try {
      await closeHotSeatTable();
    } catch (error) {
      showToast(error.message);
      button.disabled = false;
    }
  }
  if (action === "select-room-game") sendRoom({ type: "select_game", gameId: button.dataset.gameId });
  if (action === "room-bot-down") sendRoom({ type: "set_bot_count", botCount: Math.max(0, state.room.gameSettings.botCount - 1) });
  if (action === "room-bot-up") sendRoom({ type: "set_bot_count", botCount: state.room.gameSettings.botCount + 1 });
  if (action === "toggle-ready") {
    const you = state.room.players.find((player) => player.isYou);
    sendRoom({ type: "set_ready", ready: !you?.ready });
  }
  if (action === "start-room") sendRoom({ type: "start_game" });
  if (action === "not-playable-yet") showToast("That game mode has not been migrated yet.");
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
  if (action === "choose-juan-color") {
    if (!juanDeck?.COLORS.includes(button.dataset.color)) return;
    state.juanChosenColor = button.dataset.color;
    render();
  }
  if (action === "game-sort") {
    if (state.gameActionLock) return;
    const modes = state.room?.gameId === "juan" ? juanGameAdapter.sortModes : ["rank", "combo", "suit"];
    state.gameSort = modes[(modes.indexOf(state.gameSort) + 1) % modes.length];
    render();
  }
  if (action === "game-hint") {
    if (state.gameActionLock) return;
    const match = state.gameView.state;
    if (state.room?.gameId === "juan") {
      const candidateHand = match.drawnCardId
        ? state.gameView.hand.filter((card) => card.id === match.drawnCardId)
        : state.gameView.hand;
      const legal = juanRules.getLegalCards(candidateHand, match.topCard, match.activeColor);
      if (!legal.length) showToast(juanGameAdapter.noMoveText);
      else {
        const choice = legal.slice().sort((left, right) => juanRules.moveCost(left, state.gameView.hand) - juanRules.moveCost(right, state.gameView.hand))[0];
        state.selectedCards = new Set([choice.id]);
        state.juanChosenColor = choice.kind === "prism" || choice.kind === "prism-burst"
          ? juanRules.chooseColor(state.gameView.hand.filter((card) => card.id !== choice.id))
          : null;
        render();
      }
      return;
    }
    const game = currentStandardGame();
    if (!game) return;
    const moves = legalMovesForGame(game, match);
    if (!moves.length) showToast(game.noMoveText);
    else {
      const hintPlayer = { hand: state.gameView.hand, style: "human" };
      const move = moves.slice().sort((left, right) => game.rules.moveCost(left, hintPlayer) - game.rules.moveCost(right, hintPlayer))[0];
      state.selectedCards = new Set(move.cards.map((card) => card.id));
      render();
    }
  }
  if (action === "game-play") {
    if (state.gameActionLock) return;
    const cardIds = [...state.selectedCards];
    const evaluation = state.room?.gameId === "juan" ? juanSelection() : gameSelection();
    if (!cardIds.length || !evaluation.ok) return;
    state.gameActionLock = true;
    animateStandardHandExit(cardIds, () => {
      state.selectedCards.clear();
      const message = state.room?.gameId === "juan"
        ? { type: "play", cardId: cardIds[0], chosenColor: state.juanChosenColor }
        : { type: "play", cardIds };
      state.juanChosenColor = null;
      if (!sendRoom(message)) {
        state.gameActionLock = false;
        render();
      }
    });
  }
  if (action === "game-pass") {
    if (state.gameActionLock) return;
    state.gameActionLock = true;
    const isJuan = state.room?.gameId === "juan";
    const message = isJuan
      ? { type: state.gameView?.state?.drawnCardId ? "end_turn" : "draw" }
      : { type: "pass" };
    if (isJuan) {
      state.selectedCards.clear();
      state.juanChosenColor = null;
    }
    if (!sendRoom(message)) {
      state.gameActionLock = false;
      render();
    }
  }
  if (action === "next-round") {
    state.selectedCards.clear();
    if (state.gameMode === "hot-seat") state.hotSeatForceHandoff = true;
    if (!sendRoom({ type: "next_round" })) state.hotSeatForceHandoff = false;
  }
  if (action === "mercy-take-win") sendRoom({ type: "mercy_choice", accept: false });
  if (action === "mercy-double") sendRoom({ type: "mercy_choice", accept: true });
  if (action === "leave-game") {
    if (state.gameMode === "hot-seat") {
      try {
        await closeHotSeatTable();
      } catch (error) {
        showToast(error.message);
      }
      return;
    }
    if (state.gameMode === "multiplayer") {
      const you = state.room?.players.find((player) => player.isYou);
      if (you?.role !== "host") {
        showToast("Only the room host can return the table to game selection.");
        return;
      }
      state.gameActionLock = true;
      if (!sendRoom({ type: "return_to_lobby" })) {
        state.gameActionLock = false;
        render();
      }
      return;
    }
    sendRoom({ type: "leave_room" });
    state.socketIntentionalClose = true;
    state.socket?.close();
    localStorage.removeItem(storageKeys.room);
    const destination = state.gameMode === "solo" ? "home" : "multiplayer";
    state.session = null;
    state.room = null;
    state.gameView = null;
    state.selectedCards = new Set();
    state.juanChosenColor = null;
    state.gameActionLock = false;
    state.dealtHandOwners = new Set();
    state.lastPileSignature = null;
    navigate(destination);
  }
});

document.addEventListener("keydown", (event) => {
  const card = event.target.closest?.("[data-game-card]");
  if (!card || !["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  toggleStandardCard(card.dataset.gameCard);
});

window.addEventListener("resize", () => {
  if (state.screen === "game") requestAnimationFrame(layoutStandardHand);
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
  setupPwaShell();
  try {
    state.catalog = await api("/api/catalog");
    render();
  } catch (error) {
    app.innerHTML = `<div class="empty-state"><h2>Cardcade could not start.</h2><p class="error-text">${escapeHtml(error.message)}</p></div>`;
  }
}

boot();
