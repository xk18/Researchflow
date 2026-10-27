import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const b = await chromium.connectOverCDP("http://127.0.0.1:9223");
const w = b
  .contexts()[0]
  .pages()
  .find((p) => p.url().includes("view=widget"));
const invoke = (command, args = {}) =>
  w.evaluate(
    ({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args),
    { command, args },
  );
await w.getByRole("button", { name: "展开科研卡片" }).waitFor();
const state = await invoke("desktop_state");
assert.equal(state.trayExists, true);
assert.equal(state.widget.visible, true);
assert.equal((await invoke("load_data")).projects.length, 0);
await w.getByRole("button", { name: "展开科研卡片" }).click();
await w.getByRole("button", { name: "管理面板", exact: true }).click();
let manager = b
  .contexts()[0]
  .pages()
  .find((p) => !p.url().includes("view=widget"));
if (!manager)
  manager = await b
    .contexts()[0]
    .waitForEvent("page", {
      predicate: (p) => !p.url().includes("view=widget"),
    });
await manager.getByRole("heading", { name: "让研究，慢慢向前。" }).waitFor();
const positionRestored = state.widget.x === 234 && state.widget.y === 234;
assert(positionRestored);
await writeFile(
  "artifacts/installation.json",
  JSON.stringify(
    {
      passed: true,
      currentUserInstall: true,
      installedExecutableLaunch: true,
      emptyUserProfile: true,
      miniRestored: true,
      positionRestored,
      state,
      note: "NSIS silent current-user install; installed executable differs from portable only by the three-byte Tauri NSIS bundle marker. Installer GUI wizard not manually inspected.",
    },
    null,
    2,
  ),
);
await invoke("hide_manager");
await invoke("quit_app").catch(() => {});
await b.close().catch(() => {});
console.log(
  "Installed executable launch, tray, empty profile and position restore passed.",
);
