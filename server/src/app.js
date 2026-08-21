import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket, WebSocketServer } from "ws";
import { AppError } from "./errors.js";
import { deckFamilies, games } from "./game-catalog.js";
import { GameRegistry } from "./game-registry.js";
import { RoomStore } from "./room-store.js";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultPublicRoot = path.resolve(moduleDirectory, "../../public");

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".webmanifest", "application/manifest+json; charset=utf-8"]
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

function serveStatic(request, response, publicRoot, pathname) {
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
    filePath = path.join(publicRoot, "index.html");
  }

  const extension = path.extname(filePath).toLowerCase();
  const stat = statSync(filePath);
  response.writeHead(200, {
    "Content-Type": mimeTypes.get(extension) ?? "application/octet-stream",
    "Content-Length": stat.size,
    "Cache-Control": filePath.endsWith("index.html") || filePath.endsWith("sw.js") ? "no-cache" : "public, max-age=3600"
  });
  if (request.method === "HEAD") {
    response.end();
  } else {
    createReadStream(filePath).pipe(response);
  }
  return true;
}

export function createCardcadeServer({ registry, roomStore, publicRoot = defaultPublicRoot } = {}) {
  const gameRegistry = registry ?? new GameRegistry({ deckFamilies, games });
  const rooms = roomStore ?? new RoomStore({ registry: gameRegistry });
  const roomSockets = new Map();
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
        sendJson(response, 201, rooms.createRoom({ name: body.name }));
        return;
      }

      const joinMatch = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]+)\/join$/i);
      if (request.method === "POST" && joinMatch) {
        const body = await readJson(request);
        sendJson(response, 200, rooms.joinRoom(joinMatch[1], { name: body.name }));
        return;
      }

      const reconnectMatch = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]+)\/reconnect$/i);
      if (request.method === "POST" && reconnectMatch) {
        const body = await readJson(request);
        sendJson(response, 200, rooms.reconnect(reconnectMatch[1], body.token));
        return;
      }

      if (url.pathname.startsWith("/api/")) {
        sendJson(response, 404, { error: { code: "NOT_FOUND", message: "That Cardcade API route does not exist." } });
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
        send(socket, { type: "room_state", room });
      } catch (error) {
        const payload = errorPayload(error);
        send(socket, { type: "error", error: payload.body.error });
        socket.close(1008, "Invalid room session");
      }
    }
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
      case "rename_player":
        rooms.renamePlayer(code, token, message.name);
        break;
      case "leave_room":
        rooms.leaveRoom(code, token);
        socket.cardcade.left = true;
        socket.close(1000, "Left room");
        broadcastRoom(code);
        return;
      default:
        throw new AppError("UNKNOWN_MESSAGE", "That lobby action is not supported.");
    }
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
          broadcastRoom(session.code);
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
    rooms.cleanupExpired();
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
      for (const socket of webSocketServer.clients) socket.terminate();
      return new Promise((resolve, reject) => {
        webSocketServer.close(() => {
          httpServer.close((error) => error ? reject(error) : resolve());
        });
      });
    }
  };
}
