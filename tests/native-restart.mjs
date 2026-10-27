import { chromium } from "playwright";
import { expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
const pages = browser.contexts()[0].pages();
const widget = pages.find((p) => p.url().includes("view=widget"));
let manager;
const invoke = (p, command, args = {}) =>
  p.evaluate(
    ({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args),
    { command, args },
  );
const data = await invoke(widget, "load_data");
assert.equal(data.tasks[0].status, "done");
assert.equal(data.projects[0].name, "原生持久化验收 · 中文科研项目");
await invoke(widget, "manager_show", { page: "projects" });
manager = browser
  .contexts()[0]
  .pages()
  .find((p) => !p.url().includes("view=widget"));
if (!manager)
  manager = await browser
    .contexts()[0]
    .waitForEvent("page", {
      predicate: (p) => !p.url().includes("view=widget"),
    });
await manager
  .getByRole("heading", { name: data.projects[0].name, exact: true })
  .waitFor();
await manager.screenshot({
  path: "artifacts/screenshots/native-restart-persisted.png",
});
await widget.getByRole("button", { name: "收起为胶囊" }).click();
await expect.poll(() => widget.evaluate(() => innerWidth)).toBe(120);
const testdata = await invoke(widget, "load_data");
const empty = {
  schemaVersion: 1,
  revision: testdata.revision,
  projects: [],
  tasks: [],
  results: [],
  ideas: [],
  checkins: [],
  settings: { theme: "system", alwaysOnTop: false, motivation: "normal" },
  timer: null,
};
// Only remove the records that this test itself created.
assert(
  [
    ...testdata.projects,
    ...testdata.tasks,
    ...testdata.results,
    ...testdata.ideas,
    ...testdata.checkins,
  ].every((r) => r.id.startsWith("native-")),
);
const first = await invoke(widget, "save_data", {
  data: empty,
  expected: empty.revision,
});
await invoke(widget, "save_data", { data: first, expected: first.revision });
const report = JSON.parse(
  await readFile("artifacts/native-smoke.json", "utf8"),
);
report.restartPersistence = true;
report.cleanedTestRecords = true;
await writeFile("artifacts/native-smoke.json", JSON.stringify(report, null, 2));
await invoke(widget, "quit_app").catch(() => {});
await browser.close().catch(() => {});
console.log(
  "Restart persistence passed; test records cleared; mini preference left for next restart verification.",
);
