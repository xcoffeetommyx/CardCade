(function exposeFindersMakersContent(root, factory) {
  const content = factory();
  if (typeof module === "object" && module.exports) module.exports = content;
  root.CardcadeFindersMakers = content;
})(typeof globalThis !== "undefined" ? globalThis : this, function createFindersMakersContent() {
  "use strict";

  const PIECES = Object.freeze([
    { id: "plate", name: "Plate", art: "🍽️" },
    { id: "cake", name: "Cake", art: "🍰" },
    { id: "topper", name: "Topper", art: "🕯️" },
    { id: "bowl", name: "Bowl", art: "🥣" },
    { id: "ice-cream", name: "Ice Cream", art: "🍨" },
    { id: "cherry", name: "Cherry", art: "🍒" },
    { id: "burger", name: "Burger", art: "🍔" },
    { id: "flag", name: "Flag", art: "🚩" },
    { id: "pan", name: "Pan", art: "🍳" },
    { id: "pizza", name: "Pizza", art: "🍕" },
    { id: "topping", name: "Topping", art: "🫑" },
    { id: "pancakes", name: "Pancakes", art: "🥞" },
    { id: "syrup", name: "Syrup", art: "🍯" },
    { id: "robot-body", name: "Robot Body", art: "⬛" },
    { id: "robot-head", name: "Robot Head", art: "🤖" },
    { id: "antenna", name: "Antenna", art: "📡" },
    { id: "rocket-body", name: "Rocket Body", art: "🚀" },
    { id: "rocket-nose", name: "Rocket Nose", art: "🔺" },
    { id: "flame", name: "Flame", art: "🔥" },
    { id: "pot", name: "Flowerpot", art: "🪴" },
    { id: "flower", name: "Flower", art: "🌼" },
    { id: "leaves", name: "Leaves", art: "🍃" },
    { id: "spoon", name: "Spoon", art: "🥄" },
    { id: "star", name: "Star", art: "⭐" }
  ].map((piece) => Object.freeze({ ...piece })));

  const BUILDS = Object.freeze([
    { id: "cake", name: "Cake", art: "🍰", pieceIds: ["plate", "cake", "topper"] },
    { id: "sundae", name: "Sundae", art: "🍨", pieceIds: ["bowl", "ice-cream", "cherry"] },
    { id: "burger", name: "Burger", art: "🍔", pieceIds: ["plate", "burger", "flag"] },
    { id: "pizza", name: "Pizza", art: "🍕", pieceIds: ["pan", "pizza", "topping"] },
    { id: "pancakes", name: "Pancakes", art: "🥞", pieceIds: ["plate", "pancakes", "syrup"] },
    { id: "robot", name: "Robot", art: "🤖", pieceIds: ["robot-body", "robot-head", "antenna"] },
    { id: "rocket", name: "Rocket", art: "🚀", pieceIds: ["rocket-body", "rocket-nose", "flame"] },
    { id: "flowerpot", name: "Flowerpot", art: "🪴", pieceIds: ["pot", "flower", "leaves"] }
  ].map((build) => Object.freeze({ ...build, pieceIds: Object.freeze([...build.pieceIds]) })));

  const piecesById = new Map(PIECES.map((piece) => [piece.id, piece]));
  const buildsById = new Map(BUILDS.map((build) => [build.id, build]));

  function pieceById(id) {
    return piecesById.get(String(id)) || null;
  }

  function buildById(id) {
    return buildsById.get(String(id)) || null;
  }

  function projectPiece(pieceOrId) {
    const piece = typeof pieceOrId === "string" ? pieceById(pieceOrId) : pieceOrId;
    if (!piece) return null;
    return { id: piece.id, name: piece.name, art: piece.art };
  }

  function projectBuild(buildOrId) {
    const build = typeof buildOrId === "string" ? buildById(buildOrId) : buildOrId;
    if (!build) return null;
    return {
      id: build.id,
      name: build.name,
      art: build.art,
      pieces: build.pieceIds.map(projectPiece)
    };
  }

  function validateContent() {
    if (PIECES.length < 24 || new Set(PIECES.map((piece) => piece.id)).size !== PIECES.length) {
      throw new Error("Finders Makers needs unique Piece definitions.");
    }
    for (const build of BUILDS) {
      if (!Array.isArray(build.pieceIds) || build.pieceIds.length !== 3 || new Set(build.pieceIds).size !== 3) {
        throw new Error(`Finders Makers Build ${build.id} must require exactly three distinct Pieces.`);
      }
      if (build.pieceIds.some((pieceId) => !pieceById(pieceId))) {
        throw new Error(`Finders Makers Build ${build.id} references an unknown Piece.`);
      }
    }
    return true;
  }

  validateContent();

  return Object.freeze({
    PIECES,
    BUILDS,
    pieceById,
    buildById,
    projectPiece,
    projectBuild,
    validateContent
  });
});
