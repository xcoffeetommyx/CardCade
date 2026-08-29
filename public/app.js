const app = document.querySelector("#app");
const toast = document.querySelector("#toast");
const installButton = document.querySelector("#install-button");
const installDialog = document.querySelector("#install-dialog");
const installDialogCopy = document.querySelector("#install-dialog-copy");
const networkStatus = document.querySelector("#network-status");
const systemBanner = document.querySelector("#system-banner");
const systemBannerMessage = document.querySelector("#system-banner-message");
const systemBannerAction = systemBanner?.querySelector('[data-action="apply-app-update"]');
const juanPrismRevealRoot = document.querySelector("#juan-prism-reveal-root");
const controllerKeyboardRoot = document.querySelector("#controller-keyboard-root");
const controllerCursor = document.querySelector("#controller-cursor");

const appBasePath = new URL(document.baseURI).pathname.replace(/\/+$/, "") || "";

function appPath(path) {
  return `${appBasePath}${path.startsWith("/") ? path : `/${path}`}`;
}

const storageKeys = {
  name: "cardcade.playerName.v1",
  room: "cardcade.roomSession.v1",
  reducedMotion: "cardcade.reducedMotion.v1",
  appearance: "cardcade.appearance.v1"
};

const state = {
  screen: "home",
  catalog: { families: [] },
  mode: null,
  multiplayerTab: "host",
  selectedGameId: null,
  selectedDeckFamilyId: null,
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
  juanPrismReveal: null,
  juanPrismRevealTimer: null,
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
  updateRequested: false,
  updateReloading: false
};

const threeSevenRules = globalThis.ThreeSevenRules;
const thirteenRules = globalThis.ThirteenRules;
const cardPresentation = globalThis.CardcadePresentation;
const cardSkins = globalThis.CardcadeCardSkins;
const standard52 = globalThis.CardcadeStandard52;
const hotSeatFlow = globalThis.CardcadeHotSeat;
const juanDeck = globalThis.CardcadeJuanDeck;
const juanRules = globalThis.JuanRules;
const blackjackRules = globalThis.CardcadeBlackjackRules;
const holdemRules = globalThis.CardcadeHoldemRules;
const fiveCardDrawRules = globalThis.CardcadeFiveCardDrawRules;
const controllerInput = globalThis.CardcadeControllerInput;
let appearancePreferences = loadAppearancePreferences();

const controllerState = {
  cursorX: Math.round(innerWidth / 2),
  cursorY: Math.round(innerHeight / 2),
  active: false,
  input: null,
  hoveredTarget: null
};

const controllerTextState = {
  inputId: "",
  value: "",
  originalValue: "",
  uppercase: false,
  roomCode: false
};

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
  return Boolean(standardGameAdapters[gameId]) || gameId === "juan" || gameId === "blackjack" || gameId === "holdem" || gameId === "five-card-draw";
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

function loadAppearancePreferences() {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKeys.appearance) || "null");
    return cardSkins.normalizeAppearance(stored);
  } catch {
    return cardSkins.normalizeAppearance();
  }
}

function saveAppearancePreferences({ skins: requestedSkins, tableSkin: requestedTableSkin = null, legacyMode = false }) {
  appearancePreferences = cardSkins.normalizeAppearance({
    version: cardSkins.APPEARANCE_VERSION,
    skins: requestedSkins,
    tableSkin: requestedTableSkin,
    legacyMode
  });
  localStorage.setItem(storageKeys.appearance, JSON.stringify(appearancePreferences));
  return appearancePreferences;
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
    response = await fetch(appPath(path), {
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

function reloadAfterAppUpdate() {
  if (!pwaState.updateRequested || pwaState.updateReloading) return;
  pwaState.updateRequested = false;
  pwaState.updateReloading = true;
  pwaState.updateAvailable = false;
  renderShellStatus();
  location.reload();
}

function restoreAppUpdateButton(button, message) {
  pwaState.updateRequested = false;
  pwaState.updateReloading = false;
  pwaState.updateAvailable = true;
  if (button) button.disabled = false;
  renderShellStatus();
  if (message) showToast(message);
}

function activateWaitingWorker(registration, button) {
  const waiting = registration?.waiting;
  if (!waiting) return false;

  pwaState.updateRequested = true;
  if (button) button.disabled = true;
  const onStateChange = () => {
    if (waiting.state === "activated") {
      waiting.removeEventListener("statechange", onStateChange);
      reloadAfterAppUpdate();
    } else if (waiting.state === "redundant") {
      waiting.removeEventListener("statechange", onStateChange);
      restoreAppUpdateButton(button, "Cardcade could not apply that update. Try again.");
    }
  };
  waiting.addEventListener("statechange", onStateChange);
  waiting.postMessage({ type: "SKIP_WAITING" });

  // A few mobile browsers do not deliver controllerchange reliably. Give the
  // worker time to activate, then reload so the old page can release control
  // and the waiting worker can take over.
  setTimeout(() => {
    if (!pwaState.updateRequested || pwaState.updateReloading) return;
    reloadAfterAppUpdate();
  }, 3_000);
  return true;
}

async function registerCardcadeServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.register(appPath("/sw.js"));
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
    reloadAfterAppUpdate();
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

function compatibleDeckFamilies(mode) {
  return state.catalog.families
    .map((family) => ({
      ...family,
      games: family.games.filter((game) => game.modes.includes(mode))
    }))
    .filter((family) => family.games.length);
}

function selectedDeckFamily(mode, preferredId = state.selectedDeckFamilyId) {
  const families = compatibleDeckFamilies(mode);
  return families.find((family) => family.id === preferredId) || families[0] || null;
}

function setDeckFamilyForMode(mode, preferredId = null) {
  state.selectedDeckFamilyId = selectedDeckFamily(mode, preferredId)?.id || null;
}

function deckFamilyMark(family) {
  if (family.id === "standard-52") return "♠";
  if (family.id === "color-action") return "✦";
  return "▣";
}

function deckFamilyPicker(mode, { compact = false, selectedGameId = null } = {}) {
  const families = compatibleDeckFamilies(mode);
  const selectedGameFamilyId = selectedGameId
    ? families.find((family) => family.games.some((game) => game.id === selectedGameId))?.id
    : null;
  const activeFamily = selectedDeckFamily(mode, state.selectedDeckFamilyId || selectedGameFamilyId);
  if (!activeFamily) return "";
  const prefix = compact ? "Choose a deck family" : "Step 1 · Choose a deck family";
  return `
    <div class="deck-family-picker ${compact ? "compact" : ""}">
      <p class="library-step">${prefix}</p>
      <div class="deck-family-rail" aria-label="Deck families">
        ${families.map((family) => {
          const active = family.id === activeFamily.id;
          return `
            <button class="deck-family-button ${active ? "active" : ""}" type="button" data-action="select-deck-family" data-family-id="${escapeHtml(family.id)}" aria-pressed="${active}">
              <span class="deck-family-mark" data-family="${escapeHtml(family.id)}" aria-hidden="true">${deckFamilyMark(family)}</span>
              <span class="deck-family-copy"><strong>${escapeHtml(family.name)}</strong><small>${escapeHtml(family.shortName)} · ${family.games.length} game${family.games.length === 1 ? "" : "s"}</small></span>
              <span class="deck-family-arrow" aria-hidden="true">${active ? "●" : "›"}</span>
            </button>`;
        }).join("")}
      </div>
    </div>`;
}

function compactGameCard(game, selectedGameId) {
  const isPlanned = game.status === "planned";
  return `
    <button class="compact-game ${selectedGameId === game.id ? "selected" : ""}" type="button" data-action="select-room-game" data-game-id="${escapeHtml(game.id)}" data-accent="${escapeHtml(game.accent)}" ${isPlanned ? "disabled" : ""}>
      <span class="compact-game-mark" aria-hidden="true">${game.deckFamilyId === "standard-52" ? "A♠" : "✦"}</span>
      <span class="compact-game-copy"><strong>${escapeHtml(game.name)}</strong><small>${escapeHtml(game.eyebrow)}</small></span>
      <span class="badge">${escapeHtml(statusLabel(game.status))}</span>
    </button>`;
}

function catalogMarkup(mode, { compact = false, selectedGameId = null } = {}) {
  const selectedGameFamilyId = selectedGameId
    ? compatibleDeckFamilies(mode).find((candidate) => candidate.games.some((game) => game.id === selectedGameId))?.id
    : null;
  const family = selectedDeckFamily(mode, state.selectedDeckFamilyId || selectedGameFamilyId);
  if (!family) return `<div class="empty-state">No games support this mode yet.</div>`;

  const matchingGames = family.games.filter((game) => game.modes.includes(mode));
  return `
    <section class="game-library ${compact ? "compact-game-library" : ""}">
      ${deckFamilyPicker(mode, { compact, selectedGameId })}
      <div class="library-family-heading">
        <div>
          <span class="library-step">${compact ? "Choose a game" : "Step 2 · Choose a game"}</span>
          <span class="family-kicker">${escapeHtml(family.shortName)}</span>
          <h3>${escapeHtml(family.name)}</h3>
        </div>
        <p>${escapeHtml(family.description)}</p>
      </div>
      <div class="${compact ? "compact-games" : "game-grid library-game-grid"}">
        ${matchingGames.map((game) => compact
          ? compactGameCard(game, selectedGameId)
          : gameCard(game, mode === "multiplayer" ? "multiplayer" : "local")
        ).join("")}
      </div>
    </section>`;
}

function renderHome() {
  return `
    <section class="home-grid">
      <div class="home-copy">
        <h1>Every table starts here.</h1>
        <p class="lede">Pick a game, gather around one room code, and handle cards that feel like physical objects—not tiny buttons in a panel.</p>
        <div class="home-actions mode-launcher">
          <button class="arcade-button primary" type="button" data-action="open-solo">
            <span class="button-icon">▶</span><span><span class="button-label">Single / Solo</span><span class="button-copy">Choose a game and fill seats with smart rivals</span></span><span class="button-arrow">›</span>
          </button>
          <button class="arcade-button" type="button" data-action="open-hot-seat">
            <span class="button-icon">▣</span><span><span class="button-label">Hot Seat</span><span class="button-copy">Pass one device around a private table</span></span><span class="button-arrow">›</span>
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
    ${screenHeader(`${modeName} library`, "Choose a deck family first, then pick the game for this table.", "home")}
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
  return catalogMarkup("multiplayer", { compact: true, selectedGameId: room.gameId });
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

function placementForPlayer(match, player) {
  const explicitPlace = Number(player?.place);
  if (Number.isInteger(explicitPlace) && explicitPlace > 0) return explicitPlace;
  const placementIndex = Array.isArray(match?.placements) ? match.placements.indexOf(player?.seat) : -1;
  return placementIndex >= 0 ? placementIndex + 1 : null;
}

function placementClassFor(place) {
  if (place === 1) return "placement-first";
  if (place === 2) return "placement-second";
  if (place === 3) return "placement-third";
  return "";
}

function renderStandardFinalStandings(match) {
  const seatOrder = Array.isArray(match.finalStandings) && match.finalStandings.length
    ? match.finalStandings
    : match.players
      .slice()
      .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))
      .map((player) => player.seat);
  const winnerSeats = new Set(Array.isArray(match.winners) ? match.winners : []);
  return `<ol class="final-standings">${seatOrder.map((seat, index) => {
    const player = match.players.find((candidate) => candidate.seat === seat);
    const winner = winnerSeats.has(seat);
    const score = Number.isFinite(player?.score) ? player.score : 0;
    return `<li class="${winner ? "winner" : ""}"><span>${index + 1}</span><strong>${escapeHtml(player?.name || "Player")}</strong><small>${score} pts${winner ? " · Winner" : ""}</small></li>`;
  }).join("")}</ol>`;
}

function playedCardStyle(index, { animate = false, dealt = false } = {}) {
  const declarations = [];
  if (animate || dealt) declarations.push(`animation-delay:${Math.min(index, dealt ? 12 : 5) * (dealt ? 24 : 35)}ms`);
  return declarations.length ? `style="${declarations.join(";")}"` : "";
}

function deckFamilyIdForGame(gameId = state.room?.gameId) {
  for (const family of state.catalog.families || []) {
    if (family.games?.some((game) => game.id === gameId)) return family.id;
  }
  return gameId === "juan" ? "color-action" : "standard-52";
}

function selectedCardSkin(deckFamilyId) {
  return cardSkins?.resolveSkin(deckFamilyId, appearancePreferences.skins[deckFamilyId]) || null;
}

function selectedTableSkin() {
  return cardSkins?.resolveTableSkin(appearancePreferences.tableSkin) || null;
}

function activeTableAppearanceClass() {
  return selectedTableSkin()?.className || "table-skin-classic-green";
}

function standardLegacyModeEnabled() {
  return appearancePreferences.legacyMode === true
    && deckFamilyIdForGame() === "standard-52";
}

function activeCardAppearanceClass(deckFamilyId) {
  if (deckFamilyId === "standard-52" && appearancePreferences.legacyMode === true) {
    return "card-style-legacy-standard";
  }
  return selectedCardSkin(deckFamilyId)?.className || "";
}

function standardHandAriaLabel(fannedLabel, legacyLabel) {
  return appearancePreferences.legacyMode === true ? legacyLabel : fannedLabel;
}

function renderCardBack({
  deckFamilyId,
  context,
  skinId = null,
  className = "",
  ariaLabel = "",
  ariaHidden = false,
  attributes = "",
  parts = []
}) {
  const skin = skinId ? cardSkins?.resolveSkin(deckFamilyId, skinId) : null;
  const classes = [
    "card-back",
    skin?.className || activeCardAppearanceClass(deckFamilyId),
    `card-back-family-${deckFamilyId}`,
    `card-back-context-${context}`,
    className
  ].filter(Boolean).join(" ");
  const accessibility = ariaHidden
    ? 'aria-hidden="true"'
    : `aria-label="${escapeHtml(ariaLabel)}"`;
  const content = parts.map(({ tag = null, text = "", ariaHidden: partHidden = false }) => {
    const escaped = escapeHtml(text);
    if (!tag) return escaped;
    const safeTag = ["b", "i", "span", "strong"].includes(tag) ? tag : "span";
    return `<${safeTag}${partHidden ? ' aria-hidden="true"' : ""}>${escaped}</${safeTag}>`;
  }).join("");
  return `<span class="${classes}" ${attributes} ${accessibility}>${content}</span>`;
}

function renderMiniCardBack(deckFamilyId, count, { ariaLabel = "", ariaHidden = false } = {}) {
  return renderCardBack({
    deckFamilyId,
    context: "opponent-mini",
    className: "mini-deck",
    ariaLabel,
    ariaHidden,
    parts: [{ text: count }]
  });
}

function juanCornerFace(card) {
  if (card.kind === "number") return String(card.value);
  return {
    pause: "Ⅱ",
    turnabout: "↺",
    "double-draw": "+2",
    prism: "✦",
    "prism-burst": "+4"
  }[card.kind] || "?";
}

function renderSeatLastCard(player, gameId) {
  const card = player.lastPlayedCard
    || (player.lastPlay?.kind === "play" ? player.lastPlay.cards?.at(-1) : null);
  if (!card) {
    return `<span class="seat-last-card empty" aria-label="No card played yet"><i aria-hidden="true"></i></span>`;
  }
  if (gameId === "juan") {
    const isNumber = card.kind === "number";
    const face = juanCornerFace(card);
    const colorClass = card.color ? `juan-${card.color}` : "juan-prism";
    return `<span class="seat-last-card juan-seat-card card-skin-face ${selectedCardSkin("color-action")?.className || ""} ${colorClass}" aria-label="Last played ${escapeHtml(juanDeck.cardLong(card))}"><strong class="${isNumber ? "juan-rank-glyph" : ""}">${escapeHtml(face)}</strong></span>`;
  }
  const suit = standard52.SUIT_SYMBOL[card.suit];
  const red = card.suit === "H" || card.suit === "D";
  return `<span class="seat-last-card standard-seat-card card-skin-face ${activeCardAppearanceClass("standard-52")} ${red ? "red" : "black"}" aria-label="Last played ${escapeHtml(standard52.cardLong(card))}"><strong>${escapeHtml(card.rank)}</strong><i>${suit}</i></span>`;
}

function renderLegacyStandardCenter(suit, faceId = null) {
  if (faceId) {
    return `<span class="legacy-card-center legacy-court"><svg viewBox="0 0 100 140" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><use href="#${faceId}"></use></svg></span>`;
  }
  return `<span class="legacy-card-center legacy-emblem">${suit}</span>`;
}

function renderPlayingCard(card, index, { played = false, enter = false, selectable = false, dealt = false, inert = false } = {}) {
  const suit = standard52.SUIT_SYMBOL[card.suit];
  const red = card.suit === "H" || card.suit === "D";
  const selected = !played && state.selectedCards.has(card.id);
  const legacy = appearancePreferences.legacyMode === true;
  const faceId = { J: "card-face-jack", Q: "card-face-queen", K: "card-face-king" }[card.rank];
  const center = legacy
    ? renderLegacyStandardCenter(suit, faceId)
    : faceId
      ? `<span class="card-center court"><svg viewBox="0 0 100 140" aria-hidden="true"><use href="#${faceId}"></use></svg></span>`
      : `<span class="card-center">${suit}</span>`;
  const classes = [
    "playing-card",
    "card-skin-face",
    activeCardAppearanceClass("standard-52"),
    red ? "red" : "black",
    selected ? "selected" : "",
    played ? "played" : "",
    played && enter ? "enter" : "",
    selectable && !played ? "selectable" : "",
    inert && !played ? "inert" : "",
    dealt && !played ? "dealt" : ""
  ].filter(Boolean).join(" ");
  const style = playedCardStyle(index, { animate: played && enter, dealt });
  return `
    <button class="${classes}" type="button" ${played || inert ? "disabled" : ""} ${style}
      ${played ? "" : `data-game-card="${escapeHtml(card.id)}" data-card-index="${index}" tabindex="${selectable ? "0" : "-1"}"`}
      aria-label="${escapeHtml(standard52.cardLong(card))}" aria-pressed="${selected}">
      <span class="card-corner"><strong>${escapeHtml(card.rank)}</strong><i>${suit}</i></span>
      ${center}
      <span class="card-corner bottom"><strong>${escapeHtml(card.rank)}</strong><i>${suit}</i></span>
    </button>`;
}

function renderBlackjackCardBack(index, { enter = false } = {}) {
  return renderCardBack({
    deckFamilyId: "standard-52",
    context: "dealer-hole",
    className: `playing-card played blackjack-card-back ${enter ? "enter" : ""}`,
    ariaLabel: "Dealer hole card",
    attributes: playedCardStyle(index, { animate: enter }),
    parts: [
      { tag: "i", text: "CC", ariaHidden: true },
      { tag: "b", text: "", ariaHidden: true }
    ]
  });
}

function formatPoints(points) {
  const value = Number(points) || 0;
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

function blackjackOutcomeLabel(hand) {
  if (!hand) return "Awaiting deal";
  if (hand.outcome === "blackjack") return "Blackjack · +1.5";
  if (hand.outcome === "win") return `Win · +${formatPoints(hand.points)}`;
  if (hand.outcome === "push") return "Push · 0";
  if (hand.outcome === "surrender") return "Surrender · −0.5";
  if (hand.outcome === "loss" || hand.outcome === "dealer-blackjack") return `Loss · ${formatPoints(hand.points)}`;
  if (hand.complete && hand.finishReason === "bust") return "Bust";
  if (hand.complete && hand.finishReason === "split-aces") return "Split Aces";
  if (hand.complete) return hand.label || "Standing";
  return hand.label || "In play";
}

function blackjackActionLabel(action) {
  return {
    hit: "Hit",
    stand: "Stand",
    double: "Double",
    split: "Split",
    surrender: "Surrender"
  }[action] || action;
}

function blackjackPrivateCards(view) {
  return Array.isArray(view?.hands) ? view.hands.flatMap((hand) => hand.cards || []) : [];
}

function currentBlackjackHand(view = state.gameView) {
  const hands = Array.isArray(view?.hands) ? view.hands : [];
  const activeHandIndex = Number(view?.state?.activeHandIndex);
  return hands[Number.isInteger(activeHandIndex) && hands[activeHandIndex] ? activeHandIndex : 0] || null;
}

function renderBlackjackHandSummary(hand, index, active) {
  const modifier = hand.doubled ? " · doubled" : hand.isSplitHand ? " · split" : "";
  return `
    <article class="blackjack-hand-summary ${active ? "active" : ""} ${hand.complete ? "complete" : ""}">
      <span>Hand ${index + 1} · ${formatPoints(hand.wager)} pt${hand.wager === 1 ? "" : "s"}${modifier}</span>
      <strong>${escapeHtml(blackjackOutcomeLabel(hand))}</strong>
    </article>`;
}

function renderBlackjackInsurancePrompt(disabled) {
  return `
    <section class="blackjack-insurance-prompt" aria-live="assertive" aria-label="Insurance decision">
      <span class="family-kicker">Dealer shows an Ace</span><strong>Take insurance for half a table point?</strong><small>It pays 2:1 only if the hole card completes dealer Blackjack.</small>
      <div class="button-row"><button class="action-button" type="button" data-action="blackjack-insurance" data-take="false" ${disabled ? "disabled" : ""}>No insurance</button><button class="action-button primary" type="button" data-action="blackjack-insurance" data-take="true" ${disabled ? "disabled" : ""}>Take insurance</button></div>
    </section>`;
}

function renderBlackjackGame() {
  const view = state.gameView;
  if (!view || !blackjackRules) return `<div class="empty-state">Dealing the Blackjack table…</div>`;
  const match = view.state;
  const viewer = state.room?.players.find((player) => player.isYou);
  const viewerSeat = viewer?.seat;
  const yourPlayer = match.players.find((player) => player.seat === viewerSeat);
  const opponents = match.players.filter((player) => player.seat !== viewerSeat);
  const isYourTurn = match.phase === "player-turn" && match.activeSeat === viewerSeat && !match.roundOver;
  const isInsuranceTurn = match.phase === "insurance" && match.activeSeat === viewerSeat && !match.roundOver;
  const activePlayer = match.players.find((player) => player.seat === match.activeSeat);
  const activeHand = currentBlackjackHand(view);
  const activeHandIndex = Number.isInteger(match.activeHandIndex) ? match.activeHandIndex : 0;
  const actions = match.actions || {};
  const dealerCards = Array.isArray(match.dealer?.cards) ? match.dealer.cards : [];
  const dealerHiddenCount = Math.max(0, (match.dealer?.cardCount || 0) - dealerCards.length);
  const dealerSignature = `${match.dealer?.revealed ? "revealed" : "hidden"}:${dealerCards.map((card) => card.id).join(",")}:${dealerHiddenCount}`;
  const dealerIsNew = dealerSignature !== state.lastPileSignature;
  state.lastPileSignature = dealerSignature;
  const handOwner = `blackjack:${state.room?.code || "table"}:${viewerSeat ?? "viewer"}:round-${match.round}:hand-${activeHandIndex}`;
  const isDealing = !state.dealtHandOwners.has(handOwner);
  state.dealtHandOwners.add(handOwner);
  const isHost = viewer?.role === "host";
  const playerStatus = match.roundOver
    ? "Round complete"
    : match.phase === "dealer-turn"
      ? "Dealer is resolving"
      : isInsuranceTurn
        ? `${yourPlayer?.name || "You"}, insurance decision`
        : isYourTurn
          ? `${yourPlayer?.name || "You"}, your turn`
          : `${activePlayer?.name || "Dealer"} is thinking`;
  const dealerLabel = match.dealer?.revealed
    ? (match.dealer.label || `Dealer ${match.dealer.total ?? ""}`.trim())
    : `${dealerCards[0] ? standard52.cardLong(dealerCards[0]) : "Dealer upcard"} · hole card hidden`;
  const currentHandCards = activeHand?.cards || [];

  return `
    <section class="standard-card-game ${activeTableAppearanceClass()} blackjack-game" data-game-id="blackjack">
      <header class="game-topbar">
        <button class="back-button" type="button" data-action="leave-game" aria-label="${state.gameMode === "multiplayer" ? "Return to room lobby" : "Leave game"}">←</button>
        <div><span class="family-kicker">${state.gameMode === "solo" ? "Solo table" : state.gameMode === "hot-seat" ? "Hot Seat table" : `Room ${escapeHtml(state.room.code)}`}</span><h2>Blackjack</h2><p>Round ${match.round} · ${escapeHtml(match.lastMoveText)}</p></div>
        <button class="game-score" type="button" disabled><span>Points</span><strong>${formatPoints(yourPlayer?.score)}</strong></button>
      </header>
      <div class="blackjack-rule-bar"><span>Dealer stands on soft 17</span><i>•</i><span>Split, double, surrender, insurance</span><i>•</i><strong>${match.stockCount} in shoe</strong></div>
      <div class="game-opponents blackjack-opponents ${opponents.length <= 3 ? "fit-opponents" : ""}">
        ${opponents.map((player) => `
          <article class="game-seat ${match.activeSeat === player.seat ? "active" : ""}">
            ${renderSeatLastCard(player, "blackjack")}
            <span class="game-seat-copy" title="${escapeHtml(player.name)}"><strong>${escapeHtml(player.name)}</strong><small>${formatPoints(player.score)} pts · ${player.cardCount} card${player.cardCount === 1 ? "" : "s"}${player.lastAction ? ` · ${escapeHtml(player.lastAction.label)}` : ""}</small></span>
            ${renderMiniCardBack("standard-52", player.cardCount, { ariaLabel: `${player.cardCount} cards` })}
          </article>`).join("")}
      </div>
      <section class="game-table blackjack-table ${isInsuranceTurn ? "insurance-pending" : ""}">
        <div class="game-status"><span><strong>${escapeHtml(playerStatus)}</strong><small>${escapeHtml(match.lastMoveText)}</small></span><span class="badge">${match.dealer?.revealed ? escapeHtml(match.dealer.label || "Dealer") : "Dealer upcard"}</span></div>
        ${isInsuranceTurn ? renderBlackjackInsurancePrompt(state.gameActionLock) : ""}
        <div class="blackjack-dealer-zone">
          <div class="blackjack-dealer-copy"><span>Dealer</span><strong>${escapeHtml(dealerLabel)}</strong></div>
          <div class="active-pile cards-pile blackjack-dealer-pile" aria-label="Dealer cards">${dealerCards.map((card, index) => renderPlayingCard(card, index, { played: true, enter: dealerIsNew })).join("")}${Array.from({ length: dealerHiddenCount }, (_, index) => renderBlackjackCardBack(dealerCards.length + index, { enter: dealerIsNew })).join("")}</div>
        </div>
      </section>
      <section class="physical-hand blackjack-hand ${isYourTurn || isInsuranceTurn ? "your-turn" : ""}">
        <div class="hand-heading"><span><strong>Your hand</strong><small>${view.hands?.length || 0} hand${view.hands?.length === 1 ? "" : "s"} · table points</small></span><span class="selection-status ${isYourTurn ? "valid" : ""}">${isInsuranceTurn ? "Choose insurance" : escapeHtml(activeHand?.label || "Waiting for dealer")}</span></div>
        <div class="blackjack-hand-summaries">${(view.hands || []).map((hand, index) => renderBlackjackHandSummary(hand, index, isYourTurn && index === activeHandIndex)).join("")}</div>
        <div class="game-hand" data-hand-owner="${escapeHtml(handOwner)}" aria-label="${standardHandAriaLabel("Your current fanned Blackjack hand", "Your current flat legacy Blackjack hand")}">${currentHandCards.map((card, index) => renderPlayingCard(card, index, { dealt: isDealing })).join("")}</div>
      </section>
      <nav class="game-actions blackjack-actions">
        <button type="button" data-action="blackjack-hint" ${isYourTurn || isInsuranceTurn ? "" : "disabled"}>Hint</button>
        <button type="button" data-action="blackjack-action" data-blackjack-action="blackjack_hit" ${isYourTurn && actions.hit && !state.gameActionLock ? "" : "disabled"}>Hit</button>
        <button type="button" data-action="blackjack-action" data-blackjack-action="blackjack_stand" ${isYourTurn && actions.stand && !state.gameActionLock ? "" : "disabled"}>Stand</button>
        <button type="button" data-action="blackjack-action" data-blackjack-action="blackjack_double" ${isYourTurn && actions.double && !state.gameActionLock ? "" : "disabled"}>Double</button>
        <button type="button" data-action="blackjack-action" data-blackjack-action="blackjack_split" ${isYourTurn && actions.split && !state.gameActionLock ? "" : "disabled"}>Split</button>
        <button class="danger" type="button" data-action="blackjack-action" data-blackjack-action="blackjack_surrender" ${isYourTurn && actions.surrender && !state.gameActionLock ? "" : "disabled"}>Surrender</button>
      </nav>
      ${match.roundOver ? `
        <div class="round-result blackjack-result">
          <div><span class="family-kicker">Round ${match.round} settled</span><h3>${escapeHtml(match.lastMoveText)}</h3><p>${match.players.map((player) => `${escapeHtml(player.name)} · ${formatPoints(player.score)} pts`).join(" · ")}</p></div>
          <button class="action-button primary" type="button" data-action="next-round" ${isHost ? "" : "disabled"}>${isHost ? "Deal next round" : "Waiting for host"}</button>
        </div>` : ""}
    </section>`;
}

function holdemStreetLabel(street) {
  return ({
    preflop: "Pre-flop",
    flop: "Flop",
    turn: "Turn",
    river: "River",
    complete: "Showdown"
  })[street] || "Table";
}

function holdemPrivateHandLabel(hand, board) {
  const cards = Array.isArray(hand) ? hand : [];
  if (cards.length + (board?.length || 0) < 5 || !holdemRules) {
    return cards.length ? `Hole cards · ${cards.map((card) => standard52.cardLabel(card)).join(" ")}` : "Waiting for the deal";
  }
  try {
    return holdemRules.bestHand([...cards, ...board]).label;
  } catch {
    return "Your best hand";
  }
}

function renderHoldemSeatCard(player) {
  const card = player.revealedCards?.[0];
  if (!card) {
    return renderCardBack({
      deckFamilyId: "standard-52",
      context: "private-seat",
      className: "seat-last-card poker-hole-back",
      ariaLabel: `${player.holeCardCount || 0} private hole cards`,
      parts: [{ tag: "i", text: player.holeCardCount || 0, ariaHidden: true }]
    });
  }
  const suit = standard52.SUIT_SYMBOL[card.suit];
  const red = card.suit === "H" || card.suit === "D";
  return `<span class="seat-last-card standard-seat-card card-skin-face ${activeCardAppearanceClass("standard-52")} ${red ? "red" : "black"}" aria-label="Revealed ${escapeHtml(standard52.cardLong(card))}"><strong>${escapeHtml(card.rank)}</strong><i>${suit}</i></span>`;
}

function holdemPlayerStatus(player) {
  if (player.eliminated) return "out of points";
  if (player.folded) return "folded";
  if (player.allIn) return "all in";
  return `${player.holeCardCount} down`;
}

function renderHoldemGame() {
  const view = state.gameView;
  if (!view || !holdemRules) return `<div class="empty-state">Opening the Poker table…</div>`;
  const match = view.state;
  const viewer = state.room?.players.find((player) => player.isYou);
  const viewerSeat = viewer?.seat;
  const yourPlayer = match.players.find((player) => player.seat === viewerSeat);
  const opponents = match.players.filter((player) => player.seat !== viewerSeat);
  const isYourTurn = !match.roundOver && match.activeSeat === viewerSeat && ["preflop", "flop", "turn", "river"].includes(match.phase);
  const activePlayer = match.players.find((player) => player.seat === match.activeSeat);
  const actions = match.actions || {};
  const board = Array.isArray(match.communityCards) ? match.communityCards : [];
  const boardSignature = `${match.round}:${board.map((card) => card.id).join(",")}`;
  const boardIsNew = board.length > 0 && boardSignature !== state.lastPileSignature;
  state.lastPileSignature = boardSignature;
  const handOwner = `holdem:${state.room?.code || "table"}:${viewerSeat ?? "viewer"}:hand-${match.round}`;
  const isDealing = !state.dealtHandOwners.has(handOwner);
  state.dealtHandOwners.add(handOwner);
  const isHost = viewer?.role === "host";
  const playerStatus = match.roundOver
    ? match.matchOver
      ? `${match.players.find((player) => player.seat === match.winnerSeat)?.name || "The winner"} takes the table`
      : "Hand complete"
    : isYourTurn
      ? `${yourPlayer?.name || "You"}, your turn`
      : `${activePlayer?.name || "Table"} is thinking`;
  const checkCallLabel = actions.check ? "Check" : actions.call ? `Call ${formatPoints(actions.callAmount)}` : "Check / Call";
  const wagerLabel = actions.bet
    ? `Bet ${formatPoints(actions.betAmount)}`
    : actions.raise
      ? `Raise to ${formatPoints((match.currentBet || 0) + (match.betSize || 0))}`
      : "Bet / Raise";
  const canAct = isYourTurn && !state.gameActionLock;
  const showdownDetail = match.showdown?.revealed
    ? match.showdown.evaluations.map((entry) => {
      const player = match.players.find((candidate) => candidate.seat === entry.seat);
      return `${player?.name || "Player"} · ${entry.label}`;
    }).join(" · ")
    : "Best five cards from seven";

  return `
    <section class="standard-card-game ${activeTableAppearanceClass()} holdem-game" data-game-id="holdem">
      <header class="game-topbar">
        <button class="back-button" type="button" data-action="leave-game" aria-label="${state.gameMode === "multiplayer" ? "Return to room lobby" : "Leave game"}">←</button>
        <div><span class="family-kicker">${state.gameMode === "solo" ? "Solo table" : state.gameMode === "hot-seat" ? "Hot Seat table" : `Room ${escapeHtml(state.room.code)}`}</span><h2>Texas Hold'em</h2><p>Hand ${match.round} · ${escapeHtml(match.lastMoveText)}</p></div>
        <button class="game-score" type="button" disabled><span>Stack</span><strong>${formatPoints(yourPlayer?.stack)}</strong></button>
      </header>
      <div class="holdem-rule-bar"><span>Fixed limit</span><i>•</i><span>100 table points</span><i>•</i><span>1 / 2 blinds</span><i>•</i><strong>2 / 4 bets · four-bet cap</strong></div>
      <div class="game-opponents holdem-opponents ${opponents.length <= 3 ? "fit-opponents" : ""}">
        ${opponents.map((player) => `
          <article class="game-seat ${match.activeSeat === player.seat ? "active" : ""} ${player.folded ? "folded" : ""} ${player.allIn ? "all-in" : ""} ${player.eliminated ? "eliminated" : ""}">
            ${renderHoldemSeatCard(player)}
            <span class="game-seat-copy" title="${escapeHtml(player.name)}"><strong>${escapeHtml(player.name)}${player.seat === match.dealerSeat ? " · D" : ""}</strong><small>${formatPoints(player.stack)} pts · ${escapeHtml(holdemPlayerStatus(player))}${player.lastAction ? ` · ${escapeHtml(player.lastAction.label)}` : ""}</small></span>
            ${renderMiniCardBack("standard-52", player.holeCardCount, { ariaLabel: `${player.holeCardCount} private cards` })}
          </article>`).join("")}
      </div>
      <section class="game-table holdem-table">
        <div class="game-status"><span><strong>${escapeHtml(playerStatus)}</strong><small>${holdemStreetLabel(match.phase)} · ${match.currentBet ? `${formatPoints(match.currentBet)} to match` : "table is checked"}</small></span><span class="badge">Pot ${formatPoints(match.pot)}</span></div>
        <div class="holdem-board-zone">
          <div class="holdem-board-copy"><span>Community board</span><strong>${escapeHtml(showdownDetail)}</strong></div>
          <div class="active-pile cards-pile holdem-board" aria-label="Community cards">${board.length ? board.map((card, index) => renderPlayingCard(card, index, { played: true, enter: boardIsNew })).join("") : `<div class="empty-pile"><strong>Face-down board</strong><span>Cards arrive after the first betting round.</span></div>`}</div>
        </div>
      </section>
      <section class="physical-hand holdem-hand ${isYourTurn ? "your-turn" : ""}">
        <div class="hand-heading"><span><strong>Your hole cards</strong><small>${view.hand?.length || 0} cards · ${formatPoints(yourPlayer?.stack)} table points</small></span><span class="selection-status ${isYourTurn ? "valid" : ""}">${escapeHtml(holdemPrivateHandLabel(view.hand, board))}</span></div>
        <div class="game-hand" data-hand-owner="${escapeHtml(handOwner)}" aria-label="${standardHandAriaLabel("Your fanned Poker hole cards", "Your flat legacy Poker hole cards")}">${(view.hand || []).map((card, index) => renderPlayingCard(card, index, { dealt: isDealing, inert: true })).join("")}</div>
      </section>
      <nav class="game-actions holdem-actions">
        <button type="button" data-action="holdem-hint" ${canAct ? "" : "disabled"}>Hint</button>
        <button class="danger" type="button" data-action="holdem-action" data-holdem-action="holdem_fold" ${canAct && actions.fold ? "" : "disabled"}>Fold</button>
        <button type="button" data-action="holdem-action" data-holdem-action="${actions.check ? "holdem_check" : "holdem_call"}" ${canAct && (actions.check || actions.call) ? "" : "disabled"}>${escapeHtml(checkCallLabel)}</button>
        <button class="primary" type="button" data-action="holdem-action" data-holdem-action="${actions.bet ? "holdem_bet" : "holdem_raise"}" ${canAct && (actions.bet || actions.raise) ? "" : "disabled"}>${escapeHtml(wagerLabel)}</button>
      </nav>
      ${match.roundOver ? `
        <div class="round-result holdem-result">
          <div><span class="family-kicker">${match.matchOver ? "Table winner" : `Hand ${match.round} settled`}</span><h3>${escapeHtml(match.lastMoveText)}</h3><p>${match.players.map((player) => `${escapeHtml(player.name)} · ${formatPoints(player.stack)} pts${player.eliminated ? " · out" : ""}`).join(" · ")}</p></div>
          ${match.matchOver ? `<button class="action-button" type="button" data-action="leave-game">Return to Cardcade</button>` : `<button class="action-button primary" type="button" data-action="holdem-next-hand" ${isHost ? "" : "disabled"}>${isHost ? "Deal next hand" : "Waiting for host"}</button>`}
        </div>` : ""}
    </section>`;
}

function fiveCardDrawPhaseLabel(phase) {
  return ({
    opening: "Opening betting",
    draw: "Draw round",
    final: "Final betting",
    complete: "Showdown"
  })[phase] || "Five Card Draw";
}

function fiveCardDrawPrivateHandLabel(hand, match) {
  const cards = Array.isArray(hand) ? hand : [];
  if (!cards.length) return "Waiting for the deal";
  if (match?.phase === "draw") {
    const selected = state.selectedCards.size;
    return selected ? `${selected} card${selected === 1 ? "" : "s"} marked to replace` : "Select cards to replace, or stand pat";
  }
  const showdown = match?.showdown?.evaluations?.find((entry) => entry.seat === state.room?.players.find((player) => player.isYou)?.seat);
  if (showdown?.label) return showdown.label;
  try {
    return fiveCardDrawRules?.evaluateHand(cards)?.label || "Your five-card hand";
  } catch {
    return "Your five-card hand";
  }
}

function renderFiveCardDrawSeatCard(player) {
  const card = player.revealedCards?.[0];
  if (!card) {
    return renderCardBack({
      deckFamilyId: "standard-52",
      context: "private-seat",
      className: "seat-last-card poker-hole-back draw-hole-back",
      ariaLabel: `${player.cardCount || 0} private cards`,
      parts: [{ tag: "i", text: player.cardCount || 0, ariaHidden: true }]
    });
  }
  const suit = standard52.SUIT_SYMBOL[card.suit];
  const red = card.suit === "H" || card.suit === "D";
  return `<span class="seat-last-card standard-seat-card card-skin-face ${activeCardAppearanceClass("standard-52")} ${red ? "red" : "black"}" aria-label="Revealed ${escapeHtml(standard52.cardLong(card))}"><strong>${escapeHtml(card.rank)}</strong><i>${suit}</i></span>`;
}

function renderFiveCardDrawShowdownCard(card) {
  const suit = standard52.SUIT_SYMBOL[card.suit];
  const red = card.suit === "H" || card.suit === "D";
  return `<span class="draw-showdown-card ${red ? "red" : "black"}" aria-label="${escapeHtml(standard52.cardLong(card))}"><strong>${escapeHtml(card.rank)}</strong><i>${suit}</i></span>`;
}

function renderFiveCardDrawShowdown(match) {
  if (!match.showdown?.revealed) return "";
  const winnerSeats = new Set(match.showdown.winnerSeats || []);
  const evaluations = new Map((match.showdown.evaluations || []).map((entry) => [entry.seat, entry]));
  const entries = match.players
    .filter((player) => Array.isArray(player.revealedCards) && player.revealedCards.length)
    .map((player) => ({ player, evaluation: evaluations.get(player.seat), winner: winnerSeats.has(player.seat) }))
    .sort((left, right) => Number(right.winner) - Number(left.winner) || left.player.seat - right.player.seat);
  if (!entries.length) return "";

  return `
    <section class="five-card-draw-showdown" aria-label="Showdown hands">
      <span class="family-kicker">Showdown hands</span>
      <div class="five-card-draw-showdown-list">
        ${entries.map(({ player, evaluation, winner }) => `
          <article class="five-card-draw-showdown-hand ${winner ? "winner" : ""}">
            <div class="draw-showdown-copy"><strong>${escapeHtml(player.name)}${winner ? " · Winner" : ""}</strong><small>${escapeHtml(evaluation?.label || "Five-card hand")}</small></div>
            <div class="draw-showdown-cards" aria-label="${escapeHtml(player.name)}: ${escapeHtml(evaluation?.label || "five-card hand")}">${player.revealedCards.map(renderFiveCardDrawShowdownCard).join("")}</div>
          </article>`).join("")}
      </div>
    </section>`;
}

function fiveCardDrawPlayerStatus(player) {
  if (player.eliminated) return "out of points";
  if (player.folded) return "folded";
  if (player.allIn) return "all in";
  if (player.hasDrawn) return player.drawCount ? `drew ${player.drawCount}` : "stood pat";
  return `${player.cardCount} down`;
}

function renderFiveCardDrawGame() {
  const view = state.gameView;
  if (!view || !fiveCardDrawRules) return `<div class="empty-state">Opening the Five Card Draw table…</div>`;
  const match = view.state;
  const viewer = state.room?.players.find((player) => player.isYou);
  const viewerSeat = viewer?.seat;
  const yourPlayer = match.players.find((player) => player.seat === viewerSeat);
  const opponents = match.players.filter((player) => player.seat !== viewerSeat);
  const isDrawTurn = !match.roundOver && match.phase === "draw" && match.activeSeat === viewerSeat && match.actions?.draw;
  const isBetTurn = !match.roundOver && fiveCardDrawRules.BETTING_PHASES.includes(match.phase) && match.activeSeat === viewerSeat;
  const isYourTurn = isDrawTurn || isBetTurn;
  const activePlayer = match.players.find((player) => player.seat === match.activeSeat);
  const actions = match.actions || {};
  const handOwner = `five-card-draw:${state.room?.code || "table"}:${viewerSeat ?? "viewer"}:hand-${match.round}`;
  const isDealing = !state.dealtHandOwners.has(handOwner);
  state.dealtHandOwners.add(handOwner);
  const isHost = viewer?.role === "host";
  const selectedCount = state.selectedCards.size;
  const canDraw = isDrawTurn && !state.gameActionLock;
  const canBet = isBetTurn && !state.gameActionLock;
  const playerStatus = match.roundOver
    ? match.matchOver
      ? `${match.players.find((player) => player.seat === match.winnerSeat)?.name || "The winner"} takes the table`
      : "Hand complete"
    : isDrawTurn
      ? `${yourPlayer?.name || "You"}, choose replacements`
      : isBetTurn
        ? `${yourPlayer?.name || "You"}, your turn`
        : `${activePlayer?.name || "Table"} is thinking`;
  const checkCallLabel = actions.check ? "Check" : actions.call ? `Call ${formatPoints(actions.callAmount)}` : "Check / Call";
  const wagerLabel = actions.bet
    ? `Bet ${formatPoints(actions.betAmount)}`
    : actions.raise
      ? `Raise to ${formatPoints((match.currentBet || 0) + (match.betSize || 0))}`
      : "Bet / Raise";
  const drawLabel = selectedCount ? `Replace ${selectedCount}` : "Stand pat";
  const showdownDetail = match.showdown?.revealed
    ? match.showdown.evaluations.map((entry) => {
      const player = match.players.find((candidate) => candidate.seat === entry.seat);
      return `${player?.name || "Player"} · ${entry.label}`;
    }).join(" · ")
    : match.phase === "draw"
      ? "Choose zero to five cards. Replacements stay private."
      : "Every player is building one private five-card hand.";
  const tableLabel = match.showdown?.revealed ? "Showdown" : "Private draw";

  return `
    <section class="standard-card-game ${activeTableAppearanceClass()} five-card-draw-game" data-game-id="five-card-draw">
      <header class="game-topbar">
        <button class="back-button" type="button" data-action="leave-game" aria-label="${state.gameMode === "multiplayer" ? "Return to room lobby" : "Leave game"}">←</button>
        <div><span class="family-kicker">${state.gameMode === "solo" ? "Solo table" : state.gameMode === "hot-seat" ? "Hot Seat table" : `Room ${escapeHtml(state.room.code)}`}</span><h2>Five Card Draw</h2><p>Hand ${match.round} · ${escapeHtml(match.lastMoveText)}</p></div>
        <button class="game-score" type="button" disabled><span>Stack</span><strong>${formatPoints(yourPlayer?.stack)}</strong></button>
      </header>
      <div class="five-card-draw-rule-bar"><span>Fixed limit</span><i>•</i><span>100 table points</span><i>•</i><span>1 / 2 blinds</span><i>•</i><strong>2 / 4 bets · one draw · four-bet cap</strong></div>
      <div class="game-opponents five-card-draw-opponents ${opponents.length <= 3 ? "fit-opponents" : ""}">
        ${opponents.map((player) => `
          <article class="game-seat ${match.activeSeat === player.seat ? "active" : ""} ${player.folded ? "folded" : ""} ${player.allIn ? "all-in" : ""} ${player.eliminated ? "eliminated" : ""}">
            ${renderFiveCardDrawSeatCard(player)}
            <span class="game-seat-copy" title="${escapeHtml(player.name)}"><strong>${escapeHtml(player.name)}${player.seat === match.dealerSeat ? " · D" : ""}</strong><small>${formatPoints(player.stack)} pts · ${escapeHtml(fiveCardDrawPlayerStatus(player))}${player.lastAction ? ` · ${escapeHtml(player.lastAction.label)}` : ""}</small></span>
            ${renderMiniCardBack("standard-52", player.cardCount, { ariaLabel: `${player.cardCount} private cards` })}
          </article>`).join("")}
      </div>
      <section class="game-table five-card-draw-table">
        <div class="game-status"><span><strong>${escapeHtml(playerStatus)}</strong><small>${fiveCardDrawPhaseLabel(match.phase)} · ${match.currentBet ? `${formatPoints(match.currentBet)} to match` : match.phase === "draw" ? "replacements are private" : "table is checked"}</small></span><span class="badge">Pot ${formatPoints(match.pot)}</span></div>
        <div class="five-card-draw-table-zone">
          <div class="five-card-draw-copy"><span>${tableLabel}</span><strong>${escapeHtml(showdownDetail)}</strong></div>
          <div class="five-card-draw-piles" aria-label="Draw and discard piles">
            <div class="draw-stack ${activeCardAppearanceClass("standard-52")}" aria-label="${match.stockCount} cards in draw pile">${renderCardBack({ deckFamilyId: "standard-52", context: "draw-stock", className: "draw-card-back", ariaHidden: true, parts: [{ tag: "i", text: "CC" }] })}<strong>Draw</strong><small>${match.stockCount} cards</small></div>
            <div class="active-pile draw-discard-pile ${activeCardAppearanceClass("standard-52")}" aria-label="${match.discardCount} private discards">${renderCardBack({ deckFamilyId: "standard-52", context: "discard", className: "draw-card-back discard", ariaHidden: true, parts: [{ tag: "i", text: "↻" }] })}<strong>Discard</strong><small>${match.discardCount} card${match.discardCount === 1 ? "" : "s"}</small></div>
          </div>
        </div>
      </section>
      <section class="physical-hand five-card-draw-hand ${isYourTurn ? "your-turn" : ""}">
        <div class="hand-heading"><span><strong>Your five cards</strong><small>${view.hand?.length || 0} cards · ${formatPoints(yourPlayer?.stack)} table points</small></span><span class="selection-status ${isDrawTurn ? "valid" : ""}">${escapeHtml(fiveCardDrawPrivateHandLabel(view.hand, match))}</span></div>
        <div class="game-hand" data-hand-owner="${escapeHtml(handOwner)}" aria-label="${standardHandAriaLabel("Your fanned Five Card Draw hand", "Your flat legacy Five Card Draw hand")}">${(view.hand || []).map((card, index) => renderPlayingCard(card, index, { selectable: canDraw, inert: !isDrawTurn, dealt: isDealing })).join("")}</div>
      </section>
      ${match.phase === "draw" ? `
        <nav class="game-actions five-card-draw-actions draw-actions">
          <button type="button" data-action="five-card-draw-hint" ${canDraw ? "" : "disabled"}>Hint</button>
          <button class="primary" type="button" data-action="five-card-draw-draw" ${canDraw ? "" : "disabled"}>${escapeHtml(drawLabel)}</button>
        </nav>` : `
        <nav class="game-actions five-card-draw-actions">
          <button type="button" data-action="five-card-draw-hint" ${canBet ? "" : "disabled"}>Hint</button>
          <button class="danger" type="button" data-action="five-card-draw-action" data-five-card-draw-action="five_card_draw_fold" ${canBet && actions.fold ? "" : "disabled"}>Fold</button>
          <button type="button" data-action="five-card-draw-action" data-five-card-draw-action="${actions.check ? "five_card_draw_check" : "five_card_draw_call"}" ${canBet && (actions.check || actions.call) ? "" : "disabled"}>${escapeHtml(checkCallLabel)}</button>
          <button class="primary" type="button" data-action="five-card-draw-action" data-five-card-draw-action="${actions.bet ? "five_card_draw_bet" : "five_card_draw_raise"}" ${canBet && (actions.bet || actions.raise) ? "" : "disabled"}>${escapeHtml(wagerLabel)}</button>
        </nav>`}
      ${match.roundOver ? `
        <div class="round-result five-card-draw-result">
          <div><span class="family-kicker">${match.matchOver ? "Table winner" : `Hand ${match.round} settled`}</span><h3>${escapeHtml(match.lastMoveText)}</h3><p>${match.players.map((player) => `${escapeHtml(player.name)} · ${formatPoints(player.stack)} pts${player.eliminated ? " · out" : ""}`).join(" · ")}</p>${renderFiveCardDrawShowdown(match)}</div>
          ${match.matchOver ? `<button class="action-button" type="button" data-action="leave-game">Return to Cardcade</button>` : `<button class="action-button primary" type="button" data-action="five-card-draw-next-hand" ${isHost ? "" : "disabled"}>${isHost ? "Deal next hand" : "Waiting for host"}</button>`}
        </div>` : ""}
    </section>`;
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
  const yourPlace = placementForPlayer(match, yourPlayer);
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
  const roundLabel = Number.isInteger(match.totalRounds) ? `Round ${match.round}/${match.totalRounds}` : `Round ${match.round}`;
  const tableCount = game.gameId === "three-seven" ? `Stock ${match.drawCount}` : "13-card deal";

  return `
    <section class="standard-card-game ${activeTableAppearanceClass()}" data-game-id="${escapeHtml(game.gameId)}">
      <header class="game-topbar">
        <button class="back-button" type="button" data-action="leave-game" aria-label="${state.gameMode === "multiplayer" ? "Return to room lobby" : "Leave game"}">←</button>
        <div><span class="family-kicker">${state.gameMode === "solo" ? "Solo table" : state.gameMode === "hot-seat" ? "Hot Seat table" : `Room ${escapeHtml(state.room.code)}`}</span><h2>${escapeHtml(title)}</h2><p>${roundLabel} · ${escapeHtml(match.lastMoveText)}</p></div>
        <button class="game-score ${placementClassFor(yourPlace)}" type="button" disabled><span>${yourPlace ? `${placeLabel(yourPlace)} place` : "Score"}</span><strong>${yourPlayer?.score ?? 0}</strong></button>
      </header>
      ${gameLadder(game.gameId, match)}
      <div class="game-opponents">
        ${opponents.map((player) => {
          const playerPlace = placementForPlayer(match, player);
          return `
          <article class="game-seat ${match.activeSeat === player.seat ? "active" : ""} ${placementClassFor(playerPlace)}">
            ${renderSeatLastCard(player, game.gameId)}
            <span class="game-seat-copy" title="${escapeHtml(player.name)}"><strong>${escapeHtml(player.name)}</strong><small>${playerPlace ? `${placeLabel(playerPlace)} place` : `${player.cardCount} cards${player.passed ? " · passed" : ""}`}</small></span>
            ${renderMiniCardBack("standard-52", Math.min(player.cardCount, 7), { ariaHidden: true })}
          </article>`;
        }).join("")}
      </div>
      <section class="game-table">
        <div class="game-status"><span><strong>${match.roundOver ? match.matchOver ? "Match complete" : "Round complete" : isYourTurn ? `${escapeHtml(yourPlayer?.name || "You")}, your turn` : `${escapeHtml(activePlayer?.name || "Player")} is thinking`}</strong><small>${tableCount} · ${lead ? `${escapeHtml(lead.playerName)} controls the pile` : "open lead"}</small></span><span class="badge">${lead ? escapeHtml(lead.label) : "Open lead"}</span></div>
        <div class="active-pile ${lead ? "cards-pile" : ""}">${lead ? lead.cards.map((card, index) => renderPlayingCard(card, index, { played: true, enter: pileIsNew })).join("") : `<div class="empty-pile"><strong>No active pile</strong><span>${match.openingRequired ? `Lead must include ${standardCardLabel(match.openingCardId)}.` : "Lead with any legal combination."}</span></div>`}</div>
      </section>
      <section class="physical-hand ${isYourTurn ? "your-turn" : ""}">
        <div class="hand-heading"><span><strong>Your hand</strong><small>${view.hand.length} cards · ${escapeHtml(state.gameSort)} sort</small></span><span class="selection-status ${evaluation.ok ? "valid" : state.selectedCards.size ? "invalid" : ""}">${escapeHtml(evaluation.reason)}</span></div>
        <div class="game-hand" data-hand-owner="${escapeHtml(handOwner)}" aria-label="${standardHandAriaLabel("Your fanned hand", "Your flat legacy hand")}">${sortedHand.map((card, index) => renderPlayingCard(card, index, { selectable: isYourTurn && !state.gameActionLock, dealt: isDealing })).join("")}</div>
      </section>
      <nav class="game-actions">
        <button type="button" data-action="game-hint" ${isYourTurn && !state.gameActionLock ? "" : "disabled"}>Hint</button>
        <button type="button" data-action="game-sort" ${state.gameActionLock ? "disabled" : ""}>Sort</button>
        <button type="button" data-action="game-pass" ${canPass ? "" : "disabled"}>${game.passLabel}</button>
        <button class="primary" type="button" data-action="game-play" ${isYourTurn && evaluation.ok && !state.gameActionLock ? "" : "disabled"}>▶ Play</button>
      </nav>
      ${match.roundOver ? `
        <div class="round-result">
          <div><span class="family-kicker">${match.matchOver ? "Final standings" : `Round ${match.round} complete`}</span><h3>${escapeHtml(match.lastMoveText)}</h3>${match.matchOver ? renderStandardFinalStandings(match) : `<p>${match.placements.map((seat, index) => `${index + 1}. ${escapeHtml(match.players.find((player) => player.seat === seat)?.name || "Player")}`).join(" · ")}</p>`}</div>
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

function juanActionMark(kind) {
  if (kind === "pause") {
    return `<span class="juan-action-mark juan-action-pause" aria-hidden="true"><i></i><i></i></span>`;
  }
  if (kind === "turnabout") {
    return `<span class="juan-action-mark juan-action-turnabout" aria-hidden="true"><i></i><i></i></span>`;
  }
  if (kind === "double-draw") {
    return `<span class="juan-action-mark juan-action-double-draw" aria-hidden="true"><i></i><i></i><b>+2</b></span>`;
  }
  if (kind === "prism" || kind === "prism-burst") {
    return `<span class="juan-action-mark juan-action-${kind}" aria-hidden="true"><i></i><i></i><i></i><i></i><b>${kind === "prism-burst" ? "+4" : ""}</b></span>`;
  }
  return `<span class="juan-action-mark" aria-hidden="true">?</span>`;
}

function renderJuanCard(card, index, { played = false, enter = false, selectable = false, dealt = false, turnDrawn = false } = {}) {
  const selected = !played && state.selectedCards.has(card.id);
  const isNumber = card.kind === "number";
  const face = isNumber ? String(card.value) : null;
  const corner = juanCornerFace(card);
  const colorClass = card.color ? `juan-${card.color}` : "juan-prism";
  const classes = [
    "playing-card",
    "juan-card",
    "card-skin-face",
    selectedCardSkin("color-action")?.className || "",
    `juan-kind-${card.kind}`,
    colorClass,
    selected ? "selected" : "",
    turnDrawn ? "turn-drawn" : "",
    played ? "played" : "",
    played && enter ? "enter" : "",
    selectable && !played ? "selectable" : "",
    dealt && !played ? "dealt" : ""
  ].filter(Boolean).join(" ");
  const style = playedCardStyle(index, { animate: played && enter, dealt });
  return `
    <button class="${classes}" type="button" ${played ? "disabled" : ""} ${style}
      ${played ? "" : `data-game-card="${escapeHtml(card.id)}" data-card-index="${index}" tabindex="${selectable ? "0" : "-1"}"`}
      aria-label="${escapeHtml(juanDeck.cardLong(card))}" aria-pressed="${selected}">
      <span class="juan-card-ink" aria-hidden="true"></span>
      <span class="card-corner juan-corner"><strong class="${isNumber ? "juan-rank-glyph" : ""}">${escapeHtml(corner)}</strong></span>
      <span class="juan-card-center">${isNumber
        ? `<b class="juan-rank-glyph">${escapeHtml(face)}</b>`
        : juanActionMark(card.kind)
      }</span>
      <span class="card-corner bottom juan-corner"><strong class="${isNumber ? "juan-rank-glyph" : ""}">${escapeHtml(corner)}</strong></span>
    </button>`;
}

function juanColorChooser(selectedCard) {
  if (!selectedCard || !["prism", "prism-burst"].includes(selectedCard.kind) || state.juanChosenColor) return "";
  return `
    <div class="juan-prism-dialog" role="dialog" aria-modal="true" aria-labelledby="juan-prism-title">
      <div class="juan-prism-picker">
        <span class="family-kicker">Prism in hand</span>
        <h3 id="juan-prism-title">Choose the next color</h3>
        <p>Set the lane every player must follow.</p>
        <div class="juan-prism-stage-card">${renderJuanCard(selectedCard, 0, { played: true })}</div>
        <div class="juan-color-chooser" role="group" aria-label="Choose the Prism's next color">
          ${juanDeck.COLORS.map((color, index) => `
            <button type="button" class="juan-color-choice juan-${color}" style="--choice-delay:${120 + (index * 55)}ms" data-action="choose-juan-color" data-color="${color}">
              <i aria-hidden="true"></i><strong>${escapeHtml(juanDeck.COLOR_NAME[color])}</strong>
            </button>`).join("")}
        </div>
        <button type="button" class="juan-prism-cancel" data-action="cancel-juan-color">Put card back</button>
      </div>
    </div>`;
}

function renderJuanPrismReveal() {
  const reveal = state.juanPrismReveal;
  if (!reveal?.card || !juanDeck.COLORS.includes(reveal.color)) return "";
  return `
    <div class="juan-prism-reveal juan-${reveal.color}" data-reveal-key="${escapeHtml(reveal.key)}" role="status" aria-live="assertive">
      <div class="juan-prism-reveal-burst" aria-hidden="true"></div>
      <div class="juan-prism-reveal-card">${renderJuanCard(reveal.card, 0, { played: true })}</div>
      <div class="juan-prism-reveal-copy">
        <span>${escapeHtml(reveal.playerName)} played a Prism</span>
        <strong><i aria-hidden="true"></i>${escapeHtml(juanDeck.COLOR_NAME[reveal.color])}</strong>
        <small>is now the active color</small>
      </div>
    </div>`;
}

function syncJuanPrismReveal() {
  if (!juanPrismRevealRoot) return;
  const reveal = ["game", "hot-seat-handoff"].includes(state.screen) ? state.juanPrismReveal : null;
  const existing = juanPrismRevealRoot.firstElementChild;
  if (!reveal) {
    if (existing) juanPrismRevealRoot.replaceChildren();
    return;
  }
  if (existing?.dataset.revealKey === reveal.key) return;
  juanPrismRevealRoot.innerHTML = renderJuanPrismReveal();
}

function clearJuanPrismReveal() {
  clearTimeout(state.juanPrismRevealTimer);
  state.juanPrismRevealTimer = null;
  state.juanPrismReveal = null;
  syncJuanPrismReveal();
}

function queueJuanPrismReveal(gameId, previousView, nextView) {
  if (gameId !== "juan") return;
  const previousCard = previousView?.state?.topCard;
  const nextCard = nextView?.state?.topCard;
  if (!previousCard || !nextCard || previousCard.id === nextCard.id) return;
  if (!["prism", "prism-burst"].includes(nextCard.kind)) return;
  const color = nextView.state.activeColor;
  if (!juanDeck.COLORS.includes(color)) return;
  const revealKey = `${nextView.state.round}:${nextCard.id}:${color}`;
  if (state.juanPrismReveal?.key === revealKey) return;
  const player = nextView.state.players.find((candidate) => candidate.lastPlayedCard?.id === nextCard.id);
  clearTimeout(state.juanPrismRevealTimer);
  state.juanPrismReveal = {
    key: revealKey,
    card: { ...nextCard },
    color,
    playerName: player?.name || "A player"
  };
  const reducedMotion = localStorage.getItem(storageKeys.reducedMotion) === "true"
    || matchMedia("(prefers-reduced-motion: reduce)").matches;
  state.juanPrismRevealTimer = setTimeout(() => {
    if (state.juanPrismReveal?.key !== revealKey) return;
    clearJuanPrismReveal();
    if (["game", "hot-seat-handoff"].includes(state.screen)) render();
  }, reducedMotion ? 900 : 1_900);
}

function renderJuanGame() {
  const view = state.gameView;
  if (!view || !juanRules || !juanDeck) return `<div class="empty-state">Dealing the JUAN deck…</div>`;
  const match = view.state;
  const viewer = state.room?.players.find((player) => player.isYou);
  const viewerSeat = viewer?.seat;
  const yourPlayer = match.players.find((player) => player.seat === viewerSeat);
  const yourPlace = placementForPlayer(match, yourPlayer);
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
    <section class="standard-card-game ${activeTableAppearanceClass()} juan-game" data-game-id="juan" data-active-color="${escapeHtml(match.activeColor)}">
      <header class="game-topbar">
        <button class="back-button" type="button" data-action="leave-game" aria-label="${state.gameMode === "multiplayer" ? "Return to room lobby" : "Leave game"}">←</button>
        <div><span class="family-kicker">${state.gameMode === "solo" ? "Solo table" : state.gameMode === "hot-seat" ? "Hot Seat table" : `Room ${escapeHtml(state.room.code)}`}</span><h2>JUAN</h2><p>Race to one · ${escapeHtml(match.lastMoveText)}</p></div>
        <button class="game-score ${placementClassFor(yourPlace)}" type="button" disabled><span>${yourPlace ? `${placeLabel(yourPlace)} place` : "Score"}</span><strong>${yourPlayer?.score ?? 0}</strong></button>
      </header>
      <div class="juan-lane-bar">
        <span>Active color</span>
        ${juanDeck.COLORS.map((color) => `<i class="juan-lane juan-${color} ${match.activeColor === color ? "active" : ""}" title="${escapeHtml(juanDeck.COLOR_NAME[color])}"></i>`).join("")}
        <strong>${escapeHtml(juanDeck.COLOR_NAME[match.activeColor])}</strong>
        <span class="juan-direction" aria-label="Play direction ${match.direction === 1 ? "forward" : "backward"}">${match.direction === 1 ? "↻" : "↺"}</span>
      </div>
      <div class="game-opponents ${opponents.length <= 3 ? "fit-opponents" : ""}">
        ${opponents.map((player) => {
          const playerPlace = placementForPlayer(match, player);
          return `
          <article class="game-seat ${match.activeSeat === player.seat ? "active" : ""} ${player.juan ? "juan-alert" : ""} ${placementClassFor(playerPlace)}">
            ${renderSeatLastCard(player, "juan")}
            <span class="game-seat-copy" title="${escapeHtml(player.name)}"><strong>${escapeHtml(player.name)}</strong><small>${playerPlace ? `${placeLabel(playerPlace)} place` : player.juan ? "JUAN! · 1 card" : `${player.cardCount} cards`}</small></span>
            ${renderMiniCardBack("color-action", Math.min(player.cardCount, 7), { ariaHidden: true })}
          </article>`;
        }).join("")}
      </div>
      <section class="game-table juan-table">
        <div class="game-status"><span><strong>${match.roundOver ? "Match complete" : isYourTurn ? `${escapeHtml(yourPlayer?.name || "You")}, your turn` : `${escapeHtml(activePlayer?.name || "Player")} is thinking`}</strong><small>Stock ${match.stockCount} · match color or face</small></span><span class="badge">${escapeHtml(juanDeck.COLOR_NAME[match.activeColor])}</span></div>
        <div class="juan-pile-zone">
          ${renderCardBack({ deckFamilyId: "color-action", context: "stock", className: "juan-stock", ariaLabel: `${match.stockCount} cards in stock`, parts: [{ tag: "span", text: "JUAN" }, { tag: "b", text: match.stockCount }] })}
          <div class="active-pile cards-pile">${renderJuanCard(match.topCard, 0, { played: true, enter: pileIsNew })}</div>
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
    const dealerTurn = state.room?.gameId === "blackjack" && match?.phase === "dealer-turn";
    return `
      <section class="hot-seat-handoff">
        <div class="handoff-panel">
          <span class="family-kicker">Hot Seat · ${escapeHtml(gameName)} · ${escapeHtml(round)}</span>
          <div class="cpu-thinking" aria-hidden="true"><span>${dealerTurn ? "DEAL" : "CPU"}</span><i></i><i></i><i></i></div>
          <p class="handoff-instruction">${dealerTurn ? "Dealer turn" : "CPU turn"}</p>
          <h1>${escapeHtml(dealerTurn ? "Dealer" : cpu?.name || "Cardcade CPU")}</h1>
          <p class="handoff-privacy">${dealerTurn ? "Every private hand is covered while the dealer resolves the table." : "The human hand is covered while the CPU plays automatically. Cardcade will name the next person when it is time to pass the device."}</p>
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
        ${renderCardBack({ deckFamilyId: deckFamilyIdForGame(), context: "hot-seat-handoff", className: "handoff-card-back", ariaHidden: true, parts: [{ tag: "span", text: "CC" }] })}
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

function appearanceFamilyName(deckFamilyId) {
  const family = state.catalog.families?.find((candidate) => candidate.id === deckFamilyId);
  if (family) return { name: family.name, shortName: family.shortName };
  if (deckFamilyId === "standard-52") return { name: "Standard playing cards", shortName: "52-card deck" };
  if (deckFamilyId === "color-action") return { name: "Color & action cards", shortName: "Custom shedding deck" };
  return { name: deckFamilyId, shortName: "Card deck" };
}

function renderSkinPreview(skin) {
  if (skin.deckFamilyId === "standard-52") {
    return `
      <div class="skin-preview ${skin.className}" data-skin-preview="${escapeHtml(skin.deckFamilyId)}" role="img" aria-label="${escapeHtml(skin.name)} card face and back preview">
        <span class="skin-preview-card skin-preview-face skin-preview-standard-face" aria-hidden="true"><span><strong>A</strong><i>♥</i></span><b>♥</b></span>
        ${renderCardBack({ deckFamilyId: skin.deckFamilyId, skinId: skin.id, context: "settings-preview", className: "skin-preview-card skin-preview-back skin-preview-standard-back", ariaHidden: true, parts: [{ tag: "strong", text: "CC" }] })}
      </div>`;
  }
  return `
    <div class="skin-preview ${skin.className}" data-skin-preview="${escapeHtml(skin.deckFamilyId)}" role="img" aria-label="${escapeHtml(skin.name)} card face and back preview">
      <span class="skin-preview-card skin-preview-face skin-preview-juan-face" aria-hidden="true"><small>1</small><b>1</b></span>
      <span class="skin-preview-card skin-preview-face skin-preview-juan-prism" aria-hidden="true"><small>PRISM</small><b>✦</b></span>
      ${renderCardBack({ deckFamilyId: skin.deckFamilyId, skinId: skin.id, context: "settings-preview", className: "skin-preview-card skin-preview-back skin-preview-juan-back", ariaHidden: true, parts: [{ tag: "strong", text: "JUAN" }] })}
    </div>`;
}

function renderSkinSetting(deckFamilyId) {
  const skins = cardSkins.skinsForFamily(deckFamilyId);
  const selected = selectedCardSkin(deckFamilyId);
  const family = appearanceFamilyName(deckFamilyId);
  if (!selected || !skins.length) return "";
  const inputId = `settings-skin-${deckFamilyId}`;
  return `
    <article class="skin-setting" data-skin-setting="${escapeHtml(deckFamilyId)}">
      <div class="skin-setting-heading"><span><strong>${escapeHtml(family.name)}</strong><small>${escapeHtml(family.shortName)}</small></span><span class="badge">${skins.length} skin${skins.length === 1 ? "" : "s"}</span></div>
      <div class="field">
        <label for="${escapeHtml(inputId)}">Card skin</label>
        <select id="${escapeHtml(inputId)}" name="skin-${escapeHtml(deckFamilyId)}" data-skin-family="${escapeHtml(deckFamilyId)}">
          ${skins.map((skin) => `<option value="${escapeHtml(skin.id)}" ${skin.id === selected.id ? "selected" : ""}>${escapeHtml(skin.name)}</option>`).join("")}
        </select>
      </div>
      ${renderSkinPreview(selected)}
      <p class="skin-description" data-skin-description>${escapeHtml(selected.description)}</p>
    </article>`;
}

function renderTableSkinPreview(tableSkin) {
  return `
    <div class="table-skin-preview ${tableSkin.className}" data-table-skin-preview role="img" aria-label="${escapeHtml(tableSkin.name)} card table preview">
      <span>Table felt</span><i aria-hidden="true"></i>
    </div>`;
}

function renderTableSkinSetting() {
  const skins = cardSkins.tableSkins();
  const selected = selectedTableSkin();
  if (!selected || !skins.length) return "";
  return `
    <article class="skin-setting table-skin-setting" data-table-skin-setting>
      <div class="skin-setting-heading"><span><strong>Card table</strong><small>All game modes</small></span><span class="badge">${skins.length} skin${skins.length === 1 ? "" : "s"}</span></div>
      <div class="field">
        <label for="settings-table-skin">Table skin</label>
        <select id="settings-table-skin" name="tableSkin" data-table-skin>
          ${skins.map((skin) => `<option value="${escapeHtml(skin.id)}" ${skin.id === selected.id ? "selected" : ""}>${escapeHtml(skin.name)}</option>`).join("")}
        </select>
      </div>
      ${renderTableSkinPreview(selected)}
      <p class="skin-description" data-table-skin-description>${escapeHtml(selected.description)}</p>
    </article>`;
}

function renderLegacyModePreview() {
  return `
    <span class="legacy-mode-preview" role="img" aria-label="Legacy illustrated court card and blue patterned back preview">
      <span class="legacy-preview-card legacy-preview-face" aria-hidden="true">
        <span><strong>K</strong><i>♠</i></span>
        <svg viewBox="0 0 100 140" preserveAspectRatio="xMidYMid meet"><use href="#card-face-king"></use></svg>
      </span>
      <span class="legacy-preview-card legacy-preview-back" aria-hidden="true"></span>
    </span>`;
}

function renderSettings() {
  const reducedMotion = localStorage.getItem(storageKeys.reducedMotion) === "true";
  return `
    ${screenHeader("Options", "Readable first, physical second, pixelated with restraint.")}
    <div class="form-panel">
      <form data-form="settings">
        <div class="field"><label for="settings-name">Default player name</label><input id="settings-name" name="name" maxlength="24" value="${escapeHtml(playerName())}" autocomplete="nickname"></div>
        <div class="settings-grid">
          <button class="setting-row settings-submenu-button" type="button" data-action="open-appearance-settings">
            <span><strong>Appearance &amp; skins</strong><p>Choose table felt, card decks, and Legacy Mode.</p></span><span class="settings-submenu-arrow" aria-hidden="true">›</span>
          </button>
          <label class="setting-row"><span><strong>Reduce card motion</strong><p>Use gentler transitions when game modules are connected.</p></span><input type="checkbox" name="reducedMotion" ${reducedMotion ? "checked" : ""}></label>
          <div class="setting-row"><span><strong>Sound</strong><p>Audio controls arrive with the shared game runtime.</p></span><span class="badge">Coming later</span></div>
        </div>
        <button class="action-button primary" type="submit" style="margin-top:1rem">Save options</button>
      </form>
    </div>`;
}

function renderAppearanceSettings() {
  const legacyMode = appearancePreferences.legacyMode === true;
  return `
    ${screenHeader("Appearance & skins", "Choose a table skin and a card skin for each deck family.", "open-settings")}
    <div class="form-panel">
      <form data-form="appearance-settings">
        <section class="appearance-settings appearance-settings-screen" aria-labelledby="appearance-settings-title">
          <div class="appearance-settings-heading"><span><strong id="appearance-settings-title">Table and card appearance</strong><p>Appearance is saved only on this device and never changes a room or its rules.</p></span><span class="badge">Local only</span></div>
          <div class="table-skin-grid">${renderTableSkinSetting()}</div>
          <p class="appearance-section-label">Card decks</p>
          <div class="appearance-family-grid">
            ${Object.keys(cardSkins.DEFAULT_SKIN_IDS).map(renderSkinSetting).join("")}
          </div>
        </section>
        <div class="settings-grid">
          <label class="setting-row legacy-mode-setting">
            <span class="legacy-mode-copy"><strong>Legacy mode</strong><p>Use the original 3s &amp; 7s and Thirteen illustrated Standard 52 cards in a smaller, flat scrolling hand. Your selected modern skin stays remembered, JUAN is unchanged, and this never enters online room state.</p>${renderLegacyModePreview()}</span>
            <input type="checkbox" name="legacyMode" ${legacyMode ? "checked" : ""}>
          </label>
        </div>
        <button class="action-button primary" type="submit" style="margin-top:1rem">Save appearance</button>
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
    settings: renderSettings,
    "appearance-settings": renderAppearanceSettings
  };
  document.body.classList.toggle("playing-game", ["game", "hot-seat-handoff"].includes(state.screen));
  document.body.classList.toggle("home-screen", state.screen === "home");
  document.body.classList.toggle("legacy-standard-mode", state.screen === "game" && standardLegacyModeEnabled());
  const screen = (screens[state.screen] || renderHome)();
  app.innerHTML = screen;
  syncJuanPrismReveal();
  syncControllerTextEntry();
  if (state.screen === "game") {
    layoutActivePiles();
    layoutStandardHand();
    animateStandardHandReflow(previousHand);
    const firstColor = app.querySelector(".juan-prism-dialog .juan-color-choice");
    if (firstColor) requestAnimationFrame(() => firstColor.focus({ preventScroll: true }));
  }
  if (controllerState.active) requestAnimationFrame(updateControllerHover);
}

function layoutActivePiles() {
  if (!cardPresentation) return;
  app.querySelectorAll(".active-pile.cards-pile").forEach((pile) => {
    const cards = [...pile.querySelectorAll(".playing-card.played")];
    if (!cards.length) return;
    const containerWidth = pile.clientWidth;
    const cardWidth = cards[0].offsetWidth;
    const cardHeight = cards[0].offsetHeight || cardWidth * 1.42;
    if (!containerWidth || !cardWidth) return;
    const layout = cardPresentation.calculateFanLayout({
      count: cards.length,
      containerWidth,
      cardWidth,
      cardHeight,
      // The pile is intentionally shallower than the player's held hand, but
      // still reserves a small outside gutter for rotated card corners.
      sidePadding: 18,
      minimumVisibleIndex: Math.max(14, cardWidth * 0.2),
      maximumRotation: 7,
      curveRatio: 0.08,
      focusLiftRatio: 0,
      selectedLiftRatio: 0
    });
    pile.dataset.pileDensity = layout.density;
    cards.forEach((card, index) => {
      const position = layout.cards[index];
      card.style.setProperty("--pile-x", `${position.x}px`);
      card.style.setProperty("--pile-y", `${position.y}px`);
      card.style.setProperty("--pile-rotation", `${position.rotation}deg`);
      card.style.zIndex = String(position.zIndex);
    });
  });
}

function renderCurrentGame() {
  if (state.room?.gameId === "juan") return renderJuanGame();
  if (state.room?.gameId === "blackjack") return renderBlackjackGame();
  if (state.room?.gameId === "holdem") return renderHoldemGame();
  if (state.room?.gameId === "five-card-draw") return renderFiveCardDrawGame();
  return renderStandardGame();
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
    scrollLeft: hand.scrollLeft,
    cards: new Map(cards.map((card) => [card.dataset.gameCard, card.getBoundingClientRect()]))
  };
}

function animateStandardHandReflow(previousHand) {
  const hand = app.querySelector(".game-hand");
  if (!hand || !previousHand || previousHand.owner !== (hand.dataset.handOwner || "")) return;
  const cards = [...hand.querySelectorAll("[data-game-card]")];
  if (hand.classList.contains("legacy-flat-hand")) hand.scrollLeft = previousHand.scrollLeft || 0;
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
  if (!hand) return;
  const cards = [...hand.querySelectorAll("[data-game-card]")];
  if (!cards.length) return;
  if (standardLegacyModeEnabled()) {
    // A render replaces the table DOM. Settle the replacement legacy row while
    // card transitions are disabled, then enable interaction transitions for
    // genuine selection changes. Otherwise Chrome can tween from the shared
    // fan transform on every unrelated turn update and make the row bounce.
    hand.classList.remove("fan-ready");
    hand.classList.add("legacy-flat-hand");
    hand.dataset.density = "legacy-flat";
    void hand.offsetWidth;
    hand.classList.add("fan-ready");
    hand.onclick = (event) => {
      const card = event.target.closest?.("[data-game-card]");
      if (!card || !hand.contains(card)) return;
      toggleStandardCard(card.dataset.gameCard);
    };
    return;
  }
  if (!cardPresentation) return;
  const containerWidth = hand.clientWidth;
  const cardWidth = cards[0].offsetWidth;
  const cardHeight = cards[0].offsetHeight || cardWidth * 1.42;
  if (!containerWidth || !cardWidth) return;
  const viewportWidth = window.visualViewport?.width || innerWidth;
  const viewportHeight = window.visualViewport?.height || innerHeight;
  const compactLandscape = viewportWidth > viewportHeight && viewportHeight <= 640;
  const portraitPhone = viewportWidth <= 520 && viewportHeight > viewportWidth;
  const layout = cardPresentation.calculateFanLayout({
    count: cards.length,
    containerWidth,
    cardWidth,
    cardHeight,
    sidePadding: portraitPhone ? 12 : 8,
    minimumVisibleIndex: Math.max(16, cardWidth * 0.2),
    maximumRotation: compactLandscape ? 8 : 11,
    curveRatio: compactLandscape ? 0.06 : portraitPhone ? 0.09 : 0.12,
    focusLiftRatio: compactLandscape ? 0.22 : portraitPhone ? 0.24 : 0.48,
    selectedLiftRatio: compactLandscape ? 0.14 : portraitPhone ? 0.18 : 0.28
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
    if (["blackjack", "holdem"].includes(state.room?.gameId)) return;
    if (state.gameActionLock || !match || match.roundOver || match.activeSeat !== viewer?.seat) return;
    // Browser hit testing already accounts for each card's rotation, visible
    // stacking order, and raised selection state. Re-mapping from broad
    // bounding boxes lets a neighboring card steal otherwise precise clicks.
    const targetCard = event.target.closest?.("[data-game-card]");
    if (!targetCard || !hand.contains(targetCard)) return;
    event.preventDefault();
    toggleStandardCard(targetCard.dataset.gameCard);
  };
}

function toggleStandardCard(cardId) {
  const match = state.gameView?.state;
  const viewer = state.room?.players.find((player) => player.isYou);
  if (["blackjack", "holdem"].includes(state.room?.gameId)) return;
  if (state.gameActionLock || !match || match.roundOver || match.activeSeat !== viewer?.seat) return;
  if (state.room?.gameId === "five-card-draw") {
    if (match.phase !== "draw" || !match.actions?.draw) return;
    if (state.selectedCards.has(cardId)) state.selectedCards.delete(cardId);
    else if (state.selectedCards.size < (match.actions.maxDrawCards || 5)) state.selectedCards.add(cardId);
    else showToast(`You can replace up to ${match.actions.maxDrawCards || 5} cards.`);
    render();
    return;
  }
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

  app.querySelectorAll('[data-action="game-play"], [data-action="game-pass"], [data-action="five-card-draw-draw"]')
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
  if (!view) return null;
  return {
    ...view,
    hand: [],
    hands: Array.isArray(view.hands)
      ? view.hands.map((hand) => ({ ...hand, cards: [] }))
      : view.hands
  };
}

function isHotSeatCpuTurn(view) {
  const match = view?.state;
  if (!match || match.roundOver) return false;
  if (match.phase === "dealer-turn") return true;
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
  clearJuanPrismReveal();
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
  clearJuanPrismReveal();
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
  const socket = new WebSocket(`${protocol}//${location.host}${appPath("/ws")}`);
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
        clearJuanPrismReveal();
        state.gameActionLock = false;
        state.dealtHandOwners = new Set();
        state.lastPileSignature = null;
        navigate("room");
      } else if (state.screen === "room") render();
    } else if (message.type === "game_state" && supportsGame(message.gameId)) {
      queueJuanPrismReveal(message.gameId, state.gameView, message.view);
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
      const handIds = new Set(
        Array.isArray(message.view.hand)
          ? message.view.hand.map((card) => card.id)
          : blackjackPrivateCards(message.view).map((card) => card.id)
      );
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
  const selectedRoomFamily = compatibleDeckFamilies("multiplayer")
    .find((family) => family.games.some((game) => game.id === session.room?.gameId));
  setDeckFamilyForMode("multiplayer", selectedRoomFamily?.id || state.selectedDeckFamilyId);
  localStorage.setItem(storageKeys.room, JSON.stringify(state.session));
  connectRoom(state.session);
  navigate("room");
}

function enterGameSession(session, mode) {
  clearJuanPrismReveal();
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

  if (action.startsWith("controller-key")) {
    handleControllerKeyboardAction(button);
    return;
  }

  if (action === "install-pwa") await requestAppInstall();
  if (action === "dismiss-install-help") {
    if (typeof installDialog?.close === "function") installDialog.close();
    else installDialog?.removeAttribute("open");
  }
  if (action === "apply-app-update") {
    const registration = pwaState.serviceWorkerRegistration;
    if (activateWaitingWorker(registration, button)) return;
    if (!registration) {
      restoreAppUpdateButton(button, "Cardcade is still checking for an update.");
      return;
    }
    button.disabled = true;
    registration.update().then(() => {
      if (activateWaitingWorker(registration, button)) return;
      button.disabled = false;
      pwaState.updateAvailable = false;
      renderShellStatus();
      showToast("Cardcade is already up to date.");
    }).catch(() => {
      restoreAppUpdateButton(button, "Cardcade could not check for an update. Try again.");
    });
  }
  if (action === "home") navigate("home");
  if (action === "open-solo") {
    state.mode = "solo";
    state.selectedGameId = null;
    setDeckFamilyForMode("solo");
    navigate("library");
  }
  if (action === "open-hot-seat") {
    state.mode = "hot-seat";
    state.selectedGameId = null;
    state.hotSeatPlayerCount = 1;
    state.hotSeatBots = 2;
    state.hotSeatNames = [];
    setDeckFamilyForMode("hot-seat");
    navigate("library");
  }
  if (action === "open-multiplayer") navigate("multiplayer");
  if (action === "open-settings") navigate("settings");
  if (action === "open-appearance-settings") navigate("appearance-settings");
  if (action === "back-to-library") navigate("library");
  if (action === "multiplayer-tab") { state.multiplayerTab = button.dataset.tab; render(); }
  if (action === "select-deck-family") {
    const mode = state.screen === "room" ? "multiplayer" : state.mode;
    if (mode && compatibleDeckFamilies(mode).some((family) => family.id === button.dataset.familyId)) {
      state.selectedDeckFamilyId = button.dataset.familyId;
      render();
    }
  }
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
  if (action === "select-room-game") {
    const family = compatibleDeckFamilies("multiplayer")
      .find((candidate) => candidate.games.some((game) => game.id === button.dataset.gameId));
    if (family) state.selectedDeckFamilyId = family.id;
    sendRoom({ type: "select_game", gameId: button.dataset.gameId });
  }
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
  if (action === "cancel-juan-color") {
    state.selectedCards.clear();
    state.juanChosenColor = null;
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
        // A hinted Prism still belongs to the player: open the same color
        // picker instead of silently choosing a lane for them.
        state.juanChosenColor = null;
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
  if (action === "blackjack-hint") {
    if (state.gameActionLock || !state.gameView || !blackjackRules) return;
    const match = state.gameView.state;
    if (match.phase === "insurance") {
      showToast("Insurance is optional: it only pays when the dealer has Blackjack.");
      return;
    }
    const hand = currentBlackjackHand();
    const actions = match.actions || {};
    if (!hand || !Object.values(actions).some(Boolean)) {
      showToast("Wait for the dealer or the next player.");
      return;
    }
    const suggested = blackjackRules.chooseBotAction({
      cards: hand.cards,
      dealerUpcard: match.dealer?.cards?.[0],
      actionsTaken: hand.actionsTaken,
      isSplitHand: hand.isSplitHand,
      handCount: state.gameView.hands?.length || 1
    });
    const legalSuggestion = actions[suggested] ? suggested : (actions.hit ? "hit" : "stand");
    showToast(`Hint: ${blackjackActionLabel(legalSuggestion)} on ${hand.label}.`);
  }
  if (action === "blackjack-insurance") {
    if (state.gameActionLock) return;
    state.gameActionLock = true;
    if (!sendRoom({ type: "blackjack_insurance", take: button.dataset.take === "true" })) {
      state.gameActionLock = false;
      render();
    }
  }
  if (action === "blackjack-action") {
    if (state.gameActionLock || !button.dataset.blackjackAction) return;
    state.gameActionLock = true;
    if (!sendRoom({ type: button.dataset.blackjackAction })) {
      state.gameActionLock = false;
      render();
    }
  }
  if (action === "holdem-hint") {
    if (state.gameActionLock || !state.gameView || !holdemRules) return;
    const match = state.gameView.state;
    const actions = match.actions || {};
    if (!Object.values(actions).some(Boolean)) {
      showToast("Wait for the next Poker decision.");
      return;
    }
    const handLabel = holdemPrivateHandLabel(state.gameView.hand, match.communityCards);
    if (actions.check && actions.bet) showToast(`Hint: ${handLabel}. You can check or make the ${formatPoints(actions.betAmount)}-point limit bet.`);
    else if (actions.check) showToast(`Hint: ${handLabel}. Checking is free here.`);
    else if (actions.raise) showToast(`Hint: ${handLabel}. Call ${formatPoints(actions.callAmount)} or raise to ${formatPoints((match.currentBet || 0) + (match.betSize || 0))}.`);
    else if (actions.call) showToast(`Hint: ${handLabel}. It costs ${formatPoints(actions.callAmount)} to continue.`);
    else showToast(`Hint: ${handLabel}.`);
  }
  if (action === "holdem-action") {
    if (state.gameActionLock || !button.dataset.holdemAction) return;
    state.gameActionLock = true;
    if (!sendRoom({ type: button.dataset.holdemAction })) {
      state.gameActionLock = false;
      render();
    }
  }
  if (action === "holdem-next-hand") {
    state.selectedCards.clear();
    if (state.gameMode === "hot-seat") state.hotSeatForceHandoff = true;
    if (!sendRoom({ type: "holdem_next_hand" })) state.hotSeatForceHandoff = false;
  }
  if (action === "five-card-draw-hint") {
    if (state.gameActionLock || !state.gameView || !fiveCardDrawRules) return;
    const match = state.gameView.state;
    const actions = match.actions || {};
    if (match.phase === "draw" && actions.draw) {
      const selected = state.selectedCards.size;
      if (selected) showToast(`${selected} card${selected === 1 ? " is" : "s are"} marked to replace. Tap Replace when ready.`);
      else showToast("Select zero to five cards to replace. Leave none selected to stand pat.");
      return;
    }
    if (!Object.values(actions).some(Boolean)) {
      showToast("Wait for the next Five Card Draw decision.");
      return;
    }
    const handLabel = fiveCardDrawPrivateHandLabel(state.gameView.hand, match);
    if (actions.check && actions.bet) showToast(`Hint: ${handLabel}. You can check or make the ${formatPoints(actions.betAmount)}-point limit bet.`);
    else if (actions.check) showToast(`Hint: ${handLabel}. Checking is free here.`);
    else if (actions.raise) showToast(`Hint: ${handLabel}. Call ${formatPoints(actions.callAmount)} or raise to ${formatPoints((match.currentBet || 0) + (match.betSize || 0))}.`);
    else if (actions.call) showToast(`Hint: ${handLabel}. It costs ${formatPoints(actions.callAmount)} to continue.`);
    else showToast(`Hint: ${handLabel}.`);
  }
  if (action === "five-card-draw-action") {
    if (state.gameActionLock || !button.dataset.fiveCardDrawAction) return;
    state.gameActionLock = true;
    if (!sendRoom({ type: button.dataset.fiveCardDrawAction })) {
      state.gameActionLock = false;
      render();
    }
  }
  if (action === "five-card-draw-draw") {
    if (state.gameActionLock || state.gameView?.state?.phase !== "draw" || !state.gameView?.state?.actions?.draw) return;
    state.gameActionLock = true;
    const cardIds = [...state.selectedCards];
    animateStandardHandExit(cardIds, () => {
      state.selectedCards.clear();
      if (!sendRoom({ type: "five_card_draw_draw", cardIds })) {
        state.gameActionLock = false;
        render();
      }
    });
  }
  if (action === "five-card-draw-next-hand") {
    state.selectedCards.clear();
    if (state.gameMode === "hot-seat") state.hotSeatForceHandoff = true;
    if (!sendRoom({ type: "five_card_draw_next_hand" })) state.hotSeatForceHandoff = false;
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
  if (event.key === "Escape" && app.querySelector(".juan-prism-dialog")) {
    event.preventDefault();
    state.selectedCards.clear();
    state.juanChosenColor = null;
    render();
    return;
  }
  const card = event.target.closest?.("[data-game-card]");
  if (!card || !["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  toggleStandardCard(card.dataset.gameCard);
});

let gameTableLayoutFrame = null;
function scheduleGameTableLayout() {
  if (state.screen !== "game" || gameTableLayoutFrame !== null) return;
  gameTableLayoutFrame = requestAnimationFrame(() => {
    gameTableLayoutFrame = null;
    layoutActivePiles();
    layoutStandardHand();
  });
}

window.addEventListener("resize", scheduleGameTableLayout);
window.visualViewport?.addEventListener("resize", scheduleGameTableLayout);
window.addEventListener("resize", () => clampControllerCursor());

document.addEventListener("pointermove", (event) => {
  if (!event.isTrusted) return;
  hideControllerCursor();
}, { passive: true });

document.addEventListener("change", (event) => {
  const tableSelect = event.target.closest?.("[data-table-skin]");
  if (tableSelect) {
    const tableSkin = cardSkins.resolveTableSkin(tableSelect.value);
    const setting = tableSelect.closest("[data-table-skin-setting]");
    const preview = setting?.querySelector("[data-table-skin-preview]");
    const description = setting?.querySelector("[data-table-skin-description]");
    if (preview && tableSkin) preview.outerHTML = renderTableSkinPreview(tableSkin);
    if (description && tableSkin) description.textContent = tableSkin.description;
    return;
  }
  const select = event.target.closest?.("[data-skin-family]");
  if (!select) return;
  const deckFamilyId = select.dataset.skinFamily;
  const skin = cardSkins.resolveSkin(deckFamilyId, select.value);
  const setting = select.closest("[data-skin-setting]");
  const preview = setting?.querySelector("[data-skin-preview]");
  const description = setting?.querySelector("[data-skin-description]");
  if (preview && skin) preview.outerHTML = renderSkinPreview(skin);
  if (description && skin) description.textContent = skin.description;
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
    if (formType === "appearance-settings") {
      saveAppearancePreferences({
        skins: Object.fromEntries(Object.keys(cardSkins.DEFAULT_SKIN_IDS).map((deckFamilyId) => [
          deckFamilyId,
          String(data.get(`skin-${deckFamilyId}`) || "")
        ])),
        tableSkin: String(data.get("tableSkin") || ""),
        legacyMode: data.get("legacyMode") === "on"
      });
      showToast("Appearance saved.");
      navigate("settings");
    }
  } catch (error) {
    showToast(error.message);
  } finally {
    submit?.removeAttribute("disabled");
  }
});

async function boot() {
  setupPwaShell();
  setupControllerCursor();
  try {
    state.catalog = await api("/api/catalog");
    render();
  } catch (error) {
    app.innerHTML = `<div class="empty-state"><h2>Cardcade could not start.</h2><p class="error-text">${escapeHtml(error.message)}</p></div>`;
  }
}

function setupControllerCursor() {
  if (!controllerCursor || !controllerInput?.createGamepadInput) return;
  controllerState.input = controllerInput.createGamepadInput({
    onMove: ({ x, y }) => moveControllerCursor(x, y),
    onScroll: ({ left, top }) => scrollControllerPage(left, top),
    onButton: handleControllerButton,
    onActivity: showControllerCursor,
    onDisconnect: hideControllerCursor
  });
  controllerState.input.start();
}

function clampControllerCursor() {
  controllerState.cursorX = Math.round(Math.min(Math.max(0, controllerState.cursorX), Math.max(0, innerWidth - 1)));
  controllerState.cursorY = Math.round(Math.min(Math.max(0, controllerState.cursorY), Math.max(0, innerHeight - 1)));
  renderControllerCursor();
}

function moveControllerCursor(deltaX, deltaY) {
  controllerState.cursorX += Number(deltaX) || 0;
  controllerState.cursorY += Number(deltaY) || 0;
  clampControllerCursor();
  showControllerCursor();
  updateControllerHover();
}

function scrollControllerPage(deltaX, deltaY) {
  const left = Number(deltaX) || 0;
  const top = Number(deltaY) || 0;
  if (!left && !top) return;
  // Gamepad axes and scroll offsets share their direction signs, so up/left
  // remain negative and down/right remain positive.
  window.scrollBy({ left, top, behavior: "auto" });
}

function renderControllerCursor() {
  if (!controllerCursor) return;
  controllerCursor.style.transform = `translate3d(${controllerState.cursorX - 15}px, ${controllerState.cursorY - 15}px, 0)`;
}

function showControllerCursor() {
  if (!controllerCursor) return;
  controllerState.active = true;
  controllerCursor.hidden = false;
  document.body.classList.add("controller-active");
  renderControllerCursor();
}

function hideControllerCursor() {
  if (!controllerCursor || !controllerState.active) return;
  controllerState.active = false;
  controllerCursor.hidden = true;
  document.body.classList.remove("controller-active");
  setControllerHoverTarget(null);
}

function handleControllerButton(action) {
  if (action === "activate") {
    activateControllerTarget();
    return;
  }
  if (action === "back") {
    controllerBack();
    return;
  }
  const target = controllerState.hoveredTarget || controllerTargetAtPoint();
  if (["left", "right"].includes(action) && target?.matches?.("select:not([disabled])")) {
    cycleControllerSelect(target, action === "left" ? -1 : 1);
    return;
  }
  moveControllerFocus(action);
}

function controllerTargetScope() {
  return controllerKeyboardRoot?.querySelector(".controller-keyboard-dialog")
    || document.querySelector("dialog[open]")
    || app.querySelector(".juan-prism-dialog")
    || app.querySelector(".round-result")
    || document;
}

function controllerTargets(scope = controllerTargetScope()) {
  const selector = [
    "button:not([disabled]):not(.playing-card)",
    ".playing-card.selectable:not([disabled])",
    "input:not([disabled]):not([type=hidden])",
    "select:not([disabled])",
    "textarea:not([disabled])"
  ].join(",");
  return [...scope.querySelectorAll(selector)].filter((target) => {
    if (target.closest("[hidden], [aria-hidden=\"true\"]")) return false;
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = getComputedStyle(target);
    return style.display !== "none" && style.visibility !== "hidden" && style.pointerEvents !== "none";
  });
}

function controllerTargetAtPoint(clientX = controllerState.cursorX, clientY = controllerState.cursorY) {
  const scope = controllerTargetScope();
  const element = document.elementFromPoint(clientX, clientY);
  const target = element?.closest?.("button:not([disabled]):not(.playing-card), .playing-card.selectable:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled])");
  return target && scope.contains(target) && controllerTargets(scope).includes(target) ? target : null;
}

function setControllerHoverTarget(target, { focus = false } = {}) {
  const previous = controllerState.hoveredTarget;
  if (previous && previous !== target) previous.classList.remove("controller-hover", "controller-focus");
  controllerState.hoveredTarget = target || null;
  if (!target) return;
  target.classList.add("controller-hover");
  if (focus) {
    target.classList.add("controller-focus");
    target.focus?.({ preventScroll: true });
  }
}

function updateControllerHover() {
  if (!controllerState.active) return;
  setControllerHoverTarget(controllerTargetAtPoint());
}

function moveControllerFocus(direction) {
  const scope = controllerTargetScope();
  const targets = controllerTargets(scope);
  if (!targets.length || !controllerInput?.directionalTarget) return;
  const current = controllerState.hoveredTarget && targets.includes(controllerState.hoveredTarget)
    ? controllerState.hoveredTarget
    : controllerTargetAtPoint();
  const cardNeighbor = controllerCardNeighbor(current, direction);
  if (cardNeighbor) {
    focusControllerTarget(cardNeighbor);
    return;
  }
  const currentRect = current?.getBoundingClientRect();
  const origin = currentRect
    ? { x: (currentRect.left + currentRect.right) / 2, y: (currentRect.top + currentRect.bottom) / 2 }
    : { x: controllerState.cursorX, y: controllerState.cursorY };
  const candidates = targets.filter((target) => target !== current).map((target) => {
    const rect = target.getBoundingClientRect();
    return { target, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
  });
  const next = controllerInput.directionalTarget(candidates, origin, direction)?.target;
  if (!next) return;
  focusControllerTarget(next);
}

function controllerCardNeighbor(current, direction) {
  if (!current?.matches?.(".playing-card.selectable") || !["left", "right"].includes(direction)) return null;
  const hand = current.closest(".game-hand");
  if (!hand) return null;
  const cards = controllerTargets(hand)
    .filter((target) => target.matches(".playing-card.selectable"))
    .sort((left, right) => Number(left.dataset.fanIndex) - Number(right.dataset.fanIndex));
  const index = cards.indexOf(current);
  if (index < 0) return null;
  return cards[index + (direction === "left" ? -1 : 1)] || null;
}

function focusControllerTarget(target) {
  target.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  const rect = target.getBoundingClientRect();
  controllerState.cursorX = Math.round((rect.left + rect.right) / 2);
  controllerState.cursorY = Math.round((rect.top + rect.bottom) / 2);
  clampControllerCursor();
  showControllerCursor();
  // Keep navigation over text fields from summoning a device keyboard. A
  // opens Cardcade's controller keyboard instead.
  setControllerHoverTarget(target, { focus: !isControllerTextTarget(target) });
}

function activateControllerTarget() {
  const target = controllerState.hoveredTarget || controllerTargetAtPoint();
  if (!target || !controllerTargets().includes(target)) return;
  if (isControllerTextTarget(target)) {
    openControllerTextEntry(target);
    return;
  }
  if (target.matches?.("select:not([disabled])")) {
    cycleControllerSelect(target, 1);
    return;
  }
  target.focus?.({ preventScroll: true });
  target.click?.();
}

function controllerBack() {
  if (controllerTextState.inputId) {
    closeControllerTextEntry({ save: false });
    return;
  }
  if (installDialog?.open) {
    installDialog.close();
    return;
  }
  const prismCancel = app.querySelector('[data-action="cancel-juan-color"]');
  if (prismCancel) {
    prismCancel.click();
    return;
  }
  if (document.activeElement?.matches?.("input, select, textarea")) {
    document.activeElement.blur();
    return;
  }
  if (state.screen === "game" && state.selectedCards.size) {
    state.selectedCards.clear();
    state.juanChosenColor = null;
    render();
    return;
  }
  const screenBack = app.querySelector(".screen-head .back-button:not([disabled])");
  if (screenBack) {
    screenBack.click();
    return;
  }
  if (["game", "hot-seat-handoff"].includes(state.screen)) showToast("Use the table back button to leave safely.");
}

function isControllerTextTarget(target) {
  if (!target?.matches?.("input, textarea") || target.readOnly) return false;
  return !["button", "checkbox", "color", "date", "datetime-local", "file", "hidden", "image", "month", "radio", "range", "reset", "submit", "time", "week"].includes(String(target.type || "text").toLowerCase());
}

function controllerTextInput() {
  return controllerTextState.inputId ? document.getElementById(controllerTextState.inputId) : null;
}

function controllerTextLabel(input) {
  const label = input?.id
    ? [...document.querySelectorAll("label[for]")].find((candidate) => candidate.htmlFor === input.id)
    : null;
  return label?.textContent?.trim() || input?.getAttribute("aria-label") || input?.placeholder || "Text";
}

function controllerTextCharacters() {
  const letters = controllerTextState.uppercase ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ" : "abcdefghijklmnopqrstuvwxyz";
  return controllerTextState.roomCode ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789" : `${letters}0123456789-_.!?`;
}

function openControllerTextEntry(input) {
  if (!controllerKeyboardRoot || !input?.id) return;
  controllerTextState.inputId = input.id;
  controllerTextState.value = String(input.value || "");
  controllerTextState.originalValue = controllerTextState.value;
  controllerTextState.roomCode = input.name === "code" || input.id === "join-code";
  controllerTextState.uppercase = controllerTextState.roomCode || input.autocapitalize === "characters";
  renderControllerTextEntry();
}

function syncControllerTextEntry() {
  if (!controllerTextState.inputId) return;
  const input = controllerTextInput();
  if (!input) {
    resetControllerTextEntry();
    return;
  }
  input.value = controllerTextState.value;
  renderControllerTextEntry();
}

function renderControllerTextEntry({ focusKey = "", focusAction = "" } = {}) {
  if (!controllerKeyboardRoot) return;
  const input = controllerTextInput();
  if (!input) {
    resetControllerTextEntry();
    return;
  }
  const value = controllerTextState.value;
  const keys = [...controllerTextCharacters()].map((key) => `
    <button class="controller-keyboard-key" type="button" data-action="controller-key" data-key="${escapeHtml(key)}">${escapeHtml(key)}</button>`).join("");
  const modifiers = controllerTextState.roomCode ? "" : `
      <button class="controller-keyboard-action" type="button" data-action="controller-key-shift">${controllerTextState.uppercase ? "abc" : "ABC"}</button>
      <button class="controller-keyboard-action" type="button" data-action="controller-key-space">Space</button>`;
  controllerKeyboardRoot.innerHTML = `
    <section class="controller-keyboard-dialog" role="dialog" aria-modal="true" aria-labelledby="controller-keyboard-title">
      <div class="controller-keyboard-panel">
        <p class="controller-keyboard-kicker">Controller keyboard</p>
        <h2 class="controller-keyboard-title" id="controller-keyboard-title">${escapeHtml(controllerTextLabel(input))}</h2>
        <p class="controller-keyboard-help">D-pad or left stick moves the cursor. A types or chooses. B cancels.</p>
        <output class="controller-keyboard-value ${value ? "" : "empty"}" aria-live="polite">${value ? escapeHtml(value) : "Enter text"}</output>
        <div class="controller-keyboard-keys">${keys}</div>
        <div class="controller-keyboard-actions">
          ${modifiers}
          <button class="controller-keyboard-action" type="button" data-action="controller-key-backspace">Delete</button>
          <button class="controller-keyboard-action" type="button" data-action="controller-key-clear">Clear</button>
          <button class="controller-keyboard-action" type="button" data-action="controller-key-cancel">Cancel</button>
          <button class="controller-keyboard-action done" type="button" data-action="controller-key-done">Done</button>
        </div>
      </div>
    </section>`;
  setControllerHoverTarget(null);
  if (controllerState.active) {
    requestAnimationFrame(() => {
      const buttons = [...controllerKeyboardRoot.querySelectorAll("button")];
      const target = (focusKey && buttons.find((button) => button.dataset.key === focusKey))
        || (focusAction && buttons.find((button) => button.dataset.action === focusAction))
        || buttons.find((button) => button.dataset.action === "controller-key")
        || buttons[0];
      if (target) focusControllerTarget(target);
    });
  }
}

function appendControllerText(character) {
  const input = controllerTextInput();
  if (!input || !character) return false;
  const value = controllerTextState.roomCode ? character.toUpperCase() : character;
  const maximumLength = Number(input.maxLength);
  if (maximumLength >= 0 && controllerTextState.value.length + value.length > maximumLength) {
    showToast(`This field allows up to ${maximumLength} characters.`);
    return false;
  }
  controllerTextState.value += value;
  applyControllerTextValue();
  return true;
}

function applyControllerTextValue({ changed = false } = {}) {
  const input = controllerTextInput();
  if (!input) return;
  input.value = controllerTextState.value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  if (changed) input.dispatchEvent(new Event("change", { bubbles: true }));
}

function handleControllerKeyboardAction(button) {
  const action = button.dataset.action;
  if (action === "controller-key") {
    const key = button.dataset.key || "";
    if (controllerTextCharacters().includes(key) && appendControllerText(key)) {
      renderControllerTextEntry({ focusKey: key });
    }
    return;
  }
  if (action === "controller-key-shift") {
    controllerTextState.uppercase = !controllerTextState.uppercase;
    renderControllerTextEntry({ focusAction: action });
    return;
  }
  if (action === "controller-key-space") {
    if (appendControllerText(" ")) renderControllerTextEntry({ focusAction: action });
    return;
  }
  if (action === "controller-key-backspace") {
    controllerTextState.value = [...controllerTextState.value].slice(0, -1).join("");
    applyControllerTextValue();
    renderControllerTextEntry({ focusAction: action });
    return;
  }
  if (action === "controller-key-clear") {
    controllerTextState.value = "";
    applyControllerTextValue();
    renderControllerTextEntry({ focusAction: action });
    return;
  }
  if (action === "controller-key-cancel") closeControllerTextEntry({ save: false });
  if (action === "controller-key-done") closeControllerTextEntry({ save: true });
}

function closeControllerTextEntry({ save }) {
  const input = controllerTextInput();
  if (input) {
    controllerTextState.value = save ? controllerTextState.value : controllerTextState.originalValue;
    applyControllerTextValue({ changed: save });
  }
  resetControllerTextEntry();
  if (input && controllerState.active) requestAnimationFrame(() => focusControllerTarget(input));
}

function resetControllerTextEntry() {
  controllerTextState.inputId = "";
  controllerTextState.value = "";
  controllerTextState.originalValue = "";
  controllerTextState.uppercase = false;
  controllerTextState.roomCode = false;
  controllerKeyboardRoot?.replaceChildren();
}

function cycleControllerSelect(select, direction = 1) {
  const options = [...select.options].filter((option) => !option.disabled);
  if (!options.length) return;
  const currentIndex = Math.max(0, options.findIndex((option) => option.value === select.value));
  const nextIndex = (currentIndex + direction + options.length) % options.length;
  select.value = options[nextIndex].value;
  select.dispatchEvent(new Event("input", { bubbles: true }));
  select.dispatchEvent(new Event("change", { bubbles: true }));
  focusControllerTarget(select);
}

boot();
