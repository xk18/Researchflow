import { chromium } from "playwright";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const b = await chromium.connectOverCDP("http://127.0.0.1:9223");
const w = b
  .contexts()[0]
  .pages()
  .find((p) => p.url().includes("view=widget"));
await w.getByRole("button", { name: "添加下一步", exact: true }).waitFor();
const result = await w.evaluate(() =>
  window.__TAURI_INTERNALS__.invoke("desktop_state"),
);
const raw = JSON.parse(
  (await readFile("artifacts/monitors.json", "utf8")).replace(/^\uFEFF/, ""),
);
const monitors = Array.isArray(raw) ? raw : [raw];
assert(
  monitors.some(
    (m) =>
      result.widget.x >= m.x &&
      result.widget.y >= m.y &&
      result.widget.x + result.widget.width <= m.x + m.width &&
      result.widget.y + result.widget.height <= m.y + m.height,
  ),
);
await writeFile(
  "artifacts/offscreen.json",
  JSON.stringify(
    {
      passed: true,
      simulatedSavedPosition: { x: -100000, y: -100000 },
      actual: result.widget,
      note: "Saved-position corruption simulation on current monitor; not a physical display hotplug or DPI change test.",
    },
    null,
    2,
  ),
);
await w
  .evaluate(() => window.__TAURI_INTERNALS__.invoke("quit_app"))
  .catch(() => {});
await b.close().catch(() => {});
console.log(
  "Off-screen saved position recovered within current display bounds.",
);
