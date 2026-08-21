import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket, WebSocketServer } from "ws";
import { AppError } from "./errors.js";
import { deckFamilies, games } from "./game-catalog.js";
import { GameRegistry } from "./game-registry.js";
import { ThreeSevenRuntime } from "./games/three-seven/runtime.js";
import { ThirteenRuntime } from "./games/thirteen/runtime.js";
import { JuanRuntime } from "./games/juan/runtime.js";
import { RoomStore } from "./room-store.js";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultPublicRoot = path.resolve(moduleDirectory, "../../public");
const defaultSharedRoot = path.resolve(moduleDirectory, "../../shared");

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".woff2", "font/woff2"]
]);

function sendJson(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store"
  });
  response.end(payload);
}

function errorPayload(error) {
  if (error instanceof AppError) {
    return { status: error.status, body: { error: { code: error.code, message: error.message } } };
  }
  console.error(error);
  return { status: 500, body: { error: { code: "INTERNAL_ERROR", message: "Cardcade hit an unexpected error." } } };
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 32_768) {
      throw new AppError("PAYLOAD_TOO_LARGE", "That request is too large.", 413);
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AppError("INVALID_JSON", "The request body must be valid JSON.");
  }
}

function applySecurityHeaders(response) {
  response.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
}

function serveStatic(request, response, publicRoot, pathname, { spaFallback = true } = {}) {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    throw new AppError("INVALID_PATH", "That path is not valid.", 400);
  }

  const relativePath = decodedPath === "/" ? "index.html" : decodedPath.replace(/^\/+/, "");
  let filePath = path.resolve(publicRoot, relativePath);
  const rootBoundary = `${path.resolve(publicRoot)}${path.sep}`;
  if (!filePath.startsWith(rootBoundary)) return false;
  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    if (!spaFallback) return false;
    filePath = path.join(publicRoot, "index.html");
  }

  const extension = path.extname(filePath).toLowerCase();
  const stat = statSync(filePath);
  const requiresRevalidation = [".html", ".js", ".css", ".json", ".webmanifest"].includes(extension);
  response.writeHead(200, {
    "Content-Type": mimeTypes.get(extension) ?? "application/octet-stream",
    "Content-Length": stat.size,
    "Cache-Control": requiresRevalidation ? "no-cache" : "public, max-age=3600"
  });
  if (request.method === "HEAD") {
    response.end();
  } else {
    createReadStream(filePath).pipe(response);
  }
  return true;
}

export function createCardcadeServer({
  registry,
  roomStore,
  threeSevenRuntime,
  thirteenRuntime,
  juanRuntime,
  snapshotStore = null,
  publicRoot = defaultPublicRoot,
  sharedRoot = defaultSharedRoot,
  botTurnDelayMs = 420
} = {}) {
  const gameRegistry = registry ?? new GameRegistry({ deckFamilies, games });
  const rooms = roomStore ?? new RoomStore({ registry: gameRegistry });
  const threeSeven = threeSevenRuntime ?? new ThreeSevenRuntime();
  const thirteen = thirteenRuntime ?? new ThirteenRuntime();
  const juan = juanRuntime ?? new JuanRuntime();
  const gameRuntimes = new Map([
    ["three-seven", threeSeven],
    ["thirteen", thirteen],
    ["juan", juan]
  ]);
  const roomSockets = new Map();
  const botTimers = new Map();
  const webSocketServer = new WebSocketServer({ noServer: true });

  const httpServer = createServer(async (request, response) => {
    applySecurityHeaders(response);
    const url = new URL(request.url, "http://cardcade.local");

    try {
      if (request.method === "GET" && url.pathname === "/health") {
        sendJson(response, 200, { ok: true, service: "cardcade" });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/catalog") {
        sendJson(response, 200, gameRegistry.catalog());
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/rooms") {
        const body = await readJson(request);
        const session = rooms.createRoom({ name: body.name });
        persistRoom(session.code);
        sendJson(response, 201, session);
        return;
      }

      const soloMatch = url.pathname.match(/^\/api\/solo\/([a-z0-9-]+)$/i);
      if (request.method === "POST" && soloMatch) {
        const body = await readJson(request);
        const gameId = soloMatch[1].toLowerCase();
        const game = gameRegistry.getGame(gameId);
        const runtime = requireRuntime(gameId);
        if (game.status !== "available" || !game.modes.includes("solo") || !game.supportsBots) {
          throw new AppError("MODE_NOT_SUPPORTED", `${game.name} is not available for Solo play.`, 409);
        }
        const session = rooms.createRoom({ name: body.name });
        rooms.selectGame(session.code, session.token, gameId);
        const requestedBots = Number.isInteger(body.botCount) ? body.botCount : game.players.max - 1;
        rooms.setBotCount(session.code, session.token, requestedBots);
        rooms.setReady(session.code, session.token, true);
        runtime.start(rooms.publicRoom(session.code, session.token));
        rooms.markPlaying(session.code, session.token);
        const room = rooms.publicRoom(session.code, session.token);
        persistRoom(session.code);
        scheduleBotTurns(session.code);
        sendJson(response, 201, {
          ...session,
          room,
          game: { gameId, view: runtime.view(room) }
        });
        return;
      }

      const hotSeatMatch = url.pathname.match(/^\/api\/hot-seat\/([a-z0-9-]+)$/i);
      if (request.method === "POST" && hotSeatMatch) {
        const body = await readJson(request);
        const gameId = hotSeatMatch[1].toLowerCase();
        const game = gameRegistry.getGame(gameId);
        const runtime = requireRuntime(gameId);
        if (game.status !== "available" || !game.modes.includes("hot-seat")) {
          throw new AppError("MODE_NOT_SUPPORTED", `${game.name} is not available for Hot Seat play.`, 409);
        }
        const names = Array.isArray(body.players) ? body.players : [];
        const botCount = Number.isInteger(body.botCount) ? body.botCount : 0;
        const totalPlayers = names.length + botCount;
        if (names.length < 1 || names.length > game.players.max || botCount < 0
          || totalPlayers < game.players.min || totalPlayers > game.players.max) {
          throw new AppError(
            "INVALID_PLAYER_COUNT",
            `${game.name} Hot Seat requires ${game.players.min === game.players.max ? game.players.min : `${game.players.min}–${game.players.max}`} total human and CPU players, including at least one human.`
          );
        }
        if (botCount > 0 && !game.supportsBots) {
          throw new AppError("BOTS_NOT_SUPPORTED", `${game.name} does not support CPU players.`, 409);
        }

        let hostSession = null;
        try {
          hostSession = rooms.createRoom({ name: names[0] });
          const sessions = [hostSession];
          for (const name of names.slice(1)) {
            sessions.push(rooms.joinRoom(hostSession.code, { name }));
          }
          rooms.selectGame(hostSession.code, hostSession.token, gameId);
          rooms.setSharedDevice(hostSession.code, hostSession.token, true);
          rooms.setBotCount(hostSession.code, hostSession.token, botCount);
          for (const session of sessions) rooms.setReady(hostSession.code, session.token, true);
          runtime.start(rooms.publicRoom(hostSession.code, hostSession.token));
          rooms.markPlaying(hostSession.code, hostSession.token);
          const room = rooms.publicRoom(hostSession.code, hostSession.token);
          const seats = sessions.map((session) => {
            const privateRoom = rooms.publicRoom(hostSession.code, session.token);
            const player = privateRoom.players.find((candidate) => candidate.isYou);
            return {
              playerId: session.playerId,
              token: session.token,
              seat: player.seat,
              name: player.name,
              role: player.role
            };
          });
          persistRoom(hostSession.code);
          if (botCount > 0) scheduleBotTurns(hostSession.code);
          sendJson(response, 201, {
            code: hostSession.code,
            playerId: hostSession.playerId,
            token: hostSession.token,
            mode: "hot-seat",
            room,
            hotSeat: { seats, botCount },
            game: { gameId, view: runtime.view(room) }
          });
        } catch (error) {
          if (hostSession) {
            try {
              const room = rooms.privateSnapshot(hostSession.code);
              gameRuntimes.get(room.gameId)?.remove?.(hostSession.code);
              rooms.closeRoom(hostSession.code, hostSession.token);
              snapshotStore?.delete(hostSession.code);
            } catch {
              // Preserve the original setup error.
            }
          }
          throw error;
        }
        return;
      }

      const joinMatch = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]+)\/join$/i);
      if (request.method === "POST" && joinMatch) {
        const body = await readJson(request);
        const session = rooms.joinRoom(joinMatch[1], { name: body.name });
        persistRoom(session.code);
        sendJson(response, 200, session);
        return;
      }

      const reconnectMatch = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]+)\/reconnect$/i);
      if (request.method === "POST" && reconnectMatch) {
        const body = await readJson(request);
        const session = rooms.reconnect(reconnectMatch[1], body.token);
        persistRoom(session.code);
        const runtime = gameRuntimes.get(session.room.gameId);
        const payload = session.room.phase === "playing" && runtime?.has(session.code)
          ? { ...session, game: { gameId: session.room.gameId, view: runtime.view(session.room) } }
          : session;
        sendJson(response, 200, payload);
        return;
      }

      const closeHotSeatMatch = url.pathname.match(/^\/api\/hot-seat\/([A-Z0-9]+)\/close$/i);
      if (request.method === "POST" && closeHotSeatMatch) {
        const body = await readJson(request);
        closeSharedDeviceRoom(closeHotSeatMatch[1], body.token);
        sendJson(response, 200, { closed: true });
        return;
      }

      if (url.pathname.startsWith("/api/")) {
        sendJson(response, 404, { error: { code: "NOT_FOUND", message: "That Cardcade API route does not exist." } });
        return;
      }

      if (url.pathname.startsWith("/shared/")) {
        const sharedPath = url.pathname.slice("/shared".length) || "/";
        if (!serveStatic(request, response, sharedRoot, sharedPath, { spaFallback: false })) {
          response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
          response.end("Not found");
        }
        return;
      }

      if (!serveStatic(request, response, publicRoot, url.pathname)) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Not found");
      }
    } catch (error) {
      const payload = errorPayload(error);
      sendJson(response, payload.status, payload.body);
    }
  });

  function send(socket, payload) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
    }
  }

  function requireRuntime(gameId) {
    const runtime = gameRuntimes.get(gameId);
    if (!runtime) throw new AppError("GAME_NOT_AVAILABLE", "That game has not been migrated into Cardcade yet.", 409);
    return runtime;
  }

  function persistRoom(code) {
    if (!snapshotStore) return;
    try {
      const room = rooms.privateSnapshot(code);
      const runtime = gameRuntimes.get(room.gameId);
      snapshotStore.save({
        code,
        room,
        game: runtime?.has(code)
          ? { gameId: room.gameId, code, state: runtime.snapshot(code) }
          : null
      });
    } catch (error) {
      if (error instanceof AppError && error.code === "ROOM_NOT_FOUND") {
        snapshotStore.delete(code);
        return;
      }
      console.error("Could not persist Cardcade room snapshot.", error);
    }
  }

  function closeSharedDeviceRoom(code, token) {
    const room = rooms.privateSnapshot(code);
    if (!room.gameSettings.sharedDevice) {
      throw new AppError("MODE_NOT_SUPPORTED", "That room is not a Hot Seat table.", 409);
    }
    rooms.closeRoom(code, token);
    gameRuntimes.get(room.gameId)?.remove?.(room.code);
    const timer = botTimers.get(room.code);
    if (timer) clearTimeout(timer);
    botTimers.delete(room.code);
    snapshotStore?.delete(room.code);
    for (const socket of roomSockets.get(room.code) ?? []) {
      socket.cardcade.left = true;
      send(socket, { type: "table_closed" });
      socket.close(1000, "Hot Seat table closed");
    }
    roomSockets.delete(room.code);
  }

  function removeSocket(socket) {
    if (!socket.cardcade) return;
    const sockets = roomSockets.get(socket.cardcade.code);
    sockets?.delete(socket);
    if (sockets?.size === 0) roomSockets.delete(socket.cardcade.code);
  }

  function broadcastRoom(code) {
    const sockets = roomSockets.get(code);
    if (!sockets) return;
    for (const socket of sockets) {
      try {
        const room = rooms.publicRoom(code, socket.cardcade.token);
        const runtime = gameRuntimes.get(room.gameId);
        if (room.phase === "playing" && runtime?.has(code)) {
          send(socket, { type: "game_state", gameId: room.gameId, room, view: runtime.view(room) });
        } else {
          send(socket, { type: "room_state", room });
        }
      } catch (error) {
        const payload = errorPayload(error);
        send(socket, { type: "error", error: payload.body.error });
        socket.close(1008, "Invalid room session");
      }
    }
  }

  function scheduleBotTurns(code) {
    if (botTimers.has(code)) return;
    const tick = () => {
      botTimers.delete(code);
      try {
        const room = rooms.privateSnapshot(code);
        const runtime = gameRuntimes.get(room.gameId);
        if (!runtime?.has(code)) return;
        const played = runtime.runBotTurn(code);
        if (!played) return;
        persistRoom(code);
        broadcastRoom(code);
        botTimers.set(code, setTimeout(tick, botTurnDelayMs));
      } catch (error) {
        const payload = errorPayload(error);
        for (const socket of roomSockets.get(code) ?? []) {
          send(socket, { type: "error", error: payload.body.error });
        }
      }
    };
    botTimers.set(code, setTimeout(tick, botTurnDelayMs));
  }

  function startRoomGame(code, token) {
    const room = rooms.publicRoom(code, token);
    if (room.phase !== "configuring") {
      throw new AppError("ROOM_IN_PROGRESS", "That room has already started.", 409);
    }
    const runtime = requireRuntime(room.gameId);
    // A configuring room can only have a runtime after an interrupted or
    // previously failed start. Remove that orphan before beginning a new game.
    if (runtime.has(code)) runtime.remove(code);
    try {
      runtime.start(room);
      rooms.markPlaying(code, token);
    } catch (error) {
      runtime.remove(code);
      throw error;
    }
    persistRoom(code);
    broadcastRoom(code);
    scheduleBotTurns(code);
  }

  function returnRoomToLobby(code, token) {
    const activeRoom = rooms.publicRoom(code, token);
    rooms.returnToLobby(code, token);
    gameRuntimes.get(activeRoom.gameId)?.remove?.(code);
    const timer = botTimers.get(code);
    if (timer) clearTimeout(timer);
    botTimers.delete(code);
    persistRoom(code);
    broadcastRoom(code);
  }

  function handleAction(socket, message) {
    const { code, token } = socket.cardcade;
    switch (message.type) {
      case "select_game":
        rooms.selectGame(code, token, message.gameId);
        break;
      case "set_bot_count":
        rooms.setBotCount(code, token, message.botCount);
        break;
      case "set_ready":
        rooms.setReady(code, token, message.ready);
        break;
      case "start_game":
        startRoomGame(code, token);
        return;
      case "return_to_lobby":
        returnRoomToLobby(code, token);
        return;
      case "rename_player":
        rooms.renamePlayer(code, token, message.name);
        break;
      case "leave_room":
        {
          const room = rooms.publicRoom(code, token);
          const leavingPlayer = room.players.find((player) => player.isYou);
          if (room.phase === "playing" && leavingPlayer) {
            gameRuntimes.get(room.gameId)?.replaceHumanWithBot(code, leavingPlayer.seat);
          }
        }
        rooms.leaveRoom(code, token);
        persistRoom(code);
        socket.cardcade.left = true;
        socket.close(1000, "Left room");
        broadcastRoom(code);
        scheduleBotTurns(code);
        return;
      default:
        {
          const room = rooms.publicRoom(code, token);
          if (room.phase !== "playing") throw new AppError("UNKNOWN_MESSAGE", "That lobby action is not supported.");
          const runtime = requireRuntime(room.gameId);
          runtime.act(room, message);
          persistRoom(code);
          // Broadcast the human action before any paced CPU response.
          broadcastRoom(code);
          scheduleBotTurns(code);
          return;
        }
    }
    persistRoom(code);
    broadcastRoom(code);
  }

  webSocketServer.on("connection", (socket) => {
    socket.isAlive = true;
    socket.on("pong", () => {
      socket.isAlive = true;
    });

    const authenticationTimeout = setTimeout(() => {
      if (!socket.cardcade) socket.close(1008, "Authentication required");
    }, 5_000);

    socket.on("message", (buffer) => {
      let message;
      try {
        message = JSON.parse(buffer.toString("utf8"));
        if (!socket.cardcade) {
          if (message.type !== "authenticate") {
            throw new AppError("AUTH_REQUIRED", "Authenticate before sending lobby actions.", 401);
          }
          const session = rooms.reconnect(message.code, message.token);
          socket.cardcade = { code: session.code, playerId: session.playerId, token: message.token, left: false };
          clearTimeout(authenticationTimeout);
          const sockets = roomSockets.get(session.code) ?? new Set();
          sockets.add(socket);
          roomSockets.set(session.code, sockets);
          persistRoom(session.code);
          broadcastRoom(session.code);
          if (session.room.phase === "playing") scheduleBotTurns(session.code);
          return;
        }
        handleAction(socket, message);
      } catch (error) {
        const payload = errorPayload(error);
        send(socket, { type: "error", error: payload.body.error });
      }
    });

    socket.on("close", () => {
      clearTimeout(authenticationTimeout);
      const connection = socket.cardcade;
      removeSocket(socket);
      if (!connection || connection.left) return;
      const otherConnection = [...(roomSockets.get(connection.code) ?? [])]
        .some((candidate) => candidate.cardcade?.playerId === connection.playerId);
      if (!otherConnection) {
        try {
          rooms.setConnected(connection.code, connection.token, false);
          persistRoom(connection.code);
          broadcastRoom(connection.code);
        } catch {
          // The room may have expired while the socket was open.
        }
      }
    });
  });

  httpServer.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url, "http://cardcade.local");
    if (url.pathname !== "/ws") {
      socket.destroy();
      return;
    }
    webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
      webSocketServer.emit("connection", webSocket, request);
    });
  });

  const heartbeat = setInterval(() => {
    rooms.cleanupExpired((code) => snapshotStore?.delete(code));
    for (const socket of webSocketServer.clients) {
      if (!socket.isAlive) {
        socket.terminate();
        continue;
      }
      socket.isAlive = false;
      socket.ping();
    }
  }, 30_000);
  heartbeat.unref();

  return {
    server: httpServer,
    registry: gameRegistry,
    rooms,
    listen({ host = "127.0.0.1", port = 4380 } = {}) {
      return new Promise((resolve, reject) => {
        const onError = (error) => reject(error);
        httpServer.once("error", onError);
        httpServer.listen(port, host, () => {
          httpServer.off("error", onError);
          resolve(httpServer.address());
        });
      });
    },
    close() {
      clearInterval(heartbeat);
      for (const timer of botTimers.values()) clearTimeout(timer);
      botTimers.clear();
      for (const socket of webSocketServer.clients) socket.terminate();
      return new Promise((resolve, reject) => {
        webSocketServer.close(() => {
          httpServer.close((error) => error ? reject(error) : resolve());
        });
      });
    }
  };
}
