# JUAN

JUAN is Cardcade's original color/action shedding game. It uses Cardcade's room, persistence, CPU, Hot Seat, and physical fan systems, but owns its deck definition, rules, card faces, names, and scoring.

## Deck

The complete deck contains 108 unique physical cards across four original color lanes: Blaze, Tide, Grove, and Spark.

For each color:

- one 0;
- two copies of every number from 1 through 9;
- two Pause cards;
- two Turnabout cards;
- two Double Draw cards.

The neutral cards are four Prism cards and four Prism Burst cards. This produces 76 number cards, 24 colored action cards, and 8 neutral cards.

## Play

Each player starts with seven cards. A numbered card opens the discard stack. On a turn, play one card matching the active color lane or printed face, or play a Prism. A Prism chooses the next active color. Pause skips the next player, Turnabout reverses direction, Double Draw makes the next player take two cards and lose the turn, and Prism Burst chooses a color while making the next player take four cards and lose the turn.

If no card is played, draw one. A playable drawn card may be played immediately; otherwise the turn ends. The player may also keep a playable drawn card. Reaching one card triggers the JUAN table call, and emptying the hand wins the match.

The server is authoritative: other hands remain private, CPUs use the same legal-play checks, and active matches survive the same SQLite snapshot flow as the standard-deck games.

## Original presentation

JUAN does not import external card art. Its color names, action names, diagonal ribbon geometry, symbols, text, and pixel treatment are implemented as Cardcade-owned HTML and CSS. The reference informed only the broad idea of a readable four-color shedding deck.
