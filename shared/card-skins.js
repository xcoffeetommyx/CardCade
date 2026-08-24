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
      id: "juan-minimal",
      deckFamilyId: "color-action",
      name: "JUAN Minimal",
      description: "JUAN's original minimalist color and action deck.",
      className: "card-skin-juan-minimal",
      renderer: "color-action",
      capabilities: Object.freeze({ faces: true, backs: true, courts: false })
    })
  ]);

  const DEFAULT_SKIN_IDS = Object.freeze({
    "standard-52": "cardcade-pixel",
    "color-action": "juan-minimal"
  });
  const APPEARANCE_VERSION = 1;

  function skinsForFamily(deckFamilyId) {
    return SKINS.filter((skin) => skin.deckFamilyId === deckFamilyId);
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

  function normalizeAppearance(value = null) {
    const requestedSkins = value && typeof value === "object" && value.skins && typeof value.skins === "object"
      ? value.skins
      : {};
    const skins = Object.fromEntries(Object.keys(DEFAULT_SKIN_IDS).map((deckFamilyId) => [
      deckFamilyId,
      resolveSkin(deckFamilyId, requestedSkins[deckFamilyId])?.id || DEFAULT_SKIN_IDS[deckFamilyId]
    ]));
    return Object.freeze({ version: APPEARANCE_VERSION, skins: Object.freeze(skins) });
  }

  return Object.freeze({
    SKINS,
    DEFAULT_SKIN_IDS,
    APPEARANCE_VERSION,
    skinsForFamily,
    skinById,
    defaultSkinForFamily,
    resolveSkin,
    normalizeAppearance
  });
});
