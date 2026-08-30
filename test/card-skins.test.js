import assert from "node:assert/strict";
import test from "node:test";
import cardSkins from "../shared/card-skins.js";

test("card skins are registered by deck family with stable defaults", () => {
  const standard = cardSkins.defaultSkinForFamily("standard-52");
  const colorAction = cardSkins.defaultSkinForFamily("color-action");
  const rotatingRummy = cardSkins.defaultSkinForFamily("rotating-rummy");
  const table = cardSkins.defaultTableSkin();

  assert.equal(standard.id, "cardcade-pixel");
  assert.equal(standard.deckFamilyId, "standard-52");
  assert.equal(colorAction.id, "juan-minimal");
  assert.equal(colorAction.deckFamilyId, "color-action");
  assert.equal(rotatingRummy.id, "rotating-rummy-blackout");
  assert.equal(rotatingRummy.deckFamilyId, "rotating-rummy");
  assert.equal(table.id, "classic-green");
  assert.deepEqual(cardSkins.skinsForFamily("standard-52").map((skin) => skin.id), ["cardcade-pixel", "casino-gold", "royal-violet"]);
  assert.deepEqual(cardSkins.skinsForFamily("color-action").map((skin) => skin.id), ["juan-minimal", "juan-night-shift", "juan-paper-pop"]);
  assert.deepEqual(cardSkins.skinsForFamily("rotating-rummy").map((skin) => skin.id), ["rotating-rummy-blackout"]);
  assert.deepEqual(cardSkins.tableSkins().map((skin) => skin.id), ["classic-green", "midnight-blue", "burgundy-velvet"]);
});

test("a skin can never resolve across deck-family boundaries", () => {
  assert.equal(cardSkins.resolveSkin("standard-52", "casino-gold").id, "casino-gold");
  assert.equal(cardSkins.resolveSkin("standard-52", "royal-violet").id, "royal-violet");
  assert.equal(cardSkins.resolveSkin("standard-52", "juan-minimal").id, "cardcade-pixel");
  assert.equal(cardSkins.resolveSkin("color-action", "cardcade-pixel").id, "juan-minimal");
  assert.equal(cardSkins.resolveSkin("rotating-rummy", "cardcade-pixel").id, "rotating-rummy-blackout");
  assert.equal(cardSkins.resolveSkin("standard-52", "missing-skin").id, "cardcade-pixel");
  assert.equal(cardSkins.resolveSkin("future-family", "cardcade-pixel"), null);
});

test("skin metadata is immutable presentation data", () => {
  assert.equal(Object.isFrozen(cardSkins.SKINS), true);
  assert.equal(cardSkins.SKINS.every((skin) => Object.isFrozen(skin)), true);
  assert.equal(cardSkins.SKINS.every((skin) => Object.isFrozen(skin.capabilities)), true);
  assert.equal(Object.isFrozen(cardSkins.TABLE_SKINS), true);
  assert.equal(cardSkins.TABLE_SKINS.every((skin) => Object.isFrozen(skin)), true);
});

test("appearance preferences are versioned and normalize every family independently", () => {
  const defaults = cardSkins.normalizeAppearance();
  const invalid = cardSkins.normalizeAppearance({
    version: 999,
    skins: {
      "standard-52": "juan-minimal",
      "color-action": "missing-skin"
    },
    tableSkin: "missing-table"
  });

  assert.deepEqual(defaults, {
    version: 4,
    skins: {
      "standard-52": "cardcade-pixel",
      "color-action": "juan-minimal",
      "rotating-rummy": "rotating-rummy-blackout"
    },
    tableSkin: "classic-green",
    legacyMode: false
  });
  assert.deepEqual(invalid, defaults);
  assert.equal(Object.isFrozen(defaults), true);
  assert.equal(Object.isFrozen(defaults.skins), true);
});

test("table skins normalize independently from every deck family", () => {
  const appearance = cardSkins.normalizeAppearance({
    skins: { "standard-52": "casino-gold", "color-action": "juan-paper-pop" },
    tableSkin: "midnight-blue"
  });

  assert.equal(appearance.tableSkin, "midnight-blue");
  assert.deepEqual(appearance.skins, {
    "standard-52": "casino-gold",
    "color-action": "juan-paper-pop",
    "rotating-rummy": "rotating-rummy-blackout"
  });
  assert.equal(cardSkins.resolveTableSkin("burgundy-velvet").id, "burgundy-velvet");
  assert.equal(cardSkins.resolveTableSkin("missing-table").id, "classic-green");
  assert.equal(cardSkins.tableSkinById("midnight-blue").className, "table-skin-midnight-blue");
});

test("alternate standard skin choices persist without changing the color-action family", () => {
  const appearance = cardSkins.normalizeAppearance({
    skins: { "standard-52": "royal-violet", "color-action": "juan-minimal" }
  });

  assert.deepEqual(appearance.skins, {
    "standard-52": "royal-violet",
    "color-action": "juan-minimal",
    "rotating-rummy": "rotating-rummy-blackout"
  });
});

test("alternate JUAN skin choices persist without changing the standard family", () => {
  const appearance = cardSkins.normalizeAppearance({
    skins: { "standard-52": "casino-gold", "color-action": "juan-paper-pop" }
  });

  assert.deepEqual(appearance.skins, {
    "standard-52": "casino-gold",
    "color-action": "juan-paper-pop",
    "rotating-rummy": "rotating-rummy-blackout"
  });
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
