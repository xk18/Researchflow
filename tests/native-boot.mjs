import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";
const t = performance.now();
const child = spawn("src-tauri/target/release/researchflow.exe", [], {
  windowsHide: true,
  stdio: "ignore",
  env: {
    ...process.env,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: "--remote-debugging-port=9223",
  },
});
child.unref();
let ready = false;
for (let i = 0; i < 100; i++) {
  try {
    const r = await fetch("http://127.0.0.1:9223/json/list");
    const pages = await r.json();
    if (pages.some((p) => p.url?.includes("view=widget"))) {
      ready = true;
      break;
    }
  } catch {}
  await new Promise((r) => setTimeout(r, 100));
}
if (!ready) throw new Error("App debug endpoint did not become ready.");
const b = await chromium.connectOverCDP("http://127.0.0.1:9223");
const w =
  b
    .contexts()[0]
    .pages()
    .find((p) => p.url().includes("view=widget")) ||
  b.contexts()[0].pages()[0] ||
  (await b.contexts()[0].waitForEvent("page"));
await w.waitForURL(/view=widget/);
await w.waitForFunction(() => !!window.__TAURI_INTERNALS__);
await w.evaluate(() => window.__TAURI_INTERNALS__.invoke("load_data"));
const elapsed = performance.now() - t;
await writeFile(
  "artifacts/startup.json",
  JSON.stringify(
    {
      pid: child.pid,
      launchToIpcReadyMs: Math.round(elapsed),
      note: "One run with WebView2 CDP enabled; includes test harness attach. Not a repeated benchmark.",
    },
    null,
    2,
  ),
);
console.log(
  `Native launch to IPC ready: ${Math.round(elapsed)} ms (CDP test enabled).`,
);
await b.close();
