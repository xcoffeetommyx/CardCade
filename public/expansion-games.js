export const expansionGameIds = ["spades", "hearts", "solitaire", "juan-fleep"];

// Game-specific interaction state stays out of the central application shell.
export function createExpansionUI(ctx) {
  const { escapeHtml: esc } = ctx;
  let scope = "", selectedSource = null, chosenColor = null, hint = null, help = false, confirmation = null;
  let drag = null, suppressClick = false;
  let flipKey = "";
  const state = () => ctx.getState();
  const current = () => state().gameView?.state;
  const viewer = () => state().room?.players.find(p => p.isYou);
  const button = (action, label, enabled = true, attrs = "") => `<button type="button" class="action-button" data-action="exp-${action}" ${enabled && !state().gameActionLock ? "" : "disabled"} ${attrs}>${label}</button>`;
  const title = () => ({ spades: "Spades", hearts: "Hearts", solitaire: "Solitaire", "juan-fleep": "JUAN FLEEP" })[state().room?.gameId];
  const encode = value => esc(JSON.stringify(value));
  const picture = (card, fleep = false) => (fleep ? ctx.renderJuanCard(card, 0, { played: true }) : ctx.renderPlayingCard(card, 0, { played: true }))
    .replace("<button", "<span").replace("</button>", "</span>").replace('type="button"', "").replace("disabled", "");
  function sync() {
    const s = state(), m = current();
    const key = [s.room?.code, s.room?.gameId, viewer()?.seat, m?.round, m?.side, s.room?.gameId === "solitaire" ? m?.revision : ""].join(":");
    if (key !== scope) { scope = key; selectedSource = null; chosenColor = null; hint = null; confirmation = null; s.selectedCards.clear(); }
  }
  function send(action) {
    if (state().gameActionLock) return;
    state().gameActionLock = true;
    if (!ctx.sendRoom({ ...action, revision: current().revision })) { state().gameActionLock = false; state().hotSeatForceHandoff = false; }
    state().selectedCards.clear(); selectedSource = null; hint = null; chosenColor = null;
    ctx.render();
  }
  const helpText = {
    spades: "Partners sit opposite. Bid 0–13; zero is nil. Follow suit; spades are trump and cannot lead until broken unless only spades remain. A made team bid earns 10 per trick bid plus overtricks; a failed bid loses 10 per trick bid. Ten bags cost 100. Nil is +100 or −100; failed-nil tricks count as bags, not toward the partner’s bid. Highest team score at 500 wins; tied teams play another hand.",
    hearts: "Pass three cards left, right, across, then keep; repeat. The two of clubs leads. Follow suit. No penalties on the first trick unless forced. Hearts cannot lead until a heart is discarded, unless only hearts remain. Each heart costs 1; the queen of spades costs 13. Capture all 26 to give every opponent 26 instead. When anyone reaches 100, lowest score wins; ties share the win.",
    solitaire: "Build descending, alternating-color tableau sequences. Only kings fill empty columns. Foundations build ace to king in the same suit; their top cards may return to the tableau. Select a card or sequence, then its destination, or drag it there. Draw 1 or 3; recycle without shuffling as often as needed. Undo reverses an entire action. Hints use visible cards and are not a solver. Auto-finish becomes available when stock and waste are empty and every tableau card is exposed. Menu preserves your game within the current 12-hour session expiry.",
    "juan-fleep": "Match the active color, number, or effect; Wild chooses a color. Light has Draw One, Pause, Turnabout, FLEEP, Wild, and Wild Draw Two. Dark has Draw Five, Pause All (play again), Turnabout, FLEEP, Wild, and Wild Draw Color. FLEEP turns over both piles and all hands. Opponents show their inactive faces. Challenge a draw Wild if its player held the previous active color. Failed challenges add two cards. Call JUAN at one card; a missed call costs two. Four rounds; highest cumulative score wins. Values: numbers as printed, Draw One 10, Draw Five/Turnabout/Pause/FLEEP 20, Pause All 30, Wild 40, Wild Draw Two 50, Wild Draw Color 60. Score the ending side. Exhausted penalties draw only available cards."
  };
  function header(m, solitaire = false) {
    return `<header class="game-topbar">${solitaire ? button("menu", "← Menu") : '<button class="back-button" data-action="leave-game" aria-label="Leave game">←</button>'}
      <div><span class="family-kicker">${solitaire ? "Standard 52 · Klondike" : m.gameId === "juan-fleep" ? "Color deck · Two sides" : "Standard 52 · Trick taking"}</span><h2>${title()}</h2><p role="status">${esc(m.lastMoveText)}</p></div>
      ${button("help", help ? "Hide rules" : "Rules")}</header>${help ? `<aside class="exp-help">${esc(helpText[m.gameId])}</aside>` : ""}`;
  }
  function results(m) {
    if (!m.roundOver) return "";
    const winners = m.players.filter(p => m.winners?.includes(p.seat)).map(p => p.name).join(" & ");
    return `<section class="round-summary"><h2>${m.matchOver ? `${esc(winners || "Table")} wins` : "Hand complete"}</h2>
      <div class="exp-scores">${m.players.map(p => `<span><strong>${esc(p.name)}</strong> ${p.score} pts${p.delta !== undefined ? ` (${p.delta >= 0 ? "+" : ""}${p.delta})` : ""}</span>`).join("")}</div>
      ${m.matchOver ? '<button class="action-button" data-action="leave-game">Return to CardCade</button>' : button("next", viewer()?.role === "host" ? "Deal next hand" : "Waiting for host", viewer()?.role === "host")}</section>`;
  }
  function hand(m, fleep = false) {
    const s = state();
    const cards = s.gameView.hand.slice().sort((a, b) => fleep ? String(a.color).localeCompare(String(b.color)) || (a.value ?? 20) - (b.value ?? 20) : a.suit.localeCompare(b.suit) || globalThis.CardcadeTrickRules.value(a) - globalThis.CardcadeTrickRules.value(b));
    const selectable = m.actions.pass || m.actions.legalCardIds?.length;
    return `<section class="physical-hand ${selectable ? "your-turn" : ""}"><div class="hand-heading"><span><strong>Your hand</strong><small>${cards.length} cards</small></span><span>${s.selectedCards.size} selected</span></div><div class="game-hand ${fleep ? "juan-hand" : ""}" data-hand-owner="${esc(scope)}" aria-label="Your cards">${cards.map((c, i) => fleep ? ctx.renderJuanCard(c, i, { selectable: !!selectable }) : ctx.renderPlayingCard(c, i, { selectable: !!selectable })).join("")}</div></section>`;
  }
  function renderTrick(m) {
    const you = viewer().seat, s = state();
    const spades = m.gameId === "spades";
    const detail = p => spades ? `Team ${p.team + 1} · bid ${p.bid === null ? "—" : p.bid === 0 ? "nil" : p.bid} · ${p.tricks} tricks` : `${p.score} pts · ${p.penalty} this hand${p.committed ? " · passed" : ""}`;
    const activeCards = m.trick.length ? m.trick : [];
    const center = `<div class="exp-trick" aria-label="Current trick">${m.players.map(p => {
      const play = activeCards.find(a => a.seat === p.seat);
      return `<div class="exp-trick-slot"><small>${esc(p.name)}</small>${play ? picture(play.card) : '<span class="exp-empty-card">·</span>'}</div>`;
    }).join("")}</div>`;
    const status = `<div class="exp-status">Hand ${m.round} · Trick ${m.trickNumber}/13 · ${m.broken ? (spades ? "Spades" : "Hearts") + " broken" : "Unbroken"}${m.trick.length ? `<div>Lead: ${esc(m.players.find(p => p.seat === m.trick[0].seat).name)} · ${esc(globalThis.CardcadeStandard52.SUIT_NAME[m.trick[0].card.suit])}</div>` : ""}${spades ? `<div>${m.teams.map(t => `Team ${t.id + 1}: ${t.score} pts / ${t.bags} bags`).join(" · ")}</div>` : ""}</div>`;
    let controls = "";
    if (m.phase === "bidding") controls = `<label class="exp-choice">Your bid <select id="exp-bid" ${m.actions.bid ? "" : "disabled"}>${Array.from({ length: 14 }, (_, n) => `<option value="${n}" ${n === 3 ? "selected" : ""}>${n === 0 ? "Nil (0)" : n}</option>`).join("")}</select></label>${button("bid", "Bid", m.actions.bid)}`;
    else if (m.phase === "passing") controls = `<span>Pass ${["", "left", "across", "right"][m.passOffset]} · ${s.selectedCards.size}/3 selected</span>${button("pass", "Commit three cards", m.actions.pass && s.selectedCards.size === 3)}`;
    else controls = button("play", "Play selected card", !m.roundOver && s.selectedCards.size === 1 && m.actions.legalCardIds.includes([...s.selectedCards][0]));
    return `<section class="standard-card-game expansion-game ${ctx.tableClass()}" data-game-id="${m.gameId}">${header(m)}${ctx.renderTableScene({ match: m, viewerSeat: you,
      opponentsMarkup: m.players.filter(p => p.seat !== you).map(p => ctx.renderTableOpponent({ match: m, viewerSeat: you, player: p, deckFamilyId: "standard-52", detail: detail(p) })).join(""),
      centerMarkup: center, tableStatusMarkup: status, handMarkup: hand(m), localDetail: detail(m.players.find(p => p.seat === you)), localActive: m.activeSeat === you })}
      <div class="exp-controls">${controls}</div>${m.lastTrick ? `<details class="exp-last-trick"><summary>Previous trick</summary>${m.lastTrick.map(p => `${esc(m.players.find(q => q.seat === p.seat).name)}: ${esc(globalThis.CardcadeStandard52.cardLabel(p.card))}`).join(" · ")}</details>` : ""}${results(m)}</section>`;
  }
  function renderFleep(m) {
    const nextFlipKey = `${state().room.code}:${m.round}:${m.flipSequence}`;
    const flipped = flipKey && flipKey !== nextFlipKey && m.flipSequence > 0 && !ctx.reducedMotion();
    flipKey = nextFlipKey;
    const you = viewer().seat, s = state(), deck = globalThis.CardcadeFleepDeck;
    const selected = s.gameView.hand.find(c => s.selectedCards.has(c.id));
    const colors = !m.roundOver && (m.phase === "choose-color" && m.activeSeat === you || selected && !selected.color);
    const colorButtons = colors ? `<div class="exp-color-choices" aria-label="Choose active color">${deck.COLORS[m.side].map(color => button("color", esc(deck.NAMES[color]), true, `data-color="${color}" aria-pressed="${chosenColor === color}"`)).join("")}</div>` : "";
    const canPlay = selected && m.actions.legalCardIds.includes(selected.id) && (selected.color || chosenColor);
    const turn = m.activeSeat === you && !m.roundOver;
    let controls = m.phase === "challenge-review" ? button("review-done", turn ? "Done reviewing · Continue" : "Challenger reviewing", turn) : m.pending ? `${button("accept", "Accept draw", turn)}${button("challenge", "Challenge", turn)}` : `${button("play", "Play selected", !!canPlay)}${button(m.drawnId ? "keep" : "draw", m.drawnId ? "Keep drawn card" : "Draw", turn && m.phase === "playing")}`;
    if (m.call) controls += button(m.call.seat === you ? "call" : "catch", m.call.seat === you ? "Call JUAN!" : "Catch missed JUAN!");
    const center = `<div class="exp-fleep-piles" data-side="${m.side}"><div><small>Draw · ${m.stockCount}</small>${m.stockFace ? picture(m.stockFace, true) : '<span class="exp-empty-card">Empty</span>'}</div><div><small>Discard</small>${picture(m.topCard, true)}</div></div>`;
    const outward = `<details class="exp-outward"><summary>Inspect opponents’ outward ${m.side === "light" ? "dark" : "light"} faces</summary>${m.players.filter(p => p.seat !== you).map(p => `<div><strong>${esc(p.name)}</strong><div class="exp-outward-cards">${p.outward.map(c => `<div>${picture(c, true)}<small>${esc(deck.label(c))}</small></div>`).join("")}</div></div>`).join("")}</details>`;
    return `<section class="standard-card-game juan-game expansion-game fleep-game ${ctx.tableClass()} fleep-${m.side} ${flipped ? "fleep-flipped" : ""}" data-game-id="juan-fleep">${header(m)}
      ${m.announcement ? `<p class="exp-announcement" role="status">${esc(m.announcement.text)}</p>` : ""}
      ${ctx.renderTableScene({ match: m, viewerSeat: you, opponentsMarkup: m.players.filter(p => p.seat !== you).map(p => ctx.renderTableOpponent({ match: m, viewerSeat: you, player: p, deckFamilyId: "color-action", detail: `${p.cardCount} cards · ${p.score} pts`, revealedCards: p.outward })).join(""),
        centerMarkup: center, tableStatusMarkup: `<div class="exp-status"><strong>${m.side.toUpperCase()} SIDE</strong> · ${esc(deck.NAMES[m.activeColor] || "Choose color")} · ${m.direction === 1 ? "↻" : "↺"} · Round ${m.round}/4</div>`, handMarkup: hand(m, true), localDetail: `${m.players.find(p => p.seat === you).score} pts`, localActive: turn })}
      ${colorButtons}<div class="exp-controls">${controls}</div>${outward}
      ${s.gameView.challengeHand ? `<aside class="exp-help"><strong>Challenge evidence (hand when played)</strong><p>${s.gameView.challengeHand.map(c => esc(deck.label(c))).join(" · ")}</p></aside>` : ""}${results(m)}</section>`;
  }
  function renderSolitaire(m) {
    const label = c => globalThis.CardcadeStandard52.cardLong(c);
    function cardButton(c, from, to) {
      const selected = JSON.stringify(selectedSource) === JSON.stringify(from);
      const hinted = hint && JSON.stringify(hint.from) === JSON.stringify(from);
      return `<button type="button" class="sol-card ${selected ? "sol-selected" : ""} ${hinted ? "sol-hint" : ""}" data-action="exp-sol-card" data-sol-source="${encode(from)}" data-sol-target="${encode(to)}" aria-label="${esc(label(c))}" aria-pressed="${selected}">${picture(c)}</button>`;
    }
    function destination(pile, column) { return `<button class="sol-empty" type="button" data-action="exp-sol-destination" data-sol-target="${encode({ pile, column })}" aria-label="Empty ${pile === "foundations" ? "foundation" : "tableau"} ${column + 1}">${pile === "foundations" ? "A" : "K"}</button>`; }
    const foundations = m.foundations.map((p, column) => `<div class="sol-pile">${p.length ? cardButton(p.at(-1), { pile: "foundations", column }, { pile: "foundations", column }) : destination("foundations", column)}<small>Foundation ${column + 1}</small></div>`).join("");
    const waste = m.waste.length ? `<div class="sol-waste-cards">${m.waste.slice(0, -1).map(c => `<span class="sol-waste-under">${picture(c)}</span>`).join("")}${cardButton(m.waste.at(-1), { pile: "waste" }, { pile: "waste" })}</div>` : '<span class="sol-empty" aria-label="Empty waste">·</span>';
    const tableau = m.tableau.map((p, column) => `<div class="sol-column" data-sol-target="${encode({ pile: "tableau", column })}" aria-label="Tableau ${column + 1}">${p.length ? p.map((c, index) => c.faceUp ? cardButton(c, { pile: "tableau", column, index }, { pile: "tableau", column }) : `<span class="sol-covered" aria-label="Face-down card">${ctx.renderCardBack({ deckFamilyId: "standard-52", context: "solitaire", ariaHidden: true })}</span>`).join("") : destination("tableau", column)}</div>`).join("");
    return `<section class="standard-card-game solitaire-game ${ctx.tableClass()}" data-game-id="solitaire">${header(m, true)}
      <div class="sol-status">Draw ${m.drawCount} · ${m.moves} moves · ${m.foundations.reduce((n, p) => n + p.length, 0)}/52 complete</div>
      <div class="sol-board"><div class="sol-top"><div class="sol-pile"><button class="sol-stock ${hint?.type === "draw" ? "sol-hint" : ""}" data-action="exp-draw" ${m.stockCount || m.wasteCount ? "" : "disabled"} aria-label="${m.stockCount ? `Draw ${m.drawCount} cards` : "Recycle waste"}">${m.stockCount ? ctx.renderCardBack({ deckFamilyId: "standard-52", context: "solitaire", ariaHidden: true }) : '<span class="sol-empty">↻</span>'}</button><small>Stock · ${m.stockCount}</small></div><div class="sol-pile sol-waste">${waste}<small>Waste · ${m.wasteCount}</small></div><div class="sol-spacer"></div>${foundations}</div><div class="sol-tableau">${tableau}</div></div>
      <div class="exp-controls">${button("undo", "Undo", m.actions.undo)}${button("hint", "Hint", !m.matchOver)}${button("auto", "Auto-finish", m.actions.autoFinish)}${button("restart-confirm", "Restart deal")}${button("new-confirm", "New deal")}${button("abandon-confirm", "Abandon")}</div>
      ${hint ? `<p class="exp-help" role="status">${hint.type === "draw" ? "Draw or recycle the stock." : `Move the highlighted card to ${hint.to.pile === "foundations" ? "foundation" : "tableau"} ${hint.to.column + 1}.`}</p>` : ""}
      ${confirmation ? `<div class="exp-help" role="alert"><p>${confirmation === "new_deal" ? "Replace this deal with a new shuffle?" : confirmation === "restart" ? "Restart this deal from its original layout?" : "Abandon this saved game?"}</p>${button("confirm", "Confirm")}${button("cancel", "Keep playing")}</div>` : ""}
      ${m.matchOver ? '<p class="sol-win" role="status">All four foundations complete. You won!</p>' : ""}</section>`;
  }
  function selectCard(id) {
    const m = current(), s = state();
    if (s.gameActionLock || !m || m.roundOver) return;
    if (m.actions.pass) {
      if (s.selectedCards.has(id)) s.selectedCards.delete(id);
      else if (s.selectedCards.size < 3) s.selectedCards.add(id);
    } else {
      if (!m.actions.legalCardIds?.includes(id)) { ctx.showToast("That card is not legal right now."); return; }
      if (s.selectedCards.has(id)) s.selectedCards.clear(); else s.selectedCards = new Set([id]);
    }
    chosenColor = null; ctx.render();
  }
  function handle(action, element) {
    if (!action.startsWith("exp-")) return false;
    if (suppressClick) { suppressClick = false; return true; }
    sync(); const m = current();
    switch (action.slice(4)) {
      case "help": help = !help; ctx.render(); break;
      case "menu": ctx.saveAndMenu(); break;
      case "bid": send({ type: "bid", bid: Number(document.querySelector("#exp-bid").value) }); break;
      case "pass": send({ type: "pass_cards", cardIds: [...state().selectedCards] }); break;
      case "play": send({ type: "play", cardId: [...state().selectedCards][0], chosenColor, declareJuan: state().gameMode === "hot-seat" && state().gameView.hand.length === 2 }); break;
      case "draw": send({ type: "draw" }); break;
      case "keep": send({ type: "end_turn" }); break;
      case "next": if (state().gameMode === "hot-seat") state().hotSeatForceHandoff = true; send({ type: "next_round" }); break;
      case "color": chosenColor = element.dataset.color; if (m.phase === "choose-color") send({ type: "choose_color", color: chosenColor }); else ctx.render(); break;
      case "accept": case "challenge": send({ type: action.slice(4) }); break;
      case "review-done": send({ type: "acknowledge_challenge" }); break;
      case "call": send({ type: "juan_call" }); break;
      case "catch": send({ type: "juan_catch" }); break;
      case "undo": send({ type: "undo" }); break;
      case "auto": send({ type: "auto_finish" }); break;
      case "hint": hint = m.actions.hint; if (!hint) ctx.showToast("No useful legal move found. You can undo or start another deal."); ctx.render(); break;
      case "restart-confirm": confirmation = "restart"; ctx.render(); break;
      case "new-confirm": confirmation = "new_deal"; ctx.render(); break;
      case "abandon-confirm": confirmation = "abandon"; ctx.render(); break;
      case "cancel": confirmation = null; ctx.render(); break;
      case "confirm": { const type = confirmation; confirmation = null; if (type === "abandon") ctx.abandon(); else if (type) send({ type }); break; }
      case "sol-card": {
        const from = JSON.parse(element.dataset.solSource), to = JSON.parse(element.dataset.solTarget);
        if (selectedSource && JSON.stringify(selectedSource) !== JSON.stringify(from) && !(selectedSource.pile === to.pile && selectedSource.column === to.column)) send({ type: "move", from: selectedSource, to });
        else { selectedSource = JSON.stringify(selectedSource) === JSON.stringify(from) ? null : from; hint = null; ctx.render(); }
        break;
      }
      case "sol-destination": if (selectedSource) send({ type: "move", from: selectedSource, to: JSON.parse(element.dataset.solTarget) }); break;
    }
    return true;
  }
  document.addEventListener("pointerdown", event => {
    const source = event.target.closest("[data-sol-source]");
    if (!source || event.button !== 0 || state().gameActionLock) return;
    drag = { from: JSON.parse(source.dataset.solSource), x: event.clientX, y: event.clientY, id: event.pointerId };
  });
  document.addEventListener("pointerup", event => {
    if (!drag || drag.id !== event.pointerId) return;
    const movement = Math.hypot(event.clientX - drag.x, event.clientY - drag.y);
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-sol-target]");
    const previous = drag; drag = null;
    if (movement < 12 || !target) return;
    suppressClick = true; setTimeout(() => { suppressClick = false; }, 400);
    send({ type: "move", from: previous.from, to: JSON.parse(target.dataset.solTarget) });
  });
  document.addEventListener("pointercancel", () => { drag = null; });
  return {
    handle, selectCard,
    captureFocus() {
      const element = document.activeElement;
      if (!element?.closest?.('.expansion-game, .solitaire-game')) return null;
      if (element.id) return { id: element.id };
      const entries = Object.entries(element.dataset).filter(([key]) => ['action', 'gameCard', 'solSource', 'solTarget', 'color'].includes(key));
      return entries.length ? { entries } : null;
    },
    restoreFocus(token) {
      if (!token) return;
      const element = token.id ? document.getElementById(token.id) : [...document.querySelectorAll('.expansion-game button, .solitaire-game button')].find(e => token.entries.every(([key, value]) => e.dataset[key] === value));
      if (element && !element.disabled) element.focus({ preventScroll: true });
    },
    render() { sync(); const m = current(); return m.gameId === "solitaire" ? renderSolitaire(m) : m.gameId === "juan-fleep" ? renderFleep(m) : renderTrick(m); }
  };
}
