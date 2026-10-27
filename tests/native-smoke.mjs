// Development-only smoke test for our own WebView2 app launched with CDP enabled.
// No external application is controlled. Never run against a profile with user data.
import { chromium } from "playwright";
import { expect } from "@playwright/test";
import { writeFile, readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
const context = browser.contexts()[0];
const pages = context.pages();
console.log(pages.map((p) => p.url()));
const widget = pages.find((p) => p.url().includes("view=widget"));
assert(widget, "widget exists");
await widget.evaluate(() =>
  window.__TAURI_INTERNALS__.invoke("manager_show", { page: "overview" }),
);
let manager = context.pages().find((p) => !p.url().includes("view=widget"));
if (!manager)
  manager = await context.waitForEvent("page", {
    predicate: (p) => !p.url().includes("view=widget"),
  });
assert(manager, "manager exists");
const invoke = (page, command, args = {}) =>
  page.evaluate(
    ({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args),
    { command, args },
  );
if (await widget.getByRole("button", { name: "展开科研卡片" }).isVisible())
  await widget.getByRole("button", { name: "展开科研卡片" }).click();
const path = await invoke(widget, "data_path");
const prior = await invoke(widget, "load_data");
if (
  prior &&
  [
    ...prior.projects,
    ...prior.tasks,
    ...prior.ideas,
    ...prior.results,
    ...prior.checkins,
  ].some((r) => !r.id.startsWith("native-"))
)
  throw new Error("Profile contains user records; refusing to alter it.");
await writeFile(
  "artifacts/native-test-profile.json",
  JSON.stringify({ path, prior }, null, 2),
);
const now = new Date().toISOString();
const base = (id) => ({ id, createdAt: now, updatedAt: now });
const data = {
  schemaVersion: 1,
  revision: prior?.revision || 0,
  projects: [
    {
      ...base("native-project"),
      name: "原生持久化验收 · 中文科研项目",
      background: "仅用于测试，验收后清空。",
      track: "deliver",
      status: "active",
      priority: true,
    },
  ],
  tasks: [
    {
      ...base("native-task"),
      projectId: "native-project",
      name: "核对 Figure 2 的统计结果",
      type: "结果检查",
      minutes: 10,
      status: "todo",
      note: "检查一个小步骤。",
    },
  ],
  results: [],
  ideas: [],
  checkins: [],
  settings: { theme: "light", alwaysOnTop: false, motivation: "low" },
  timer: null,
};
const saved = await invoke(widget, "save_data", {
  data,
  expected: data.revision,
});
assert.equal(saved.revision, data.revision + 1);
const onDisk = JSON.parse(await readFile(path, "utf8"));
assert.equal(onDisk.projects[0].name, data.projects[0].name);
await invoke(widget, "manager_show", { page: "overview" });
await manager
  .getByRole("heading", { name: data.tasks[0].name, exact: true })
  .waitFor();
await widget.getByRole("button", { name: "开始", exact: true }).click();
await manager.locator(".timer").waitFor();
await widget.getByRole("button", { name: "暂停", exact: true }).click();
await widget.getByRole("button", { name: "完成", exact: true }).click();
await manager
  .getByRole("heading", { name: "从一个具体的小步骤开始", exact: true })
  .waitFor();
await invoke(widget, "set_top", { value: true });
assert.equal((await invoke(widget, "desktop_state")).widget.alwaysOnTop, true);
await invoke(widget, "set_top", { value: false });
assert.equal((await invoke(widget, "desktop_state")).widget.alwaysOnTop, false);
assert.equal((await invoke(widget, "desktop_state")).trayExists, true);
await widget.getByRole("button", { name: "收起为胶囊" }).click();
await expect.poll(() => widget.evaluate(() => innerWidth)).toBe(120);
assert.equal(await widget.evaluate(() => document.body.scrollWidth), 120);
await widget.screenshot({ path: "artifacts/screenshots/native-capsule.png" });
await widget.getByRole("button", { name: "展开科研卡片" }).click();
await expect.poll(() => widget.evaluate(() => innerWidth)).toBe(320);
await invoke(widget, "hide_all");
let visibility = await invoke(widget, "desktop_state");
assert.equal(visibility.widget.visible, false);
assert.equal(visibility.manager.visible, false);
await invoke(widget, "widget_show");
assert.equal((await invoke(widget, "desktop_state")).widget.visible, true);
await invoke(widget, "manager_show", { page: "projects" });
await manager
  .getByRole("heading", { name: data.projects[0].name, exact: true })
  .waitFor();
let conflict = false;
try {
  await invoke(widget, "save_data", { data, expected: 0 });
} catch {
  conflict = true;
}
assert(conflict, "stale write must fail");
await widget.screenshot({ path: "artifacts/screenshots/native-widget.png" });
await manager.screenshot({ path: "artifacts/screenshots/native-manager.png" });
const disk = await invoke(widget, "load_data");
assert.equal(disk.tasks[0].status, "done");
await writeFile(
  "artifacts/native-smoke.json",
  JSON.stringify(
    {
      passed: true,
      path,
      revision: disk.revision,
      windowWidths: [120, 320],
      completedTask: disk.tasks[0].status,
      checks: [
        "native atomic save/read",
        "stale revision rejection",
        "cross-window event synchronization",
        "timer start/pause/complete",
        "always-on-top command",
        "hide/show commands",
        "capsule/card resize",
      ],
      note: "Tray shell clicks and physical monitor DPI not tested by CDP.",
    },
    null,
    2,
  ),
);
console.log("Native smoke passed. Closing through quit_app.");
await invoke(widget, "quit_app").catch(() => {});
await browser.close().catch(() => {});
