import { test, expect } from "@playwright/test";
import { emptyData } from "../../src/types";

const read = (page: import("@playwright/test").Page) => page.evaluate(() => JSON.parse(localStorage.getItem("researchflow-v1")!));

test("欢迎三项选择、取消创建与保存后不重复引导", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".overview-timeline")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "体验示例科研项目", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "创建我的第一个科研项目", exact: true }).click();
  await page.getByRole("button", { name: "关闭对话框" }).click();
  await expect(page.getByRole("heading", { name: "欢迎使用 ResearchFlow" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("researchflow-v1"))).toBeNull();
  await page.getByRole("button", { name: "创建我的第一个科研项目", exact: true }).click();
  await page.getByRole("textbox", { name: "项目名称", exact: true }).fill("自己的观察性研究");
  await page.getByRole("button", { name: "保存项目", exact: true }).click();
  expect((await read(page)).settings.onboarding).toBe("completed");
  expect((await read(page)).projects).toHaveLength(1);
  await page.reload();
  await expect(page.getByRole("heading", { name: "欢迎使用 ResearchFlow" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "近期安排" })).toBeVisible();
});

test("跳过及创建保存失败保留欢迎，无成功反馈或部分数据", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw Error("测试写入失败"); }; });
  await page.getByRole("button", { name: "暂时跳过", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("保存失败");
  await expect(page.getByRole("heading", { name: "欢迎使用 ResearchFlow" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
  await page.getByRole("button", { name: "创建我的第一个科研项目", exact: true }).click();
  await page.getByRole("textbox", { name: "项目名称", exact: true }).fill("未保存的研究");
  await page.getByRole("button", { name: "保存项目", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "项目名称", exact: true })).toHaveValue("未保存的研究");
  expect(await page.evaluate(() => localStorage.getItem("researchflow-v1"))).toBeNull();
});

test("隐私共用详情、默认折叠、键盘关闭不保存，路径和备份入口定位", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "隐私详情", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("应用不会自动将科研项目内容上传至开发者服务器");
  await expect(dialog.locator("details")).not.toHaveAttribute("open");
  await dialog.locator("summary").click();
  await expect(dialog).toContainText("后补忽略规则不会自动停止已跟踪文件的跟踪");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "隐私详情", exact: true })).toBeFocused();
  expect(await page.evaluate(() => localStorage.getItem("researchflow-v1"))).toBeNull();
  await page.getByRole("button", { name: "隐私详情", exact: true }).click();
  await dialog.getByRole("button", { name: "查看本地数据位置", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("#data-location")).toBeFocused();
  await expect(page.locator("#data-location")).toContainText("浏览器预览数据");
  await page.getByRole("button", { name: "隐私详情", exact: true }).click();
  await dialog.getByRole("button", { name: "管理备份与恢复", exact: true }).click();
  await expect(page.locator("#backup-settings")).toBeFocused();
  expect(await page.evaluate(() => localStorage.getItem("researchflow-v1"))).toBeNull();
});

test("读取数据位置失败可重试，未改科研记录（原生桥接模拟）", async ({ page }) => {
  const data = emptyData(); data.settings.onboarding = "completed";
  await page.addInitScript(data => {
    const scope = window as unknown as { isTauri: boolean; __TAURI_INTERNALS__: unknown; __TAURI_EVENT_PLUGIN_INTERNALS__: unknown; allowPath: boolean };
    scope.isTauri = true; scope.allowPath = false;
    scope.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
    scope.__TAURI_INTERNALS__ = {
      transformCallback: () => 1,
      invoke: async (command: string) => {
        if (command === "load_data") return data;
        if (command === "data_path") {
          await new Promise(resolve => setTimeout(resolve, 150));
          if (!scope.allowPath) throw Error("测试路径读取失败");
          return "C:\\TestProfile\\researchflow.json";
        }
        if (command === "plugin:autostart|is_enabled") return false;
        return null;
      },
    };
  }, data);
  await page.goto("/?page=settings");
  await expect(page.locator("#data-location")).toContainText("正在读取");
  await expect(page.locator("#data-location").getByRole("alert")).toContainText("无法读取数据位置");
  await page.evaluate(() => { (window as unknown as { allowPath: boolean }).allowPath = true; });
  await page.locator("#data-location").getByRole("button", { name: "重新读取" }).click();
  await expect(page.locator("#data-location")).toContainText("C:\\TestProfile\\researchflow.json");
  await expect(page.locator("#data-location").getByRole("alert")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("researchflow-v1"))).toBeNull();
});

test("欢迎、隐私深浅主题与紧凑窗口真实渲染截图", async ({ page }) => {
  await page.goto("/");
  await page.screenshot({ path: "artifacts/v1.4.1/welcome-before-review.png" });
  await page.getByRole("button", { name: "隐私详情", exact: true }).click();
  await page.screenshot({ path: "artifacts/v1.4.1/privacy-light.png" });
  await page.getByRole("dialog").locator("summary").click();
  await page.getByRole("dialog").locator("summary").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "artifacts/v1.4.1/privacy-advanced-light.png" });
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 720, height: 560 });
  await page.screenshot({ path: "artifacts/v1.4.1/welcome-compact.png" });
  await expect(page.getByRole("button", { name: "暂时跳过", exact: true })).toBeInViewport({ ratio: 1 });
  expect(await page.locator("body").evaluate(el => el.scrollWidth)).toBe(720);
  await page.goto("/?view=widget"); await page.setViewportSize({ width: 320, height: 400 });
  await expect(page.getByRole("button", { name: "开始使用", exact: true })).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: "artifacts/v1.4.1/widget-welcome.png" });
  await page.getByRole("button", { name: "收起为胶囊" }).click();
  await page.setViewportSize({ width: 120, height: 44 });
  await page.screenshot({ path: "artifacts/v1.4.1/capsule-welcome.png" });
});
