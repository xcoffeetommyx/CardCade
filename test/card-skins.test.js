import assert from "node:assert/strict";
import test from "node:test";
import cardSkins from "../shared/card-skins.js";

test("card skins are registered by deck family with stable defaults", () => {
  const standard = cardSkins.defaultSkinForFamily("standard-52");
  const colorAction = cardSkins.defaultSkinForFamily("color-action");

  assert.equal(standard.id, "cardcade-pixel");
  assert.equal(standard.deckFamilyId, "standard-52");
  assert.equal(colorAction.id, "juan-minimal");
  assert.equal(colorAction.deckFamilyId, "color-action");
  assert.deepEqual(cardSkins.skinsForFamily("standard-52").map((skin) => skin.id), ["cardcade-pixel", "casino-gold", "royal-violet"]);
  assert.deepEqual(cardSkins.skinsForFamily("color-action").map((skin) => skin.id), ["juan-minimal", "juan-night-shift", "juan-paper-pop"]);
});

test("a skin can never resolve across deck-family boundaries", () => {
  assert.equal(cardSkins.resolveSkin("standard-52", "casino-gold").id, "casino-gold");
  assert.equal(cardSkins.resolveSkin("standard-52", "royal-violet").id, "royal-violet");
  assert.equal(cardSkins.resolveSkin("standard-52", "juan-minimal").id, "cardcade-pixel");
  assert.equal(cardSkins.resolveSkin("color-action", "cardcade-pixel").id, "juan-minimal");
  assert.equal(cardSkins.resolveSkin("standard-52", "missing-skin").id, "cardcade-pixel");
  assert.equal(cardSkins.resolveSkin("future-family", "cardcade-pixel"), null);
});

test("skin metadata is immutable presentation data", () => {
  assert.equal(Object.isFrozen(cardSkins.SKINS), true);
  assert.equal(cardSkins.SKINS.every((skin) => Object.isFrozen(skin)), true);
  assert.equal(cardSkins.SKINS.every((skin) => Object.isFrozen(skin.capabilities)), true);
});

test("appearance preferences are versioned and normalize every family independently", () => {
  const defaults = cardSkins.normalizeAppearance();
  const invalid = cardSkins.normalizeAppearance({
    version: 999,
    skins: {
      "standard-52": "juan-minimal",
      "color-action": "missing-skin"
    }
  });

  assert.deepEqual(defaults, {
    version: 2,
    skins: { "standard-52": "cardcade-pixel", "color-action": "juan-minimal" },
    legacyMode: false
  });
  assert.deepEqual(invalid, defaults);
  assert.equal(Object.isFrozen(defaults), true);
  assert.equal(Object.isFrozen(defaults.skins), true);
});

test("alternate standard skin choices persist without changing the color-action family", () => {
  const appearance = cardSkins.normalizeAppearance({
    skins: { "standard-52": "royal-violet", "color-action": "juan-minimal" }
  });

  assert.deepEqual(appearance.skins, { "standard-52": "royal-violet", "color-action": "juan-minimal" });
});

test("alternate JUAN skin choices persist without changing the standard family", () => {
  const appearance = cardSkins.normalizeAppearance({
    skins: { "standard-52": "casino-gold", "color-action": "juan-paper-pop" }
  });

  assert.deepEqual(appearance.skins, { "standard-52": "casino-gold", "color-action": "juan-paper-pop" });
  assert.equal(cardSkins.resolveSkin("color-action", "juan-night-shift").id, "juan-night-shift");
  assert.equal(cardSkins.resolveSkin("standard-52", "juan-paper-pop").id, "cardcade-pixel");
});

test("Legacy Mode is a separate immutable local override rather than a skin", () => {
  const appearance = cardSkins.normalizeAppearance({
    skins: { "standard-52": "casino-gold", "color-action": "juan-minimal" },
    legacyMode: true
  });
  const invalid = cardSkins.normalizeAppearance({ legacyMode: "true" });

  assert.equal(appearance.legacyMode, true);
  assert.equal(appearance.skins["standard-52"], "casino-gold");
  assert.equal(invalid.legacyMode, false);
  assert.equal(cardSkins.skinById("legacy-mode"), null);
  assert.equal(Object.isFrozen(appearance), true);
});
