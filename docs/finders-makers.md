# Finders Makers

Finders Makers is Cardcade's original two-player memory and set-building game. It supports Solo, Multiplayer, and private pass-the-device Hot Seat play, including CPU opponents.

## Pieces and Builds

Every normal round gives each player a different private Build made from exactly three Pieces. The shared board stays face down. Searching reveals one Piece only to the active player, so each player must remember their own discoveries; the server never exposes the full board or one player's memory to the other player.

On a turn, search one face-down position or commit three positions as a Build attempt. A correct attempt wins the round and scores one point. A failed attempt reveals no additional Piece identities and play continues.

## Match flow

A normal match lasts four rounds. Round 1 chooses a random opening player while keeping room seats stable. Later rounds alternate the opener from that initial origin, giving each player two opening rounds. Scores and player identity carry across fresh boards; searches, attempted positions, and private discoveries do not.

The higher score after Round 4 wins. A 2–2 tie opens Sudden Death with a fresh board and one shared Build objective. The first player to find that exact Build wins the match.

Finders Makers owns its Piece identities, Build rules, board generation, private projections, and CPU memory. It reuses Cardcade's room/session boundary, persistence, table shell, Hot Seat handoff, and presentation primitives without treating its board as a standard card deck.
