import { chromium } from "playwright";
import { expect } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const b = await chromium.connectOverCDP("http://127.0.0.1:9223");
const pages = b.contexts()[0].pages();
const w = pages.find((p) => p.url().includes("view=widget"));
let m;
const invoke = (p, command, args = {}) =>
  p.evaluate(
    ({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args),
    { command, args },
  );
await expect(w.getByRole("button", { name: "展开科研卡片" })).toBeVisible();
assert.equal(await w.evaluate(() => innerWidth), 120);
assert.equal(await w.evaluate(() => document.body.scrollWidth), 120);
await expect(w.getByRole("button", { name: "重新读取" })).toHaveCount(0);
const info = await invoke(w, "desktop_state");
assert.equal(info.trayExists, true);
assert.equal(info.manager.visible, false);
assert.equal(info.widget.visible, true);
await w.getByRole("button", { name: "展开科研卡片" }).click();
await expect.poll(() => w.evaluate(() => innerWidth)).toBe(320);
assert.equal((await invoke(w, "load_data")).projects.length, 0);
await invoke(w, "manager_show", { page: "settings" });
m = b
  .contexts()[0]
  .pages()
  .find((p) => !p.url().includes("view=widget"));
if (!m)
  m = await b
    .contexts()[0]
    .waitForEvent("page", {
      predicate: (p) => !p.url().includes("view=widget"),
    });
await m.getByRole("heading", { name: "安静地，按你的习惯" }).waitFor();
assert(
  !w.url().includes("page=settings"),
  "manager navigation must not reach widget",
);
await invoke(w, "manager_show", { page: "overview" });
await m.getByRole("heading", { name: "今天的研究" }).waitFor();
await m.screenshot({ path: "artifacts/screenshots/native-empty.png" });
await w.screenshot({ path: "artifacts/screenshots/native-final-widget.png" });
await writeFile(
  "artifacts/native-final.json",
  JSON.stringify(
    {
      passed: true,
      miniRestored: true,
      initializationRaceResolved: true,
      targetedNavigation: true,
      desktopState: info,
    },
    null,
    2,
  ),
);
console.log("Final native startup/mini/targeted navigation checks passed.");
await b.close();
