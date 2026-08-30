import { fileURLToPath } from "node:url";
import { createCardcadeServer } from "./app.js";
import { deckFamilies, games } from "./game-catalog.js";
import { GameRegistry } from "./game-registry.js";
import { ThreeSevenRuntime } from "./games/three-seven/runtime.js";
import { ThirteenRuntime } from "./games/thirteen/runtime.js";
import { JuanRuntime } from "./games/juan/runtime.js";
import { RotatingRummyRuntime } from "./games/rotating-rummy/runtime.js";
import { BlackjackRuntime } from "./games/blackjack/runtime.js";
import { HoldemRuntime } from "./games/holdem/runtime.js";
import { FiveCardDrawRuntime } from "./games/five-card-draw/runtime.js";
import { RoomStore } from "./room-store.js";
import { SnapshotStore } from "./snapshot-store.js";

const host = process.env.HOST || "0.0.0.0";
const port = Number.parseInt(process.env.PORT || "4380", 10);
const defaultDatabaseFile = fileURLToPath(new URL("../../data/cardcade.sqlite3", import.meta.url));
const databaseFile = process.env.DB_FILE || defaultDatabaseFile;
const snapshotStore = new SnapshotStore({ file: databaseFile });
const snapshots = snapshotStore.loadAll();
const registry = new GameRegistry({ deckFamilies, games });
const rooms = new RoomStore({ registry, restoredRooms: snapshots.map((snapshot) => snapshot.room).filter(Boolean) });
const threeSevenRuntime = new ThreeSevenRuntime({ restoredMatches: snapshots.map((snapshot) => snapshot.game).filter(Boolean) });
const thirteenRuntime = new ThirteenRuntime({ restoredMatches: snapshots.map((snapshot) => snapshot.game).filter(Boolean) });
const juanRuntime = new JuanRuntime({ restoredMatches: snapshots.map((snapshot) => snapshot.game).filter(Boolean) });
const rotatingRummyRuntime = new RotatingRummyRuntime({ restoredMatches: snapshots.map((snapshot) => snapshot.game).filter(Boolean) });
const blackjackRuntime = new BlackjackRuntime({ restoredMatches: snapshots.map((snapshot) => snapshot.game).filter(Boolean) });
const holdemRuntime = new HoldemRuntime({ restoredMatches: snapshots.map((snapshot) => snapshot.game).filter(Boolean) });
const fiveCardDrawRuntime = new FiveCardDrawRuntime({ restoredMatches: snapshots.map((snapshot) => snapshot.game).filter(Boolean) });
for (const snapshot of snapshots) {
  if (!rooms.roomCodes().includes(snapshot.code)) snapshotStore.delete(snapshot.code);
}
const app = createCardcadeServer({ registry, roomStore: rooms, threeSevenRuntime, thirteenRuntime, juanRuntime, rotatingRummyRuntime, blackjackRuntime, holdemRuntime, fiveCardDrawRuntime, snapshotStore });

await app.listen({ host, port });
console.log(`Cardcade is listening on http://${host}:${port}`);
console.log(`Restored ${rooms.roomCodes().length} room(s) from ${databaseFile}.`);

let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  console.log(`Received ${signal}; closing Cardcade.`);
  await app.close();
  snapshotStore.close();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
