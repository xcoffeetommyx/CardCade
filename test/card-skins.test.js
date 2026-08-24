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
  assert.deepEqual(cardSkins.skinsForFamily("standard-52").map((skin) => skin.id), ["cardcade-pixel"]);
  assert.deepEqual(cardSkins.skinsForFamily("color-action").map((skin) => skin.id), ["juan-minimal"]);
});

test("a skin can never resolve across deck-family boundaries", () => {
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
