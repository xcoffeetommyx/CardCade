import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

const schema = `
  CREATE TABLE IF NOT EXISTS cardcade_rooms (
    code TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )
`;

export class SnapshotStore {
  #database;
  #upsert;
  #remove;
  #selectAll;

  constructor({ file = ":memory:" } = {}) {
    if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
    this.#database = new DatabaseSync(file);
    this.#database.exec(schema);
    this.#upsert = this.#database.prepare(`
      INSERT INTO cardcade_rooms (code, data, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(code) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
    `);
    this.#remove = this.#database.prepare("DELETE FROM cardcade_rooms WHERE code = ?");
    this.#selectAll = this.#database.prepare("SELECT data FROM cardcade_rooms ORDER BY updated_at ASC");
  }

  save(snapshot) {
    this.#upsert.run(snapshot.code, JSON.stringify(snapshot), Date.now());
  }

  delete(code) {
    this.#remove.run(String(code));
  }

  loadAll() {
    return this.#selectAll.all().flatMap((row) => {
      try {
        return [JSON.parse(row.data)];
      } catch {
        return [];
      }
    });
  }

  close() {
    this.#database.close();
  }
}
