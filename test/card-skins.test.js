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
  assert.deepEqual(cardSkins.skinsForFamily("color-action").map((skin) => skin.id), ["juan-minimal"]);
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
    version: 1,
    skins: { "standard-52": "cardcade-pixel", "color-action": "juan-minimal" }
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
