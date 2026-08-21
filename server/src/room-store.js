import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { AppError, assert } from "./errors.js";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DEFAULT_ROOM_CAPACITY = 8;
const DEFAULT_ROOM_TTL_MS = 12 * 60 * 60 * 1000;

function randomCode(length = 6) {
  let code = "";
  for (let index = 0; index < length; index += 1) {
    code += CODE_ALPHABET[randomBytes(1)[0] % CODE_ALPHABET.length];
  }
  return code;
}

function newToken() {
  return randomBytes(32).toString("base64url");
}

function hashToken(token) {
  return createHash("sha256").update(token).digest();
}

function tokenMatches(candidate, expectedHash) {
  if (typeof candidate !== "string" || candidate.length === 0) {
    return false;
  }
  const candidateHash = hashToken(candidate);
  return candidateHash.length === expectedHash.length && timingSafeEqual(candidateHash, expectedHash);
}

function normalizeCode(code) {
  return String(code ?? "").trim().toUpperCase();
}

function normalizeName(name) {
  const normalized = String(name ?? "").trim().replace(/\s+/g, " ");
  assert(normalized.length >= 1, "INVALID_NAME", "Enter a player name.");
  assert(normalized.length <= 24, "INVALID_NAME", "Player names can be at most 24 characters.");
  return normalized;
}

function touch(room, now) {
  room.version += 1;
  room.lastActivityAt = now;
}

export class RoomStore {
  #rooms = new Map();
  #registry;
  #now;
  #generateCode;
  #ttlMs;

  constructor({ registry, now = () => Date.now(), generateCode = randomCode, roomTtlMs = DEFAULT_ROOM_TTL_MS, restoredRooms = [] } = {}) {
    assert(registry, "REGISTRY_REQUIRED", "RoomStore requires a game registry.", 500);
    this.#registry = registry;
    this.#now = now;
    this.#generateCode = generateCode;
    this.#ttlMs = roomTtlMs;
    const cutoff = this.#now() - this.#ttlMs;
    for (const snapshot of restoredRooms) {
      const room = hydrateRoom(snapshot, this.#now());
      if (!room || room.lastActivityAt < cutoff || this.#rooms.has(room.code)) continue;
      this.#rooms.set(room.code, room);
    }
  }

  createRoom({ name }) {
    this.cleanupExpired();
    let code;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const candidate = normalizeCode(this.#generateCode());
      if (candidate && !this.#rooms.has(candidate)) {
        code = candidate;
        break;
      }
    }
    assert(code, "ROOM_CODE_EXHAUSTED", "Could not create a unique room code. Try again.", 503);

    const now = this.#now();
    const room = {
      code,
      phase: "configuring",
      gameId: null,
      gameSettings: { botCount: 0, sharedDevice: false },
      players: [],
      createdAt: now,
      lastActivityAt: now,
      version: 0
    };
    this.#rooms.set(code, room);
    return this.#addPlayer(room, normalizeName(name), "host");
  }

  joinRoom(code, { name }) {
    const room = this.#getRoom(code);
    assert(room.phase === "configuring", "ROOM_IN_PROGRESS", "That room has already started.", 409);
    const capacity = this.#capacity(room);
    assert(room.players.length < capacity, "ROOM_FULL", "That room is full.", 409);
    return this.#addPlayer(room, normalizeName(name), "guest");
  }

  reconnect(code, token) {
    const room = this.#getRoom(code);
    const player = this.#authenticatePlayer(room, token);
    player.connected = true;
    touch(room, this.#now());
    return this.#session(room, player, token);
  }

  setConnected(code, token, connected) {
    const room = this.#getRoom(code);
    const player = this.#authenticatePlayer(room, token);
    if (player.connected !== Boolean(connected)) {
      player.connected = Boolean(connected);
      touch(room, this.#now());
    }
    return this.project(room);
  }

  renamePlayer(code, token, name) {
    const room = this.#getRoom(code);
    const player = this.#authenticatePlayer(room, token);
    player.name = normalizeName(name);
    touch(room, this.#now());
    return this.project(room, player.id);
  }

  selectGame(code, token, gameId) {
    const room = this.#getRoom(code);
    const player = this.#authenticatePlayer(room, token);
    this.#assertHost(player);
    assert(room.phase === "configuring", "ROOM_IN_PROGRESS", "The game cannot be changed after play begins.", 409);

    const game = this.#registry.getGame(gameId);
    assert(game.modes.includes("multiplayer"), "MODE_NOT_SUPPORTED", "That game does not support multiplayer.");
    assert(room.players.length <= game.players.max, "TOO_MANY_PLAYERS", `${game.name} supports at most ${game.players.max} players.`, 409);

    room.gameId = game.id;
    room.gameSettings = { botCount: 0, sharedDevice: false };
    for (const roomPlayer of room.players) {
      roomPlayer.ready = false;
    }
    touch(room, this.#now());
    return this.project(room, player.id);
  }

  setBotCount(code, token, botCount) {
    const room = this.#getRoom(code);
    const player = this.#authenticatePlayer(room, token);
    this.#assertHost(player);
    assert(room.gameId, "GAME_REQUIRED", "Choose a game before adding CPU players.");
    const game = this.#registry.getGame(room.gameId);
    assert(game.supportsBots, "BOTS_NOT_SUPPORTED", `${game.name} does not support CPU players.`);
    assert(Number.isInteger(botCount) && botCount >= 0, "INVALID_BOT_COUNT", "CPU player count must be a whole number.");
    assert(room.players.length + botCount <= game.players.max, "TOO_MANY_PLAYERS", `${game.name} supports at most ${game.players.max} players.`);

    room.gameSettings.botCount = botCount;
    for (const roomPlayer of room.players) {
      roomPlayer.ready = false;
    }
    touch(room, this.#now());
    return this.project(room, player.id);
  }

  setSharedDevice(code, token, sharedDevice) {
    const room = this.#getRoom(code);
    const player = this.#authenticatePlayer(room, token);
    this.#assertHost(player);
    assert(room.phase === "configuring", "ROOM_IN_PROGRESS", "Shared-device mode is locked after play begins.", 409);
    room.gameSettings.sharedDevice = Boolean(sharedDevice);
    touch(room, this.#now());
    return this.project(room, player.id);
  }

  setReady(code, token, ready) {
    const room = this.#getRoom(code);
    const player = this.#authenticatePlayer(room, token);
    assert(room.phase === "configuring", "ROOM_IN_PROGRESS", "Readiness is locked after play begins.", 409);
    assert(room.gameId, "GAME_REQUIRED", "Wait for the host to choose a game.");
    player.ready = Boolean(ready);
    touch(room, this.#now());
    return this.project(room, player.id);
  }

  markPlaying(code, token) {
    const room = this.#getRoom(code);
    const player = this.#authenticatePlayer(room, token);
    this.#assertHost(player);
    assert(room.phase === "configuring", "ROOM_IN_PROGRESS", "That room has already started.", 409);
    const projection = this.project(room, player.id);
    assert(projection.canStart, "ROOM_NOT_READY", projection.startBlocker || "That room is not ready to start.", 409);
    room.phase = "playing";
    touch(room, this.#now());
    return this.project(room, player.id);
  }

  returnToLobby(code, token) {
    const room = this.#getRoom(code);
    const player = this.#authenticatePlayer(room, token);
    this.#assertHost(player);
    assert(room.phase === "playing", "ROOM_NOT_IN_PROGRESS", "That room is already in the lobby.", 409);

    room.phase = "configuring";
    for (const roomPlayer of room.players) {
      roomPlayer.ready = false;
    }
    touch(room, this.#now());
    return this.project(room, player.id);
  }

  leaveRoom(code, token) {
    const room = this.#getRoom(code);
    const player = this.#authenticatePlayer(room, token);
    room.players = room.players.filter((candidate) => candidate.id !== player.id);
    if (room.players.length === 0) {
      this.#rooms.delete(room.code);
      return null;
    }
    if (player.role === "host") {
      room.players[0].role = "host";
    }
    room.players.forEach((candidate, index) => {
      if (room.phase === "configuring") candidate.seat = index;
      candidate.ready = false;
    });
    touch(room, this.#now());
    return this.project(room);
  }

  closeRoom(code, token) {
    const room = this.#getRoom(code);
    const player = this.#authenticatePlayer(room, token);
    this.#assertHost(player);
    this.#rooms.delete(room.code);
    return true;
  }

  publicRoom(code, token) {
    const room = this.#getRoom(code);
    const player = this.#authenticatePlayer(room, token);
    return this.project(room, player.id);
  }

  privateSnapshot(code) {
    const room = this.#getRoom(code);
    return {
      code: room.code,
      phase: room.phase,
      gameId: room.gameId,
      gameSettings: { ...room.gameSettings },
      createdAt: room.createdAt,
      lastActivityAt: room.lastActivityAt,
      version: room.version,
      players: room.players.map((player) => ({
        id: player.id,
        name: player.name,
        seat: player.seat,
        role: player.role,
        ready: player.ready,
        joinedAt: player.joinedAt,
        tokenHash: player.tokenHash.toString("base64")
      }))
    };
  }

  roomCodes() {
    this.cleanupExpired();
    return [...this.#rooms.keys()];
  }

  project(roomOrCode, viewerId = null) {
    const room = typeof roomOrCode === "string" ? this.#getRoom(roomOrCode) : roomOrCode;
    const game = room.gameId ? this.#registry.getGame(room.gameId) : null;
    const humanCount = room.players.length;
    const botCount = room.gameSettings.botCount;
    const totalPlayers = humanCount + botCount;
    const everyoneReady = humanCount > 0 && room.players.every((player) => player.ready && player.connected);
    const enoughPlayers = game ? totalPlayers >= game.players.min : false;

    return {
      code: room.code,
      phase: room.phase,
      gameId: room.gameId,
      game,
      gameSettings: { ...room.gameSettings },
      players: room.players.map((player) => ({
        id: player.id,
        name: player.name,
        seat: player.seat,
        role: player.role,
        ready: player.ready,
        connected: player.connected,
        isYou: player.id === viewerId
      })),
      capacity: this.#capacity(room),
      version: room.version,
      canStart: Boolean(room.phase === "configuring" && game && game.status === "available" && enoughPlayers && everyoneReady),
      startBlocker: this.#startBlocker(game, enoughPlayers, everyoneReady)
    };
  }

  cleanupExpired(onRemove = null) {
    const cutoff = this.#now() - this.#ttlMs;
    let removed = 0;
    for (const [code, room] of this.#rooms) {
      if (room.lastActivityAt < cutoff) {
        this.#rooms.delete(code);
        onRemove?.(code);
        removed += 1;
      }
    }
    return removed;
  }

  #addPlayer(room, name, role) {
    assert(!room.players.some((player) => player.name.toLocaleLowerCase() === name.toLocaleLowerCase()), "NAME_IN_USE", "That name is already being used in this room.", 409);
    const token = newToken();
    const player = {
      id: randomUUID(),
      name,
      seat: room.players.length,
      role,
      ready: false,
      connected: true,
      joinedAt: this.#now(),
      tokenHash: hashToken(token)
    };
    room.players.push(player);
    touch(room, this.#now());
    return this.#session(room, player, token);
  }

  #session(room, player, token) {
    return {
      code: room.code,
      playerId: player.id,
      token,
      room: this.project(room, player.id)
    };
  }

  #getRoom(code) {
    this.cleanupExpired();
    const room = this.#rooms.get(normalizeCode(code));
    assert(room, "ROOM_NOT_FOUND", "That room code was not found.", 404);
    return room;
  }

  #authenticatePlayer(room, token) {
    const player = room.players.find((candidate) => tokenMatches(token, candidate.tokenHash));
    if (!player) {
      throw new AppError("INVALID_SESSION", "That private room session is not valid.", 401);
    }
    return player;
  }

  #assertHost(player) {
    assert(player.role === "host", "HOST_ONLY", "Only the host can change that setting.", 403);
  }

  #capacity(room) {
    return room.gameId ? this.#registry.getGame(room.gameId).players.max : DEFAULT_ROOM_CAPACITY;
  }

  #startBlocker(game, enoughPlayers, everyoneReady) {
    if (!game) return "Choose a game.";
    if (game.status !== "available") return `${game.name} is ready to migrate into the Cardcade shell next.`;
    if (!enoughPlayers) return `Add at least ${game.players.min} players.`;
    if (!everyoneReady) return "Every human player must be ready.";
    return null;
  }
}

function hydrateRoom(snapshot, now) {
  if (!snapshot || typeof snapshot !== "object") return null;
  const code = normalizeCode(snapshot.code);
  if (!code || !Array.isArray(snapshot.players) || snapshot.players.length === 0) return null;
  const players = snapshot.players.flatMap((player) => {
    try {
      const tokenHash = Buffer.from(String(player.tokenHash || ""), "base64");
      if (tokenHash.length !== 32) return [];
      return [{
        id: String(player.id),
        name: normalizeName(player.name),
        seat: Number(player.seat),
        role: player.role === "host" ? "host" : "guest",
        ready: Boolean(player.ready),
        connected: false,
        joinedAt: Number(player.joinedAt) || now,
        tokenHash
      }];
    } catch {
      return [];
    }
  });
  if (!players.length || !players.some((player) => player.role === "host")) return null;
  return {
    code,
    phase: snapshot.phase === "playing" ? "playing" : "configuring",
    gameId: typeof snapshot.gameId === "string" ? snapshot.gameId : null,
    gameSettings: {
      botCount: Math.max(0, Number(snapshot.gameSettings?.botCount) || 0),
      sharedDevice: Boolean(snapshot.gameSettings?.sharedDevice)
    },
    players,
    createdAt: Number(snapshot.createdAt) || now,
    lastActivityAt: Number(snapshot.lastActivityAt) || now,
    version: Number(snapshot.version) || 0
  };
}
