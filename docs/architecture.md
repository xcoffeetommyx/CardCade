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
         ├─ 3s & 7s adapter (playable)
         ├─ Thirteen adapter (playable)
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

The two current games implement a narrow runtime boundary resembling:

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

3s & 7s and Thirteen now prove this boundary in practice: Cardcade supplies rooms, identity, connections, persistence, the standard deck presentation, and private Hot Seat handoffs. Each runtime owns its rules, private views, CPU turns, round transitions, and scoring. Shared behavior should be generalized only when both implementations actually need it.

## Rooms and sessions

A global room begins in `configuring` with `gameId: null`. The host may select or change the game while players wait. Selecting a game applies that game's capacity and resets readiness.

Room codes are discoverability keys, not authentication. Creation and joining return a random private token for that player. Only a hash is retained in server memory, and public projections never expose tokens or hashes.

The platform lobby supports these game-neutral actions:

- select a registered game (host);
- set CPU count (host, when the game supports it);
- mark ready;
- rename a player;
- leave or reconnect.

Game actions travel through the selected game-runtime boundary after a match starts.

Hot Seat creates a normal server-authoritative room with one private session per human seat. Only the current seat is connected to the shared device. Between turns, the client removes the prior hand from its render state, disconnects that session, and shows a covered pass-the-device screen before reconnecting the named next seat. Round transitions return to the host, while 3s & 7s mercy decisions return to the guaranteed leader.

## What to reuse from ThreeSeven

ThreeSeven currently has the strongest version of these pieces:

- readable standard 52-card artwork;
- adaptive fan geometry and overlap hit testing;
- focus versus multi-card selection behavior;
- pixel styling that preserves readable UI text;
- player/bot lobby configuration;
- reconnect and match lifecycle patterns;
- broader automated coverage.

These are now shared Cardcade presentation modules rather than imported game-specific assets. Thirteen keeps its own ranks, legal combinations, turn rules, scoring, and CPU decisions.

## Persistence

Cardcade stores private room state and active game snapshots in a single SQLite database. Reconnect tokens themselves are never written; only their SHA-256 hashes are persisted. On restart, live sockets are correctly restored as disconnected while seats, private hands, scores, piles, and rounds remain recoverable.

The Docker deployment mounts `/app/data` through the `cardcade-data` named volume. The persistence interface remains game-neutral: the room snapshot and the selected runtime snapshot share a room code but are restored by their respective owners.
