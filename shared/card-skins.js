(function exposeCardSkins(root, factory) {
  const cardSkins = factory();
  if (typeof module === "object" && module.exports) module.exports = cardSkins;
  root.CardcadeCardSkins = cardSkins;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCardSkins() {
  "use strict";

  // Skin definitions describe presentation only. Card identities, game rules,
  // room state, and action payloads must never depend on these values.
  const SKINS = Object.freeze([
    Object.freeze({
      id: "cardcade-pixel",
      deckFamilyId: "standard-52",
      name: "Cardcade Pixel",
      description: "Cardcade's original ivory pixel deck and table backs.",
      className: "card-skin-cardcade-pixel",
      renderer: "standard-52",
      capabilities: Object.freeze({ faces: true, backs: true, courts: true })
    }),
    Object.freeze({
      id: "casino-gold",
      deckFamilyId: "standard-52",
      name: "Casino Gold",
      description: "Warm ivory faces with navy ink and a tailored midnight-and-gold back.",
      className: "card-skin-casino-gold",
      renderer: "standard-52",
      capabilities: Object.freeze({ faces: true, backs: true, courts: true })
    }),
    Object.freeze({
      id: "royal-violet",
      deckFamilyId: "standard-52",
      name: "Royal Violet",
      description: "Cool pearl faces with violet ink and a jewel-toned geometric back.",
      className: "card-skin-royal-violet",
      renderer: "standard-52",
      capabilities: Object.freeze({ faces: true, backs: true, courts: true })
    }),
    Object.freeze({
      id: "crimson-arcade",
      deckFamilyId: "standard-52",
      name: "Crimson Arcade",
      description: "Warm ivory faces with burgundy ink and a red-and-gold Cardcade back without a suit mark.",
      className: "card-skin-crimson-arcade",
      renderer: "standard-52",
      capabilities: Object.freeze({ faces: true, backs: true, courts: true })
    }),
    Object.freeze({
      id: "juan-minimal",
      deckFamilyId: "color-action",
      name: "JUAN Minimal",
      description: "JUAN's original minimalist color and action deck.",
      className: "card-skin-juan-minimal",
      renderer: "color-action",
      capabilities: Object.freeze({ faces: true, backs: true, courts: false })
    }),
    Object.freeze({
      id: "juan-night-shift",
      deckFamilyId: "color-action",
      name: "JUAN Night Shift",
      description: "Dark color fields, bright signal ink, and a neon arcade back for late-night tables.",
      className: "card-skin-juan-night-shift",
      renderer: "color-action",
      capabilities: Object.freeze({ faces: true, backs: true, courts: false })
    }),
    Object.freeze({
      id: "juan-paper-pop",
      deckFamilyId: "color-action",
      name: "JUAN Paper Pop",
      description: "Warm printed faces with bold color bands and a playful cream-and-coral back.",
      className: "card-skin-juan-paper-pop",
      renderer: "color-action",
      capabilities: Object.freeze({ faces: true, backs: true, courts: false })
    }),
    Object.freeze({
      id: "rotating-rummy-blackout",
      deckFamilyId: "rotating-rummy",
      name: "Blackout Edition",
      description: "Matte-black Route cards with color-coded pixel digits and signal-bright backs.",
      className: "card-skin-rotating-rummy-blackout",
      renderer: "rotating-rummy",
      capabilities: Object.freeze({ faces: true, backs: true, courts: false })
    }),
    Object.freeze({
      id: "rotating-rummy-light",
      deckFamilyId: "rotating-rummy",
      name: "Light Mode",
      description: "Clean white Route cards with color-coded pixel digits and crisp signal-line backs.",
      className: "card-skin-rotating-rummy-light",
      renderer: "rotating-rummy",
      capabilities: Object.freeze({ faces: true, backs: true, courts: false })
    })
  ]);

  const DEFAULT_SKIN_IDS = Object.freeze({
    "standard-52": "cardcade-pixel",
    "color-action": "juan-minimal",
    "rotating-rummy": "rotating-rummy-blackout"
  });
  const TABLE_SKINS = Object.freeze([
    Object.freeze({
      id: "classic-green",
      name: "Classic Green",
      description: "Cardcade's original tournament-green felt with a deep emerald rail.",
      className: "table-skin-classic-green"
    }),
    Object.freeze({
      id: "midnight-blue",
      name: "Midnight Blue",
      description: "A cool blue felt with a dark navy rail for a late-night arcade table.",
      className: "table-skin-midnight-blue"
    }),
    Object.freeze({
      id: "burgundy-velvet",
      name: "Burgundy Velvet",
      description: "A warm burgundy felt with a rich wine-colored rail.",
      className: "table-skin-burgundy-velvet"
    }),
    Object.freeze({
      id: "plum-purple",
      name: "Plum Purple",
      description: "A deep plum-purple felt with a muted violet rail.",
      className: "table-skin-plum-purple"
    })
  ]);
  const DEFAULT_TABLE_SKIN_ID = "classic-green";
  const APPEARANCE_VERSION = 4;

  function skinsForFamily(deckFamilyId) {
    return SKINS.filter((skin) => skin.deckFamilyId === deckFamilyId);
  }

  function tableSkins() {
    return TABLE_SKINS;
  }

  function skinById(skinId) {
    return SKINS.find((skin) => skin.id === skinId) || null;
  }

  function defaultSkinForFamily(deckFamilyId) {
    return skinById(DEFAULT_SKIN_IDS[deckFamilyId]);
  }

  function resolveSkin(deckFamilyId, requestedSkinId = null) {
    const requested = requestedSkinId ? skinById(requestedSkinId) : null;
    if (requested?.deckFamilyId === deckFamilyId) return requested;
    return defaultSkinForFamily(deckFamilyId);
  }

  function tableSkinById(tableSkinId) {
    return TABLE_SKINS.find((skin) => skin.id === tableSkinId) || null;
  }

  function defaultTableSkin() {
    return tableSkinById(DEFAULT_TABLE_SKIN_ID);
  }

  function resolveTableSkin(requestedTableSkinId = null) {
    return tableSkinById(requestedTableSkinId) || defaultTableSkin();
  }

  function normalizeAppearance(value = null) {
    const requestedSkins = value && typeof value === "object" && value.skins && typeof value.skins === "object"
      ? value.skins
      : {};
    const skins = Object.fromEntries(Object.keys(DEFAULT_SKIN_IDS).map((deckFamilyId) => [
      deckFamilyId,
      resolveSkin(deckFamilyId, requestedSkins[deckFamilyId])?.id || DEFAULT_SKIN_IDS[deckFamilyId]
    ]));
    const requestedTableSkin = value && typeof value === "object" ? value.tableSkin : null;
    return Object.freeze({
      version: APPEARANCE_VERSION,
      skins: Object.freeze(skins),
      tableSkin: resolveTableSkin(requestedTableSkin)?.id || DEFAULT_TABLE_SKIN_ID,
      // Legacy Mode is deliberately separate from the skin registry. It is a
      // local presentation override for Standard 52 faces and hand geometry;
      // it can never become part of rules, rooms, or synchronized game state.
      legacyMode: value?.legacyMode === true
    });
  }

  return Object.freeze({
    SKINS,
    DEFAULT_SKIN_IDS,
    TABLE_SKINS,
    DEFAULT_TABLE_SKIN_ID,
    APPEARANCE_VERSION,
    skinsForFamily,
    tableSkins,
    skinById,
    defaultSkinForFamily,
    resolveSkin,
    tableSkinById,
    defaultTableSkin,
    resolveTableSkin,
    normalizeAppearance
  });
});
