# Spades, Hearts, Solitaire, and JUAN FLEEP

All four additions run server-authoritatively and use the existing room/session and SQLite snapshot system. Spades and Hearts appear in the standard 52-card family; Solitaire appears there only in Solo. JUAN FLEEP appears immediately below JUAN in the color/action family. The original JUAN deck and its scoring are unchanged.

## Spades

Four occupied seats form opposite partnerships: seats 1 and 3 versus 2 and 4. Bidding proceeds clockwise from the dealer's left, then that player leads. Each player bids 0–13; zero is nil. Players must follow suit. Highest spade wins, otherwise highest led suit wins; ace is high. Spades cannot lead until broken unless the player holds only spades. Every hand has thirteen tricks.

Team non-nil bids form the contract. Making it scores ten per bid trick plus one per overtrick; failing loses ten per bid trick. Nil earns +100 with no tricks or −100 otherwise. Failed-nil tricks become bags and do not satisfy the partner's contract. Each ten accumulated bags deducts 100, retaining the remainder. Check the 500-point target after scoring the whole hand; higher team wins, and tied qualifying teams play again. Blind nil, jokers, and partner passing are not included.

## Hearts

Four individuals receive thirteen cards. Pass three left, right, across, then keep; repeat the cycle. Network seats can commit independently; Hot Seat commits privately in sequence. Every pass transfers together after all commitments. Cards cannot be changed after commitment.

The two of clubs leads. Follow suit; highest led suit wins. No hearts or queen of spades on the first trick unless no safe legal card exists. A heart breaks hearts; the queen alone does not. Until broken, hearts cannot lead unless only hearts remain. Hearts cost one each and the queen of spades thirteen. Capturing all 26 gives the shooter zero and everyone else 26. At the end of a hand where anyone reaches 100, the lowest score wins; equal lowest scores share the win.

## Solitaire

Klondike with seven tableau columns, four foundations, stock, and waste. Choose draw-one (default) or draw-three before dealing. Recycle without shuffling with unlimited passes. Tableau builds downward in alternating colors; kings and king-led sequences fill empty columns. Foundations rise by suit from ace to king; their top cards may move back to the tableau. Newly uncovered cards turn up automatically.

Tap/click a source then destination, use keyboard/controller focus, or drag a source to a destination. Undo includes drawing, recycling, and automatic exposure. Hints use visible legal moves, not unseen stock or covered cards; they do not certify solvability. Auto-finish is offered once stock and waste are empty and every tableau card is exposed. It moves cards legally to foundations and can be undone. Restart preserves the original deal; New deal shuffles again. Both require an in-game confirmation.

Menu preserves the current server session; Abandon ends it. Reconnection needs the same browser token and an unexpired room (currently twelve hours of inactivity). The offline PWA shell is not offline gameplay. No timer scoring, statistics database, or guaranteed-win generator is included.

## JUAN FLEEP

The deck contains 112 physical cards. Each side has four color lanes, two copies of numbers 1–9 per lane, two of each of four colored actions per lane, four Wilds, and four draw Wilds. Original light lanes are Blaze, Tide, Grove, and Spark; dark lanes are Orchid, Lagoon, Ember, and Dusk. Light and dark inventories are randomly paired once per match on the server, and each opaque physical ID retains its pairing across deals and restores.

Light actions are Draw One, Pause, Turnabout, FLEEP, Wild, and Wild Draw Two. Dark actions are Draw Five, Pause All, Turnabout, FLEEP, Wild, and Wild Draw Color. Match the active color, number, or action. Draw once if not playing; only that newly drawn card may then be played, or kept. Drawing penalties skip their target. Pause All returns play to its source. In two-player play, Turnabout also returns play to its source. There is no draw stacking.

FLEEP changes the active side and reverses both physical pile orders. The former bottom of the discard becomes the new top. Its revealed action is not executed. If it is a Wild, the next player selects an active color. Every round starts light, with opening action effects applied; an opening Wild Draw Two is returned for another opener.

Draw Wilds can be challenged if their source held the previous active color. The server records the hand at play time; only the challenger sees that evidence. The human challenger acknowledges the evidence before play or Hot Seat handoff continues; this review survives reconnects. A successful challenge makes the source take the penalty and preserves the target's turn. A failed challenge adds two cards to the target's penalty. Draw Color continues until the chosen color is reached, including that card. If all drawable cards are exhausted, take what remains and proceed. A full circuit of exhausted, unplayed turns ends the round without points.

Call JUAN when one card remains. Players may catch an uncalled hand; the next action otherwise imposes the two-card missed-call penalty. CPUs allow a 2.6-second reaction window. Hot Seat play declares JUAN with the penultimate card to avoid requiring simultaneous private controls. Human challenge decisions still work privately.

Final-card effects resolve before scoring. Number cards score their value; Draw One 10; Draw Five, Turnabout, Pause, and FLEEP 20; Pause All 30; Wild 40; Wild Draw Two 50; Wild Draw Color 60. Score the active side when the round ends. Play four cumulative rounds, rotate the dealer, and share tied highest scores.

Light faces reuse JUAN's renderer and skins, with new Draw One, draw Wild, and FLEEP symbols. Dark faces use the same geometry with distinct colors, dark edging, and geometric decoration. Opponent outward faces are inspectable in the Table info overlay for all seats; current playable faces remain private. The stock exposes only its outward top face.

## Interfaces and persistence

`POST /api/solo/solitaire` accepts `{ name, botCount: 0, settings: { drawCount: 1 | 3 } }`. Other new game setup uses existing Solo, room, and Hot Seat APIs. Room mode is persisted and validated; old room snapshots default to Multiplayer, or Hot Seat when `sharedDevice` was set. Solo does not imply bot support. Public Solo joins are rejected.

All expansion game actions include the current `revision`. Stale revisions are rejected, and the room adapter applies actions to a clone before committing, so rejected actions cannot partially mutate the saved match. Actions are `bid`, `pass_cards`, `play`, and `next_round` for trick games; `move`, `draw`, `undo`, `restart`, `new_deal`, and `auto_finish` for Solitaire; and `play`, `draw`, `end_turn`, `choose_color`, `accept`, `challenge`, `acknowledge_challenge`, `juan_call`, `juan_catch`, and `next_round` for FLEEP.

Completed tricks remain visible for 1.2 seconds. Their pending deadline and cards are persisted and resolve exactly once. The new runtimes are registered both in the server factory and restart initialization. Covered cards, stock order, FLEEP pairing inventories, pending pass contents, undo history, and private challenge evidence are not broadcast. No database schema migration is needed.

FLEEP shares JUAN’s fixed viewport table, hand/deal/play motion, color picker, and color-reveal presentation on both sides. Calls and draw decisions use the shared reaction overlay. Table info contains rules, outward faces, and the last twelve draws of the current round, with the recipient, actual count, cause, and resulting hand size. Draw Color can add many cards; its prompt explains the stopping color before acceptance. Challenge evidence and results use bounded dialogs. Drawing away from a one-card hand clears any stale Call JUAN window.
