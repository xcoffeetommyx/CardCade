import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { WebSocket } from "ws";
import standard52 from "../shared/standard-52.js";
import { createCardcadeServer } from "../server/src/app.js";
import { MatchEngine as BlackjackMatchEngine } from "../server/src/games/blackjack/match-engine.js";
import { BlackjackRuntime } from "../server/src/games/blackjack/runtime.js";

async function startServer(t, options = {}) {
  const app = createCardcadeServer(options);
  const address = await app.listen({ host: "127.0.0.1", port: 0 });
  const origin = `http://127.0.0.1:${address.port}`;
  t.after(() => app.close());
  return { app, origin };
}

async function jsonRequest(origin, path, options = {}) {
  const response = await fetch(`${origin}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  return { response, body: await response.json() };
}

function nextMessage(socket, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for WebSocket message."));
    }, 2_000);
    function cleanup() {
      clearTimeout(timeout);
      socket.off("message", onMessage);
      socket.off("error", onError);
    }
    function onMessage(buffer) {
      const message = JSON.parse(buffer.toString("utf8"));
      if (!predicate(message)) return;
      cleanup();
      resolve(message);
    }
    function onError(error) {
      cleanup();
      reject(error);
    }
    socket.on("message", onMessage);
    socket.on("error", onError);
  });
}

function openSocket(origin, session, expectedType = "room_state", socketPath = "/ws") {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(origin.replace("http", "ws") + socketPath);
    socket.once("open", () => {
      const stateMessage = nextMessage(socket, (message) => message.type === expectedType);
      socket.send(JSON.stringify({ type: "authenticate", code: session.code, token: session.token }));
      stateMessage.then(() => resolve(socket), reject);
    });
    socket.once("error", reject);
  });
}

function serviceWorkerShellPaths() {
  const worker = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
  const shell = worker.match(/const APP_SHELL = \[([\s\S]*?)\]\.map/);
  assert.ok(shell, "service worker must define its pre-cached application shell");
  return [...shell[1].matchAll(/"([^"]*)"/g)].map(([, assetPath]) => assetPath);
}

function scriptedBlackjackShuffle(topToBottom) {
  return (deck) => {
    const scripted = new Set(topToBottom);
    const cardsById = new Map(standard52.makeDeck().map((card) => [card.id, card]));
    return [...deck.filter((card) => !scripted.has(card.id)), ...topToBottom.slice().reverse().map((cardId) => cardsById.get(cardId))];
  };
}

test("health, catalog, and launcher are served from one process", async (t) => {
  const { origin } = await startServer(t);
  const health = await fetch(`${origin}/health`);
  assert.deepEqual(await health.json(), { ok: true, service: "cardcade" });

  const catalog = await fetch(`${origin}/api/catalog`);
  const catalogBody = await catalog.json();
  assert.deepEqual(catalogBody.families[0].games.map((game) => game.id), ["three-seven", "thirteen", "blackjack", "holdem", "five-card-draw"]);

  const launcher = await fetch(origin);
  assert.equal(launcher.status, 200);
  const launcherBody = await launcher.text();
  assert.match(launcherBody, /<title>Cardcade<\/title>/);
  assert.match(launcherBody, /shared\/thirteen-rules\.js/);
  assert.match(launcherBody, /shared\/blackjack-rules\.js/);
  assert.match(launcherBody, /shared\/holdem-rules\.js/);
  assert.match(launcherBody, /shared\/five-card-draw-rules\.js/);
  assert.match(launcherBody, /shared\/hot-seat-flow\.js/);
  assert.match(launcherBody, /shared\/juan-deck\.js/);
  assert.match(launcherBody, /shared\/juan-rules\.js/);
  assert.match(launcherBody, /shared\/rotating-rummy-deck\.js/);
  assert.match(launcherBody, /shared\/rotating-rummy-routes\.js/);
  assert.match(launcherBody, /shared\/rotating-rummy-rules\.js/);
  assert.match(launcherBody, /shared\/controller-input\.js/);

  const thirteenRules = await fetch(`${origin}/shared/thirteen-rules.js`);
  assert.equal(thirteenRules.status, 200);
  assert.match(await thirteenRules.text(), /ThirteenRules/);

  const blackjackRules = await fetch(`${origin}/shared/blackjack-rules.js`);
  assert.equal(blackjackRules.status, 200);
  assert.match(await blackjackRules.text(), /CardcadeBlackjackRules/);

  const holdemRules = await fetch(`${origin}/shared/holdem-rules.js`);
  assert.equal(holdemRules.status, 200);
  assert.match(await holdemRules.text(), /CardcadeHoldemRules/);

  const fiveCardDrawRules = await fetch(`${origin}/shared/five-card-draw-rules.js`);
  assert.equal(fiveCardDrawRules.status, 200);
  assert.match(await fiveCardDrawRules.text(), /CardcadeFiveCardDrawRules/);

  const hotSeatFlow = await fetch(`${origin}/shared/hot-seat-flow.js`);
  assert.equal(hotSeatFlow.status, 200);
  assert.match(await hotSeatFlow.text(), /CardcadeHotSeat/);

  const juanRules = await fetch(`${origin}/shared/juan-rules.js`);
  assert.equal(juanRules.status, 200);
  assert.match(await juanRules.text(), /JuanRules/);

  const rotatingRummyRules = await fetch(`${origin}/shared/rotating-rummy-rules.js`);
  assert.equal(rotatingRummyRules.status, 200);
  assert.match(await rotatingRummyRules.text(), /RotatingRummyRules/);

  const manifest = await fetch(`${origin}/manifest.webmanifest`);
  assert.match(manifest.headers.get("content-type"), /application\/manifest\+json/);
  const appIcon = await fetch(`${origin}/assets/pwa/icon-192.png`);
  assert.equal(appIcon.headers.get("content-type"), "image/png");
});

test("the Funnel subpath serves the complete HTTP and WebSocket application", async (t) => {
  const { origin } = await startServer(t, { basePath: "/cardcade" });

  const redirect = await fetch(`${origin}/cardcade`, { redirect: "manual" });
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get("location"), "/cardcade/");

  const launcher = await fetch(`${origin}/cardcade/`);
  assert.equal(launcher.status, 200);
  assert.match(await launcher.text(), /<base href="\/cardcade\/">/);

  const [styles, appScript, manifest, sharedRules, catalog] = await Promise.all([
    fetch(`${origin}/cardcade/app.css?v=51`),
    fetch(`${origin}/cardcade/app.js?v=53`),
    fetch(`${origin}/cardcade/manifest.webmanifest`),
    fetch(`${origin}/cardcade/shared/thirteen-rules.js?v=2`),
    fetch(`${origin}/cardcade/api/catalog`)
  ]);
  assert.match(styles.headers.get("content-type"), /text\/css/);
  assert.match(appScript.headers.get("content-type"), /text\/javascript/);
  assert.match(manifest.headers.get("content-type"), /application\/manifest\+json/);
  assert.match(sharedRules.headers.get("content-type"), /text\/javascript/);
  assert.equal(catalog.status, 200);
  assert.equal((await catalog.json()).families[0].id, "standard-52");

  const shellResponses = await Promise.all(serviceWorkerShellPaths().map(async (assetPath) => ({
    assetPath,
    response: await fetch(new URL(assetPath, `${origin}/cardcade/`))
  })));
  for (const { assetPath, response } of shellResponses) {
    assert.equal(response.status, 200, `Funnel shell asset ${assetPath || "/"} must be served`);
  }

  const host = (await jsonRequest(origin, "/cardcade/api/rooms", {
    method: "POST",
    body: JSON.stringify({ name: "Funnel Host" })
  })).body;
  const socket = await openSocket(origin, host, "room_state", "/cardcade/ws");
  t.after(() => socket.terminate());
});

test("HTTP room creation and joining return private sessions", async (t) => {
  const { origin } = await startServer(t);
  const hostResult = await jsonRequest(origin, "/api/rooms", { method: "POST", body: JSON.stringify({ name: "Host" }) });
  assert.equal(hostResult.response.status, 201);
  assert.equal(hostResult.body.room.gameId, null);

  const guestResult = await jsonRequest(origin, `/api/rooms/${hostResult.body.code}/join`, { method: "POST", body: JSON.stringify({ name: "Guest" }) });
  assert.equal(guestResult.response.status, 200);
  assert.notEqual(guestResult.body.token, hostResult.body.token);
  assert.equal(guestResult.body.room.players.length, 2);

  const invalid = await jsonRequest(origin, `/api/rooms/${hostResult.body.code}/reconnect`, { method: "POST", body: JSON.stringify({ token: "invalid" }) });
  assert.equal(invalid.response.status, 401);
  assert.equal(invalid.body.error.code, "INVALID_SESSION");
});

test("WebSocket lobby broadcasts host game selection to every player", async (t) => {
  const { origin } = await startServer(t);
  const host = (await jsonRequest(origin, "/api/rooms", { method: "POST", body: JSON.stringify({ name: "Host" }) })).body;
  const guest = (await jsonRequest(origin, `/api/rooms/${host.code}/join`, { method: "POST", body: JSON.stringify({ name: "Guest" }) })).body;
  const hostSocket = await openSocket(origin, host);
  const guestSocket = await openSocket(origin, guest);
  t.after(() => {
    hostSocket.terminate();
    guestSocket.terminate();
  });

  const hostUpdate = nextMessage(hostSocket, (message) => message.type === "room_state" && message.room.gameId === "three-seven");
  const guestUpdate = nextMessage(guestSocket, (message) => message.type === "room_state" && message.room.gameId === "three-seven");
  hostSocket.send(JSON.stringify({ type: "select_game", gameId: "three-seven" }));

  const [hostMessage, guestMessage] = await Promise.all([hostUpdate, guestUpdate]);
  assert.equal(hostMessage.room.players.find((player) => player.isYou).name, "Host");
  assert.equal(guestMessage.room.players.find((player) => player.isYou).name, "Guest");
  assert.equal(guestMessage.room.game.name, "3s & 7s");
});

test("Solo starts a private server-authoritative 3s & 7s match", async (t) => {
  const { origin } = await startServer(t);
  const result = await jsonRequest(origin, "/api/solo/three-seven", {
    method: "POST",
    body: JSON.stringify({ name: "Solo Player", botCount: 3 })
  });

  assert.equal(result.response.status, 201);
  assert.equal(result.body.room.phase, "playing");
  assert.equal(result.body.room.gameId, "three-seven");
  assert.equal(result.body.game.view.type, "match_state");
  assert.equal(result.body.game.view.hand.length, 7);
  assert.equal(result.body.game.view.state.players.length, 4);
  assert.equal(result.body.game.view.state.players.every((player) => !("hand" in player)), true);

  const reconnect = await jsonRequest(origin, `/api/rooms/${result.body.code}/reconnect`, {
    method: "POST",
    body: JSON.stringify({ token: result.body.token })
  });
  assert.equal(reconnect.body.game.view.hand.length, 7);

  const socket = await openSocket(origin, result.body, "game_state");
  t.after(() => socket.terminate());
});

test("a host starts 3s & 7s from the global Cardcade lobby", async (t) => {
  const { origin } = await startServer(t);
  const host = (await jsonRequest(origin, "/api/rooms", {
    method: "POST",
    body: JSON.stringify({ name: "Host" })
  })).body;
  const socket = await openSocket(origin, host);
  t.after(() => socket.terminate());

  let update = nextMessage(socket, (message) => message.type === "room_state" && message.room.gameId === "three-seven");
  socket.send(JSON.stringify({ type: "select_game", gameId: "three-seven" }));
  await update;

  update = nextMessage(socket, (message) => message.type === "room_state" && message.room.gameSettings.botCount === 1);
  socket.send(JSON.stringify({ type: "set_bot_count", botCount: 1 }));
  await update;

  update = nextMessage(socket, (message) => message.type === "room_state" && message.room.canStart === true);
  socket.send(JSON.stringify({ type: "set_ready", ready: true }));
  await update;

  const gameState = nextMessage(socket, (message) => message.type === "game_state");
  socket.send(JSON.stringify({ type: "start_game" }));
  const message = await gameState;

  assert.equal(message.room.phase, "playing");
  assert.equal(message.gameId, "three-seven");
  assert.equal(message.view.hand.length, 7);
  assert.equal(message.view.state.players.length, 2);
});

test("Solo starts Thirteen with four players and private 13-card hands", async (t) => {
  const { origin } = await startServer(t, { botTurnDelayMs: 10_000 });
  const result = await jsonRequest(origin, "/api/solo/thirteen", {
    method: "POST",
    body: JSON.stringify({ name: "Thirteen Player", botCount: 3 })
  });

  assert.equal(result.response.status, 201);
  assert.equal(result.body.room.phase, "playing");
  assert.equal(result.body.room.gameId, "thirteen");
  assert.equal(result.body.game.view.type, "match_state");
  assert.equal(result.body.game.view.hand.length, 13);
  assert.equal(result.body.game.view.state.players.length, 4);
  assert.equal(result.body.game.view.state.players.every((player) => !Object.hasOwn(player, "hand")), true);

  const reconnect = await jsonRequest(origin, `/api/rooms/${result.body.code}/reconnect`, {
    method: "POST",
    body: JSON.stringify({ token: result.body.token })
  });
  assert.equal(reconnect.body.game.gameId, "thirteen");
  assert.equal(reconnect.body.game.view.hand.length, 13);
  assert.deepEqual(
    reconnect.body.game.view.hand.map((card) => Object.keys(card).sort()),
    Array.from({ length: 13 }, () => ["id", "rank", "suit"]),
    "Thirteen receives the rules-neutral shared standard deck"
  );
});

test("a host starts Thirteen from the shared global room", async (t) => {
  const { origin } = await startServer(t, { botTurnDelayMs: 10_000 });
  const host = (await jsonRequest(origin, "/api/rooms", {
    method: "POST",
    body: JSON.stringify({ name: "Host" })
  })).body;
  const socket = await openSocket(origin, host);
  t.after(() => socket.terminate());

  let update = nextMessage(socket, (message) => message.type === "room_state" && message.room.gameId === "thirteen");
  socket.send(JSON.stringify({ type: "select_game", gameId: "thirteen" }));
  await update;

  update = nextMessage(socket, (message) => message.type === "room_state" && message.room.gameSettings.botCount === 3);
  socket.send(JSON.stringify({ type: "set_bot_count", botCount: 3 }));
  await update;

  update = nextMessage(socket, (message) => message.type === "room_state" && message.room.canStart === true);
  socket.send(JSON.stringify({ type: "set_ready", ready: true }));
  await update;

  const gameState = nextMessage(socket, (message) => message.type === "game_state" && message.gameId === "thirteen");
  socket.send(JSON.stringify({ type: "start_game" }));
  const message = await gameState;

  assert.equal(message.room.phase, "playing");
  assert.equal(message.room.game.name, "Thirteen");
  assert.equal(message.view.hand.length, 13);
  assert.equal(message.view.state.players.length, 4);
  assert.equal(message.view.state.players.filter((player) => player.type === "bot").length, 3);
});

test("Blackjack starts from Solo with the shared 52-card deck and CPU seats", async (t) => {
  const { origin } = await startServer(t, { botTurnDelayMs: 10_000 });
  const result = await jsonRequest(origin, "/api/solo/blackjack", {
    method: "POST",
    body: JSON.stringify({ name: "Blackjack Player", botCount: 3 })
  });

  assert.equal(result.response.status, 201);
  assert.equal(result.body.room.phase, "playing");
  assert.equal(result.body.room.gameId, "blackjack");
  assert.equal(result.body.game.view.type, "blackjack_match_state");
  assert.equal(result.body.game.view.hands.length, 1);
  assert.equal(result.body.game.view.hands[0].cards.length, 2);
  const dealer = result.body.game.view.state.dealer;
  assert.equal(dealer.cards.length, dealer.revealed ? dealer.cardCount : 1);
  assert.ok([1, 2].includes(dealer.cards.length), "an opening dealer Blackjack may reveal the hole card immediately");
  assert.equal(result.body.game.view.state.players.length, 4);
  assert.equal(result.body.game.view.state.players.filter((player) => player.type === "bot").length, 3);
  assert.equal(result.body.game.view.state.players.every((player) => !Object.hasOwn(player, "cards")), true);
});

test("a host starts Blackjack from a global room with CPU seats", async (t) => {
  const { origin } = await startServer(t, { botTurnDelayMs: 10_000 });
  const host = (await jsonRequest(origin, "/api/rooms", {
    method: "POST",
    body: JSON.stringify({ name: "Host" })
  })).body;
  const socket = await openSocket(origin, host);
  t.after(() => socket.terminate());

  let update = nextMessage(socket, (message) => message.type === "room_state" && message.room.gameId === "blackjack");
  socket.send(JSON.stringify({ type: "select_game", gameId: "blackjack" }));
  await update;

  update = nextMessage(socket, (message) => message.type === "room_state" && message.room.gameSettings.botCount === 2);
  socket.send(JSON.stringify({ type: "set_bot_count", botCount: 2 }));
  await update;

  update = nextMessage(socket, (message) => message.type === "room_state" && message.room.canStart === true);
  socket.send(JSON.stringify({ type: "set_ready", ready: true }));
  await update;

  const gameState = nextMessage(socket, (message) => message.type === "game_state" && message.gameId === "blackjack");
  socket.send(JSON.stringify({ type: "start_game" }));
  const message = await gameState;

  assert.equal(message.room.phase, "playing");
  assert.equal(message.room.game.name, "Blackjack");
  assert.equal(message.view.type, "blackjack_match_state");
  assert.equal(message.view.hands[0].cards.length, 2);
  assert.equal(message.view.state.players.length, 3);
});

test("Blackjack's paced dealer turn adds drawn cards and reaches the settled round", async (t) => {
  const blackjackRuntime = new BlackjackRuntime({
    matchEngine: new BlackjackMatchEngine({
      // Player: 10♠ 6♥; dealer: 5♦ 6♣. The dealer must visibly draw 2♠,
      // then 4♥ to reach 17 and settle.
      shuffleDeck: scriptedBlackjackShuffle(["10S", "5D", "6H", "6C", "2S", "4H"])
    })
  });
  const { origin } = await startServer(t, { botTurnDelayMs: 5, blackjackRuntime });
  const result = await jsonRequest(origin, "/api/solo/blackjack", {
    method: "POST",
    body: JSON.stringify({ name: "Dealer Audit", botCount: 0 })
  });
  const socket = await openSocket(origin, result.body, "game_state");
  t.after(() => socket.terminate());

  const dealerTurn = nextMessage(socket, (message) => message.type === "game_state" && message.gameId === "blackjack" && message.view.state.phase === "dealer-turn");
  const settled = nextMessage(socket, (message) => message.type === "game_state" && message.gameId === "blackjack" && message.view.state.roundOver === true);
  socket.send(JSON.stringify({ type: "blackjack_stand" }));

  await dealerTurn;
  const finalState = await settled;
  assert.equal(finalState.view.state.phase, "complete");
  assert.deepEqual(finalState.view.state.dealer.cards.map((card) => card.id), ["5D", "6C", "2S", "4H"]);
  assert.match(finalState.view.state.lastMoveText, /Dealer stands on 17/);
});

test("Texas Hold'em starts from Solo with fixed-limit points and private hole cards", async (t) => {
  const { origin } = await startServer(t, { botTurnDelayMs: 10_000 });
  const result = await jsonRequest(origin, "/api/solo/holdem", {
    method: "POST",
    body: JSON.stringify({ name: "Poker Player", botCount: 3 })
  });

  assert.equal(result.response.status, 201);
  assert.equal(result.body.room.phase, "playing");
  assert.equal(result.body.room.gameId, "holdem");
  assert.equal(result.body.game.view.type, "holdem_match_state");
  assert.equal(result.body.game.view.hand.length, 2);
  assert.equal(result.body.game.view.state.players.length, 4);
  assert.equal(result.body.game.view.state.pot, 3);
  assert.equal(result.body.game.view.state.currentBet, 2);
  assert.equal(result.body.game.view.state.players.filter((player) => player.type === "bot").length, 3);
  assert.equal(result.body.game.view.state.players.every((player) => !Object.hasOwn(player, "holeCards")), true);
});

test("Five Card Draw starts from Solo with fixed-limit points and five private cards", async (t) => {
  const { origin } = await startServer(t, { botTurnDelayMs: 10_000 });
  const result = await jsonRequest(origin, "/api/solo/five-card-draw", {
    method: "POST",
    body: JSON.stringify({ name: "Draw Player", botCount: 3 })
  });

  assert.equal(result.response.status, 201);
  assert.equal(result.body.room.phase, "playing");
  assert.equal(result.body.room.gameId, "five-card-draw");
  assert.equal(result.body.game.view.type, "five_card_draw_match_state");
  assert.equal(result.body.game.view.hand.length, 5);
  assert.equal(result.body.game.view.state.players.length, 4);
  assert.equal(result.body.game.view.state.pot, 3);
  assert.equal(result.body.game.view.state.currentBet, 2);
  assert.equal(result.body.game.view.state.players.filter((player) => player.type === "bot").length, 3);
  assert.equal(result.body.game.view.state.players.every((player) => !Object.hasOwn(player, "hand")), true);
});

test("a host starts Texas Hold'em from the same shared global room with CPU seats", async (t) => {
  const { origin } = await startServer(t, { botTurnDelayMs: 10_000 });
  const host = (await jsonRequest(origin, "/api/rooms", {
    method: "POST",
    body: JSON.stringify({ name: "Host" })
  })).body;
  const socket = await openSocket(origin, host);
  t.after(() => socket.terminate());

  let update = nextMessage(socket, (message) => message.type === "room_state" && message.room.gameId === "holdem");
  socket.send(JSON.stringify({ type: "select_game", gameId: "holdem" }));
  await update;

  update = nextMessage(socket, (message) => message.type === "room_state" && message.room.gameSettings.botCount === 1);
  socket.send(JSON.stringify({ type: "set_bot_count", botCount: 1 }));
  await update;

  update = nextMessage(socket, (message) => message.type === "room_state" && message.room.canStart === true);
  socket.send(JSON.stringify({ type: "set_ready", ready: true }));
  await update;

  const gameState = nextMessage(socket, (message) => message.type === "game_state" && message.gameId === "holdem");
  socket.send(JSON.stringify({ type: "start_game" }));
  const message = await gameState;

  assert.equal(message.room.phase, "playing");
  assert.equal(message.room.game.name, "Texas Hold'em");
  assert.equal(message.view.type, "holdem_match_state");
  assert.equal(message.view.hand.length, 2);
  assert.equal(message.view.state.players.length, 2);
});

test("a host starts Five Card Draw from the same shared global room with CPU seats", async (t) => {
  const { origin } = await startServer(t, { botTurnDelayMs: 10_000 });
  const host = (await jsonRequest(origin, "/api/rooms", {
    method: "POST",
    body: JSON.stringify({ name: "Host" })
  })).body;
  const socket = await openSocket(origin, host);
  t.after(() => socket.terminate());

  let update = nextMessage(socket, (message) => message.type === "room_state" && message.room.gameId === "five-card-draw");
  socket.send(JSON.stringify({ type: "select_game", gameId: "five-card-draw" }));
  await update;

  update = nextMessage(socket, (message) => message.type === "room_state" && message.room.gameSettings.botCount === 1);
  socket.send(JSON.stringify({ type: "set_bot_count", botCount: 1 }));
  await update;

  update = nextMessage(socket, (message) => message.type === "room_state" && message.room.canStart === true);
  socket.send(JSON.stringify({ type: "set_ready", ready: true }));
  await update;

  const gameState = nextMessage(socket, (message) => message.type === "game_state" && message.gameId === "five-card-draw");
  socket.send(JSON.stringify({ type: "start_game" }));
  const message = await gameState;

  assert.equal(message.room.phase, "playing");
  assert.equal(message.room.game.name, "Five Card Draw");
  assert.equal(message.view.type, "five_card_draw_match_state");
  assert.equal(message.view.hand.length, 5);
  assert.equal(message.view.state.players.length, 2);
});

test("Solo starts JUAN with the original color/action deck", async (t) => {
  const { origin } = await startServer(t, { botTurnDelayMs: 10_000 });
  const result = await jsonRequest(origin, "/api/solo/juan", {
    method: "POST",
    body: JSON.stringify({ name: "JUAN Player", botCount: 3 })
  });

  assert.equal(result.response.status, 201);
  assert.equal(result.body.room.phase, "playing");
  assert.equal(result.body.room.gameId, "juan");
  assert.equal(result.body.game.view.type, "juan_match_state");
  assert.equal(result.body.game.view.hand.length, 7);
  assert.equal(result.body.game.view.state.players.length, 4);
  assert.equal(result.body.game.view.state.players.every((player) => !Object.hasOwn(player, "hand")), true);
  assert.ok(result.body.game.view.hand.every((card) => ["number", "pause", "turnabout", "double-draw", "prism", "prism-burst"].includes(card.kind)));
});

test("Solo starts Rotating Rummy with a private ten-card hand and public Route Deck", async (t) => {
  const { origin } = await startServer(t, { botTurnDelayMs: 10_000 });
  const result = await jsonRequest(origin, "/api/solo/rotating-rummy", {
    method: "POST",
    body: JSON.stringify({ name: "Route Player", botCount: 3 })
  });

  assert.equal(result.response.status, 201);
  assert.equal(result.body.room.phase, "playing");
  assert.equal(result.body.room.gameId, "rotating-rummy");
  assert.equal(result.body.game.view.type, "rotating_rummy_match_state");
  assert.equal(result.body.game.view.hand.length, 10);
  assert.equal(result.body.game.view.state.players.length, 4);
  assert.equal(result.body.game.view.state.routeDeck.routes.length, 10);
  assert.equal(result.body.game.view.state.players.every((player) => !Object.hasOwn(player, "hand")), true);
  assert.ok(result.body.game.view.hand.every((card) => ["number", "glitch", "lock"].includes(card.kind)));
});

test("a host starts JUAN from the same global Cardcade room", async (t) => {
  const { origin } = await startServer(t, { botTurnDelayMs: 10_000 });
  const host = (await jsonRequest(origin, "/api/rooms", {
    method: "POST",
    body: JSON.stringify({ name: "Host" })
  })).body;
  const socket = await openSocket(origin, host);
  t.after(() => socket.terminate());

  let update = nextMessage(socket, (message) => message.type === "room_state" && message.room.gameId === "juan");
  socket.send(JSON.stringify({ type: "select_game", gameId: "juan" }));
  await update;

  update = nextMessage(socket, (message) => message.type === "room_state" && message.room.gameSettings.botCount === 2);
  socket.send(JSON.stringify({ type: "set_bot_count", botCount: 2 }));
  await update;

  const blockedStart = nextMessage(socket, (message) => message.type === "error" && message.error.code === "ROOM_NOT_READY");
  socket.send(JSON.stringify({ type: "start_game" }));
  await blockedStart;

  update = nextMessage(socket, (message) => message.type === "room_state" && message.room.canStart === true);
  socket.send(JSON.stringify({ type: "set_ready", ready: true }));
  await update;

  const gameState = nextMessage(socket, (message) => message.type === "game_state" && message.gameId === "juan");
  socket.send(JSON.stringify({ type: "start_game" }));
  const message = await gameState;

  assert.equal(message.room.phase, "playing");
  assert.equal(message.room.game.name, "JUAN");
  assert.equal(message.view.hand.length, 7);
  assert.equal(message.view.state.players.length, 3);

  const lobbyState = nextMessage(socket, (candidate) => candidate.type === "room_state" && candidate.room.phase === "configuring");
  socket.send(JSON.stringify({ type: "return_to_lobby" }));
  const lobby = await lobbyState;
  assert.equal(lobby.room.code, host.code);
  assert.equal(lobby.room.gameId, "juan");
  assert.equal(lobby.room.players.length, 1);
  assert.equal(lobby.room.gameSettings.botCount, 2);

  update = nextMessage(socket, (candidate) => candidate.type === "room_state" && candidate.room.canStart === true);
  socket.send(JSON.stringify({ type: "set_ready", ready: true }));
  await update;

  const restartedState = nextMessage(socket, (candidate) => candidate.type === "game_state" && candidate.gameId === "juan");
  socket.send(JSON.stringify({ type: "start_game" }));
  const restarted = await restartedState;
  assert.equal(restarted.room.code, host.code);
  assert.equal(restarted.room.phase, "playing");
  assert.equal(restarted.view.hand.length, 7);
});

test("Hot Seat creates private human seats on the shared 3s & 7s runtime", async (t) => {
  const { origin } = await startServer(t);
  const result = await jsonRequest(origin, "/api/hot-seat/three-seven", {
    method: "POST",
    body: JSON.stringify({ players: ["Tommy", "Alex"] })
  });

  assert.equal(result.response.status, 201);
  assert.equal(result.body.mode, "hot-seat");
  assert.equal(result.body.room.phase, "playing");
  assert.equal(result.body.room.gameId, "three-seven");
  assert.equal(result.body.room.gameSettings.sharedDevice, true);
  assert.equal(result.body.hotSeat.seats.length, 2);
  assert.equal(new Set(result.body.hotSeat.seats.map((seat) => seat.token)).size, 2);
  assert.equal(result.body.game.view.hand.length, 7);
  assert.equal(result.body.game.view.state.players.length, 2);
  assert.equal(result.body.game.view.state.players.every((player) => player.type === "human"), true);

  const guestSeat = result.body.hotSeat.seats[1];
  const guest = await jsonRequest(origin, `/api/rooms/${result.body.code}/reconnect`, {
    method: "POST",
    body: JSON.stringify({ token: guestSeat.token })
  });
  assert.equal(guest.response.status, 200);
  assert.equal(guest.body.room.players.find((player) => player.isYou).name, "Alex");
  assert.equal(guest.body.game.view.hand.length, 7);
  assert.equal(guest.body.game.view.state.players.every((player) => !Object.hasOwn(player, "hand")), true);
});

test("Hot Seat mixes private human seats with configurable CPU players", async (t) => {
  const { origin } = await startServer(t, { botTurnDelayMs: 10_000 });
  const result = await jsonRequest(origin, "/api/hot-seat/three-seven", {
    method: "POST",
    body: JSON.stringify({ players: ["Tommy"], botCount: 2 })
  });

  assert.equal(result.response.status, 201);
  assert.equal(result.body.hotSeat.seats.length, 1);
  assert.equal(result.body.hotSeat.botCount, 2);
  assert.equal(result.body.room.gameSettings.botCount, 2);
  assert.equal(result.body.game.view.state.players.length, 3);
  assert.equal(result.body.game.view.state.players.filter((player) => player.type === "human").length, 1);
  assert.equal(result.body.game.view.state.players.filter((player) => player.type === "bot").length, 2);
  assert.equal(result.body.game.view.hand.length, 7);

  const invalid = await jsonRequest(origin, "/api/hot-seat/three-seven", {
    method: "POST",
    body: JSON.stringify({ players: ["Tommy"], botCount: 4 })
  });
  assert.equal(invalid.response.status, 400);
  assert.equal(invalid.body.error.code, "INVALID_PLAYER_COUNT");
});

test("Thirteen Hot Seat fills its fixed four seats with humans and CPUs", async (t) => {
  const { origin } = await startServer(t, { botTurnDelayMs: 10_000 });
  const result = await jsonRequest(origin, "/api/hot-seat/thirteen", {
    method: "POST",
    body: JSON.stringify({ players: ["One", "Two"], botCount: 2 })
  });

  assert.equal(result.response.status, 201);
  assert.equal(result.body.hotSeat.seats.length, 2);
  assert.equal(result.body.room.gameSettings.botCount, 2);
  assert.equal(result.body.game.view.state.players.length, 4);
  assert.equal(result.body.game.view.state.players.filter((player) => player.type === "bot").length, 2);
});

test("JUAN Hot Seat mixes private human hands with CPU seats", async (t) => {
  const { origin } = await startServer(t, { botTurnDelayMs: 10_000 });
  const result = await jsonRequest(origin, "/api/hot-seat/juan", {
    method: "POST",
    body: JSON.stringify({ players: ["Tommy", "Alex"], botCount: 2 })
  });

  assert.equal(result.response.status, 201);
  assert.equal(result.body.room.gameId, "juan");
  assert.equal(result.body.hotSeat.seats.length, 2);
  assert.equal(result.body.hotSeat.botCount, 2);
  assert.equal(result.body.game.view.hand.length, 7);
  assert.equal(result.body.game.view.state.players.length, 4);
  assert.equal(result.body.game.view.state.players.filter((player) => player.type === "bot").length, 2);

  const guestSeat = result.body.hotSeat.seats[1];
  const guest = await jsonRequest(origin, `/api/rooms/${result.body.code}/reconnect`, {
    method: "POST",
    body: JSON.stringify({ token: guestSeat.token })
  });
  assert.equal(guest.body.game.gameId, "juan");
  assert.equal(guest.body.game.view.hand.length, 7);
});

test("Rotating Rummy Hot Seat mixes private Route hands with CPU seats", async (t) => {
  const { origin } = await startServer(t, { botTurnDelayMs: 10_000 });
  const result = await jsonRequest(origin, "/api/hot-seat/rotating-rummy", {
    method: "POST",
    body: JSON.stringify({ players: ["Tommy", "Alex"], botCount: 2 })
  });

  assert.equal(result.response.status, 201);
  assert.equal(result.body.room.gameId, "rotating-rummy");
  assert.equal(result.body.hotSeat.seats.length, 2);
  assert.equal(result.body.hotSeat.botCount, 2);
  assert.equal(result.body.game.view.type, "rotating_rummy_match_state");
  assert.equal(result.body.game.view.hand.length, 10);
  assert.equal(result.body.game.view.state.players.length, 4);

  const guestSeat = result.body.hotSeat.seats[1];
  const guest = await jsonRequest(origin, `/api/rooms/${result.body.code}/reconnect`, {
    method: "POST",
    body: JSON.stringify({ token: guestSeat.token })
  });
  assert.equal(guest.body.game.gameId, "rotating-rummy");
  assert.equal(guest.body.game.view.hand.length, 10);
});

test("Blackjack Hot Seat shares private human seats with configurable CPUs", async (t) => {
  const { origin } = await startServer(t, { botTurnDelayMs: 10_000 });
  const result = await jsonRequest(origin, "/api/hot-seat/blackjack", {
    method: "POST",
    body: JSON.stringify({ players: ["Tommy", "Alex"], botCount: 2 })
  });

  assert.equal(result.response.status, 201);
  assert.equal(result.body.room.gameId, "blackjack");
  assert.equal(result.body.hotSeat.seats.length, 2);
  assert.equal(result.body.hotSeat.botCount, 2);
  assert.equal(result.body.game.view.type, "blackjack_match_state");
  assert.equal(result.body.game.view.hands[0].cards.length, 2);
  assert.equal(result.body.game.view.state.players.length, 4);
  assert.equal(result.body.game.view.state.players.filter((player) => player.type === "bot").length, 2);

  const guestSeat = result.body.hotSeat.seats[1];
  const guest = await jsonRequest(origin, `/api/rooms/${result.body.code}/reconnect`, {
    method: "POST",
    body: JSON.stringify({ token: guestSeat.token })
  });
  assert.equal(guest.body.game.gameId, "blackjack");
  assert.equal(guest.body.game.view.hands[0].cards.length, 2);
});

test("Texas Hold'em Hot Seat mixes private human hole cards with configurable CPUs", async (t) => {
  const { origin } = await startServer(t, { botTurnDelayMs: 10_000 });
  const result = await jsonRequest(origin, "/api/hot-seat/holdem", {
    method: "POST",
    body: JSON.stringify({ players: ["Tommy", "Alex"], botCount: 2 })
  });

  assert.equal(result.response.status, 201);
  assert.equal(result.body.room.gameId, "holdem");
  assert.equal(result.body.hotSeat.seats.length, 2);
  assert.equal(result.body.hotSeat.botCount, 2);
  assert.equal(result.body.game.view.type, "holdem_match_state");
  assert.equal(result.body.game.view.hand.length, 2);
  assert.equal(result.body.game.view.state.players.length, 4);
  assert.equal(result.body.game.view.state.players.filter((player) => player.type === "bot").length, 2);

  const guestSeat = result.body.hotSeat.seats[1];
  const guest = await jsonRequest(origin, `/api/rooms/${result.body.code}/reconnect`, {
    method: "POST",
    body: JSON.stringify({ token: guestSeat.token })
  });
  assert.equal(guest.body.game.gameId, "holdem");
  assert.equal(guest.body.game.view.hand.length, 2);
});

test("Five Card Draw Hot Seat mixes private human cards with configurable CPUs", async (t) => {
  const { origin } = await startServer(t, { botTurnDelayMs: 10_000 });
  const result = await jsonRequest(origin, "/api/hot-seat/five-card-draw", {
    method: "POST",
    body: JSON.stringify({ players: ["Tommy", "Alex"], botCount: 2 })
  });

  assert.equal(result.response.status, 201);
  assert.equal(result.body.room.gameId, "five-card-draw");
  assert.equal(result.body.hotSeat.seats.length, 2);
  assert.equal(result.body.hotSeat.botCount, 2);
  assert.equal(result.body.game.view.type, "five_card_draw_match_state");
  assert.equal(result.body.game.view.hand.length, 5);
  assert.equal(result.body.game.view.state.players.length, 4);
  assert.equal(result.body.game.view.state.players.filter((player) => player.type === "bot").length, 2);

  const guestSeat = result.body.hotSeat.seats[1];
  const guest = await jsonRequest(origin, `/api/rooms/${result.body.code}/reconnect`, {
    method: "POST",
    body: JSON.stringify({ token: guestSeat.token })
  });
  assert.equal(guest.body.game.gameId, "five-card-draw");
  assert.equal(guest.body.game.view.hand.length, 5);
});

test("Hot Seat runs Thirteen with four private human hands and host-controlled closure", async (t) => {
  const { origin } = await startServer(t);
  const result = await jsonRequest(origin, "/api/hot-seat/thirteen", {
    method: "POST",
    body: JSON.stringify({ players: ["One", "Two", "Three", "Four"] })
  });

  assert.equal(result.response.status, 201);
  assert.equal(result.body.room.gameId, "thirteen");
  assert.equal(result.body.hotSeat.seats.length, 4);
  assert.equal(result.body.game.view.hand.length, 13);
  assert.equal(result.body.game.view.state.players.length, 4);
  assert.equal(result.body.game.view.state.players.every((player) => player.type === "human"), true);

  const denied = await jsonRequest(origin, `/api/hot-seat/${result.body.code}/close`, {
    method: "POST",
    body: JSON.stringify({ token: result.body.hotSeat.seats[1].token })
  });
  assert.equal(denied.response.status, 403);
  assert.equal(denied.body.error.code, "HOST_ONLY");

  const closed = await jsonRequest(origin, `/api/hot-seat/${result.body.code}/close`, {
    method: "POST",
    body: JSON.stringify({ token: result.body.hotSeat.seats[0].token })
  });
  assert.equal(closed.response.status, 200);
  assert.equal(closed.body.closed, true);

  const reconnect = await jsonRequest(origin, `/api/rooms/${result.body.code}/reconnect`, {
    method: "POST",
    body: JSON.stringify({ token: result.body.hotSeat.seats[0].token })
  });
  assert.equal(reconnect.response.status, 404);
  assert.equal(reconnect.body.error.code, "ROOM_NOT_FOUND");
});
