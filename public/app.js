const app = document.querySelector("#app");
const toast = document.querySelector("#toast");
const installButton = document.querySelector("#install-button");
const installDialog = document.querySelector("#install-dialog");
const installDialogCopy = document.querySelector("#install-dialog-copy");
const networkStatus = document.querySelector("#network-status");
const systemBanner = document.querySelector("#system-banner");
const systemBannerMessage = document.querySelector("#system-banner-message");
const systemBannerAction = systemBanner?.querySelector('[data-action="apply-app-update"]');
const siteShell = document.querySelector(".site-shell");
const skipLink = document.querySelector(".skip-link");
const juanPrismRevealRoot = document.querySelector("#juan-prism-reveal-root");
const findersMakersPresentationRoot = document.querySelector("#finders-makers-presentation-root");
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
  multiplayerPanel: null,
  optionsPanel: null,
  appearanceCategoryIndex: 0,
  appearanceDraft: null,
  selectedGameId: null,
  selectedDeckFamilyId: null,
  libraryStage: "decks",
  libraryGameIndex: 0,
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
  rummyLinkTarget: null,
  rummyPatternHelpOpen: false,
  juanPrismReveal: null,
  juanPrismRevealTimer: null,
  findersBuildSelection: new Set(),
  findersSearchConfirmation: null,
  findersPendingSearch: null,
  findersSearchFlip: null,
  findersSearchFlipTimer: null,
  findersBuildReveal: null,
  findersBuildRevealTimer: null,
  findersPresentedBuildKeys: new Set(),
  findersHotSeatHandoffTimer: null,
  snapCountdownTimer: null,
  gameActionLock: false,
  dealtHandOwners: new Set(),
  lastPileSignature: null,
  renderedScreen: null,
  navigationDirection: "forward"
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
const snapRules = globalThis.CardcadeSnapRules;
const hotSeatFlow = globalThis.CardcadeHotSeat;
const juanDeck = globalThis.CardcadeJuanDeck;
const juanRules = globalThis.JuanRules;
const rotatingRummyDeck = globalThis.CardcadeRotatingRummyDeck;
const rotatingRummyRoutes = globalThis.CardcadeRotatingRummyRoutes;
const rotatingRummyRules = globalThis.RotatingRummyRules;
const blackjackRules = globalThis.CardcadeBlackjackRules;
const holdemRules = globalThis.CardcadeHoldemRules;
const fiveCardDrawRules = globalThis.CardcadeFiveCardDrawRules;
const findersMakersContent = globalThis.CardcadeFindersMakers;
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

let librarySwipeGesture = null;
let librarySuppressDeckClickUntil = 0;

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

const rotatingRummyGameAdapter = {
  gameId: "rotating-rummy",
  rules: rotatingRummyRules,
  deck: rotatingRummyDeck,
  sortModes: ["rank", "color"],
  defaultSort: "rank"
};

function supportsGame(gameId) {
  return Boolean(standardGameAdapters[gameId]) || gameId === "juan" || gameId === "rotating-rummy" || gameId === "finders-makers" || gameId === "blackjack" || gameId === "holdem" || gameId === "five-card-draw" || gameId === "snap";
}

function sortAdapterForGame(gameId = state.room?.gameId) {
  if (gameId === "juan") return juanGameAdapter;
  if (gameId === "rotating-rummy") return rotatingRummyGameAdapter;
  return null;
}

function defaultSortForGame(gameId) {
  return sortAdapterForGame(gameId)?.defaultSort || "rank";
}

function normalizeGameSort(gameId) {
  const adapter = sortAdapterForGame(gameId);
  if (adapter && !adapter.sortModes.includes(state.gameSort)) state.gameSort = adapter.defaultSort;
  if (standardGameAdapters[gameId] && !["rank", "combo", "suit"].includes(state.gameSort)) state.gameSort = "rank";
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
    <div class="screen-head utility-screen-head">
      <button class="back-button" type="button" data-action="${back}" aria-label="Go back">←</button>
      <div>
        <p class="eyebrow">Cardcade</p>
        <h2>${escapeHtml(title)}</h2>
        ${copy ? `<p class="lede">${escapeHtml(copy)}</p>` : ""}
      </div>
    </div>`;
}

function gameShellNav(label, back = "home", backLabel = "Go back") {
  return `
    <div class="screen-head game-shell-nav">
      <button class="back-button" type="button" data-action="${back}" aria-label="${escapeHtml(backLabel)}">←</button>
      <span>${escapeHtml(label)}</span>
    </div>`;
}

function statusLabel(status) {
  return {
    "available": "Playable now",
    "migration-ready": "Next to migrate",
    "planned": "Planned"
  }[status] || status;
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
  if (family.id === "rotating-rummy") return "↻";
  return "▣";
}

function familyForGame(gameId) {
  return state.catalog.families.find((family) => family.games.some((game) => game.id === gameId)) || null;
}

function renderGameObject(game, { compact = false } = {}) {
  const family = familyForGame(game?.id);
  const familyId = family?.id || "standard-52";
  const mark = escapeHtml(deckFamilyMark(family || { id: familyId }));
  return `
    <div class="game-object ${compact ? "compact" : ""}" data-family="${escapeHtml(familyId)}" aria-hidden="true">
      <span class="game-object-shadow"></span>
      <span class="game-object-deck"><small>Cardcade</small><i>${mark}</i><b>${escapeHtml(family?.shortName || "Card deck")}</b></span>
      <span class="game-object-card"><i>${mark}</i></span>
    </div>`;
}

function libraryModeLabel(mode = state.mode) {
  if (mode === "hot-seat") return "HOT SEAT";
  if (mode === "multiplayer") return "MULTIPLAYER";
  return "SOLO";
}

function libraryReducedMotion() {
  return localStorage.getItem(storageKeys.reducedMotion) === "true"
    || matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function libraryOrbitSlot(index, activeIndex, total) {
  if (!total) return 0;
  let delta = (index - activeIndex + total) % total;
  if (delta > total / 2) delta -= total;
  return delta;
}

function renderOrbitalDeck(family, slot, active) {
  const gameCount = family.games.length;
  const mark = escapeHtml(deckFamilyMark(family));
  const accessibleState = active ? "Selected. Open games." : "Rotate this deck toward the front.";
  return `
    <button class="orbital-deck ${active ? "active" : ""}" type="button" data-action="select-orbital-deck" data-family-id="${escapeHtml(family.id)}" data-orbit-slot="${slot}" aria-pressed="${active}" aria-label="${escapeHtml(family.name)}. ${accessibleState}" tabindex="${active ? "0" : "-1"}">
      <span class="orbital-deck-box" data-family="${escapeHtml(family.id)}" aria-hidden="true">
        <span class="deck-box-side deck-box-side-right"><i>${mark}</i></span>
        <span class="deck-box-side deck-box-side-left"><i>${mark}</i></span>
        <span class="deck-box-top"><i>${mark}</i></span>
        <span class="deck-box-bottom"></span>
        <span class="deck-box-rear"><span>${mark}</span><b>Cardcade</b></span>
        <span class="deck-box-front">
          <small>Cardcade</small>
          <span class="deck-box-emblem">${mark}</span>
          <strong>${escapeHtml(family.name)}</strong>
          <b>${gameCount} game${gameCount === 1 ? "" : "s"}</b>
        </span>
      </span>
    </button>`;
}

function renderSpatialGameOptions(family) {
  if (!family?.games?.length) return `<p class="spatial-mode-empty">No games support this table mode.</p>`;
  const focusedIndex = Math.max(0, Math.min(state.libraryGameIndex, family.games.length - 1));
  state.libraryGameIndex = focusedIndex;
  return family.games.map((game, index) => {
    const focused = index === focusedIndex;
    const planned = game.status === "planned";
    return `
      <button class="spatial-game-option ${focused ? "active" : ""}" type="button" role="option" aria-selected="${focused}" data-action="select-library-game" data-game-id="${escapeHtml(game.id)}" data-game-index="${index}" tabindex="${focused ? "0" : "-1"}" ${planned ? "disabled" : ""}>
        <span aria-hidden="true">›</span><strong>${escapeHtml(game.name)}</strong>
      </button>`;
  }).join("");
}

function renderLibrary() {
  const families = compatibleDeckFamilies(state.mode);
  const activeFamily = selectedDeckFamily(state.mode);
  if (!activeFamily) return `<div class="empty-state">No games support this mode yet.</div>`;
  state.selectedDeckFamilyId = activeFamily.id;
  const activeIndex = families.findIndex((family) => family.id === activeFamily.id);
  const showingGames = state.libraryStage === "games";
  const focusedGame = activeFamily.games[Math.max(0, Math.min(state.libraryGameIndex, activeFamily.games.length - 1))] || null;
  const backLabel = showingGames ? "Return to deck selection" : state.mode === "multiplayer" ? "Return to room lobby" : "Return to Cardcade home";
  return `
    <section class="arcade-library-scene ${showingGames ? "show-games" : "show-decks"} ${libraryReducedMotion() ? "reduced-motion" : ""}" data-library-stage="${showingGames ? "games" : "decks"}" data-active-family="${escapeHtml(activeFamily.id)}" aria-label="Cardcade deck and game selection">
      <h1 class="sr-only">Choose a Cardcade deck and game</h1>
      <div class="arcade-library-atmosphere" aria-hidden="true"></div>
      <div class="arcade-library-hud">
        <button class="arcade-library-back" type="button" data-action="library-back" aria-label="${backLabel}">←</button>
        <span>${libraryModeLabel()} · <b>${showingGames ? "GAME SELECT" : "DECK SELECT"}</b></span>
      </div>
      <section class="orbital-deck-stage" aria-label="Deck families" ${showingGames ? "inert" : ""} aria-hidden="${showingGames}">
        <div class="deck-orbit-viewport">
          ${families.map((family, index) => renderOrbitalDeck(family, libraryOrbitSlot(index, activeIndex, families.length), family.id === activeFamily.id)).join("")}
        </div>
        <button class="orbit-step orbit-step-left" type="button" data-action="rotate-library-deck" data-direction="-1" aria-label="Previous deck">‹</button>
        <button class="orbit-step orbit-step-right" type="button" data-action="rotate-library-deck" data-direction="1" aria-label="Next deck">›</button>
        <div class="orbit-readout" aria-live="polite">
          <strong>${escapeHtml(activeFamily.name)}</strong>
          <small>${escapeHtml(activeFamily.shortName)} · ${activeFamily.games.length} game${activeFamily.games.length === 1 ? "" : "s"}</small>
        </div>
      </section>
      <section class="spatial-game-stage" aria-label="Games for ${escapeHtml(activeFamily.name)}" ${showingGames ? "" : "inert"} aria-hidden="${!showingGames}">
        <p class="spatial-game-family">${escapeHtml(activeFamily.shortName)}</p>
        <div class="spatial-mode-list" role="listbox" aria-label="${escapeHtml(activeFamily.name)} games">
          ${renderSpatialGameOptions(activeFamily)}
        </div>
        <p class="spatial-game-context" aria-live="polite">${focusedGame ? `${escapeHtml(focusedGame.eyebrow)} · ${focusedGame.players.min}–${focusedGame.players.max} players` : ""}</p>
      </section>
      <p class="arcade-library-help">${showingGames ? "UP / DOWN TO CHOOSE · CONFIRM TO ENTER · BACK FOR DECKS" : "LEFT / RIGHT TO ORBIT · CONFIRM THE FRONT DECK"}</p>
    </section>`;
}

function syncLibraryGameFocus({ focus = false, controller = false, scroll = true } = {}) {
  const scene = app.querySelector(".arcade-library-scene");
  if (!scene) return;
  const family = selectedDeckFamily(state.mode);
  const options = [...scene.querySelectorAll(".spatial-game-option")];
  if (!family || !options.length) return;
  state.libraryGameIndex = Math.max(0, Math.min(state.libraryGameIndex, options.length - 1));
  options.forEach((option, index) => {
    const active = index === state.libraryGameIndex;
    option.classList.toggle("active", active);
    option.setAttribute("aria-selected", String(active));
    option.tabIndex = active ? 0 : -1;
  });
  const game = family.games[state.libraryGameIndex];
  const context = scene.querySelector(".spatial-game-context");
  if (context && game) context.textContent = `${game.eyebrow} · ${game.players.min}–${game.players.max} players`;
  const target = options[state.libraryGameIndex];
  if (scroll) target?.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: libraryReducedMotion() ? "auto" : "smooth" });
  if (controller && target) focusControllerTarget(target);
  else if (focus) target?.focus?.({ preventScroll: true });
}

function syncLibraryStage({ focus = false, controller = false } = {}) {
  const scene = app.querySelector(".arcade-library-scene");
  if (!scene) return;
  const showingGames = state.libraryStage === "games";
  scene.dataset.libraryStage = showingGames ? "games" : "decks";
  scene.classList.toggle("show-games", showingGames);
  scene.classList.toggle("show-decks", !showingGames);
  const deckStage = scene.querySelector(".orbital-deck-stage");
  const gameStage = scene.querySelector(".spatial-game-stage");
  deckStage?.toggleAttribute("inert", showingGames);
  deckStage?.setAttribute("aria-hidden", String(showingGames));
  gameStage?.toggleAttribute("inert", !showingGames);
  gameStage?.setAttribute("aria-hidden", String(!showingGames));
  const mode = scene.querySelector(".arcade-library-hud span");
  if (mode) mode.innerHTML = `${libraryModeLabel()} · <b>${showingGames ? "GAME SELECT" : "DECK SELECT"}</b>`;
  const help = scene.querySelector(".arcade-library-help");
  if (help) help.textContent = showingGames ? "UP / DOWN TO CHOOSE · CONFIRM TO ENTER · BACK FOR DECKS" : "LEFT / RIGHT TO ORBIT · CONFIRM THE FRONT DECK";
  const back = scene.querySelector(".arcade-library-back");
  if (back) back.setAttribute("aria-label", showingGames ? "Return to deck selection" : state.mode === "multiplayer" ? "Return to room lobby" : "Return to Cardcade home");
  if (showingGames) syncLibraryGameFocus({ focus, controller });
  else if (focus || controller) {
    const activeDeck = scene.querySelector(".orbital-deck.active");
    if (controller && activeDeck) focusControllerTarget(activeDeck);
    else activeDeck?.focus?.({ preventScroll: true });
  }
}

function syncLibraryCarousel({ focus = false, controller = false } = {}) {
  const scene = app.querySelector(".arcade-library-scene");
  const families = compatibleDeckFamilies(state.mode);
  const family = selectedDeckFamily(state.mode);
  if (!scene || !family || !families.length) return;
  const activeIndex = families.findIndex((candidate) => candidate.id === family.id);
  scene.dataset.activeFamily = family.id;
  for (const deck of scene.querySelectorAll(".orbital-deck")) {
    const index = families.findIndex((candidate) => candidate.id === deck.dataset.familyId);
    const active = index === activeIndex;
    deck.dataset.orbitSlot = String(libraryOrbitSlot(index, activeIndex, families.length));
    deck.classList.toggle("active", active);
    deck.setAttribute("aria-pressed", String(active));
    deck.setAttribute("aria-label", `${families[index].name}. ${active ? "Selected. Open games." : "Rotate this deck toward the front."}`);
    deck.tabIndex = active ? 0 : -1;
  }
  const readout = scene.querySelector(".orbit-readout");
  if (readout) readout.innerHTML = `<strong>${escapeHtml(family.name)}</strong><small>${escapeHtml(family.shortName)} · ${family.games.length} game${family.games.length === 1 ? "" : "s"}</small>`;
  const gameStage = scene.querySelector(".spatial-game-stage");
  if (gameStage) {
    gameStage.setAttribute("aria-label", `Games for ${family.name}`);
    const label = gameStage.querySelector(".spatial-game-family");
    if (label) label.textContent = family.shortName;
    const list = gameStage.querySelector(".spatial-mode-list");
    if (list) {
      list.setAttribute("aria-label", `${family.name} games`);
      list.innerHTML = renderSpatialGameOptions(family);
    }
  }
  syncLibraryGameFocus({ scroll: false });
  if (focus || controller) {
    const activeDeck = scene.querySelector(".orbital-deck.active");
    if (controller && activeDeck) focusControllerTarget(activeDeck);
    else activeDeck?.focus?.({ preventScroll: true });
  }
}

function rotateLibraryDeck(direction, { focus = true, controller = false } = {}) {
  if (state.screen !== "library" || state.libraryStage !== "decks") return;
  const families = compatibleDeckFamilies(state.mode);
  const activeFamily = selectedDeckFamily(state.mode);
  const activeIndex = families.findIndex((family) => family.id === activeFamily?.id);
  if (activeIndex < 0 || families.length < 2) return;
  const nextIndex = (activeIndex + (direction < 0 ? -1 : 1) + families.length) % families.length;
  state.selectedDeckFamilyId = families[nextIndex].id;
  state.libraryGameIndex = 0;
  syncLibraryCarousel({ focus, controller });
}

function openLibraryGames({ controller = false } = {}) {
  if (state.screen !== "library") return;
  const family = selectedDeckFamily(state.mode);
  if (!family?.games?.length) return;
  state.libraryStage = "games";
  state.libraryGameIndex = Math.max(0, Math.min(state.libraryGameIndex, family.games.length - 1));
  syncLibraryStage({ focus: !controller, controller });
}

function libraryBack({ controller = false } = {}) {
  if (state.screen !== "library") return false;
  if (state.libraryStage === "games") {
    state.libraryStage = "decks";
    syncLibraryStage({ focus: !controller, controller });
  } else {
    navigate(state.mode === "multiplayer" && state.room ? "room" : "home");
  }
  return true;
}

function moveLibraryGameFocus(direction, { controller = false } = {}) {
  if (state.screen !== "library" || state.libraryStage !== "games") return;
  const games = selectedDeckFamily(state.mode)?.games || [];
  if (!games.length) return;
  state.libraryGameIndex = Math.max(0, Math.min(state.libraryGameIndex + (direction < 0 ? -1 : 1), games.length - 1));
  syncLibraryGameFocus({ focus: !controller, controller });
}

function renderHome() {
  return `
    <section class="game-shell-screen title-screen" aria-labelledby="cardcade-title">
      <div class="title-lockup">
        <h1 id="cardcade-title" aria-label="Cardcade"><span>Card</span><span>cade</span></h1>
      </div>
      <nav class="main-menu" aria-label="Cardcade main menu">
        <button class="main-menu-option" type="button" data-action="open-solo"><span aria-hidden="true">›</span><strong>Solo</strong></button>
        <button class="main-menu-option" type="button" data-action="open-multiplayer"><span aria-hidden="true">›</span><strong>Multiplayer</strong></button>
        <button class="main-menu-option" type="button" data-action="open-settings"><span aria-hidden="true">›</span><strong>Options</strong></button>
      </nav>
    </section>`;
}

function selectedGame() {
  for (const family of state.catalog.families) {
    const game = family.games.find((candidate) => candidate.id === state.selectedGameId);
    if (game) return game;
  }
  return null;
}

function ensureHotSeatSetup(game) {
  const minimumHumans = game.supportsBots ? 1 : game.players.min;
  const count = Math.max(minimumHumans, Math.min(state.hotSeatPlayerCount, game.players.max));
  state.hotSeatPlayerCount = count;
  if (!game.supportsBots) state.hotSeatBots = 0;
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
    <section class="game-shell-screen pregame-screen" data-family="${escapeHtml(familyForGame(game.id)?.id || "standard-52")}" aria-labelledby="pregame-title">
      ${gameShellNav(`${modeLabel} · Table setup`, "back-to-library", "Return to game selection")}
      <div class="pregame-layout">
        <header class="pregame-game-identity">
          ${renderGameObject(game)}
          <p class="shell-kicker">${escapeHtml(game.eyebrow)}</p>
          <h1 id="pregame-title">${escapeHtml(game.name)}</h1>
          <span class="game-player-range">${game.players.min}–${game.players.max} players</span>
        </header>
        <div class="table-setup-console" aria-label="${escapeHtml(game.name)} table configuration">
          ${state.mode === "solo" ? `
            <div class="configuration-selector player-identity-selector">
              <label for="local-name">Player</label>
              <input id="local-name" maxlength="24" value="${escapeHtml(playerName())}" autocomplete="nickname">
            </div>
            <div class="configuration-selector">
              <span class="configuration-label">CPU players</span>
              <div class="stepper game-stepper">
                <button type="button" data-action="local-bot-down" aria-label="Remove CPU player" ${state.localBots <= minBots ? "disabled" : ""}>−</button>
                <output><strong>${state.localBots}</strong><span>CPU${state.localBots === 1 ? "" : "s"}</span></output>
                <button type="button" data-action="local-bot-up" aria-label="Add CPU player" ${state.localBots >= maxBots ? "disabled" : ""}>+</button>
              </div>
            </div>` : `
            <div class="configuration-selector">
              <span class="configuration-label">Human players</span>
              <div class="stepper game-stepper">
                <button type="button" data-action="hot-seat-player-down" aria-label="Remove Hot Seat player" ${state.hotSeatPlayerCount <= (game.supportsBots ? 1 : game.players.min) ? "disabled" : ""}>−</button>
                <output><strong>${state.hotSeatPlayerCount}</strong><span>Human${state.hotSeatPlayerCount === 1 ? "" : "s"}</span></output>
                <button type="button" data-action="hot-seat-player-up" aria-label="Add Hot Seat player" ${state.hotSeatPlayerCount >= game.players.max || (state.hotSeatBots === 0 && hotSeatTotal >= game.players.max) ? "disabled" : ""}>+</button>
              </div>
            </div>
            <div class="player-seat-config-grid" aria-label="Hot Seat player names">
              ${state.hotSeatNames.map((name, index) => `
                <div class="player-name-slot">
                  <span aria-hidden="true">${index + 1}</span>
                  <div class="field">
                    <label for="hot-seat-name-${index}">Seat ${index + 1}${index === 0 ? " · table host" : ""}</label>
                    <input id="hot-seat-name-${index}" data-hot-seat-name maxlength="24" value="${escapeHtml(name)}" autocomplete="off" required>
                  </div>
                </div>`).join("")}
            </div>
            ${game.supportsBots ? `
              <div class="configuration-selector">
                <span class="configuration-label">CPU players</span>
                <div class="stepper game-stepper">
                  <button type="button" data-action="hot-seat-bot-down" aria-label="Remove Hot Seat CPU" ${state.hotSeatBots <= 0 || hotSeatTotal <= game.players.min ? "disabled" : ""}>−</button>
                  <output><strong>${state.hotSeatBots}</strong><span>CPU${state.hotSeatBots === 1 ? "" : "s"}</span></output>
                  <button type="button" data-action="hot-seat-bot-up" aria-label="Add Hot Seat CPU" ${hotSeatTotal >= game.players.max ? "disabled" : ""}>+</button>
                </div>
              </div>
              <p class="setup-note">${hotSeatTotal} seats · hands are covered between players · CPU turns run automatically</p>` : `
              <p class="setup-note">Two private human seats · the table is covered between turns</p>`}
          `}
        </div>
      </div>
      <div class="game-shell-action-dock pregame-actions">
        <button class="game-secondary-action" type="button" data-action="back-to-library">Choose another game</button>
        <button class="game-primary-action" type="button" data-action="${game.status === "available" ? (isHotSeat ? "start-hot-seat" : "start-local-game") : "not-playable-yet"}" ${game.status === "available" ? "" : "disabled"}>Start ${isHotSeat ? `${hotSeatTotal}-seat ` : ""}game</button>
      </div>
    </section>`;
}

function renderMultiplayer() {
  const savedSession = JSON.parse(localStorage.getItem(storageKeys.room) || "null");
  const panel = state.multiplayerPanel;
  return `
    <section class="game-shell-screen layered-menu-screen multiplayer-menu-screen ${panel ? "panel-open" : ""}" aria-labelledby="multiplayer-title">
      <div class="menu-depth-background" ${panel ? "aria-hidden=\"true\" inert" : ""}>
        ${gameShellNav("Main menu · Network tables")}
        <header class="shell-title-block game-menu-title-block">
          <p class="shell-kicker">Select command</p>
          <h1 id="multiplayer-title">Multiplayer</h1>
        </header>
        <nav class="game-command-menu" aria-label="Multiplayer commands">
          <button class="game-command-option" type="button" data-action="multiplayer-tab" data-tab="host"><span aria-hidden="true">›</span><strong>Host room</strong><small>New table</small></button>
          <button class="game-command-option" type="button" data-action="multiplayer-tab" data-tab="join"><span aria-hidden="true">›</span><strong>Join room</strong><small>Use a code</small></button>
          ${savedSession ? `<button class="game-command-option" type="button" data-action="resume-room"><span aria-hidden="true">›</span><strong>Resume table</strong><small class="room-code-menu-value">${escapeHtml(savedSession.code)}</small></button>` : ""}
          <button class="game-command-option" type="button" data-action="open-hot-seat"><span aria-hidden="true">›</span><strong>Hot Seat</strong><small>One device</small></button>
        </nav>
      </div>
      ${panel ? `
        <section class="menu-layer multiplayer-command-layer" role="dialog" aria-modal="true" aria-labelledby="multiplayer-command-title">
          <div class="screen-head layer-screen-head">
            <button class="back-button" type="button" data-action="close-multiplayer-panel" aria-label="Return to multiplayer commands">←</button>
            <span>Multiplayer · ${panel === "host" ? "Host room" : "Join room"}</span>
          </div>
          <header class="layer-title-block">
            <p class="shell-kicker">${panel === "host" ? "Open a table" : "Find your table"}</p>
            <h2 id="multiplayer-command-title">${panel === "host" ? "Host room" : "Join room"}</h2>
          </header>
          ${panel === "host" ? `
            <form class="menu-entry-form" data-form="host-room" aria-label="Host a Cardcade room">
              <div class="menu-entry-row"><label for="host-name">Player name</label><input id="host-name" name="name" maxlength="24" value="${escapeHtml(playerName())}" autocomplete="nickname" required></div>
              <button class="game-primary-action" type="submit">Create room</button>
            </form>` : `
            <form class="menu-entry-form" data-form="join-room" aria-label="Join a Cardcade room">
              <div class="menu-entry-row room-code-entry"><label for="join-code">Room code</label><input class="room-code-input" id="join-code" name="code" maxlength="6" inputmode="text" autocapitalize="characters" autocomplete="off" placeholder="ABC234" required></div>
              <div class="menu-entry-row"><label for="join-name">Player name</label><input id="join-name" name="name" maxlength="24" value="${escapeHtml(playerName())}" autocomplete="nickname" required></div>
              <button class="game-primary-action" type="submit">Enter room</button>
            </form>`}
        </section>` : ""}
    </section>`;
}

function roomGamePicker(room, isHost) {
  const family = room.game ? familyForGame(room.game.id) : null;
  if (!isHost) {
    return room.game
      ? `<div class="lobby-game-selection">${renderGameObject(room.game, { compact: true })}<span class="lobby-game-family">${escapeHtml(family?.shortName || room.game.eyebrow)}</span><strong>${escapeHtml(room.game.name)}</strong><small>Selected by the host</small></div>`
      : `<div class="lobby-game-selection empty"><span class="empty-deck" aria-hidden="true">?</span><strong>Waiting for game</strong><small>The host is choosing a deck.</small></div>`;
  }
  return `
    <div class="lobby-game-selection ${room.game ? "" : "empty"}">
      ${room.game ? renderGameObject(room.game, { compact: true }) : `<span class="empty-deck" aria-hidden="true">?</span>`}
      <span class="lobby-game-family">${room.game ? escapeHtml(family?.shortName || room.game.eyebrow) : "Deck bay empty"}</span>
      <strong>${room.game ? escapeHtml(room.game.name) : "Choose a game"}</strong>
      <button class="game-secondary-action" type="button" data-action="open-room-library">${room.game ? "Change game" : "Open game library"}</button>
    </div>`;
}

function initials(name) {
  return String(name).split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function lobbySeatSlots(count) {
  const layouts = {
    1: [5],
    2: [5, 1],
    3: [5, 0, 2],
    4: [5, 1, 7, 3],
    5: [5, 1, 7, 3, 0],
    6: [5, 1, 7, 3, 0, 2],
    7: [5, 1, 7, 3, 0, 2, 6],
    8: [5, 1, 7, 3, 0, 2, 6, 4]
  };
  return layouts[Math.max(1, Math.min(8, count))] || layouts[8];
}

function renderLobbySeat(occupant, seatIndex, slot) {
  if (!occupant) {
    return `
      <article class="lobby-seat empty" data-lobby-slot="${slot}" aria-label="Open seat ${seatIndex + 1}">
        <span class="lobby-seat-marker" aria-hidden="true">+</span>
        <span class="lobby-seat-copy"><strong>Open seat</strong><small>Waiting for player</small></span>
      </article>`;
  }
  const isCpu = occupant.type === "bot";
  const connected = isCpu || occupant.connected;
  const ready = isCpu || occupant.ready;
  const hostLabel = occupant.role === "host" ? "Host · " : "";
  const status = !connected ? "Reconnecting" : ready ? `${hostLabel}Ready` : `${hostLabel}Not ready`;
  const classes = ["lobby-seat", "occupied", ready ? "ready" : "", occupant.role === "host" ? "host" : "", occupant.isYou ? "you" : "", isCpu ? "cpu" : "", connected ? "" : "offline"].filter(Boolean).join(" ");
  return `
    <article class="${classes}" data-lobby-slot="${slot}" aria-label="${escapeHtml(occupant.name)}. ${escapeHtml(status)}.">
      <span class="lobby-seat-marker">${isCpu ? "CPU" : escapeHtml(initials(occupant.name))}</span>
      <span class="lobby-seat-copy"><strong>${escapeHtml(occupant.name)}${occupant.isYou ? " · You" : ""}</strong><small>${escapeHtml(status)}</small></span>
      <i class="lobby-ready-light" aria-hidden="true"></i>
    </article>`;
}

function renderRoom() {
  const room = state.room;
  if (!room) return `<div class="empty-state">Connecting to the room…</div>`;
  const you = room.players.find((player) => player.isYou);
  const isHost = you?.role === "host";
  const botCount = room.gameSettings.botCount || 0;
  const maxBots = room.game ? Math.max(0, room.game.players.max - room.players.length) : 0;
  const occupants = Array.from({ length: room.capacity }, () => null);
  room.players.forEach((player) => { occupants[player.seat] = player; });
  for (let index = 0; index < botCount; index += 1) {
    const openSeat = occupants.findIndex((occupant) => occupant === null);
    if (openSeat < 0) break;
    occupants[openSeat] = { type: "bot", name: `CPU ${index + 1}`, connected: true, ready: true, role: "guest", isYou: false };
  }
  const seatSlots = lobbySeatSlots(room.capacity);
  const seats = occupants.map((occupant, index) => renderLobbySeat(occupant, index, seatSlots[index] ?? index)).join("");
  const totalPlayers = room.players.length + botCount;
  const prompt = room.startBlocker || "Every seat is locked in. Start when ready.";

  return `
    <section class="game-shell-screen room-lobby-screen" aria-labelledby="room-lobby-title">
      ${gameShellNav("Multiplayer · Game lobby", "open-multiplayer", "Return to multiplayer entry")}
      <h1 class="sr-only" id="room-lobby-title">Cardcade room ${escapeHtml(room.code)}</h1>
      <div class="lobby-seat-ring" data-seat-count="${room.capacity}">
        <section class="lobby-table-core" aria-label="Room ${escapeHtml(room.code)} table">
          <div class="lobby-room-code">
            <span>Room code</span>
            <strong class="room-code">${escapeHtml(room.code)}</strong>
            <div class="room-code-actions">
              <button type="button" data-action="copy-code">Copy</button>
              <button type="button" data-action="share-code">Share</button>
            </div>
          </div>
          ${roomGamePicker(room, isHost)}
          ${isHost && room.game?.supportsBots ? `
            <div class="configuration-selector lobby-bot-selector">
              <span class="configuration-label">CPU seats</span>
              <div class="stepper game-stepper compact">
                <button type="button" data-action="room-bot-down" aria-label="Remove CPU player" ${botCount <= 0 ? "disabled" : ""}>−</button>
                <output><strong>${botCount}</strong><span>CPU</span></output>
                <button type="button" data-action="room-bot-up" aria-label="Add CPU player" ${botCount >= maxBots ? "disabled" : ""}>+</button>
              </div>
            </div>` : ""}
          <span class="lobby-capacity">${totalPlayers} / ${room.capacity} seats occupied</span>
        </section>
        ${seats}
      </div>
      <div class="lobby-action-dock">
        <p class="game-prompt ${room.canStart ? "ready" : ""}"><span aria-hidden="true"></span>${escapeHtml(prompt)}</p>
        <div class="lobby-actions">
          <button class="game-ready-action ${you?.ready ? "ready" : ""}" type="button" data-action="toggle-ready" ${!room.game ? "disabled" : ""}>${you?.ready ? "Ready ✓" : "Ready up"}</button>
          <button class="game-primary-action" type="button" data-action="start-room" ${room.canStart ? "" : "disabled"}>Start ${room.game ? escapeHtml(room.game.name) : "game"}</button>
          <button class="game-tertiary-action" type="button" data-action="leave-room">Leave room</button>
        </div>
      </div>
    </section>`;
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
  if (gameId === "juan") return "color-action";
  if (gameId === "rotating-rummy") return "rotating-rummy";
  return "standard-52";
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

function tableSeatAssignments(match, viewerSeat) {
  const seats = (match?.players || []).map((player) => player.seat);
  const assignments = cardPresentation?.resolveTableSeats?.(seats, viewerSeat) || [];
  return new Map(assignments.map((assignment) => [assignment.seat, assignment]));
}

function tableSeatSlotFor(match, viewerSeat, playerSeat) {
  if (playerSeat === viewerSeat) return "south";
  return tableSeatAssignments(match, viewerSeat).get(playerSeat)?.slot || "north";
}

function renderOpponentFan(deckFamilyId, count, { ariaLabel = "", revealedCards = [] } = {}) {
  const safeCount = Math.min(108, Math.max(0, Math.floor(Number(count) || 0)));
  const cards = Array.from({ length: safeCount }, (_, index) => {
    const revealedCard = revealedCards[index];
    if (deckFamilyId === "standard-52" && revealedCard) {
      return renderPlayingCard(revealedCard, index, {
        played: true,
        inert: true,
        className: "opponent-card opponent-card-face"
      });
    }
    return renderCardBack({
      deckFamilyId,
      context: "opponent-hand",
      className: "opponent-card",
      ariaHidden: true,
      attributes: `data-opponent-card-index="${index}"`
    });
  }).join("");
  return `<div class="opponent-hand" data-opponent-hand data-card-count="${safeCount}" role="img" aria-label="${escapeHtml(ariaLabel || `${safeCount} hidden cards`)}">${cards}</div>`;
}

function renderTableOpponent({
  match,
  viewerSeat,
  player,
  deckFamilyId,
  cardCount = player?.cardCount,
  detail = "",
  modifiers = "",
  gameId = null,
  showLastPlay = false,
  revealedCards = []
}) {
  const assignment = tableSeatAssignments(match, viewerSeat).get(player.seat);
  const slot = assignment?.slot || "north";
  const count = Math.max(0, Math.floor(Number(cardCount) || 0));
  const active = match.activeSeat === player.seat && !match.roundOver;
  const revealedLabel = deckFamilyId === "standard-52"
    ? revealedCards.filter(Boolean).map((card) => standard52.cardLong(card)).join(", ")
    : "";
  const handLabel = revealedLabel
    ? `${player.name} has ${count} cards, showing ${revealedLabel}`
    : `${player.name} has ${count} hidden cards`;
  return `
    <article class="game-seat table-seat table-seat-${slot} ${active ? "active" : ""} ${modifiers}" data-table-seat="${slot}" data-player-seat="${player.seat}">
      <div class="player-hud">
        ${showLastPlay ? `<span class="seat-played-card">${renderSeatLastCard(player, gameId)}</span>` : ""}
        <span class="game-seat-copy" title="${escapeHtml(player.name)}"><strong>${escapeHtml(player.name)}</strong><small>${escapeHtml(detail)}</small></span>
        ${active ? '<span class="turn-indicator">Turn</span>' : ""}
      </div>
      <div class="opponent-hand-wrap">${renderOpponentFan(deckFamilyId, count, {
        ariaLabel: handLabel,
        revealedCards
      })}</div>
    </article>`;
}

function renderLocalPlayerHud(player, { detail = "", active = false } = {}) {
  if (!player) return "";
  return `
    <div class="local-player-hud player-hud ${active ? "active" : ""}" data-table-seat="south">
      <span class="game-seat-copy" title="${escapeHtml(player.name)}"><strong>${escapeHtml(player.name)} · You</strong><small>${escapeHtml(detail)}</small></span>
      ${active ? '<span class="turn-indicator">Turn</span>' : ""}
    </div>`;
}

function renderTableScene({
  match,
  viewerSeat,
  opponentsMarkup,
  centerMarkup,
  handMarkup = "",
  localDetail = "",
  localActive = false,
  playOriginSeat = null,
  className = ""
}) {
  const localPlayer = match.players.find((player) => player.seat === viewerSeat);
  const playOrigin = playOriginSeat === "dealer"
    ? "north"
    : tableSeatSlotFor(match, viewerSeat, playOriginSeat);
  return `
    <div class="card-table-scene ${className}" data-seat-count="${match.players.length}" data-opponent-count="${Math.max(0, match.players.length - 1)}" data-play-origin="${escapeHtml(playOrigin)}">
      <div class="card-table-depth" aria-hidden="true"><div class="card-table-surface"><i></i></div></div>
      <div class="game-opponents table-seats-layer" aria-label="Opponents around the table">${opponentsMarkup}</div>
      <div class="center-play-area">${centerMarkup}</div>
      ${renderLocalPlayerHud(localPlayer, { detail: localDetail, active: localActive })}
      ${handMarkup}
    </div>`;
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
  if (gameId === "rotating-rummy") {
    const colorClass = card.color ? `rummy-${card.color}` : `rummy-${rummyVisualKind(card.kind)}`;
    return `<span class="seat-last-card rummy-seat-card card-skin-face ${selectedCardSkin("rotating-rummy")?.className || ""} ${colorClass}" aria-label="Last played ${escapeHtml(rotatingRummyDeck.cardLong(card))}">${renderRummySeatFace(card)}</span>`;
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

function renderPlayingCard(card, index, { played = false, enter = false, selectable = false, dealt = false, inert = false, className = "" } = {}) {
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
    dealt && !played ? "dealt" : "",
    className
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

function snapCountdownValue(match) {
  const remaining = Number(match?.countdownEndsAt) - Date.now();
  return remaining > 0 ? String(Math.max(1, Math.ceil(remaining / 1_000))) : "GO!";
}

function snapPlayerStatus(player, phase) {
  if (player.skipNextReveal) return "Skip next reveal";
  if (phase === snapRules?.PHASES?.WAITING_FOR_READY) return player.ready ? "READY" : "WAITING";
  if (phase === snapRules?.PHASES?.COUNTDOWN) return "LOCKED IN";
  return player.type === "bot" ? "CPU" : player.connected ? "ONLINE" : "OFFLINE";
}

function renderSnapGame() {
  const view = state.gameView;
  if (!view || !snapRules) return `<div class="empty-state">Snap is loading…</div>`;
  const match = view.state;
  const viewerSeat = state.room?.players.find((player) => player.isYou)?.seat;
  const viewer = match.players.find((player) => player.seat === viewerSeat);
  const opponents = match.players.filter((player) => player.seat !== viewerSeat);
  const revealPlayer = match.players.find((player) => player.seat === (match.phase === snapRules.PHASES.WAITING_FOR_READY ? match.upcomingRevealSeat : match.revealSourceSeat));
  const resolution = match.phase === snapRules.PHASES.REACTION
    && match.lastResolution?.reactionId !== match.reactionId
    ? null
    : match.lastResolution;
  const phaseCopy = match.phase === snapRules.PHASES.WAITING_FOR_READY
    ? { kicker: "NEXT REVEAL", title: revealPlayer ? `${revealPlayer.name} is up` : "Lock in", detail: "Every player readies before the card is revealed." }
    : match.phase === snapRules.PHASES.COUNTDOWN
      ? { kicker: "REVEAL IN", title: snapCountdownValue(match), detail: `${revealPlayer?.name || "Next player"}'s card stays hidden until zero.` }
      : match.phase === snapRules.PHASES.REACTION
        ? { kicker: "REACT NOW", title: match.matchType === "sandwich" ? "SANDWICH?" : "SNAP?", detail: "Match the previous rank or the rank two cards back. Suit does not matter." }
        : { kicker: "MATCH COMPLETE", title: match.winners.length > 1 ? "TIE GAME" : `${match.players.find((player) => player.seat === match.winners[0])?.name || "Winner"} WINS`, detail: match.lastMoveText };
  const resultClass = resolution?.type === "snap" ? "success" : resolution?.type === "failed-snap" ? "failure" : "neutral";
  const readyAction = match.actions?.ready === true;
  const snapAction = match.actions?.snap === true;
  const isFinished = match.phase === snapRules.PHASES.FINISHED;
  const snapLabel = match.phase === snapRules.PHASES.WAITING_FOR_READY
    ? (viewer?.ready ? "READY ✓" : "READY")
    : match.phase === snapRules.PHASES.COUNTDOWN
      ? "LOCKED IN"
      : match.phase === snapRules.PHASES.REACTION
        ? (match.snapSubmissions.includes(viewerSeat) ? "SNAP SENT" : "SNAP")
        : "MATCH OVER";

  return `
    <section class="standard-card-game ${activeTableAppearanceClass()} snap-game" data-game-id="snap" data-snap-phase="${escapeHtml(match.phase)}">
      <header class="game-topbar">
        <button class="back-button" type="button" data-action="leave-game" aria-label="${state.gameMode === "multiplayer" ? "Return to room lobby" : "Leave game"}">←</button>
        <div><span class="family-kicker">Standard 52 · Reaction</span><h2>Snap</h2><p>${escapeHtml(match.lastMoveText)}</p></div>
        <button class="game-score" type="button" disabled><span>Center</span><strong>${match.centerCount}</strong></button>
      </header>
      <div class="snap-phase-banner ${match.phase === snapRules.PHASES.COUNTDOWN ? "counting" : ""}" aria-live="assertive">
        <span>${escapeHtml(phaseCopy.kicker)}</span>
        <strong>${escapeHtml(phaseCopy.title)}</strong>
        <small>${escapeHtml(phaseCopy.detail)}</small>
      </div>
      ${renderTableScene({
        match,
        viewerSeat,
        opponentsMarkup: opponents.map((player) => renderTableOpponent({
          match,
          viewerSeat,
          player,
          deckFamilyId: "standard-52",
          cardCount: player.drawCount,
          detail: `${snapPlayerStatus(player, match.phase)} · ${player.drawCount} draw · ${player.capturedCount} captured`,
          modifiers: `${player.ready ? "ready" : ""} ${player.skipNextReveal ? "penalized" : ""}`
        })).join(""),
        centerMarkup: `
          <div class="snap-center-board">
            <div class="snap-compare-card"><span>Two back</span>${match.twoBackCard ? renderPlayingCard(match.twoBackCard, 0, { played: true }) : `<div class="snap-empty-card">—</div>`}</div>
            <div class="snap-compare-card"><span>Previous</span>${match.previousCard ? renderPlayingCard(match.previousCard, 1, { played: true }) : `<div class="snap-empty-card">—</div>`}</div>
            <div class="snap-compare-card current"><span>Current</span>${match.currentCard ? renderPlayingCard(match.currentCard, 2, { played: true, enter: match.phase === snapRules.PHASES.REACTION }) : `<div class="snap-empty-card">?</div>`}</div>
            <div class="snap-hidden-source" aria-label="Upcoming card remains hidden">
              ${renderCardBack({ deckFamilyId: "standard-52", context: "snap-source", className: "playing-card played", ariaLabel: "Hidden upcoming card", parts: [{ tag: "i", text: "CC", ariaHidden: true }] })}
              <small>${escapeHtml(revealPlayer?.name || "Next reveal")}</small>
            </div>
          </div>`,
        handMarkup: `
          <section class="physical-hand snap-local-pile" aria-label="Your draw pile">
            <div class="snap-local-pile-fan">${renderOpponentFan("standard-52", viewer?.drawCount || 0, { ariaLabel: `Your draw pile has ${viewer?.drawCount || 0} hidden cards` })}</div>
          </section>`,
        localDetail: `${snapPlayerStatus(viewer || {}, match.phase)} · ${viewer?.drawCount || 0} draw · ${viewer?.capturedCount || 0} captured`,
        localActive: match.upcomingRevealSeat === viewerSeat || match.revealSourceSeat === viewerSeat,
        playOriginSeat: match.revealSourceSeat,
        className: "snap-table-scene"
      })}
      ${resolution ? `<div class="snap-result ${resultClass}" role="status"><strong>${resolution.type === "snap" ? "SNAP!" : resolution.type === "failed-snap" ? "FAILED SNAP" : "NO SNAP"}</strong><span>${escapeHtml(resolution.text)}</span></div>` : ""}
      <div class="snap-action-dock">
        <button class="snap-primary-action ${match.phase === snapRules.PHASES.REACTION ? "react" : "ready"}" type="button" data-action="${match.phase === snapRules.PHASES.REACTION ? "snap-react" : "snap-ready"}" ${(readyAction || snapAction) && !state.gameActionLock ? "" : "disabled"}>${escapeHtml(snapLabel)}</button>
        <small>${match.phase === snapRules.PHASES.REACTION ? "SNAP on matching ranks or a sandwich: 7 → K → 7. First server-accepted SNAP wins; a wrong SNAP skips your next reveal." : "The server reveals only after every player is locked in."}</small>
      </div>
      ${isFinished ? `<section class="round-summary"><h2>Final captures</h2>${renderStandardFinalStandings({ ...match, players: match.players.map((player) => ({ ...player, score: player.capturedCount })) })}<button class="action-button" type="button" data-action="leave-game">Return to Cardcade</button></section>` : ""}
    </section>`;
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
      ${renderTableScene({
        match,
        viewerSeat,
        opponentsMarkup: opponents.map((player) => renderTableOpponent({
          match,
          viewerSeat,
          player,
          deckFamilyId: "standard-52",
          cardCount: player.cardCount,
          detail: `${formatPoints(player.score)} pts · ${player.cardCount} card${player.cardCount === 1 ? "" : "s"}${player.lastAction ? ` · ${player.lastAction.label}` : ""}`
        })).join(""),
        centerMarkup: `
          <section class="game-table blackjack-table ${isInsuranceTurn ? "insurance-pending" : ""}">
            <div class="game-status"><span><strong>${escapeHtml(playerStatus)}</strong><small>${escapeHtml(match.lastMoveText)}</small></span><span class="badge">${match.dealer?.revealed ? escapeHtml(match.dealer.label || "Dealer") : "Dealer upcard"}</span></div>
            ${isInsuranceTurn ? renderBlackjackInsurancePrompt(state.gameActionLock) : ""}
            <div class="blackjack-dealer-zone">
              <div class="blackjack-dealer-copy"><span>Dealer</span><strong>${escapeHtml(dealerLabel)}</strong></div>
              <div class="active-pile cards-pile blackjack-dealer-pile" aria-label="Dealer cards">${dealerCards.map((card, index) => renderPlayingCard(card, index, { played: true, enter: dealerIsNew })).join("")}${Array.from({ length: dealerHiddenCount }, (_, index) => renderBlackjackCardBack(dealerCards.length + index, { enter: dealerIsNew })).join("")}</div>
            </div>
          </section>`,
        handMarkup: `
          <section class="physical-hand blackjack-hand ${isYourTurn || isInsuranceTurn ? "your-turn" : ""}">
            <div class="hand-heading"><span><strong>Your hand</strong><small>${view.hands?.length || 0} hand${view.hands?.length === 1 ? "" : "s"} · table points</small></span><span class="selection-status ${isYourTurn ? "valid" : ""}">${isInsuranceTurn ? "Choose insurance" : escapeHtml(activeHand?.label || "Waiting for dealer")}</span></div>
            <div class="blackjack-hand-summaries">${(view.hands || []).map((hand, index) => renderBlackjackHandSummary(hand, index, isYourTurn && index === activeHandIndex)).join("")}</div>
            <div class="game-hand" data-hand-owner="${escapeHtml(handOwner)}" aria-label="${standardHandAriaLabel("Your current fanned Blackjack hand", "Your current flat legacy Blackjack hand")}">${currentHandCards.map((card, index) => renderPlayingCard(card, index, { dealt: isDealing })).join("")}</div>
          </section>`,
        localDetail: `${formatPoints(yourPlayer?.score)} pts · ${currentHandCards.length} cards`,
        localActive: isYourTurn || isInsuranceTurn,
        playOriginSeat: "dealer",
        className: "casino-table-scene blackjack-table-scene"
      })}
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
      ${renderTableScene({
        match,
        viewerSeat,
        opponentsMarkup: opponents.map((player) => renderTableOpponent({
          match,
          viewerSeat,
          player,
          deckFamilyId: "standard-52",
          cardCount: player.holeCardCount,
          detail: `${formatPoints(player.stack)} pts · ${holdemPlayerStatus(player)}${player.lastAction ? ` · ${player.lastAction.label}` : ""}${player.seat === match.dealerSeat ? " · dealer" : ""}`,
          modifiers: `${player.folded ? "folded" : ""} ${player.allIn ? "all-in" : ""} ${player.eliminated ? "eliminated" : ""}`,
          revealedCards: player.revealedCards || []
        })).join(""),
        centerMarkup: `
          <section class="game-table holdem-table">
            <div class="game-status"><span><strong>${escapeHtml(playerStatus)}</strong><small>${holdemStreetLabel(match.phase)} · ${match.currentBet ? `${formatPoints(match.currentBet)} to match` : "table is checked"}</small></span><span class="badge">Pot ${formatPoints(match.pot)}</span></div>
            <div class="holdem-board-zone">
              <div class="holdem-board-copy"><span>Community board</span><strong>${escapeHtml(showdownDetail)}</strong></div>
              <div class="active-pile cards-pile holdem-board" aria-label="Community cards">${board.length ? board.map((card, index) => renderPlayingCard(card, index, { played: true, enter: boardIsNew })).join("") : `<div class="empty-pile"><strong>Face-down board</strong><span>Cards arrive after the first betting round.</span></div>`}</div>
            </div>
          </section>`,
        handMarkup: `
          <section class="physical-hand holdem-hand ${isYourTurn ? "your-turn" : ""}">
            <div class="hand-heading"><span><strong>Your hole cards</strong><small>${view.hand?.length || 0} cards · ${formatPoints(yourPlayer?.stack)} table points</small></span><span class="selection-status ${isYourTurn ? "valid" : ""}">${escapeHtml(holdemPrivateHandLabel(view.hand, board))}</span></div>
            <div class="game-hand" data-hand-owner="${escapeHtml(handOwner)}" aria-label="${standardHandAriaLabel("Your fanned Poker hole cards", "Your flat legacy Poker hole cards")}">${(view.hand || []).map((card, index) => renderPlayingCard(card, index, { dealt: isDealing, inert: true })).join("")}</div>
          </section>`,
        localDetail: `${formatPoints(yourPlayer?.stack)} pts · ${(view.hand || []).length} hole cards${yourPlayer?.seat === match.dealerSeat ? " · dealer" : ""}`,
        localActive: isYourTurn,
        playOriginSeat: "dealer",
        className: "casino-table-scene holdem-table-scene"
      })}
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
      ${renderTableScene({
        match,
        viewerSeat,
        opponentsMarkup: opponents.map((player) => renderTableOpponent({
          match,
          viewerSeat,
          player,
          deckFamilyId: "standard-52",
          cardCount: player.cardCount,
          detail: `${formatPoints(player.stack)} pts · ${fiveCardDrawPlayerStatus(player)}${player.lastAction ? ` · ${player.lastAction.label}` : ""}${player.seat === match.dealerSeat ? " · dealer" : ""}`,
          modifiers: `${player.folded ? "folded" : ""} ${player.allIn ? "all-in" : ""} ${player.eliminated ? "eliminated" : ""}`,
          revealedCards: player.revealedCards || []
        })).join(""),
        centerMarkup: `
          <section class="game-table five-card-draw-table">
            <div class="game-status"><span><strong>${escapeHtml(playerStatus)}</strong><small>${fiveCardDrawPhaseLabel(match.phase)} · ${match.currentBet ? `${formatPoints(match.currentBet)} to match` : match.phase === "draw" ? "replacements are private" : "table is checked"}</small></span><span class="badge">Pot ${formatPoints(match.pot)}</span></div>
            <div class="five-card-draw-table-zone">
              <div class="five-card-draw-copy"><span>${tableLabel}</span><strong>${escapeHtml(showdownDetail)}</strong></div>
              <div class="five-card-draw-piles" aria-label="Draw and discard piles">
                <div class="draw-stack ${activeCardAppearanceClass("standard-52")}" aria-label="${match.stockCount} cards in draw pile">${renderCardBack({ deckFamilyId: "standard-52", context: "draw-stock", className: "draw-card-back", ariaHidden: true, parts: [{ tag: "i", text: "CC" }] })}<strong>Draw</strong><small>${match.stockCount} cards</small></div>
                <div class="active-pile draw-discard-pile ${activeCardAppearanceClass("standard-52")}" aria-label="${match.discardCount} private discards">${renderCardBack({ deckFamilyId: "standard-52", context: "discard", className: "draw-card-back discard", ariaHidden: true, parts: [{ tag: "i", text: "↻" }] })}<strong>Discard</strong><small>${match.discardCount} card${match.discardCount === 1 ? "" : "s"}</small></div>
              </div>
            </div>
          </section>`,
        handMarkup: `
          <section class="physical-hand five-card-draw-hand ${isYourTurn ? "your-turn" : ""}">
            <div class="hand-heading"><span><strong>Your five cards</strong><small>${view.hand?.length || 0} cards · ${formatPoints(yourPlayer?.stack)} table points</small></span><span class="selection-status ${isDrawTurn ? "valid" : ""}">${escapeHtml(fiveCardDrawPrivateHandLabel(view.hand, match))}</span></div>
            <div class="game-hand" data-hand-owner="${escapeHtml(handOwner)}" aria-label="${standardHandAriaLabel("Your fanned Five Card Draw hand", "Your flat legacy Five Card Draw hand")}">${(view.hand || []).map((card, index) => renderPlayingCard(card, index, { selectable: canDraw, inert: !isDrawTurn, dealt: isDealing })).join("")}</div>
          </section>`,
        localDetail: `${formatPoints(yourPlayer?.stack)} pts · ${(view.hand || []).length} cards${yourPlayer?.seat === match.dealerSeat ? " · dealer" : ""}`,
        localActive: isYourTurn,
        playOriginSeat: "dealer",
        className: "casino-table-scene five-card-draw-table-scene"
      })}
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
      ${renderTableScene({
        match,
        viewerSeat,
        opponentsMarkup: opponents.map((player) => {
          const playerPlace = placementForPlayer(match, player);
          return renderTableOpponent({
            match,
            viewerSeat,
            player,
            deckFamilyId: "standard-52",
            cardCount: player.cardCount,
            detail: playerPlace ? `${placeLabel(playerPlace)} place` : `${player.cardCount} cards${player.passed ? " · passed" : ""}`,
            modifiers: placementClassFor(playerPlace),
            gameId: game.gameId,
            showLastPlay: true
          });
        }).join(""),
        centerMarkup: `
          <section class="game-table">
            <div class="game-status"><span><strong>${match.roundOver ? match.matchOver ? "Match complete" : "Round complete" : isYourTurn ? `${escapeHtml(yourPlayer?.name || "You")}, your turn` : `${escapeHtml(activePlayer?.name || "Player")} is thinking`}</strong><small>${tableCount} · ${lead ? `${escapeHtml(lead.playerName)} controls the pile` : "open lead"}</small></span><span class="badge">${lead ? escapeHtml(lead.label) : "Open lead"}</span></div>
            <div class="active-pile ${lead ? "cards-pile" : ""}">${lead ? lead.cards.map((card, index) => renderPlayingCard(card, index, { played: true, enter: pileIsNew })).join("") : `<div class="empty-pile"><strong>No active pile</strong><span>${match.openingRequired ? `Lead must include ${standardCardLabel(match.openingCardId)}.` : "Lead with any legal combination."}</span></div>`}</div>
          </section>`,
        handMarkup: `
          <section class="physical-hand ${isYourTurn ? "your-turn" : ""}">
            <div class="hand-heading"><span><strong>Your hand</strong><small>${view.hand.length} cards · ${escapeHtml(state.gameSort)} sort</small></span><span class="selection-status ${evaluation.ok ? "valid" : state.selectedCards.size ? "invalid" : ""}">${escapeHtml(evaluation.reason)}</span></div>
            <div class="game-hand" data-hand-owner="${escapeHtml(handOwner)}" aria-label="${standardHandAriaLabel("Your fanned hand", "Your flat legacy hand")}">${sortedHand.map((card, index) => renderPlayingCard(card, index, { selectable: isYourTurn && !state.gameActionLock, dealt: isDealing })).join("")}</div>
          </section>`,
        localDetail: `${yourPlayer?.score ?? 0} pts · ${view.hand.length} cards`,
        localActive: isYourTurn,
        playOriginSeat: lead?.playerSeat
      })}
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

function rotatingRummySelection() {
  const view = state.gameView;
  if (!view || !rotatingRummyRules || !rotatingRummyDeck) {
    return { selected: [], routeOk: false, linkOk: false, discardOk: false, linkTarget: null, reason: "Rotating Rummy unavailable" };
  }
  const match = view.state;
  const viewer = state.room?.players.find((player) => player.isYou);
  const player = match.players.find((candidate) => candidate.seat === viewer?.seat);
  const selected = view.hand.filter((card) => state.selectedCards.has(card.id));
  if (match.turnStage !== "play") {
    return { selected, routeOk: false, linkOk: false, discardOk: false, linkTarget: null, reason: "Draw from the stock or discard first" };
  }
  if (player?.routeComplete) {
    const linkTarget = rummyLinkTarget(match);
    const linkOk = Boolean(selected.length && linkTarget
      && rotatingRummyRules.canExtendRequirement([...linkTarget.group, ...selected], linkTarget.requirement));
    if (!selected.length) {
      return {
        selected,
        routeOk: false,
        linkOk: false,
        discardOk: false,
        linkTarget,
        reason: linkTarget ? `Select cards to link to ${linkTarget.player.name}'s Route group` : "Route complete — select one card to discard or choose a Route group to link"
      };
    }
    return {
      selected,
      routeOk: false,
      linkOk,
      discardOk: selected.length === 1,
      linkTarget,
      reason: linkOk
        ? `Link ${selected.length} card${selected.length === 1 ? "" : "s"} to ${linkTarget.player.name}'s Route group`
        : selected.length === 1
          ? `Discard ${rotatingRummyDeck.cardLong(selected[0])}, or choose a Route group to link`
          : "Choose a completed Route group that fits these cards"
    };
  }
  if (!selected.length) {
    return { selected, routeOk: false, linkOk: false, discardOk: false, linkTarget: null, reason: `Select cards for Route ${match.yourRoute?.number || ""}`.trim() };
  }
  const route = rummyRouteForPlayer(match, player);
  if (!route) {
    return { selected, routeOk: false, linkOk: false, discardOk: selected.length === 1, linkTarget: null, reason: "Route details are unavailable" };
  }
  const routeCardCount = rotatingRummyRoutes.routeCardCount(route);
  const evaluation = rotatingRummyRules.evaluateRoute(selected, route);
  return {
    selected,
    routeOk: evaluation.ok,
    linkOk: false,
    discardOk: selected.length === 1,
    linkTarget: null,
    evaluation,
    reason: evaluation.ok
      ? `Route ready · ${route.name}`
      : selected.length === 1
        ? `Discard ${rotatingRummyDeck.cardLong(selected[0])}, or select cards for your Route`
        : selected.length > routeCardCount
          ? `Lay the exact ${routeCardCount}-card Route first, then link extra cards before your discard`
        : evaluation.reason
  };
}

function rummyLinkTargets(match = state.gameView?.state) {
  if (!match || !rotatingRummyRoutes) return [];
  return match.players.flatMap((player) => {
    if (!player.routeComplete || !Array.isArray(player.routeMeld)) return [];
    const route = rummyRouteForPlayer(match, player);
    return player.routeMeld.map((group, groupIndex) => ({
      player,
      group,
      groupIndex,
      requirement: route?.requirements?.[groupIndex]
    })).filter((target) => target.requirement && target.requirement.type !== "spectrum");
  });
}

function rummyRouteForPlayer(match, player) {
  if (!match || !player || !rotatingRummyRoutes) return null;
  return rotatingRummyRoutes.routeFor(match.routeDeck?.id, player.routeIndex);
}

function rummyLinkTarget(match = state.gameView?.state) {
  const targetSeat = Number(state.rummyLinkTarget?.targetSeat);
  const groupIndex = Number(state.rummyLinkTarget?.groupIndex);
  return rummyLinkTargets(match).find((target) => target.player.seat === targetSeat && target.groupIndex === groupIndex) || null;
}

function rummyCardSets(cards, count, start = 0, selected = []) {
  if (count === 0) return [selected];
  if (!Array.isArray(cards) || cards.length - start < count) return [];
  const choices = [];
  for (let index = start; index <= cards.length - count; index += 1) {
    choices.push(...rummyCardSets(cards, count - 1, index + 1, [...selected, cards[index]]));
  }
  return choices;
}

function findRummyLinkSuggestion(match, hand) {
  const targets = rummyLinkTargets(match);
  for (let count = hand.length - 1; count >= 1; count -= 1) {
    for (const cards of rummyCardSets(hand, count)) {
      const target = targets.find((candidate) => rotatingRummyRules.canExtendRequirement([...candidate.group, ...cards], candidate.requirement));
      if (target) return { target, cards };
    }
  }
  return null;
}

function rummyVisualKind(kind) {
  if (kind === "glitch") return "wild";
  if (kind === "lock") return "pass";
  return kind;
}

function rummyWildMark(className = "") {
  return `<span class="rummy-wild-mark ${className}" aria-hidden="true"><i></i><i></i><i></i><i></i></span>`;
}

function rummyCornerFace(card) {
  if (card.kind === "number") return String(card.value);
  if (card.kind === "lock") return "Ⅱ";
  return "?";
}

function renderRummySeatFace(card) {
  if (card.kind === "glitch") return rummyWildMark("rummy-wild-mark-seat");
  const isNumber = card.kind === "number";
  return `<strong class="${isNumber ? "rummy-rank-glyph" : ""}">${escapeHtml(rummyCornerFace(card))}</strong>`;
}

function renderRummyCardCorner(card, bottom = false) {
  if (card.kind === "glitch") return "";
  const isNumber = card.kind === "number";
  const contents = `<strong class="${isNumber ? "rummy-rank-glyph" : ""}">${escapeHtml(rummyCornerFace(card))}</strong>`;
  return `<span class="card-corner rummy-corner${bottom ? " bottom" : ""}">${contents}</span>`;
}

function rummyActionMark(kind) {
  if (kind === "glitch") {
    return `<span class="rummy-action-mark rummy-action-wild" aria-hidden="true">${rummyWildMark("rummy-wild-mark-center")}</span>`;
  }
  if (kind === "lock") {
    return `<span class="rummy-action-mark rummy-action-pass" aria-hidden="true"><i></i><i></i></span>`;
  }
  return `<span class="rummy-action-mark" aria-hidden="true">?</span>`;
}

function renderRotatingRummyCard(card, index, { played = false, enter = false, selectable = false, dealt = false } = {}) {
  const selected = !played && state.selectedCards.has(card.id);
  const isNumber = card.kind === "number";
  const face = isNumber ? String(card.value) : null;
  const visualKind = rummyVisualKind(card.kind);
  const colorClass = card.color ? `rummy-${card.color}` : `rummy-${visualKind}`;
  const classes = [
    "playing-card",
    "rummy-card",
    "card-skin-face",
    selectedCardSkin("rotating-rummy")?.className || "",
    `rummy-kind-${visualKind}`,
    colorClass,
    selected ? "selected" : "",
    played ? "played" : "",
    played && enter ? "enter" : "",
    selectable && !played ? "selectable" : "",
    dealt && !played ? "dealt" : ""
  ].filter(Boolean).join(" ");
  const style = playedCardStyle(index, { animate: played && enter, dealt });
  return `
    <button class="${classes}" type="button" ${played ? "disabled" : ""} ${style}
      ${played ? "" : `data-game-card="${escapeHtml(card.id)}" data-card-index="${index}" tabindex="${selectable ? "0" : "-1"}"`}
      aria-label="${escapeHtml(rotatingRummyDeck.cardLong(card))}" aria-pressed="${selected}">
      <span class="rummy-card-ink" aria-hidden="true"></span>
      ${renderRummyCardCorner(card)}
      <span class="rummy-card-center">${isNumber
        ? `<b class="rummy-rank-glyph">${escapeHtml(face)}</b>`
        : rummyActionMark(card.kind)
      }</span>
      ${renderRummyCardCorner(card, true)}
    </button>`;
}

function renderRummyRouteProgress(player, totalRoutes) {
  const current = Math.min(totalRoutes, Math.max(0, Number(player?.routeIndex) || 0));
  return `<span class="rummy-route-progress" aria-label="${current} of ${totalRoutes} Routes cleared">${Array.from({ length: totalRoutes }, (_, index) => `<i class="${index < current ? "cleared" : index === current ? "current" : ""}" aria-hidden="true"></i>`).join("")}</span>`;
}

function renderRummyPatternHelp() {
  const expanded = state.rummyPatternHelpOpen;
  return `<section class="rummy-pattern-help">
    <button class="rummy-pattern-help-toggle" type="button" data-action="rummy-toggle-help" aria-expanded="${expanded}" aria-controls="rummy-pattern-help-copy">Pattern help <span aria-hidden="true">${expanded ? "−" : "+"}</span></button>
    <div id="rummy-pattern-help-copy" ${expanded ? "" : "hidden"}>
      <ul>
        <li><b>Pair / matching numbers:</b> cards with the same number.</li>
        <li><b>Numbers in order:</b> a run such as 4-5-6.</li>
        <li><b>Odd or even:</b> all odd (1-3-5) or all even (2-4-6).</li>
        <li><b>Numbers two apart:</b> a pattern such as 2-4-6-8.</li>
        <li><b>One of each color:</b> one red, blue, green, and yellow card.</li>
        <li><b>Pairs that add to 13:</b> 1+12, 2+11, 3+10, and so on.</li>
        <li><b>Pairs with consecutive numbers:</b> 5-5 and 6-6, for example.</li>
      </ul>
      <p><b>Wild cards</b> can stand in for any number. <b>Pass cards</b> move play past the next player and cannot be used in a Route.</p>
    </div>
  </section>`;
}

function renderRotatingRummyGame() {
  const view = state.gameView;
  if (!view || !rotatingRummyRules || !rotatingRummyDeck) return `<div class="empty-state">Shuffling the Route Deck…</div>`;
  const match = view.state;
  const viewer = state.room?.players.find((player) => player.isYou);
  const viewerSeat = viewer?.seat;
  const yourPlayer = match.players.find((player) => player.seat === viewerSeat);
  const opponents = match.players.filter((player) => player.seat !== viewerSeat);
  const isYourTurn = match.activeSeat === viewerSeat && !match.roundOver;
  const activePlayer = match.players.find((player) => player.seat === match.activeSeat);
  const selection = rotatingRummySelection();
  const sortedHand = rotatingRummyRules.sortCards(view.hand, state.gameSort);
  const actions = match.actions || {};
  const pileSignature = match.topCard?.id || "";
  const pileIsNew = pileSignature !== state.lastPileSignature;
  state.lastPileSignature = pileSignature;
  const handOwner = `rotating-rummy:${state.room?.code || "table"}:${viewerSeat ?? "viewer"}:round-${match.round}`;
  const isDealing = !state.dealtHandOwners.has(handOwner);
  state.dealtHandOwners.add(handOwner);
  const route = match.yourRoute;
  const isHost = viewer?.role === "host";
  const linkTargets = rummyLinkTargets(match);
  const canSelectLinkTarget = isYourTurn && match.turnStage === "play" && yourPlayer?.routeComplete && !state.gameActionLock;
  const stockLabel = `Draw stock · ${match.stockCount}`;
  const tableStatus = match.roundOver
    ? match.matchOver ? "Match complete" : "Round complete"
    : isYourTurn
      ? match.turnStage === "draw" ? `${yourPlayer?.name || "You"}, draw a card` : `${yourPlayer?.name || "You"}, finish your turn`
      : `${activePlayer?.name || "Player"} is planning a Route`;

  return `
    <section class="standard-card-game ${activeTableAppearanceClass()} rotating-rummy-game" data-game-id="rotating-rummy">
      <header class="game-topbar">
        <button class="back-button" type="button" data-action="leave-game" aria-label="${state.gameMode === "multiplayer" ? "Return to room lobby" : "Leave game"}">←</button>
        <div><span class="family-kicker">${state.gameMode === "solo" ? "Solo table" : state.gameMode === "hot-seat" ? "Hot Seat table" : `Room ${escapeHtml(state.room.code)}`}</span><h2>Rotating Rummy</h2><p>Round ${match.round} · ${escapeHtml(match.lastMoveText)}</p></div>
        <button class="game-score" type="button" disabled><span>Routes</span><strong>${Math.min(match.totalRoutes, yourPlayer?.routeIndex || 0)}/${match.totalRoutes}</strong></button>
      </header>
      <section class="rummy-route-banner ${yourPlayer?.routeComplete ? "complete" : ""}">
        <div><span class="family-kicker">${escapeHtml(match.routeDeck.name)} · Route ${route?.number || match.totalRoutes}/${match.totalRoutes}</span><h3>${escapeHtml(route?.name || "All Routes cleared")}</h3><p>${escapeHtml(route?.description || "The table is settling the final Route.")}</p></div>
        <div class="rummy-route-circuit" aria-label="Your Route progress">${renderRummyRouteProgress(yourPlayer, match.totalRoutes)}</div>
      </section>
      ${renderRummyPatternHelp()}
      ${renderTableScene({
        match,
        viewerSeat,
        opponentsMarkup: opponents.map((player) => renderTableOpponent({
          match,
          viewerSeat,
          player,
          deckFamilyId: "rotating-rummy",
          cardCount: player.cardCount,
          detail: player.routeComplete ? `Route ${match.roundOver && player.completedThisRound ? player.routeIndex : Math.min(match.totalRoutes, player.routeIndex + 1)} clear${match.roundOver ? "" : " · link or discard next"}` : `Route ${Math.min(match.totalRoutes, player.routeIndex + 1)}/${match.totalRoutes} · ${player.cardCount} cards`,
          modifiers: player.routeComplete ? "rummy-route-clear" : "",
          gameId: "rotating-rummy",
          showLastPlay: true
        })).join(""),
        centerMarkup: `
          <div class="rummy-table-stage">
            <section class="game-table rummy-table">
              <div class="game-status"><span><strong>${escapeHtml(tableStatus)}</strong><small>${escapeHtml(match.routeDeck.description)} · ${match.roundOver ? match.matchOver ? "the Route circuit is complete" : "review progress, then deal the next Route round" : match.turnStage === "draw" ? "draw from either pile" : yourPlayer?.routeComplete ? "Route is down — link cards or discard" : "lay down your Route or discard"}</small></span><span class="badge">${match.stockCount} stock</span></div>
              <div class="rummy-pile-zone">
                ${renderCardBack({ deckFamilyId: "rotating-rummy", context: "stock", className: "rummy-stock", ariaLabel: `${match.stockCount} cards in stock`, parts: [{ tag: "span", text: "RR" }, { tag: "b", text: match.stockCount }] })}
                <div class="active-pile cards-pile">${match.topCard ? renderRotatingRummyCard(match.topCard, 0, { played: true, enter: pileIsNew }) : ""}</div>
              </div>
            </section>
            ${linkTargets.length ? `<section class="rummy-link-board" aria-label="Completed Route groups">
              <div class="rummy-link-board-heading"><span class="family-kicker">Route links</span><small>${yourPlayer?.routeComplete ? "Choose your Route or another completed group, then link compatible cards before your discard." : "Complete your Route before linking cards."}</small></div>
              <div class="rummy-link-targets">${linkTargets.map((target) => {
                const selectedTarget = selection.linkTarget?.player.seat === target.player.seat && selection.linkTarget.groupIndex === target.groupIndex;
                const targetName = target.player.seat === viewerSeat ? "Your Route" : `${target.player.name}'s Route`;
                return `<article class="rummy-link-group-card ${selectedTarget ? "selected" : ""}">
                  <div class="rummy-link-group-cards" aria-label="${escapeHtml(targetName)} group ${target.groupIndex + 1}">${target.group.map((card, index) => renderRotatingRummyCard(card, index, { played: true })).join("")}</div>
                  <button type="button" data-action="rummy-select-link-target" data-rummy-link-seat="${target.player.seat}" data-rummy-link-group="${target.groupIndex}" ${canSelectLinkTarget ? "" : "disabled"}>${selectedTarget ? "Link target ✓" : `Link to ${escapeHtml(targetName)}`}</button>
                </article>`;
              }).join("")}</div>
            </section>` : ""}
          </div>`,
        handMarkup: `
          <section class="physical-hand ${isYourTurn ? "your-turn" : ""}">
            <div class="hand-heading"><span><strong>Your hand</strong><small>${view.hand.length} cards · ${escapeHtml(state.gameSort)} sort</small></span><span class="selection-status ${selection.routeOk || selection.linkOk || selection.discardOk ? "valid" : state.selectedCards.size ? "invalid" : ""}">${escapeHtml(selection.reason)}</span></div>
            <div class="game-hand" data-hand-owner="${escapeHtml(handOwner)}" aria-label="Your fanned Rotating Rummy hand">${sortedHand.map((card, index) => renderRotatingRummyCard(card, index, {
              selectable: isYourTurn && match.turnStage === "play" && !state.gameActionLock,
              dealt: isDealing
            })).join("")}</div>
          </section>`,
        localDetail: `Route ${Math.min(match.totalRoutes, (yourPlayer?.routeIndex || 0) + 1)}/${match.totalRoutes} · ${view.hand.length} cards`,
        localActive: isYourTurn,
        playOriginSeat: match.players.find((player) => player.lastPlayedCard?.id === match.topCard?.id)?.seat,
        className: "rummy-table-scene"
      })}
      <nav class="game-actions rummy-actions">
        <button type="button" data-action="rummy-hint" ${isYourTurn && !state.gameActionLock ? "" : "disabled"}>Hint</button>
        <button type="button" data-action="game-sort" ${state.gameActionLock ? "disabled" : ""}>Sort</button>
        <button type="button" data-action="rummy-draw-stock" ${actions.drawStock && !state.gameActionLock ? "" : "disabled"}>${stockLabel}</button>
        <button type="button" data-action="rummy-draw-discard" ${actions.drawDiscard && !state.gameActionLock ? "" : "disabled"}>Take discard</button>
        <button class="primary" type="button" data-action="rummy-complete-route" ${actions.completeRoute && selection.routeOk && !state.gameActionLock ? "" : "disabled"}>Route ↓</button>
        <button class="primary" type="button" data-action="rummy-link" ${actions.link && selection.linkOk && !state.gameActionLock ? "" : "disabled"}>Link ↓</button>
        <button class="primary" type="button" data-action="rummy-discard" ${actions.discard && selection.discardOk && !state.gameActionLock ? "" : "disabled"}>Discard</button>
      </nav>
      ${match.roundOver ? `
        <div class="round-result rummy-result">
          <div><span class="family-kicker">${match.matchOver ? "Route circuit complete" : `Round ${match.round} complete`}</span><h3>${escapeHtml(match.lastMoveText)}</h3><p>${match.players.map((player) => `${escapeHtml(player.name)} · ${player.routeIndex}/${match.totalRoutes} Routes cleared${player.completedThisRound ? " · advanced" : " · repeats"}${player.score ? ` · ${player.score} pts` : ""}`).join(" · ")}</p></div>
          ${match.matchOver ? `<button class="action-button" type="button" data-action="leave-game">Return to Cardcade</button>` : `<button class="action-button primary" type="button" data-action="rummy-next-round" ${isHost ? "" : "disabled"}>${isHost ? "Deal next Route round" : "Waiting for host"}</button>`}
        </div>` : ""}
    </section>`;
}

function findersPlayerLabel(match, seat) {
  return match.players.find((player) => player.seat === seat)?.name || "Player";
}

function renderFindersBuild(build, { shared = false } = {}) {
  if (!build) {
    return `<section class="finders-build-card waiting"><span class="family-kicker">${shared ? "Sudden Death" : "Your Build"}</span><strong>Objective incoming</strong><small>Start the finale to reveal the shared Build.</small></section>`;
  }
  return `
    <section class="finders-build-card ${shared ? "shared" : ""}" aria-label="${shared ? "Shared" : "Your"} Build: ${escapeHtml(build.name)}">
      <div class="finders-build-heading"><span><span class="family-kicker">${shared ? "Shared Build" : "Your Build"}</span><strong>${escapeHtml(build.name)}</strong></span><b aria-hidden="true">${escapeHtml(build.art)}</b></div>
      <div class="finders-piece-list">${build.pieces.map((piece) => `<span><i aria-hidden="true">${escapeHtml(piece.art)}</i><small>${escapeHtml(piece.name)}</small></span>`).join("")}</div>
    </section>`;
}

function renderFindersRoundResult(match, isHost) {
  if (!match.roundOver) return "";
  const scores = match.players.map((player) => `${escapeHtml(player.name)} · ${player.score}`).join(" &nbsp; ");
  if (match.matchOver) {
    const winner = findersPlayerLabel(match, match.matchWinnerSeat);
    return `
      <section class="round-result finders-result complete">
        <div><span class="family-kicker">Match complete</span><h3>${escapeHtml(winner)} wins Finders Makers!</h3><p>${escapeHtml(match.lastMoveText)} ${scores}</p></div>
        <button class="action-button" type="button" data-action="leave-game">Return to Cardcade</button>
      </section>`;
  }
  if (match.phase === "sudden-death-intro") {
    return `
      <section class="round-result finders-result sudden">
        <div><span class="family-kicker">Sudden Death</span><h3>The score is tied 2–2.</h3><p>A fresh 4 × 4 board and one shared Build decide the match. ${scores}</p></div>
        <button class="action-button primary" type="button" data-action="finders-start-sudden-death" ${isHost ? "" : "disabled"}>${isHost ? "Start Sudden Death" : "Waiting for host"}</button>
      </section>`;
  }
  return `
    <section class="round-result finders-result">
      <div><span class="family-kicker">Round ${match.round} complete</span><h3>${escapeHtml(match.lastMoveText)}</h3><p>${scores}</p></div>
      <button class="action-button primary" type="button" data-action="finders-next-round" ${isHost ? "" : "disabled"}>${isHost ? `Deal Round ${match.round + 1}` : "Waiting for host"}</button>
  </section>`;
}

function findersReducedMotion() {
  return localStorage.getItem(storageKeys.reducedMotion) === "true"
    || matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function findersRoundScope(match) {
  return `${match?.round || 0}:${match?.suddenDeath ? "sudden" : "normal"}`;
}

function findersPresentationIsActive() {
  return Boolean(state.findersBuildReveal || state.findersSearchFlip);
}

function renderFindersPieceCard(card, {
  selected = false,
  selectable = false,
  building = false,
  latestSearch = null,
  latestSearchPlayer = "Player",
  attempted = false
} = {}) {
  const position = card.position;
  const reveal = state.findersSearchFlip?.position === position ? state.findersSearchFlip : null;
  const revealing = Boolean(reveal?.piece);
  const showSearchMarker = position === latestSearch?.position && !revealing;
  const baseCardLabel = revealing
    ? `Privately revealed ${reveal.piece.name} at position ${position + 1}`
    : building ? `Build selection ${position + 1}` : `Face-down Piece ${position + 1}`;
  const cardLabel = showSearchMarker ? `${baseCardLabel}; last searched by ${latestSearchPlayer}` : baseCardLabel;
  const classes = [
    "finders-piece-card",
    selected ? "selected" : "",
    revealing ? "revealing" : "",
    revealing && reveal.reducedMotion ? "reduced-motion" : "",
    attempted ? "attempted" : ""
  ].filter(Boolean).join(" ");
  return `
    <button class="${classes}" type="button" data-action="finders-card" data-finders-position="${position}" aria-pressed="${selected}" aria-label="${escapeHtml(cardLabel)}" ${selectable ? "" : "disabled"}>
      <span class="finders-piece-card-inner">
        <span class="finders-piece-card-face finders-piece-card-back" aria-hidden="true">
          <span class="finders-card-index">${position + 1}</span><b>?</b>${showSearchMarker ? `<i class="finders-search-marker">◉</i>` : ""}${attempted ? '<i class="finders-attempt-marker">×</i>' : ""}
        </span>
        <span class="finders-piece-card-face finders-piece-card-front" aria-hidden="true">
          <i>${revealing ? escapeHtml(reveal.piece.art) : ""}</i><strong>${revealing ? escapeHtml(reveal.piece.name) : ""}</strong><small>${revealing ? "Private Search" : ""}</small>
        </span>
      </span>
    </button>`;
}

function renderFindersSearchConfirmation(match) {
  const confirmation = state.findersSearchConfirmation;
  if (!confirmation || !match.board?.some((card) => card.position === confirmation.position)) return "";
  return `
    <section class="finders-search-confirmation ${findersReducedMotion() ? "reduced-motion" : ""}" role="dialog" aria-modal="true" aria-labelledby="finders-search-confirmation-title">
      <div class="finders-search-confirmation-panel">
        <span class="family-kicker">Private Search · position ${confirmation.position + 1}</span>
        <h3 id="finders-search-confirmation-title">Search this card?</h3>
        <p>Lock in this position and reveal it privately.</p>
        <div class="finders-search-confirmation-actions">
          <button type="button" data-action="finders-cancel-search">Cancel</button>
          <button class="primary" type="button" data-action="finders-confirm-search">Lock in</button>
        </div>
      </div>
    </section>`;
}

function renderFindersMakersGame() {
  const view = state.gameView;
  if (!view || !findersMakersContent) return `<div class="empty-state">Preparing the hidden Piece board…</div>`;
  const match = view.state;
  const viewer = state.room?.players.find((player) => player.isYou);
  const viewerSeat = viewer?.seat;
  const isHost = viewer?.role === "host";
  const activePlayer = match.players.find((player) => player.seat === match.activeSeat);
  const isYourTurn = match.phase === "playing" && !match.roundOver && match.activeSeat === viewerSeat;
  const isBuilding = isYourTurn && match.turnMode === "build";
  const boardPositions = new Set((match.board || []).map((card) => card.position));
  state.findersBuildSelection = new Set([...state.findersBuildSelection].filter((position) => boardPositions.has(position)));
  const selectedPositions = state.findersBuildSelection;
  const searchConfirmation = state.findersSearchConfirmation;
  const objective = match.sharedBuild || view.ownBuild;
  const interactionLocked = state.gameActionLock || findersPresentationIsActive() || Boolean(searchConfirmation);
  const currentStatus = match.roundOver
    ? match.lastMoveText
    : isYourTurn
      ? isBuilding ? `Choose three cards for ${objective?.name || "your Build"}.` : "Tap a Piece to search it, or press BUILD to choose three cards."
      : `${activePlayer?.name || "Player"} is taking a private turn.`;
  const attemptedPositions = new Set(match.lastBuildAttempt?.positions || []);

  return `
    <section class="standard-card-game ${activeTableAppearanceClass()} finders-makers-game" data-game-id="finders-makers">
      <header class="game-topbar">
        <button class="back-button" type="button" data-action="leave-game" aria-label="${state.gameMode === "multiplayer" ? "Return to room lobby" : "Leave game"}">←</button>
        <div><span class="family-kicker">${match.suddenDeath ? "Sudden Death" : `Round ${match.round} of ${match.normalRounds}`}</span><h2>Finders Makers</h2><p>${escapeHtml(match.lastMoveText)}</p></div>
        <button class="game-score" type="button" disabled><span>Score</span><strong>${match.players.map((player) => player.score).join("–")}</strong></button>
      </header>
      <div class="card-table-scene finders-table-scene" data-seat-count="${match.players.length}" data-opponent-count="${Math.max(0, match.players.length - 1)}">
        <div class="card-table-depth" aria-hidden="true"><div class="card-table-surface"><i></i></div></div>
        <div class="finders-scoreboard" aria-label="Players around the Piece table">${match.players.map((player) => `
          <article class="finders-player ${player.seat === match.activeSeat ? "active" : ""} ${player.seat === viewerSeat ? "you" : ""}" data-table-seat="${player.seat === viewerSeat ? "south" : "north"}">
            <span>${escapeHtml(player.avatar)}</span><strong title="${escapeHtml(player.name)}">${escapeHtml(player.name)}</strong><b>${player.score}</b><small>${player.seat === match.activeSeat && !match.roundOver ? "TURN" : player.seat === viewerSeat ? "YOU" : player.type === "bot" ? "CPU" : ""}</small>
          </article>`).join("")}</div>
        ${renderFindersBuild(objective, { shared: Boolean(match.sharedBuild) || match.suddenDeath })}
        <section class="finders-board-zone">
          <div class="finders-board-status"><span><strong>${escapeHtml(currentStatus)}</strong><small>${match.suddenDeath ? "First complete shared Build wins the match." : "Searches reveal one Piece only to the active player."}</small></span><span class="badge">${match.grid.cardCount} hidden Pieces</span></div>
          <div class="finders-piece-board" data-finders-rows="${Number(match.grid.rows) || 3}" style="--finders-columns:${Number(match.grid.columns) || 4};--finders-rows:${Number(match.grid.rows) || 3}" aria-label="${match.grid.rows} by ${match.grid.columns} face-down Piece board">
            ${(match.board || []).map((card) => {
              const position = card.position;
              const selected = isBuilding ? selectedPositions.has(position) : searchConfirmation?.position === position;
              const selectable = !interactionLocked && isYourTurn && (match.turnMode === "choose" || isBuilding);
              return renderFindersPieceCard(card, {
                selected,
                selectable,
                building: isBuilding,
                latestSearch: match.latestSearch,
                latestSearchPlayer: findersPlayerLabel(match, match.latestSearch?.seat),
                attempted: attemptedPositions.has(position)
              });
            }).join("")}
          </div>
        </section>
      </div>
      ${!match.roundOver ? `
        <nav class="game-actions finders-actions ${isBuilding ? "building" : "idle"}">
          ${isBuilding ? `
            <button type="button" data-action="finders-cancel-build" ${interactionLocked ? "disabled" : ""}>Cancel</button>
            <button class="primary" type="button" data-action="finders-commit-build" ${selectedPositions.size === 3 && !interactionLocked ? "" : "disabled"}>${selectedPositions.size === 3 ? "Lock in Build" : `Build ${selectedPositions.size}/3`}</button>` : `
            <button class="primary finders-build-trigger" type="button" data-action="finders-begin-build" ${isYourTurn && !interactionLocked ? "" : "disabled"}>Build</button>`}
        </nav>` : ""}
      ${renderFindersRoundResult(match, isHost)}
      ${renderFindersSearchConfirmation(match)}
    </section>`;
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

function renderFindersBuildReveal() {
  const reveal = state.findersBuildReveal;
  if (!reveal?.build) return "";
  const title = reveal.shared ? "Shared Build" : "Your Build";
  return `
    <section class="finders-build-reveal ${reveal.shared ? "shared" : ""} ${reveal.reducedMotion ? "reduced-motion" : ""}" data-reveal-key="${escapeHtml(reveal.key)}" role="dialog" aria-modal="true" aria-labelledby="finders-build-reveal-title" tabindex="-1">
      <div class="finders-build-reveal-card">
        <div class="finders-build-reveal-card-inner">
          <div class="finders-build-reveal-card-face finders-build-reveal-card-back" aria-hidden="true"><span>F</span><span>M</span><b>BUILD</b></div>
          <div class="finders-build-reveal-card-face finders-build-reveal-card-front">
            <span class="family-kicker">${title}</span>
            <strong id="finders-build-reveal-title">${escapeHtml(reveal.build.name)}</strong>
            <i aria-hidden="true">${escapeHtml(reveal.build.art)}</i>
            <small>Find these 3 Pieces</small>
            <div>${reveal.build.pieces.map((piece) => `<span><i aria-hidden="true">${escapeHtml(piece.art)}</i>${escapeHtml(piece.name)}</span>`).join("")}</div>
          </div>
        </div>
      </div>
      <p>${reveal.shared ? "Everyone is racing to complete this Build." : "Memorize this Build, then find its three Pieces on the board."}</p>
    </section>`;
}

function syncFindersModalIsolation() {
  const searchDialog = app?.querySelector(".finders-search-confirmation");
  const buildRevealActive = state.screen === "game" && Boolean(state.findersBuildReveal);
  const anyFindersModal = buildRevealActive || Boolean(searchDialog);
  for (const child of siteShell?.children || []) {
    child.toggleAttribute("inert", child === app ? buildRevealActive : anyFindersModal);
  }
  skipLink?.toggleAttribute("inert", anyFindersModal);
  const game = searchDialog?.closest(".finders-makers-game");
  for (const child of game?.children || []) child.toggleAttribute("inert", child !== searchDialog);
}

function syncFindersBuildReveal() {
  const reveal = state.screen === "game" ? state.findersBuildReveal : null;
  if (findersMakersPresentationRoot) {
    const existing = findersMakersPresentationRoot.firstElementChild;
    if (!reveal) {
      if (existing) findersMakersPresentationRoot.replaceChildren();
    } else if (existing?.dataset.revealKey !== reveal.key) {
      findersMakersPresentationRoot.innerHTML = renderFindersBuildReveal();
      requestAnimationFrame(() => findersMakersPresentationRoot.firstElementChild?.focus({ preventScroll: true }));
    }
  }
  syncFindersModalIsolation();
}

function clearFindersSearchFlip() {
  clearTimeout(state.findersSearchFlipTimer);
  state.findersSearchFlipTimer = null;
  state.findersSearchFlip = null;
}

function clearFindersBuildReveal() {
  clearTimeout(state.findersBuildRevealTimer);
  state.findersBuildRevealTimer = null;
  state.findersBuildReveal = null;
  syncFindersBuildReveal();
}

function clearFindersMakersPresentation() {
  state.findersSearchConfirmation = null;
  state.findersPendingSearch = null;
  clearFindersSearchFlip();
  clearFindersBuildReveal();
}

function queueFindersSearchFlip(gameId, previousView, nextView) {
  if (gameId !== "finders-makers") return false;
  const privateSearch = nextView?.privateSearch;
  const match = nextView?.state;
  const pending = state.findersPendingSearch;
  if (!privateSearch?.piece || !Number.isInteger(privateSearch.position) || !match || !pending) return false;
  const revealScope = findersRoundScope(match);
  if (pending.scope !== revealScope || pending.position !== privateSearch.position || Number(privateSearch.id) <= pending.baselineId) return false;
  if (Number(previousView?.privateSearch?.id) === Number(privateSearch.id) && findersRoundScope(previousView?.state) === revealScope) return false;
  const revealKey = `${revealScope}:${privateSearch.id}`;
  if (state.findersSearchFlip?.key === revealKey) return false;
  clearFindersSearchFlip();
  state.findersPendingSearch = null;
  state.findersSearchConfirmation = null;
  const reducedMotion = findersReducedMotion();
  state.findersSearchFlip = {
    key: revealKey,
    position: privateSearch.position,
    piece: { ...privateSearch.piece },
    reducedMotion
  };
  state.findersSearchFlipTimer = setTimeout(() => {
    if (state.findersSearchFlip?.key !== revealKey) return;
    clearFindersSearchFlip();
    if (state.screen === "game") render();
  }, reducedMotion ? 1_250 : 3_300);
  return true;
}

function queueFindersBuildReveal(gameId, nextView) {
  if (gameId !== "finders-makers") return false;
  const match = nextView?.state;
  const build = match?.sharedBuild || nextView?.ownBuild;
  if (!match || match.phase !== "playing" || !build?.id || !Array.isArray(build.pieces)) return false;
  const viewerSeat = state.room?.players?.find((player) => player.isYou)?.seat ?? "viewer";
  const revealKey = `${viewerSeat}:${findersRoundScope(match)}:${build.id}`;
  if (state.findersPresentedBuildKeys.has(revealKey) || state.findersBuildReveal?.key === revealKey) return false;
  state.findersPresentedBuildKeys.add(revealKey);
  clearFindersBuildReveal();
  state.findersSearchConfirmation = null;
  state.findersPendingSearch = null;
  const reducedMotion = findersReducedMotion();
  state.findersBuildReveal = {
    key: revealKey,
    shared: Boolean(match.sharedBuild),
    build: { ...build, pieces: build.pieces.map((piece) => ({ ...piece })) },
    reducedMotion
  };
  state.findersBuildRevealTimer = setTimeout(() => {
    if (state.findersBuildReveal?.key !== revealKey) return;
    clearFindersBuildReveal();
    if (state.screen === "game") render();
  }, reducedMotion ? 2_400 : 6_300);
  return true;
}

function renderJuanReactionPanels(match, viewerSeat) {
  if (match.roundOver) return "";
  const panels = [];
  const pendingJuan = match.juanCall;
  if (pendingJuan) {
    const player = match.players.find((candidate) => candidate.seat === pendingJuan.seat);
    if (pendingJuan.seat === viewerSeat) {
      panels.push(`
        <section class="juan-reaction-panel juan-call-panel" aria-live="polite">
          <span><strong>One card left.</strong><small>Call JUAN before another player catches you.</small></span>
          <button class="primary" type="button" data-action="juan-call" ${state.gameActionLock ? "disabled" : ""}>Call JUAN!</button>
        </section>`);
    } else if (player) {
      panels.push(`
        <section class="juan-reaction-panel juan-catch-panel" aria-live="polite">
          <span><strong>${escapeHtml(player.name)} has one card.</strong><small>They have not called JUAN yet.</small></span>
          <button type="button" data-action="juan-catch" ${state.gameActionLock ? "disabled" : ""}>Catch ${escapeHtml(player.name)}</button>
        </section>`);
    }
  }

  const prismBurst = match.prismBurstChallenge;
  if (prismBurst) {
    const source = match.players.find((candidate) => candidate.seat === prismBurst.sourceSeat);
    const target = match.players.find((candidate) => candidate.seat === prismBurst.targetSeat);
    if (prismBurst.targetSeat === viewerSeat) {
      const previousColor = juanDeck.COLOR_NAME[prismBurst.priorColor] || "previous";
      panels.push(`
        <section class="juan-reaction-panel juan-prism-challenge-panel" aria-live="polite">
          <span><strong>Prism Burst +4</strong><small>${escapeHtml(source?.name || "That player")} chose a new lane. Challenge if they held ${escapeHtml(previousColor)}.</small></span>
          <div class="juan-reaction-actions">
            <button type="button" data-action="juan-challenge-prism-burst" ${state.gameActionLock ? "disabled" : ""}>Challenge +4</button>
            <button class="primary" type="button" data-action="juan-accept-prism-burst" ${state.gameActionLock ? "disabled" : ""}>Take 4</button>
          </div>
        </section>`);
    } else {
      panels.push(`
        <section class="juan-reaction-panel juan-prism-wait-panel" aria-live="polite">
          <span><strong>Prism Burst +4</strong><small>${escapeHtml(target?.name || "The next player")} is deciding whether to challenge ${escapeHtml(source?.name || "the play")}.</small></span>
        </section>`);
    }
  }
  return panels.join("");
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
  const hasPrismBurstDecision = Boolean(match.prismBurstChallenge);
  const isYourTurn = match.activeSeat === viewerSeat && !match.roundOver && !hasPrismBurstDecision;
  const activePlayer = match.players.find((player) => player.seat === match.activeSeat);
  const evaluation = juanSelection();
  const sortedHand = juanRules.sortCards(view.hand, state.gameSort);
  const selectedCard = view.hand.find((card) => state.selectedCards.has(card.id));
  const hotSeatJuanPlay = state.gameMode === "hot-seat" && evaluation.ok && view.hand.length - state.selectedCards.size === 1;
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
      ${renderJuanReactionPanels(match, viewerSeat)}
      ${renderTableScene({
        match,
        viewerSeat,
        opponentsMarkup: opponents.map((player) => {
          const playerPlace = placementForPlayer(match, player);
          const needsJuanCall = match.juanCall?.seat === player.seat;
          return renderTableOpponent({
            match,
            viewerSeat,
            player,
            deckFamilyId: "color-action",
            cardCount: player.cardCount,
            detail: playerPlace ? `${placeLabel(playerPlace)} place` : player.juan ? "JUAN! · 1 card" : needsJuanCall ? "1 card · call JUAN!" : `${player.cardCount} cards`,
            modifiers: `${player.juan ? "juan-alert" : ""} ${needsJuanCall ? "juan-call-pending" : ""} ${placementClassFor(playerPlace)}`,
            gameId: "juan",
            showLastPlay: true
          });
        }).join(""),
        centerMarkup: `
          <section class="game-table juan-table">
            <div class="game-status"><span><strong>${match.roundOver ? "Match complete" : hasPrismBurstDecision ? `${escapeHtml(activePlayer?.name || "Player")} is resolving +4` : isYourTurn ? `${escapeHtml(yourPlayer?.name || "You")}, your turn` : `${escapeHtml(activePlayer?.name || "Player")} is thinking`}</strong><small>${hasPrismBurstDecision ? "Challenge it or take four" : `Stock ${match.stockCount} · match color or face`}</small></span><span class="badge">${escapeHtml(juanDeck.COLOR_NAME[match.activeColor])}</span></div>
            <div class="juan-pile-zone">
              ${renderCardBack({ deckFamilyId: "color-action", context: "stock", className: "juan-stock", ariaLabel: `${match.stockCount} cards in stock`, parts: [{ tag: "span", text: "JUAN" }, { tag: "b", text: match.stockCount }] })}
              <div class="active-pile cards-pile">${renderJuanCard(match.topCard, 0, { played: true, enter: pileIsNew })}</div>
            </div>
          </section>`,
        handMarkup: `
          <section class="physical-hand ${isYourTurn ? "your-turn" : ""}">
            <div class="hand-heading"><span><strong>Your hand${yourPlayer?.juan ? " · JUAN!" : match.juanCall?.seat === viewerSeat ? " · call JUAN!" : ""}</strong><small>${view.hand.length} cards · ${escapeHtml(state.gameSort)} sort</small></span><span class="selection-status ${evaluation.ok ? "valid" : state.selectedCards.size ? "invalid" : ""}">${escapeHtml(evaluation.reason)}</span></div>
            ${juanColorChooser(selectedCard)}
            <div class="game-hand" data-hand-owner="${escapeHtml(handOwner)}" aria-label="Your fanned JUAN hand">${sortedHand.map((card, index) => renderJuanCard(card, index, {
              selectable: isYourTurn && !state.gameActionLock && (!match.drawnCardId || match.drawnCardId === card.id),
              dealt: isDealing,
              turnDrawn: match.drawnCardId === card.id
            })).join("")}</div>
          </section>`,
        localDetail: `${yourPlayer?.score ?? 0} pts · ${view.hand.length} cards${yourPlayer?.juan ? " · JUAN!" : ""}`,
        localActive: isYourTurn,
        playOriginSeat: match.players.find((player) => player.lastPlayedCard?.id === match.topCard.id)?.seat,
        className: "juan-table-scene"
      })}
      <nav class="game-actions juan-actions">
        <button type="button" data-action="game-hint" ${isYourTurn && !state.gameActionLock ? "" : "disabled"}>Hint</button>
        <button type="button" data-action="game-sort" ${state.gameActionLock ? "disabled" : ""}>Sort</button>
        <button type="button" data-action="game-pass" ${canDraw ? "" : "disabled"}>${hasDrawChoice ? "Keep" : "Draw"}</button>
        <button class="primary" type="button" data-action="game-play" ${isYourTurn && evaluation.ok && !state.gameActionLock ? "" : "disabled"} aria-label="${hotSeatJuanPlay ? "Call JUAN and play" : "Play selected card"}">${hotSeatJuanPlay ? "JUAN + Play" : "▶ Play"}</button>
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
  if (deckFamilyId === "rotating-rummy") return { name: "Rotating Rummy Routes", shortName: "108-card Route deck" };
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
  if (skin.deckFamilyId === "rotating-rummy") {
    return `
      <div class="skin-preview ${skin.className}" data-skin-preview="${escapeHtml(skin.deckFamilyId)}" role="img" aria-label="${escapeHtml(skin.name)} card face and back preview">
        <span class="skin-preview-card skin-preview-face skin-preview-rummy-face" aria-hidden="true"><small>7</small><b>7</b></span>
        <span class="skin-preview-card skin-preview-face skin-preview-rummy-wild" aria-hidden="true">${rummyWildMark("rummy-wild-mark-preview")}</span>
        ${renderCardBack({ deckFamilyId: skin.deckFamilyId, skinId: skin.id, context: "settings-preview", className: "skin-preview-card skin-preview-back skin-preview-rummy-back", ariaHidden: true, parts: [{ tag: "strong", text: "RR" }] })}
      </div>`;
  }
  return `
    <div class="skin-preview ${skin.className}" data-skin-preview="${escapeHtml(skin.deckFamilyId)}" role="img" aria-label="${escapeHtml(skin.name)} card face and back preview">
      <span class="skin-preview-card skin-preview-face skin-preview-juan-face" aria-hidden="true"><small>1</small><b>1</b></span>
      <span class="skin-preview-card skin-preview-face skin-preview-juan-prism" aria-hidden="true"><small>PRISM</small><b>✦</b></span>
      ${renderCardBack({ deckFamilyId: skin.deckFamilyId, skinId: skin.id, context: "settings-preview", className: "skin-preview-card skin-preview-back skin-preview-juan-back", ariaHidden: true, parts: [{ tag: "strong", text: "JUAN" }] })}
    </div>`;
}

function renderTableSkinPreview(tableSkin) {
  return `
    <div class="table-skin-preview ${tableSkin.className}" data-table-skin-preview role="img" aria-label="${escapeHtml(tableSkin.name)} card table preview">
      <span>Table felt</span><i aria-hidden="true"></i>
    </div>`;
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

function createAppearanceDraft() {
  return {
    tableSkin: appearancePreferences.tableSkin,
    skins: { ...appearancePreferences.skins },
    legacyMode: appearancePreferences.legacyMode === true
  };
}

function currentAppearanceDraft() {
  if (!state.appearanceDraft) state.appearanceDraft = createAppearanceDraft();
  return state.appearanceDraft;
}

function appearanceCategories(draft = currentAppearanceDraft()) {
  const categoryForDeck = (id, label, kicker, mark) => ({
    id,
    label,
    kicker,
    mark,
    type: "deck",
    deckFamilyId: id,
    options: cardSkins.skinsForFamily(id),
    selectedId: draft.skins[id]
  });
  return [
    {
      id: "table",
      label: "Table felt",
      kicker: "Surface",
      mark: "◇",
      type: "table",
      options: cardSkins.tableSkins(),
      selectedId: draft.tableSkin
    },
    categoryForDeck("standard-52", "Standard deck", "52 cards", "♠"),
    categoryForDeck("color-action", "JUAN deck", "Color & action", "1"),
    categoryForDeck("rotating-rummy", "Route deck", "Rotating Rummy", "7"),
    {
      id: "legacy",
      label: "Legacy mode",
      kicker: "Classic tables",
      mark: "K",
      type: "legacy",
      options: [
        { id: "off", name: "Modern mode", description: "Use the current physical fan, selected Standard deck skin, and full table presentation." },
        { id: "on", name: "Legacy mode", description: "Use the original illustrated 3s & 7s and Thirteen cards with the smaller flat hand." }
      ],
      selectedId: draft.legacyMode ? "on" : "off"
    }
  ];
}

function selectedAppearanceChoice(category) {
  return category.options.find((option) => option.id === category.selectedId) || category.options[0];
}

function renderAppearanceChoicePreview(category, choice, draft) {
  if (category.type === "table") return renderTableSkinPreview(choice);
  if (category.type === "deck") return renderSkinPreview(choice);
  return draft.legacyMode
    ? `<div class="appearance-legacy-preview active">${renderLegacyModePreview()}</div>`
    : `<div class="appearance-modern-preview">${renderSkinPreview(cardSkins.resolveSkin("standard-52", draft.skins["standard-52"]))}</div>`;
}

function renderAppearanceDraftInputs(draft) {
  return `
    <input type="hidden" name="tableSkin" value="${escapeHtml(draft.tableSkin)}">
    ${Object.keys(cardSkins.DEFAULT_SKIN_IDS).map((deckFamilyId) => `<input type="hidden" name="skin-${escapeHtml(deckFamilyId)}" value="${escapeHtml(draft.skins[deckFamilyId])}">`).join("")}
    <input type="hidden" name="legacyMode" value="on" ${draft.legacyMode ? "" : "disabled"}>`;
}

function renderOptionsCommands({ staticOnly = false } = {}) {
  const reducedMotion = localStorage.getItem(storageKeys.reducedMotion) === "true";
  const tag = staticOnly ? "div" : "button";
  const attrs = (action) => staticOnly ? "" : `type="button" data-action="${action}"`;
  return `
    <nav class="game-command-menu options-command-menu" ${staticOnly ? "aria-hidden=\"true\"" : "aria-label=\"Options commands\""}>
      <${tag} class="game-command-option" ${attrs("open-player-name-option")}><span aria-hidden="true">›</span><strong>Player name</strong><small>${escapeHtml(playerName())}</small></${tag}>
      <${tag} class="game-command-option" ${attrs("open-appearance-settings")}><span aria-hidden="true">›</span><strong>Appearance &amp; skins</strong><small>Customize</small></${tag}>
      <${tag} class="game-command-option" ${attrs("toggle-reduced-motion-setting")} ${staticOnly ? "" : `aria-pressed="${reducedMotion}"`}><span aria-hidden="true">›</span><strong>Reduce motion</strong><small>${reducedMotion ? "On" : "Off"}</small></${tag}>
      <div class="game-command-option unavailable" aria-disabled="true"><span aria-hidden="true">·</span><strong>Sound</strong><small>Coming later</small></div>
    </nav>`;
}

function renderOptionsMenuBackground({ staticOnly = false } = {}) {
  return `
    <div class="menu-depth-background" ${staticOnly ? "aria-hidden=\"true\"" : ""}>
      ${staticOnly ? `<div class="game-shell-nav ghost-shell-nav"><span aria-hidden="true">←</span><span>Main menu · System</span></div>` : gameShellNav("Main menu · System")}
      <header class="shell-title-block game-menu-title-block">
        <p class="shell-kicker">Select command</p>
        <h1 ${staticOnly ? "" : `id="options-title"`}>Options</h1>
      </header>
      ${renderOptionsCommands({ staticOnly })}
    </div>`;
}

function renderSettings() {
  const panel = state.optionsPanel;
  return `
    <section class="game-shell-screen layered-menu-screen options-menu-screen ${panel ? "panel-open" : ""}" aria-label="Options">
      ${renderOptionsMenuBackground({ staticOnly: Boolean(panel) })}
      ${panel === "player-name" ? `
        <section class="menu-layer player-name-layer" role="dialog" aria-modal="true" aria-labelledby="player-name-option-title">
          <div class="screen-head layer-screen-head">
            <button class="back-button" type="button" data-action="close-options-panel" aria-label="Return to Options">←</button>
            <span>Options · Player name</span>
          </div>
          <header class="layer-title-block">
            <p class="shell-kicker">Player profile</p>
            <h2 id="player-name-option-title">Player name</h2>
          </header>
          <form class="menu-entry-form" data-form="player-name-setting">
            <div class="menu-entry-row"><label for="settings-name">Default name</label><input id="settings-name" name="name" maxlength="24" value="${escapeHtml(playerName())}" autocomplete="nickname" required></div>
            <button class="game-primary-action" type="submit">Save name</button>
          </form>
        </section>` : ""}
    </section>`;
}

function renderAppearanceSettings() {
  const draft = currentAppearanceDraft();
  const categories = appearanceCategories(draft);
  state.appearanceCategoryIndex = Math.max(0, Math.min(state.appearanceCategoryIndex, categories.length - 1));
  const category = categories[state.appearanceCategoryIndex];
  const choice = selectedAppearanceChoice(category);
  const choiceIndex = Math.max(0, category.options.findIndex((option) => option.id === choice.id));
  return `
    <section class="game-shell-screen layered-menu-screen options-menu-screen appearance-options-screen panel-open" aria-labelledby="appearance-screen-title">
      ${renderOptionsMenuBackground({ staticOnly: true })}
      <section class="menu-layer appearance-menu-layer" role="dialog" aria-modal="true" aria-labelledby="appearance-screen-title">
        <div class="screen-head layer-screen-head">
          <button class="back-button" type="button" data-action="open-settings" aria-label="Return to Options">←</button>
          <span>Options · Appearance &amp; skins</span>
        </div>
        <header class="layer-title-block appearance-layer-title">
          <p class="shell-kicker">Loadout bay</p>
          <h2 id="appearance-screen-title">Appearance</h2>
          <small><span aria-hidden="true"></span>Saved on this device only</small>
        </header>
        <form class="appearance-console" data-form="appearance-settings">
          ${renderAppearanceDraftInputs(draft)}
          <div class="appearance-loadout-layout">
            <nav class="appearance-category-menu" role="tablist" aria-label="Appearance categories">
              ${categories.map((candidate, index) => `
                <button id="appearance-category-${index}" type="button" role="tab" tabindex="${index === state.appearanceCategoryIndex ? "0" : "-1"}" aria-selected="${index === state.appearanceCategoryIndex}" aria-controls="appearance-choice-stage" class="appearance-category-option ${index === state.appearanceCategoryIndex ? "active" : ""}" data-action="select-appearance-category" data-category-index="${index}">
                  <span aria-hidden="true">${escapeHtml(candidate.mark)}</span>
                  <strong>${escapeHtml(candidate.label)}</strong>
                  <small>${escapeHtml(candidate.kicker)}</small>
                </button>`).join("")}
            </nav>
            <section class="appearance-choice-stage" id="appearance-choice-stage" role="tabpanel" aria-labelledby="appearance-category-${state.appearanceCategoryIndex}">
              <p class="appearance-stage-kicker">${escapeHtml(category.kicker)}</p>
              <h3>${escapeHtml(category.label)}</h3>
              <div class="appearance-object-stage" data-appearance-category="${escapeHtml(category.id)}">
                ${renderAppearanceChoicePreview(category, choice, draft)}
              </div>
              <div class="appearance-choice-selector" aria-label="Choose ${escapeHtml(category.label)}">
                <button type="button" data-action="cycle-appearance-choice" data-direction="-1" aria-label="Previous ${escapeHtml(category.label)}">‹</button>
                <output aria-live="polite"><strong>${escapeHtml(choice.name)}</strong><small>${choiceIndex + 1} / ${category.options.length}</small></output>
                <button type="button" data-action="cycle-appearance-choice" data-direction="1" aria-label="Next ${escapeHtml(category.label)}">›</button>
              </div>
              <p class="appearance-choice-description">${escapeHtml(choice.description)}</p>
            </section>
          </div>
          <div class="appearance-command-bar">
            <span>UP / DOWN · CATEGORY&nbsp;&nbsp;&nbsp; LEFT / RIGHT · STYLE</span>
            <button class="game-primary-action" type="submit">Save appearance</button>
          </div>
        </form>
      </section>
    </section>`;
}

function selectAppearanceCategory(index, { focus = true } = {}) {
  const categories = appearanceCategories();
  state.appearanceCategoryIndex = Math.max(0, Math.min(Number(index) || 0, categories.length - 1));
  render();
  if (focus) requestAnimationFrame(() => app.querySelector(`[data-category-index="${state.appearanceCategoryIndex}"]`)?.focus({ preventScroll: true }));
}

function moveAppearanceCategory(direction, { controller = false } = {}) {
  const count = appearanceCategories().length;
  state.appearanceCategoryIndex = (state.appearanceCategoryIndex + (Number(direction) < 0 ? -1 : 1) + count) % count;
  render();
  requestAnimationFrame(() => {
    const target = app.querySelector(`[data-category-index="${state.appearanceCategoryIndex}"]`);
    if (!target) return;
    if (controller) focusControllerTarget(target);
    else target.focus({ preventScroll: true });
  });
}

function cycleAppearanceChoice(direction, { focus = true } = {}) {
  const draft = currentAppearanceDraft();
  const categories = appearanceCategories(draft);
  const category = categories[state.appearanceCategoryIndex] || categories[0];
  if (!category?.options.length) return;
  const currentIndex = Math.max(0, category.options.findIndex((option) => option.id === category.selectedId));
  const step = Number(direction) < 0 ? -1 : 1;
  const next = category.options[(currentIndex + step + category.options.length) % category.options.length];
  if (category.type === "table") draft.tableSkin = next.id;
  else if (category.type === "deck") draft.skins[category.deckFamilyId] = next.id;
  else draft.legacyMode = next.id === "on";
  render();
  if (focus) requestAnimationFrame(() => app.querySelector(`[data-action="cycle-appearance-choice"][data-direction="${step}"]`)?.focus({ preventScroll: true }));
}

let gameScrollRestoreFrame = null;

function captureGameScrollPosition() {
  const scrollRoot = document.scrollingElement;
  return {
    left: scrollRoot?.scrollLeft ?? window.scrollX ?? 0,
    top: scrollRoot?.scrollTop ?? window.scrollY ?? 0
  };
}

function restoreGameScrollPosition(position) {
  if (gameScrollRestoreFrame !== null) {
    cancelAnimationFrame(gameScrollRestoreFrame);
    gameScrollRestoreFrame = null;
  }
  if (!position) return;

  const restore = () => window.scrollTo(position.left, position.top);
  // Replacing the complete game tree can briefly make the page shorter than
  // its current offset. Mobile browsers then clamp to the top. Restore once
  // after the new tree exists and once after its layout settles.
  restore();
  gameScrollRestoreFrame = requestAnimationFrame(() => {
    gameScrollRestoreFrame = null;
    if (state.screen === "game") restore();
  });
}

function render() {
  const screenChanged = state.renderedScreen !== state.screen;
  const shouldPreserveGameScroll = state.screen === "game" && Boolean(app.querySelector(".standard-card-game"));
  const gameScrollPosition = shouldPreserveGameScroll ? captureGameScrollPosition() : null;
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
  document.body.classList.toggle("library-screen", state.screen === "library");
  document.body.classList.toggle("game-shell-flow", ["home", "local-lobby", "multiplayer", "room", "settings", "appearance-settings"].includes(state.screen));
  document.body.classList.toggle("reduced-motion", libraryReducedMotion());
  document.body.classList.toggle("legacy-standard-mode", state.screen === "game" && standardLegacyModeEnabled());
  const screen = (screens[state.screen] || renderHome)();
  app.innerHTML = screen;
  app.dataset.screen = state.screen;
  app.classList.remove("shell-transition-forward", "shell-transition-back");
  if (screenChanged) {
    void app.offsetWidth;
    app.classList.add(state.navigationDirection === "back" ? "shell-transition-back" : "shell-transition-forward");
  }
  state.renderedScreen = state.screen;
  syncJuanPrismReveal();
  syncFindersBuildReveal();
  syncSnapCountdown();
  syncControllerTextEntry();
  if (state.screen === "game") {
    layoutActivePiles();
    layoutOpponentHands();
    layoutStandardHand();
    animateStandardHandReflow(previousHand);
    const firstColor = app.querySelector(".juan-prism-dialog .juan-color-choice");
    if (firstColor) requestAnimationFrame(() => firstColor.focus({ preventScroll: true }));
    const searchConfirmation = app.querySelector('[data-action="finders-confirm-search"]');
    if (searchConfirmation) requestAnimationFrame(() => searchConfirmation.focus({ preventScroll: true }));
  }
  if (controllerState.active) requestAnimationFrame(updateControllerHover);
  restoreGameScrollPosition(gameScrollPosition);
}

function syncSnapCountdown() {
  clearTimeout(state.snapCountdownTimer);
  state.snapCountdownTimer = null;
  const match = state.gameView?.state;
  if (state.screen !== "game" || state.room?.gameId !== "snap" || match?.phase !== snapRules?.PHASES?.COUNTDOWN) return;
  const remaining = Number(match.countdownEndsAt) - Date.now();
  if (remaining <= 0) return;
  const shown = Math.max(1, Math.ceil(remaining / 1_000));
  const untilNextNumber = remaining - ((shown - 1) * 1_000);
  state.snapCountdownTimer = setTimeout(() => {
    state.snapCountdownTimer = null;
    if (state.screen === "game" && state.room?.gameId === "snap") render();
  }, Math.max(30, untilNextNumber + 20));
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

// Card stock is ~0.3mm; at this scale a little over half a pixel per card reads
// as a physical fan without opening a visible gap between neighbours.
const CARD_STACK_THICKNESS = 0.55;

function layoutOpponentHands() {
  if (!cardPresentation) return;
  app.querySelectorAll("[data-opponent-hand]").forEach((hand) => {
    const cards = [...hand.querySelectorAll(".opponent-card")];
    if (!cards.length) return;
    const seatSlot = hand.closest("[data-table-seat]")?.dataset.tableSeat || "";
    const leadsWithFirstCard = seatSlot === "west" || seatSlot === "west-near" || seatSlot === "north-west";
    const containerWidth = hand.clientWidth;
    const cardWidth = cards[0].offsetWidth;
    const cardHeight = cards[0].offsetHeight || cardWidth * 1.42;
    if (!containerWidth || !cardWidth) return;
    const layout = cardPresentation.calculateFanLayout({
      count: cards.length,
      containerWidth,
      cardWidth,
      cardHeight,
      sidePadding: 3,
      minimumVisibleIndex: Math.max(4, cardWidth * 0.12),
      maximumRotation: cards.length > 14 ? 7 : 10,
      curveRatio: 0.09,
      focusLiftRatio: 0,
      selectedLiftRatio: 0
    });
    hand.dataset.density = layout.density;
    cards.forEach((card, index) => {
      const position = layout.cards[index];
      // The seat's yaw turns its hand toward the table, so whichever end of the
      // fan swung toward the camera is the end that sits on top. Left-hand seats
      // lead with their first card, everyone else with their last.
      const stackOrder = leadsWithFirstCard ? cards.length - index : index + 1;
      card.style.setProperty("--opponent-x", `${position.x}px`);
      card.style.setProperty("--opponent-y", `${position.y}px`);
      card.style.setProperty("--opponent-rotation", `${position.rotation}deg`);
      // Real thickness in the shared 3D space. Foreshortening is the camera's
      // job now, so nothing here tries to fake it.
      card.style.setProperty("--opponent-z", `${(stackOrder - 1) * CARD_STACK_THICKNESS}px`);
      card.style.zIndex = String(stackOrder);
    });
  });
}

function renderCurrentGame() {
  if (state.room?.gameId === "snap") return renderSnapGame();
  if (state.room?.gameId === "rotating-rummy") return renderRotatingRummyGame();
  if (state.room?.gameId === "finders-makers") return renderFindersMakersGame();
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
  const desktopRummyFit = state.room?.gameId === "rotating-rummy" && viewportWidth >= 900;
  const layout = cardPresentation.calculateFanLayout({
    count: cards.length,
    containerWidth,
    cardWidth,
    cardHeight,
    sidePadding: portraitPhone ? 12 : 8,
    minimumVisibleIndex: Math.max(16, cardWidth * 0.2),
    maximumRotation: compactLandscape ? 8 : desktopRummyFit ? 9 : 11,
    curveRatio: compactLandscape ? 0.06 : desktopRummyFit ? 0.08 : portraitPhone ? 0.09 : 0.12,
    focusLiftRatio: compactLandscape ? 0.22 : desktopRummyFit ? 0.32 : portraitPhone ? 0.24 : 0.48,
    selectedLiftRatio: compactLandscape ? 0.14 : desktopRummyFit ? 0.2 : portraitPhone ? 0.18 : 0.28
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
  if (state.room?.gameId === "rotating-rummy") {
    if (match.turnStage !== "play") return;
    if (state.selectedCards.has(cardId)) state.selectedCards.delete(cardId);
    else state.selectedCards.add(cardId);
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

function screenDepth(screen) {
  return ({
    home: 0,
    multiplayer: 1,
    settings: 1,
    library: 2,
    room: 2,
    "appearance-settings": 2,
    "local-lobby": 3,
    game: 4,
    "hot-seat-handoff": 4
  })[screen] ?? 0;
}

function navigate(screen, { direction = null } = {}) {
  if (screen !== state.screen) {
    state.navigationDirection = direction || (screenDepth(screen) < screenDepth(state.screen) ? "back" : "forward");
  }
  state.screen = screen;
  render();
  window.scrollTo({ top: 0, behavior: libraryReducedMotion() ? "auto" : "smooth" });
  app.focus({ preventScroll: true });
}

function focusMenuLayer() {
  requestAnimationFrame(() => app.querySelector(".menu-layer .back-button")?.focus({ preventScroll: true }));
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
    ownBuild: null,
    privateSearch: null,
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
  clearFindersMakersPresentation();
  clearTimeout(state.findersHotSeatHandoffTimer);
  clearTimeout(state.snapCountdownTimer);
  state.findersHotSeatHandoffTimer = null;
  state.snapCountdownTimer = null;
  state.room = room;
  state.gameView = hiddenPrivateView(view);
  state.hotSeatPendingPlayerId = null;
  state.hotSeatWaitingForCpu = true;
  state.selectedCards = new Set();
  state.juanChosenColor = null;
  state.rummyLinkTarget = null;
  state.findersBuildSelection = new Set();
  state.gameActionLock = false;
  state.dealtHandOwners = new Set();
  state.lastPileSignature = null;
  saveHotSeatSession();
  navigate("hot-seat-handoff");
}

function queueHotSeatHandoff(seatNumber, { room = state.room, view = state.gameView } = {}) {
  const nextSeat = hotSeatSessionForSeat(seatNumber);
  if (!nextSeat) return false;
  clearFindersMakersPresentation();
  clearTimeout(state.findersHotSeatHandoffTimer);
  state.findersHotSeatHandoffTimer = null;
  disconnectRoomSocket();
  state.room = room;
  state.gameView = hiddenPrivateView(view);
  state.hotSeatPendingPlayerId = nextSeat.playerId;
  state.hotSeatWaitingForCpu = false;
  state.selectedCards = new Set();
  state.juanChosenColor = null;
  state.rummyLinkTarget = null;
  state.findersBuildSelection = new Set();
  state.gameActionLock = false;
  state.dealtHandOwners = new Set();
  state.lastPileSignature = null;
  saveHotSeatSession();
  navigate("hot-seat-handoff");
  return true;
}

function beginHotSeatSession(session) {
  clearJuanPrismReveal();
  clearFindersMakersPresentation();
  state.findersPresentedBuildKeys = new Set();
  state.gameMode = "hot-seat";
  state.hotSeatSeats = session.hotSeat?.seats || [];
  state.session = { code: session.code, token: session.token, playerId: session.playerId, mode: "hot-seat" };
  state.room = session.room;
  state.gameView = hiddenPrivateView(session.game?.view);
  state.hotSeatForceHandoff = false;
  state.hotSeatWaitingForCpu = false;
  state.gameSort = defaultSortForGame(session.game?.gameId);
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
  clearFindersMakersPresentation();
  state.findersBuildSelection = new Set();
  state.gameActionLock = false;
  state.dealtHandOwners = new Set();
  state.lastPileSignature = null;
  queueFindersBuildReveal(session.room?.gameId, state.gameView);
  saveHotSeatSession();
  connectRoom(state.session);
  navigate("game");
}

function clearGameSession() {
  disconnectRoomSocket();
  clearFindersMakersPresentation();
  clearTimeout(state.findersHotSeatHandoffTimer);
  state.findersHotSeatHandoffTimer = null;
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
  state.rummyLinkTarget = null;
  state.findersBuildSelection = new Set();
  state.findersPresentedBuildKeys = new Set();
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
  if (state.screen === "library" && state.mode === "multiplayer" && state.room) return true;
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
        state.rummyLinkTarget = null;
        state.findersBuildSelection = new Set();
        state.findersSearchConfirmation = null;
        state.findersPendingSearch = null;
        state.findersPresentedBuildKeys = new Set();
        clearJuanPrismReveal();
        clearFindersMakersPresentation();
        state.gameActionLock = false;
        state.dealtHandOwners = new Set();
        state.lastPileSignature = null;
        navigate("room");
      } else if (state.screen === "room") render();
    } else if (message.type === "game_state" && supportsGame(message.gameId)) {
      queueJuanPrismReveal(message.gameId, state.gameView, message.view);
      const hasPrivateFindersReveal = queueFindersSearchFlip(message.gameId, state.gameView, message.view);
      if (state.gameMode === "hot-seat" && state.hotSeatPendingPlayerId) return;
      if (state.gameMode === "hot-seat") {
        const viewer = message.room.players.find((player) => player.isYou);
        const requiredSeat = hotSeatFlow?.requiredSeat(message.view?.state, state.hotSeatSeats);
        const forceHandoff = state.hotSeatForceHandoff;
        state.hotSeatForceHandoff = false;
        if (message.gameId === "finders-makers" && hasPrivateFindersReveal && Number.isInteger(requiredSeat) && Number(viewer?.seat) !== requiredSeat) {
          // A Search ends the turn on the server, but a Hot Seat player still
          // needs a brief private moment to see their discovered Piece before
          // the device is handed over.
          state.room = message.room;
          state.gameView = message.view;
          state.gameActionLock = false;
          state.screen = "game";
          render();
          clearTimeout(state.findersHotSeatHandoffTimer);
          state.findersHotSeatHandoffTimer = setTimeout(() => {
            state.findersHotSeatHandoffTimer = null;
            if (state.gameMode === "hot-seat" && state.screen === "game") {
              queueHotSeatHandoff(requiredSeat, { room: message.room, view: message.view });
            }
          }, state.findersSearchFlip?.reducedMotion ? 1_250 : 3_300);
          return;
        }
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
        state.rummyLinkTarget = null;
        state.findersBuildSelection = new Set();
        state.findersSearchConfirmation = null;
        state.findersPendingSearch = null;
        if (previousGameId !== message.gameId) state.findersPresentedBuildKeys = new Set();
      }
      normalizeGameSort(message.gameId);
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
      if (message.gameId !== "rotating-rummy") state.rummyLinkTarget = null;
      if (message.gameId !== "finders-makers") {
        state.findersBuildSelection = new Set();
        state.findersSearchConfirmation = null;
        state.findersPendingSearch = null;
      } else {
        const viewer = message.room.players.find((player) => player.isYou);
        const canKeepBuildSelection = message.view.state.activeSeat === viewer?.seat && message.view.state.turnMode === "build";
        if (!canKeepBuildSelection) state.findersBuildSelection = new Set();
        const canKeepSearchConfirmation = message.view.state.activeSeat === viewer?.seat && message.view.state.turnMode === "choose";
        if (!canKeepSearchConfirmation) state.findersSearchConfirmation = null;
      }
      queueFindersBuildReveal(message.gameId, message.view);
      state.screen = "game";
      if (hasPrivateFindersReveal || !state.findersSearchFlip) render();
    } else if (message.type === "table_closed") {
      clearGameSession();
      navigate("home");
      showToast("The Hot Seat table was closed.");
    } else if (message.type === "error") {
      state.gameActionLock = false;
      state.hotSeatForceHandoff = false;
      state.findersSearchConfirmation = null;
      state.findersPendingSearch = null;
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
  clearFindersMakersPresentation();
  state.session = { code: session.code, token: session.token, playerId: session.playerId, mode };
  state.room = session.room;
  state.gameView = session.game?.view || null;
  state.gameMode = mode;
  state.selectedCards = new Set();
  state.juanChosenColor = null;
  state.rummyLinkTarget = null;
  state.findersBuildSelection = new Set();
  state.findersPresentedBuildKeys = new Set();
  state.gameSort = defaultSortForGame(session.game?.gameId);
  state.gameActionLock = false;
  state.dealtHandOwners = new Set();
  state.lastPileSignature = null;
  queueFindersBuildReveal(session.game?.gameId, state.gameView);
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
  if (performance.now() < librarySuppressDeckClickUntil && button.closest(".orbital-deck-stage")) {
    event.preventDefault();
    return;
  }
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
    state.libraryStage = "decks";
    state.libraryGameIndex = 0;
    setDeckFamilyForMode("solo");
    navigate("library");
  }
  if (action === "open-hot-seat") {
    state.mode = "hot-seat";
    state.selectedGameId = null;
    state.hotSeatPlayerCount = 1;
    state.hotSeatBots = 2;
    state.hotSeatNames = [];
    state.libraryStage = "decks";
    state.libraryGameIndex = 0;
    setDeckFamilyForMode("hot-seat");
    navigate("library");
  }
  if (action === "open-multiplayer") {
    state.multiplayerPanel = null;
    navigate("multiplayer");
  }
  if (action === "open-room-library" && state.room) {
    state.mode = "multiplayer";
    state.selectedGameId = state.room.gameId || null;
    const currentFamily = compatibleDeckFamilies("multiplayer")
      .find((family) => family.games.some((game) => game.id === state.room.gameId));
    setDeckFamilyForMode("multiplayer", currentFamily?.id);
    state.libraryStage = "decks";
    state.libraryGameIndex = Math.max(0, selectedDeckFamily("multiplayer")?.games?.findIndex((game) => game.id === state.room.gameId) ?? 0);
    navigate("library");
  }
  if (action === "open-settings") {
    state.optionsPanel = null;
    state.appearanceDraft = null;
    navigate("settings");
  }
  if (action === "open-appearance-settings") {
    state.optionsPanel = null;
    state.appearanceCategoryIndex = 0;
    state.appearanceDraft = createAppearanceDraft();
    navigate("appearance-settings");
    requestAnimationFrame(() => app.querySelector('[data-action="select-appearance-category"][aria-selected="true"]')?.focus({ preventScroll: true }));
  }
  if (action === "back-to-library") {
    state.libraryStage = "games";
    const family = selectedDeckFamily(state.mode);
    state.libraryGameIndex = Math.max(0, family?.games?.findIndex((game) => game.id === state.selectedGameId) ?? 0);
    navigate("library");
  }
  if (action === "multiplayer-tab") {
    state.multiplayerTab = button.dataset.tab;
    state.multiplayerPanel = button.dataset.tab;
    render();
    focusMenuLayer();
  }
  if (action === "close-multiplayer-panel") {
    state.multiplayerPanel = null;
    render();
    requestAnimationFrame(() => app.querySelector(`[data-action="multiplayer-tab"][data-tab="${state.multiplayerTab}"]`)?.focus({ preventScroll: true }));
  }
  if (action === "open-player-name-option") {
    state.optionsPanel = "player-name";
    render();
    focusMenuLayer();
  }
  if (action === "close-options-panel") {
    state.optionsPanel = null;
    render();
    requestAnimationFrame(() => app.querySelector('[data-action="open-player-name-option"]')?.focus({ preventScroll: true }));
  }
  if (action === "toggle-reduced-motion-setting") {
    const reducedMotion = localStorage.getItem(storageKeys.reducedMotion) === "true";
    localStorage.setItem(storageKeys.reducedMotion, reducedMotion ? "false" : "true");
    render();
    requestAnimationFrame(() => app.querySelector('[data-action="toggle-reduced-motion-setting"]')?.focus({ preventScroll: true }));
  }
  if (action === "select-appearance-category") selectAppearanceCategory(Number(button.dataset.categoryIndex));
  if (action === "cycle-appearance-choice") cycleAppearanceChoice(Number(button.dataset.direction));
  if (action === "library-back") libraryBack();
  if (action === "rotate-library-deck") rotateLibraryDeck(Number(button.dataset.direction));
  if (action === "select-orbital-deck") {
    if (button.classList.contains("active")) openLibraryGames({ controller: controllerState.active });
    else rotateLibraryDeck(Number(button.dataset.orbitSlot) < 0 ? -1 : 1);
  }
  if (action === "select-library-game") {
    const family = selectedDeckFamily(state.mode);
    const game = family?.games?.find((candidate) => candidate.id === button.dataset.gameId);
    if (!game || game.status === "planned") return;
    state.libraryGameIndex = family.games.indexOf(game);
    state.selectedGameId = game.id;
    if (state.mode === "multiplayer" && state.room) {
      if (sendRoom({ type: "select_game", gameId: game.id })) navigate("room");
    } else {
      navigate("local-lobby");
    }
  }
  if (action === "local-bot-down") { state.localBots = Math.max(0, state.localBots - 1); render(); }
  if (action === "local-bot-up") { state.localBots += 1; render(); }
  if (action === "hot-seat-player-down") {
    captureHotSeatNames();
    const game = selectedGame();
    if (game && state.hotSeatPlayerCount > (game.supportsBots ? 1 : game.players.min)) {
      state.hotSeatPlayerCount -= 1;
      if (game.supportsBots) state.hotSeatBots += 1;
    }
    if (game) ensureHotSeatSetup(game);
    render();
  }
  if (action === "hot-seat-player-up") {
    captureHotSeatNames();
    const game = selectedGame();
    if (game && state.hotSeatPlayerCount < game.players.max) {
      state.hotSeatPlayerCount += 1;
      if (game.supportsBots && state.hotSeatBots > 0) state.hotSeatBots -= 1;
    }
    if (game) ensureHotSeatSetup(game);
    render();
  }
  if (action === "hot-seat-bot-down") {
    captureHotSeatNames();
    const game = selectedGame();
    if (game?.supportsBots && state.hotSeatBots > 0 && state.hotSeatPlayerCount + state.hotSeatBots > game.players.min) {
      state.hotSeatBots -= 1;
    }
    render();
  }
  if (action === "hot-seat-bot-up") {
    captureHotSeatNames();
    const game = selectedGame();
    if (game?.supportsBots && state.hotSeatPlayerCount + state.hotSeatBots < game.players.max) {
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
  if (action === "room-bot-down" && state.room?.game?.supportsBots) sendRoom({ type: "set_bot_count", botCount: Math.max(0, state.room.gameSettings.botCount - 1) });
  if (action === "room-bot-up" && state.room?.game?.supportsBots) sendRoom({ type: "set_bot_count", botCount: state.room.gameSettings.botCount + 1 });
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
  if (action === "rummy-toggle-help") {
    state.rummyPatternHelpOpen = !state.rummyPatternHelpOpen;
    render();
  }
  if (action === "finders-cancel-search") {
    if (!state.findersSearchConfirmation || state.gameActionLock) return;
    const position = state.findersSearchConfirmation.position;
    state.findersSearchConfirmation = null;
    render();
    requestAnimationFrame(() => app.querySelector(`[data-finders-position="${position}"]`)?.focus({ preventScroll: true }));
    return;
  }
  if (action === "finders-confirm-search") {
    const match = state.gameView?.state;
    const viewer = state.room?.players.find((player) => player.isYou);
    const confirmation = state.findersSearchConfirmation;
    if (state.gameActionLock || findersPresentationIsActive() || !confirmation || state.room?.gameId !== "finders-makers" || match?.activeSeat !== viewer?.seat || match?.turnMode !== "choose" || match?.roundOver) return;
    const baselineId = Number(state.gameView?.privateSearch?.id);
    state.findersPendingSearch = {
      position: confirmation.position,
      scope: findersRoundScope(match),
      baselineId: Number.isInteger(baselineId) ? baselineId : 0
    };
    state.findersSearchConfirmation = null;
    state.gameActionLock = true;
    if (!sendRoom({ type: "finders_search", position: confirmation.position })) {
      state.gameActionLock = false;
      state.findersPendingSearch = null;
      render();
    } else render();
    return;
  }
  if (action === "finders-card") {
    const match = state.gameView?.state;
    const viewer = state.room?.players.find((player) => player.isYou);
    const position = Number(button.dataset.findersPosition);
    if (state.gameActionLock || findersPresentationIsActive() || state.findersSearchConfirmation || state.room?.gameId !== "finders-makers" || !Number.isInteger(position) || match?.activeSeat !== viewer?.seat || match?.roundOver) return;
    if (match.turnMode === "build") {
      if (state.findersBuildSelection.has(position)) state.findersBuildSelection.delete(position);
      else if (state.findersBuildSelection.size < 3) state.findersBuildSelection.add(position);
      else showToast("A Build attempt uses exactly three cards.");
      render();
      return;
    }
    if (match.turnMode !== "choose") return;
    state.findersBuildSelection = new Set();
    state.findersSearchConfirmation = { position };
    render();
    return;
  }
  if (action === "finders-begin-build" || action === "finders-cancel-build") {
    const match = state.gameView?.state;
    const viewer = state.room?.players.find((player) => player.isYou);
    const expectedMode = action === "finders-begin-build" ? "choose" : "build";
    if (state.gameActionLock || findersPresentationIsActive() || state.findersSearchConfirmation || state.room?.gameId !== "finders-makers" || match?.activeSeat !== viewer?.seat || match?.turnMode !== expectedMode || match?.roundOver) return;
    state.gameActionLock = true;
    state.findersBuildSelection = new Set();
    if (!sendRoom({ type: action === "finders-begin-build" ? "finders_begin_build" : "finders_cancel_build" })) {
      state.gameActionLock = false;
      render();
    }
    return;
  }
  if (action === "finders-commit-build") {
    const match = state.gameView?.state;
    const viewer = state.room?.players.find((player) => player.isYou);
    if (state.gameActionLock || findersPresentationIsActive() || state.findersSearchConfirmation || state.room?.gameId !== "finders-makers" || match?.activeSeat !== viewer?.seat || match?.turnMode !== "build" || state.findersBuildSelection.size !== 3) return;
    state.gameActionLock = true;
    const positions = [...state.findersBuildSelection].sort((left, right) => left - right);
    if (!sendRoom({ type: "finders_attempt_build", positions })) {
      state.gameActionLock = false;
      render();
    }
    return;
  }
  if (action === "finders-next-round" || action === "finders-start-sudden-death") {
    state.findersSearchConfirmation = null;
    state.findersPendingSearch = null;
    state.findersBuildSelection = new Set();
    if (state.gameMode === "hot-seat") state.hotSeatForceHandoff = true;
    const type = action === "finders-next-round" ? "finders_next_round" : "finders_start_sudden_death";
    if (!sendRoom({ type })) state.hotSeatForceHandoff = false;
    return;
  }
  if (action === "rummy-select-link-target") {
    const match = state.gameView?.state;
    const viewer = state.room?.players.find((player) => player.isYou);
    const player = match?.players?.find((candidate) => candidate.seat === viewer?.seat);
    const targetSeat = Number(button.dataset.rummyLinkSeat);
    const groupIndex = Number(button.dataset.rummyLinkGroup);
    const target = rummyLinkTargets(match).find((candidate) => candidate.player.seat === targetSeat && candidate.groupIndex === groupIndex);
    if (!state.gameActionLock && match?.turnStage === "play" && match.activeSeat === viewer?.seat && player?.routeComplete && target) {
      state.rummyLinkTarget = { targetSeat, groupIndex };
      render();
    }
  }
  if (action === "rummy-hint") {
    if (state.gameActionLock || !state.gameView || !rotatingRummyRules) return;
    const match = state.gameView.state;
    const viewer = state.room?.players.find((player) => player.isYou);
    const player = match.players?.find((candidate) => candidate.seat === viewer?.seat);
    const route = rummyRouteForPlayer(match, player);
    if (match.turnStage !== "play") {
      showToast("Draw from the stock or discard before building your Route.");
      return;
    }
    if (player?.routeComplete) {
      const link = findRummyLinkSuggestion(match, state.gameView.hand);
      if (link) {
        state.rummyLinkTarget = { targetSeat: link.target.player.seat, groupIndex: link.target.groupIndex };
        state.selectedCards = new Set(link.cards.map((card) => card.id));
        showToast(`Compatible cards are selected for ${link.target.player.name}'s Route group.`);
        render();
        return;
      }
      const discard = rotatingRummyRules.recommendedDiscard(state.gameView.hand, route);
      if (!discard) showToast("No card is available to discard.");
      else {
        state.selectedCards = new Set([discard.id]);
        render();
      }
      return;
    }
    const completion = rotatingRummyRules.findRouteCompletion(state.gameView.hand, route);
    if (!completion) {
      const discard = rotatingRummyRules.recommendedDiscard(state.gameView.hand, route);
      if (discard) {
        state.selectedCards = new Set([discard.id]);
        showToast(`No complete Route yet. ${rotatingRummyDeck.cardLong(discard)} is selected to discard.`);
        render();
      } else {
        showToast(`No complete Route yet. Keep building ${route?.name || "your pattern"}.`);
      }
      return;
    }
    state.selectedCards = new Set(completion.cards.map((card) => card.id));
    render();
  }
  if (action === "rummy-draw-stock" || action === "rummy-draw-discard") {
    if (state.gameActionLock) return;
    state.gameActionLock = true;
    state.selectedCards.clear();
    state.rummyLinkTarget = null;
    if (!sendRoom({ type: action === "rummy-draw-stock" ? "rummy_draw_stock" : "rummy_draw_discard" })) {
      state.gameActionLock = false;
      render();
    }
  }
  if (action === "rummy-complete-route") {
    if (state.gameActionLock) return;
    const selection = rotatingRummySelection();
    if (!selection.routeOk) return;
    state.gameActionLock = true;
    const cardIds = selection.selected.map((card) => card.id);
    animateStandardHandExit(cardIds, () => {
      state.selectedCards.clear();
      state.rummyLinkTarget = null;
      if (!sendRoom({ type: "rummy_complete_route", cardIds })) {
        state.gameActionLock = false;
        render();
      }
    });
  }
  if (action === "rummy-link") {
    if (state.gameActionLock) return;
    const selection = rotatingRummySelection();
    if (!selection.linkOk || !selection.linkTarget) return;
    state.gameActionLock = true;
    const cardIds = selection.selected.map((card) => card.id);
    const { player, groupIndex } = selection.linkTarget;
    state.selectedCards.clear();
    state.rummyLinkTarget = null;
    if (!sendRoom({ type: "rummy_link", targetSeat: player.seat, groupIndex, cardIds })) {
      state.gameActionLock = false;
      render();
    }
  }
  if (action === "rummy-discard") {
    if (state.gameActionLock) return;
    const selection = rotatingRummySelection();
    if (!selection.discardOk) return;
    state.gameActionLock = true;
    const [discard] = selection.selected;
    animateStandardHandExit([discard.id], () => {
      state.selectedCards.clear();
      state.rummyLinkTarget = null;
      if (!sendRoom({ type: "rummy_discard", cardId: discard.id })) {
        state.gameActionLock = false;
        render();
      }
    });
  }
  if (action === "rummy-next-round") {
    state.selectedCards.clear();
    state.rummyLinkTarget = null;
    if (state.gameMode === "hot-seat") state.hotSeatForceHandoff = true;
    if (!sendRoom({ type: "rummy_next_round" })) state.hotSeatForceHandoff = false;
  }
  if (["juan-call", "juan-catch", "juan-accept-prism-burst", "juan-challenge-prism-burst"].includes(action)) {
    if (state.gameActionLock || state.room?.gameId !== "juan") return;
    const actionTypes = {
      "juan-call": "juan_call",
      "juan-catch": "juan_catch",
      "juan-accept-prism-burst": "juan_accept_prism_burst",
      "juan-challenge-prism-burst": "juan_challenge_prism_burst"
    };
    state.gameActionLock = true;
    state.selectedCards.clear();
    state.juanChosenColor = null;
    if (!sendRoom({ type: actionTypes[action] })) {
      state.gameActionLock = false;
      render();
    }
  }
  if (action === "snap-ready") {
    if (state.gameActionLock || state.room?.gameId !== "snap" || state.gameView?.state?.actions?.ready !== true) return;
    state.gameActionLock = true;
    if (!sendRoom({ type: "snap_ready" })) {
      state.gameActionLock = false;
      render();
    }
  }
  if (action === "snap-react") {
    const match = state.gameView?.state;
    if (state.gameActionLock || state.room?.gameId !== "snap" || match?.actions?.snap !== true || !match.reactionId) return;
    state.gameActionLock = true;
    if (!sendRoom({ type: "snap_react", reactionId: match.reactionId })) {
      state.gameActionLock = false;
      render();
    }
  }
  if (action === "game-sort") {
    if (state.gameActionLock) return;
    const modes = sortAdapterForGame()?.sortModes || ["rank", "combo", "suit"];
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
        ? {
          type: "play",
          cardId: cardIds[0],
          chosenColor: state.juanChosenColor,
          declareJuan: state.gameMode === "hot-seat" && state.gameView.hand.length - cardIds.length === 1
        }
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
    state.findersBuildSelection = new Set();
    state.findersPresentedBuildKeys = new Set();
    clearFindersMakersPresentation();
    state.gameActionLock = false;
    state.dealtHandOwners = new Set();
    state.lastPileSignature = null;
    navigate(destination);
  }
});

function handleLibraryKeydown(event) {
  if (state.screen !== "library") return false;
  const tagName = event.target?.tagName?.toLowerCase();
  if (["input", "select", "textarea"].includes(tagName)) return false;
  if (["Escape", "Backspace"].includes(event.key)) {
    event.preventDefault();
    libraryBack();
    return true;
  }
  if (state.libraryStage === "decks") {
    if (["ArrowLeft", "ArrowRight"].includes(event.key)) {
      event.preventDefault();
      rotateLibraryDeck(event.key === "ArrowLeft" ? -1 : 1);
      return true;
    }
    if (["Enter", " "].includes(event.key)) {
      event.preventDefault();
      const target = event.target.closest?.(".orbital-deck, .orbit-step, .arcade-library-back");
      if (target) target.click();
      else openLibraryGames();
      return true;
    }
    return false;
  }
  if (["Enter", " "].includes(event.key)) {
    const target = event.target.closest?.(".spatial-game-option") || app.querySelector(".spatial-game-option.active");
    if (!target) return false;
    event.preventDefault();
    target.click();
    return true;
  }
  if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(event.key)) {
    event.preventDefault();
    const games = selectedDeckFamily(state.mode)?.games || [];
    if (!games.length) return true;
    if (event.key === "Home") state.libraryGameIndex = 0;
    else if (event.key === "End") state.libraryGameIndex = games.length - 1;
    else {
      const step = event.key === "PageUp" ? -3 : event.key === "PageDown" ? 3 : event.key === "ArrowUp" ? -1 : 1;
      state.libraryGameIndex = Math.max(0, Math.min(state.libraryGameIndex + step, games.length - 1));
    }
    syncLibraryGameFocus({ focus: true });
    return true;
  }
  return false;
}

function activeGameMenuOptions() {
  if (state.screen === "home") return [...app.querySelectorAll(".main-menu-option:not([disabled])")];
  if (state.screen === "multiplayer" && !state.multiplayerPanel) return [...app.querySelectorAll("button.game-command-option:not([disabled])")];
  if (state.screen === "settings" && !state.optionsPanel) return [...app.querySelectorAll("button.game-command-option:not([disabled])")];
  return [];
}

function handleMainMenuKeydown(event) {
  if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return false;
  const options = activeGameMenuOptions();
  if (!options.length) return false;
  event.preventDefault();
  const nextIndex = event.key === "Home" ? 0
    : event.key === "End" ? options.length - 1
      : mainMenuTargetIndex(event.key === "ArrowUp" ? -1 : 1, options);
  options[nextIndex].focus({ preventScroll: true });
  return true;
}

function handleMenuLayerKeydown(event) {
  const layer = app.querySelector('.menu-layer[role="dialog"]');
  if (!layer) return false;
  if (event.key === "Escape") {
    event.preventDefault();
    layer.querySelector(".back-button:not([disabled])")?.click();
    return true;
  }
  if (event.key !== "Tab") return false;
  const controls = controllerTargets(layer);
  const first = controls[0];
  const last = controls.at(-1);
  if (!first || !last) return false;
  if (event.shiftKey && (document.activeElement === first || !layer.contains(document.activeElement))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
  return false;
}

function handleAppearanceKeydown(event) {
  if (state.screen !== "appearance-settings" || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return false;
  event.preventDefault();
  if (event.key === "ArrowUp" || event.key === "ArrowDown") moveAppearanceCategory(event.key === "ArrowUp" ? -1 : 1);
  else cycleAppearanceChoice(event.key === "ArrowLeft" ? -1 : 1);
  return true;
}

function mainMenuTargetIndex(direction, options = [...app.querySelectorAll(".main-menu-option:not([disabled])")]) {
  if (!options.length) return -1;
  const current = controllerState.hoveredTarget && options.includes(controllerState.hoveredTarget)
    ? controllerState.hoveredTarget
    : options.includes(document.activeElement) ? document.activeElement : null;
  const currentIndex = options.indexOf(current);
  return currentIndex < 0
    ? direction < 0 ? options.length - 1 : 0
    : (currentIndex + (direction < 0 ? -1 : 1) + options.length) % options.length;
}

document.addEventListener("keydown", (event) => {
  if (handleMenuLayerKeydown(event)) return;
  if (handleAppearanceKeydown(event)) return;
  if (handleMainMenuKeydown(event)) return;
  if (handleLibraryKeydown(event)) return;
  const findersSearchDialog = app.querySelector(".finders-search-confirmation");
  if (event.key === "Tab" && findersSearchDialog) {
    const controls = [...findersSearchDialog.querySelectorAll("button:not([disabled])")];
    const first = controls[0];
    const last = controls.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && (document.activeElement === first || !findersSearchDialog.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
    return;
  }
  if (event.key === "Escape" && findersSearchDialog) {
    event.preventDefault();
    const position = state.findersSearchConfirmation?.position;
    state.findersSearchConfirmation = null;
    render();
    if (Number.isInteger(position)) requestAnimationFrame(() => app.querySelector(`[data-finders-position="${position}"]`)?.focus({ preventScroll: true }));
    return;
  }
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

document.addEventListener("focusin", (event) => {
  const option = event.target.closest?.(".spatial-game-option");
  if (!option || state.screen !== "library" || state.libraryStage !== "games") return;
  const index = Number(option.dataset.gameIndex);
  if (!Number.isInteger(index) || index === state.libraryGameIndex) return;
  state.libraryGameIndex = index;
  syncLibraryGameFocus({ scroll: false });
});

document.addEventListener("pointerdown", (event) => {
  if (state.screen !== "library" || state.libraryStage !== "decks") return;
  if (!event.target.closest?.(".deck-orbit-viewport")) return;
  librarySwipeGesture = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now() };
}, { passive: true });

document.addEventListener("pointerup", (event) => {
  const gesture = librarySwipeGesture;
  librarySwipeGesture = null;
  if (!gesture || gesture.pointerId !== event.pointerId || state.screen !== "library" || state.libraryStage !== "decks") return;
  const deltaX = event.clientX - gesture.x;
  const deltaY = event.clientY - gesture.y;
  if (performance.now() - gesture.time > 900 || Math.abs(deltaX) < 42 || Math.abs(deltaX) < Math.abs(deltaY) * 1.2) return;
  librarySuppressDeckClickUntil = performance.now() + 120;
  rotateLibraryDeck(deltaX < 0 ? 1 : -1, { focus: false });
});

document.addEventListener("pointercancel", () => {
  librarySwipeGesture = null;
});

document.addEventListener("wheel", (event) => {
  if (state.screen !== "library" || state.libraryStage !== "games" || !event.target.closest?.(".arcade-library-scene")) return;
  const list = app.querySelector(".spatial-mode-list");
  if (!list || list.scrollHeight <= list.clientHeight) return;
  event.preventDefault();
  list.scrollBy({ top: event.deltaY, behavior: "auto" });
}, { passive: false });

let gameTableLayoutFrame = null;
function scheduleGameTableLayout() {
  if (state.screen !== "game" || gameTableLayoutFrame !== null) return;
  gameTableLayoutFrame = requestAnimationFrame(() => {
    gameTableLayoutFrame = null;
    layoutActivePiles();
    layoutOpponentHands();
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
    if (formType === "player-name-setting") {
      savePlayerName(data.get("name"));
      state.optionsPanel = null;
      showToast("Player name saved.");
      render();
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
      state.appearanceDraft = null;
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
  if (state.screen === "library" && state.libraryStage === "games") {
    app.querySelector(".spatial-mode-list")?.scrollBy({ left, top, behavior: "auto" });
    return;
  }
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
  if (state.screen === "appearance-settings") {
    if (["up", "down"].includes(action)) {
      moveAppearanceCategory(action === "up" ? -1 : 1, { controller: true });
      return;
    }
    if (["left", "right"].includes(action)) {
      const step = action === "left" ? -1 : 1;
      cycleAppearanceChoice(step, { focus: false });
      requestAnimationFrame(() => {
        const target = app.querySelector(`[data-action="cycle-appearance-choice"][data-direction="${step}"]`);
        if (target) focusControllerTarget(target);
      });
      return;
    }
  }
  const gameMenuOptions = activeGameMenuOptions();
  if (gameMenuOptions.length) {
    const options = gameMenuOptions;
    if (["up", "down"].includes(action) && options.length) {
      const target = options[mainMenuTargetIndex(action === "up" ? -1 : 1, options)];
      if (target) focusControllerTarget(target);
      return;
    }
    if (["left", "right"].includes(action)) return;
    if (action === "activate" && options.length) {
      const hovered = controllerState.hoveredTarget;
      const target = hovered && options.includes(hovered) ? hovered : options[0];
      focusControllerTarget(target);
      target.click();
      return;
    }
  }
  if (state.screen === "library") {
    if (action === "back") {
      libraryBack({ controller: true });
      return;
    }
    if (state.libraryStage === "decks") {
      if (["left", "right"].includes(action)) {
        rotateLibraryDeck(action === "left" ? -1 : 1, { controller: true });
        return;
      }
      if (["up", "down"].includes(action)) return;
      if (action === "activate") {
        const target = controllerState.hoveredTarget || controllerTargetAtPoint();
        if (target && controllerTargets().includes(target)) activateControllerTarget();
        else openLibraryGames({ controller: true });
        return;
      }
    } else {
      if (["up", "down"].includes(action)) {
        moveLibraryGameFocus(action === "up" ? -1 : 1, { controller: true });
        return;
      }
      if (["left", "right"].includes(action)) return;
      if (action === "activate") {
        const availableTargets = controllerTargets();
        const hovered = controllerState.hoveredTarget;
        const target = hovered && availableTargets.includes(hovered) ? hovered : app.querySelector(".spatial-game-option.active");
        if (target && availableTargets.includes(target)) {
          setControllerHoverTarget(target);
          activateControllerTarget();
        }
        return;
      }
    }
  }
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
    || app.querySelector('.menu-layer[role="dialog"]')
    || findersMakersPresentationRoot?.querySelector(".finders-build-reveal")
    || app.querySelector(".finders-search-confirmation")
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
  const findersSearchCancel = app.querySelector('[data-action="finders-cancel-search"]');
  if (findersSearchCancel) {
    findersSearchCancel.click();
    return;
  }
  const menuLayerBack = app.querySelector('.menu-layer[role="dialog"] .back-button:not([disabled])');
  if (menuLayerBack) {
    menuLayerBack.click();
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
