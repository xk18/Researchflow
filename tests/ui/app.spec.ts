import { demoData } from "../fixtures";
import { test, expect } from "@playwright/test";
test("项目、行动、快照、成果、灵感与状态的完整离线流程", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "创建我的第一个科研项目", exact: true }).click();
  await page
    .getByRole("textbox", { name: "项目名称" })
    .fill("术后队列：较长中文项目标题与统计结果的重复验证研究");
  await page.getByRole("button", { name: "保存项目" }).click();
  await expect(page.getByRole("status")).toContainText("项目已保存");
  await page.getByRole("button", { name: "添加行动", exact: true }).click();
  await page
    .getByRole("textbox", { name: "具体做什么？" })
    .fill("核对 Figure 2 的统计结果");
  await page.getByRole("button", { name: "保存行动" }).click();
  await expect(
    page.getByRole("heading", {
      name: "核对 Figure 2 的统计结果",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "完成行动", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("已完成");
  await page.getByRole("button", { name: "科研项目", exact: true }).click();
  await page.locator('.project-more > summary').click();
  await page.getByRole("button", { name: "转入成果产出", exact: true }).click();
  await expect(page.locator('.project-item .track-label')).toHaveText('成果产出');
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  await page
    .getByRole("textbox", { name: "下次重新开始的第一个动作" })
    .fill("打开分析日志，检查第三组参数");
  await page.getByRole("button", { name: "保存并暂停" }).click();
  await page.getByRole("button", { name: "找回研究思路", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "打开分析日志，检查第三组参数" }),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/screenshots/restart.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "开始10分钟", exact: true }).click();
  await page.locator(".nav-records > summary").click();
  await page.getByRole("button", { name: "成果卡", exact: true }).click();
  await page.getByRole("button", { name: "记录成果", exact: true }).click();
  await page
    .getByRole("textbox", { name: "发现了什么？" })
    .fill("观察到一个值得验证的结果，统计解释尚需补充。");
  await page.screenshot({ path: "artifacts/screenshots/result-editor.png" });
  await page.getByRole("button", { name: "保存成果卡", exact: true }).click();
  await page
    .getByRole("button", { name: "整理为论文素材", exact: true })
    .click();
  await expect(page.locator("pre")).toContainText("【待补充】");
  await page.getByRole("button", { name: "关闭对话框" }).click();
  await page.getByRole("button", { name: "灵感池", exact: true }).click();
  await page
    .getByRole("button", { name: "记录灵感", exact: true })
    .first()
    .click();
  await page
    .getByRole("textbox", { name: "一个问题，或一个想法" })
    .fill("比较不同随访时间窗口的结果稳定性");
  await page.getByRole("button", { name: "保存灵感" }).click();
  await expect(
    page.getByText("比较不同随访时间窗口的结果稳定性", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "状态回顾", exact: true }).click();
  await page.getByRole("button", { name: "记录今日状态" }).click();
  await page
    .getByRole("textbox", { name: "一句话备注（可选）" })
    .fill("今天先推进一小步。");
  await page.getByRole("button", { name: "保存状态" }).click();
  await expect(
    page.getByText("今天先推进一小步。", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("今天先推进一小步。", { exact: true }),
  ).toBeVisible();
  await page.context().setOffline(true);
  await page.getByRole("button", { name: "科研项目", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "术后队列：较长中文项目标题与统计结果的重复验证研究",
    }),
  ).toBeVisible();
});
test("真实界面视觉矩阵与响应布局", async ({ page }) => {
  await page.goto("/");
  await page.screenshot({ path: "artifacts/screenshots/empty.png" });
  await page.evaluate(d => localStorage.setItem("researchflow-v1", JSON.stringify(d)), demoData());
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "核对 Figure 2 的统计结果",
      exact: true,
    }),
  ).toBeVisible();
  await page.locator("main").evaluate((el) => (el.scrollTop = 0));
  await page.screenshot({ path: "artifacts/screenshots/overview-light.png" });
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByRole("button", { name: "深色", exact: true }).click();
  await page.getByRole("button", { name: "概览", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.locator("main").evaluate((el) => (el.scrollTop = 0));
  await page.screenshot({ path: "artifacts/screenshots/overview-dark.png" });
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByRole("button", { name: "浅色", exact: true }).click();
  await page.goto("/?view=widget");
  await page.setViewportSize({ width: 320, height: 400 });
  await expect(page.locator("html")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await page.screenshot({ path: "artifacts/screenshots/widget.png" });
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 320);
  await page.getByRole("button", { name: "收起为胶囊" }).click();
  await page.setViewportSize({ width: 120, height: 44 });
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 120);
  await page.screenshot({ path: "artifacts/screenshots/capsule.png" });
});
test("JSON 导出、校验、覆盖与重复合并", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(d => localStorage.setItem("researchflow-v1", JSON.stringify(d)), demoData());
  await page.reload();
  await page.getByRole("button", { name: "设置", exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "导出 JSON" }).click(),
  ]);
  const file = await download.path();
  expect(file).toBeTruthy();
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"schemaVersion":9}'),
    });
  await expect(page.getByRole("alert")).toContainText("备份格式");
  await page.locator("input[type=file]").setInputFiles(file!);
  await page.getByRole("button", { name: "合并恢复", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("数据已恢复");
  let count = await page.evaluate(
    () => JSON.parse(localStorage.getItem("researchflow-v1")!).projects.length,
  );
  expect(count).toBe(3);
  await page.locator("input[type=file]").setInputFiles(file!);
  await page.getByRole("button", { name: "合并恢复", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("数据已恢复");
  count = await page.evaluate(
    () => JSON.parse(localStorage.getItem("researchflow-v1")!).projects.length,
  );
  expect(count).toBe(3);
  await page.locator("input[type=file]").setInputFiles(file!);
  await page.getByRole("button", { name: "覆盖恢复", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("数据已恢复");
});

test("未保存编辑提示、长内容和视觉缩放", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "创建我的第一个科研项目", exact: true }).click();
  await page.getByRole("textbox", { name: "项目名称" }).fill("未保存的课题");
  await page.getByRole("button", { name: "关闭对话框" }).click();
  await expect(
    page.getByText("输入还没有保存。要放弃这次编辑吗？"),
  ).toBeVisible();
  await page.getByRole("button", { name: "继续编辑" }).click();
  await expect(page.getByRole("textbox", { name: "项目名称" })).toHaveValue(
    "未保存的课题",
  );
  await page.getByRole("button", { name: "保存项目" }).click();
  await page.getByRole("button", { name: "科研项目", exact: true }).click();
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await page
    .getByRole("textbox", { name: "项目名称" })
    .fill(
      "较长的中文标题用于检查科研项目在不同缩放下保持清晰且不会横向溢出：炎症微环境与术后恢复研究的结果证据整理",
    );
  await page.getByRole("button", { name: "保存项目" }).click();
  for (const scale of [1, 1.25, 1.5]) {
    await page.setViewportSize({
      width: Math.round(900 / scale),
      height: Math.round(650 / scale),
    });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await page.screenshot({
      path: `artifacts/screenshots/layout-${scale}.png`,
    });
  }
});

test("紧凑窗口的长内容、计时和状态弹层不遮挡主要操作", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(d => localStorage.setItem("researchflow-v1", JSON.stringify(d)), demoData());
  await page.reload();
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem("researchflow-v1")!);
    d.projects.forEach((p: {name: string}) => p.name = "炎症微环境与术后恢复机制的长期随访研究：多中心队列证据整理与重复验证");
    d.tasks.forEach((t: {name: string; note: string}) => { t.name = "逐项核对不同随访时间窗口下的统计结果，并记录每一处尚需重复验证的证据"; t.note = "对照原始分析日志，检查效应量、置信区间和缺失数据的处理方式。"; });
    localStorage.setItem("researchflow-v1", JSON.stringify(d));
  });
  await page.setViewportSize({ width: 320, height: 400 });
  await page.goto("/?view=widget");
  const start = page.getByRole("button", { name: "开始专注", exact: true });
  await expect(start).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole("button", { name: "管理面板", exact: true })).toBeInViewport({ ratio: 1 });
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 320);
  await start.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("timer")).toBeVisible();
  await expect(page.getByRole("button", { name: "暂停", exact: true })).toBeInViewport({ ratio: 1 });
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  await page.locator(".widget-state summary").click();
  await expect(page.getByRole("button", { name: "低动力", exact: true })).toBeInViewport({ ratio: 1 });
  await page.getByRole("button", { name: "低动力", exact: true }).click();
  await expect(page.getByRole("button", { name: "低动力", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("成果索引切换与结构化编辑保留原字段", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(d => localStorage.setItem("researchflow-v1", JSON.stringify(d)), demoData());
  await page.reload();
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem("researchflow-v1")!);
    Object.assign(d.results[0], { evidence: "Figure 2B", interpretation: "相关性解释", limitations: "单中心样本" });
    d.results.push({ ...d.results[0], id: crypto.randomUUID(), observation: "独立重复验证记录" });
    localStorage.setItem("researchflow-v1", JSON.stringify(d));
  });
  await page.reload();
  await page.locator(".nav-records > summary").click();
  await page.getByRole("button", { name: "成果卡", exact: true }).click();
  await page.locator(".result-index button").nth(1).click();
  await expect(page.locator(".result-note h2")).toHaveText("独立重复验证记录");
  await expect(page.locator(".result-fields")).toContainText("单中心样本");
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "关键数据或图表位置" })).toHaveValue("Figure 2B");
  await expect(page.getByRole("button", { name: "保存成果卡", exact: true })).toBeInViewport({ ratio: 1 });
  await page.getByRole("textbox", { name: "结果解释", exact: true }).fill("仍需验证因果关系");
  await page.getByRole("button", { name: "保存成果卡", exact: true }).click();
  await page.reload();
  await page.locator(".result-index button").nth(1).click();
  await expect(page.locator(".result-fields")).toContainText("仍需验证因果关系");
  await expect(page.locator(".result-fields")).toContainText("Figure 2B");
  await expect(page.locator(".result-fields")).toContainText("单中心样本");
});
