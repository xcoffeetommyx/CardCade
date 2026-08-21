# Cardcade architecture

## Guiding rule

Cards are objects on a table, not buttons inside a UI panel. Presentation is shared where it is truly reusable; game rules remain isolated.

## Runtime shape

Cardcade is one Node.js process and one Docker service:

```text
Browser / installed PWA
        │ HTTP + same-origin WebSocket
        ▼
Cardcade server
  ├─ launcher and static assets
  ├─ global room/session service
  ├─ game registry
  └─ active game runtimes
         ├─ ThreeSeven adapter (playable)
         ├─ Thirteen adapter
         └─ future game adapters
```

The server is intentionally build-tool-free for the first milestone. It serves native browser modules and uses `ws` for the lobby connection.

## Catalog and deck families

A deck family is launcher metadata plus a presentation capability. For example, `standard-52` identifies the familiar four suits, thirteen ranks, standard card renderer, and physical fan. It does not define which card is stronger.

Every game registry entry declares:

- stable game id and human-readable metadata;
- deck family;
- supported modes;
- minimum and maximum players;
- whether CPU players are supported;
- migration/availability status.

Game code will later implement a narrow adapter contract resembling:

```js
{
  createMatch(context, settings),
  projectState(match, viewer),
  handleAction(match, actor, action),
  nextCpuAction(match, player),
  serialize(match),
  restore(snapshot)
}
```

ThreeSeven now proves this boundary in practice: Cardcade supplies rooms, identity, connections, and persistence, while its runtime owns rules, private views, CPU turns, round transitions, and scoring. The adapter contract will be generalized only when Thirteen provides a second real implementation.

## Rooms and sessions

A global room begins in `configuring` with `gameId: null`. The host may select or change the game while players wait. Selecting a game applies that game's capacity and resets readiness.

Room codes are discoverability keys, not authentication. Creation and joining return a random private token for that player. Only a hash is retained in server memory, and public projections never expose tokens or hashes.

The platform lobby supports these game-neutral actions:

- select a registered game (host);
- set CPU count (host, when the game supports it);
- mark ready;
- rename a player;
- leave or reconnect.

Game actions will travel through a separate game-runtime boundary after a match starts.

## What to reuse from ThreeSeven

ThreeSeven currently has the strongest version of these pieces:

- readable standard 52-card artwork;
- adaptive fan geometry and overlap hit testing;
- focus versus multi-card selection behavior;
- pixel styling that preserves readable UI text;
- player/bot lobby configuration;
- reconnect and match lifecycle patterns;
- broader automated coverage.

These should be extracted and renamed for Cardcade, not imported as game-specific globals. Thirteen keeps its own ranks, legal combinations, turn rules, scoring, and CPU decisions.

## Persistence

Cardcade stores private room state and active game snapshots in a single SQLite database. Reconnect tokens themselves are never written; only their SHA-256 hashes are persisted. On restart, live sockets are correctly restored as disconnected while seats, private hands, scores, piles, and rounds remain recoverable.

The Docker deployment mounts `/app/data` through the `cardcade-data` named volume. The persistence interface remains game-neutral: the room snapshot and the selected runtime snapshot share a room code but are restored by their respective owners.
