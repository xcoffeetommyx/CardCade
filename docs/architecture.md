# Cardcade architecture

## Guiding rule

Games, decks, players, and tables are objects in a space. UI exists to operate those objects. Cards remain objects on a table, not buttons inside a UI panel. Presentation is shared where it is truly reusable; game rules remain isolated.

The launcher follows the same rule through the existing `state.screen` render architecture. Home, library, setup, room, and game screens share a compact game-shell language—menu commands, game objects, configuration selectors, player seats, prompts, and action docks—without turning those presentation primitives into game rules or introducing a client router. Major-screen transitions communicate movement through that hierarchy and become effectively instantaneous when reduced motion is enabled. Settings remains a legibility-first utility surface.

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
         ├─ JUAN adapter (playable)
         ├─ Rotating Rummy adapter (playable)
         ├─ Blackjack adapter (playable)
         ├─ Texas Hold'em adapter (playable)
         ├─ Five Card Draw adapter (playable)
         └─ Snap adapter (playable)
```

The server is intentionally build-tool-free for the first milestone. It serves native browser modules and uses `ws` for the lobby connection.

## Catalog and deck families

A deck family is launcher metadata plus a presentation capability. For example, `standard-52` identifies the familiar four suits, thirteen ranks, standard card renderer, and physical fan. `color-action` identifies JUAN's original color lanes, action faces, and dedicated card renderer. `rotating-rummy` identifies Blackout number cards, Glitches, Locks, and the Route renderer. Neither family defines a game's rules.

Every game registry entry declares:

- stable game id and human-readable metadata;
- deck family;
- supported modes;
- minimum and maximum players;
- whether CPU players are supported;
- migration/availability status.

The current games implement a narrow runtime boundary resembling:

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

3s & 7s, Thirteen, JUAN, Rotating Rummy, Blackjack, Texas Hold'em, Five Card Draw, and Snap now prove this boundary in practice: Cardcade supplies rooms, identity, connections, persistence, physical card behavior, and private Hot Seat handoffs. Each runtime owns its deck contract where needed, rules, private views, CPU turns, timed transitions, round transitions, and scoring. Shared behavior should be generalized only when multiple implementations actually need it.

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

Hot Seat creates a normal server-authoritative room with one private session per human seat plus any configured CPU seats. Only the current human seat is connected to the shared device. Between human turns, the client removes the prior hand from its render state, disconnects that session, and shows either a covered pass-the-device screen or a covered automatic CPU turn. Round transitions return to the host, while 3s & 7s mercy decisions return to the guaranteed leader. Snap omits Hot Seat because its reaction window expects simultaneous independent controls.

## What to reuse from ThreeSeven

ThreeSeven currently has the strongest version of these pieces:

- readable standard 52-card artwork;
- adaptive fan geometry and overlap hit testing;
- focus versus multi-card selection behavior;
- pixel styling that preserves readable UI text;
- player/bot lobby configuration;
- reconnect and match lifecycle patterns;
- broader automated coverage.

These are now shared Cardcade presentation modules rather than imported game-specific assets. Thirteen keeps its own ranks, legal combinations, turn rules, scoring, and CPU decisions. JUAN uses the same fan, focus, selection, and movement vocabulary with an independent 108-card color/action deck and renderer. Rotating Rummy follows the same boundary with a distinct 108-card Route deck, public Route objectives, and Link actions on completed Route groups.

## Shared tabletop presentation

Playable card games render through a common pseudo-3D table scene in `public/app.js`. The scene keeps two presentation layers separate: cards, piles, and boards occupy a CSS-perspective table world, while player names, scores, turn state, prompts, and controls remain screen-facing HUD content. The decorative table surface consumes the existing table-skin custom properties, so changing a table skin changes the felt and rail material without changing game state or markup semantics.

`shared/card-presentation.js` resolves clockwise player order into named table slots relative to the local viewer. The local player is always south; one opponent uses north, two opponents occupy west and north with east left empty, and three opponents use west, north, and east. Opponent hands contain one privacy-safe card-back element for every projected hidden card and hang that hand in the scene's own 3D space. The scene owns a single perspective, and every element between it and a card back keeps `transform-style: preserve-3d`, so all four seats are projected by one camera rather than each faking its own depth. A seat orients its hand with yaw, pitch, and roll. Yaw follows the table, not the viewer: a player holds their cards face-toward-themselves, so the backs point at whoever sits opposite. North sits opposite the viewer and therefore shows its backs square to the camera at zero yaw. West sits opposite east, so both side seats turn a right angle and present only the edges of their cards to the viewer -- their hands measure zero percent facing the camera and about a fifth the projected width of north's. Side seats cannot reuse the head-on fan calculator, which collapses into a slab at that angle; `calculateSideFanLayout` splays them radially about the grip instead and adds a small eased per-card bow that rocks only the outermost cards a few degrees either side of edge-on. Cards that tip past edge-on are being seen from their owner's side and are tagged `showing-leaf`, which paints a blank surface rather than the printed back mirrored back at the viewer; no rank or suit exists anywhere in that markup to expose. The layout derives its own card spacing from that bow, because neighbouring cards at different bow angles pinch together toward their edges and would otherwise slice through one another. Because a CSS filter forces a subtree back to flat, opponent hands carry their shadow on the cards.

Each game supplies its own center content to the shared shell. Casino games keep dealer, community-card, and betting zones; Snap keeps its unwarped comparison area; Rotating Rummy keeps Route and Link content; and Finders Makers places its top-down memory board inside a conservative table shell. A seat slot also selects the transform origin used by public pile-entry animation. Reduced-motion mode retains all spatial placement while removing that travel.

## Persistence

Cardcade stores private room state and active game snapshots in a single SQLite database. Reconnect tokens themselves are never written; only their SHA-256 hashes are persisted. On restart, live sockets are correctly restored as disconnected while seats, private hands, scores, piles, and rounds remain recoverable.

The Docker deployment mounts `/app/data` through the `cardcade-data` named volume. The persistence interface remains game-neutral: the room snapshot and the selected runtime snapshot share a room code but are restored by their respective owners.
