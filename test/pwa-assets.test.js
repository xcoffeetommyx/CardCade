import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = path.join(root, "public");

function readPublic(file) {
  return readFileSync(path.join(publicRoot, file));
}

function pngSize(file) {
  const data = readPublic(file);
  assert.deepEqual([...data.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${file} must be a PNG`);
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

test("manifest provides standalone identity and installable PNG icons", () => {
  const manifest = JSON.parse(readPublic("manifest.webmanifest").toString("utf8"));
  assert.equal(manifest.id, "./");
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.background_color, "#06101f");

  const icons = new Map(manifest.icons.map((icon) => [icon.sizes, icon]));
  assert.equal(icons.get("192x192").type, "image/png");
  assert.equal(icons.get("512x512").type, "image/png");
  assert.ok(manifest.icons.some((icon) => icon.purpose === "maskable"));
  assert.deepEqual(pngSize("assets/pwa/icon-192.png"), { width: 192, height: 192 });
  assert.deepEqual(pngSize("assets/pwa/icon-512.png"), { width: 512, height: 512 });
  assert.deepEqual(pngSize("assets/pwa/maskable-512.png"), { width: 512, height: 512 });
});

test("iPhone Home Screen metadata has a touch icon and matched launch screens", () => {
  const html = readPublic("index.html").toString("utf8");
  assert.match(html, /apple-mobile-web-app-capable" content="yes"/);
  assert.match(html, /apple-mobile-web-app-status-bar-style" content="black-translucent"/);
  assert.match(html, /apple-touch-icon" sizes="180x180"/);
  assert.deepEqual(pngSize("assets/pwa/apple-touch-icon-180.png"), { width: 180, height: 180 });

  for (const [width, height] of [
    [750, 1334],
    [1080, 2340],
    [1125, 2436],
    [828, 1792],
    [1242, 2688],
    [1170, 2532],
    [1284, 2778],
    [1179, 2556],
    [1290, 2796]
  ]) {
    const file = `assets/pwa/splash-${width}x${height}.png`;
    assert.match(html, new RegExp(file.replaceAll("/", "\\/")));
    assert.deepEqual(pngSize(file), { width, height });
  }
});

test("mobile shell exposes deliberate update and offline behavior", () => {
  const worker = readPublic("sw.js").toString("utf8");
  const app = readPublic("app.js").toString("utf8");
  const css = readPublic("app.css").toString("utf8");

  assert.match(worker, /SKIP_WAITING/);
  assert.match(worker, /const APP_ROOT = self\.registration\.scope/);
  assert.match(worker, /const CATALOG_PATH =/);
  assert.match(worker, /url\.pathname === CATALOG_PATH/);
  assert.match(worker, /new URL\(path, APP_ROOT\)/);
  assert.match(worker, /event\.request\.mode === "navigate"/);
  assert.doesNotMatch(worker.match(/self\.addEventListener\("install"[\s\S]*?\n}\);/)?.[0] || "", /skipWaiting/);
  assert.match(app, /new URL\(document\.baseURI\)\.pathname/);
  assert.match(app, /beforeinstallprompt/);
  assert.match(app, /controllerchange/);
  assert.match(app, /addEventListener\("offline"/);
  assert.match(app, /scheduleRoomReconnect/);
  assert.match(css, /safe-area-inset-top/);
  assert.match(css, /\.home-screen \.site-shell \{ height: 100dvh/);
});
