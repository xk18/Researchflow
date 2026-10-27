import { test, expect, Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { demoData } from "../fixtures";
import { addMilestones, rangeLanes } from "../../src/planning";
import { AppData, base } from "../../src/types";

export function v11Fixture() {
  const d = demoData();
  const p = d.projects[0],
    q = d.projects[1];
  p.name = "炎症微环境与术后恢复：细胞通讯机制的重复验证研究";
  p.targetDate = "2026-10-30";
  q.targetDate = "2026-11-29";
  d.settings.focusProjectId = p.id;
  d.settings.theme = "light";
  addMilestones(d, p.id, [
    "数据库下载",
    "数据清洗与变量定义",
    "分析代码",
    "主要模型",
    "结果验证",
    "图表整理",
    "论文初稿",
    "修改与交付",
  ]);
  Object.assign(d.milestones[1], {
    status: "doing",
    description: "核对缺失数据和随访窗口，保留可复现的变量定义。",
    outcome: "清洗数据集和变量说明表",
    startDate: "2026-10-10",
    endDate: "2026-10-20",
    targetDate: "2026-10-20",
  });
  const task = d.tasks.find((t) => t.projectId === p.id)!;
  Object.assign(task, {
    name: "逐项核对随访窗口与缺失数据的处理方式",
    milestoneId: d.milestones[1].id,
    estimatedMinutes: 180,
    note: "打开清洗日志，先检查一组变量。",
  });
  for (const [pid, name, startDate, endDate] of [
    [p.id, "10月 · 数据核对", "2026-10-10", "2026-10-30"],
    [p.id, "独立重复验证", "2026-10-18", "2026-10-25"],
    [p.id, "12月 · 论文修订", "2026-12-05", "2026-12-20"],
    [q.id, "论文结果整理", "2026-10-15", "2026-11-29"],
  ])
    d.planPeriods.push({
      ...base(),
      projectId: pid,
      name,
      note: "",
      startDate,
      endDate,
      priority: true,
    });
  return d;
}
async function seed(page: Page, data = v11Fixture(), url = "/?page=plan") {
  await page.goto("/");
  await page.evaluate(
    (d) => localStorage.setItem("researchflow-v1", JSON.stringify(d)),
    data,
  );
  await page.goto(url);
  await expect(page.locator(".startup")).toHaveCount(0);
  return data;
}
const read = (page: Page) =>
  page.evaluate(
    () => JSON.parse(localStorage.getItem("researchflow-v1")!) as AppData,
  );

test("独立时段编辑删除、跨月月历与时间轴无重叠", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-14T12:00:00+08:00"));
  const fixture = await seed(page);
  await expect(page.locator(".calendar-week")).toHaveCount(5);
  await page
    .locator('[data-date="2026-10-11"] .calendar-tag')
    .filter({ hasText: fixture.projects[0].name })
    .first()
    .click();
  await page.getByLabel("计划名称（可选）").fill("10月 · 变量核对");
  await page.getByRole("button", { name: "保存计划", exact: true }).click();
  let d = await read(page);
  expect(d.planPeriods).toHaveLength(4);
  expect(d.planPeriods[2].startDate).toBe("2026-12-05");
  await page.getByRole("button", { name: "时间轴", exact: true }).click();
  await expect(page.locator(".timeline-bar")).toHaveCount(4);
  const bars = page
    .locator(".timeline-project")
    .first()
    .locator(".timeline-bar");
  const box0 = await bars.nth(0).boundingBox(),
    box1 = await bars.nth(1).boundingBox();
  expect(box1!.y).toBeGreaterThan(box0!.y + box0!.height);
  await page
    .getByRole("button", {
      name: `展开阶段 ${fixture.projects[0].name}`,
      exact: true,
    })
    .click();
  await expect(page.locator(".timeline-stage")).toHaveCount(8);
  await expect(page.locator(".timeline-stage-bar")).toHaveCount(1);
  await page.screenshot({ path: "artifacts/v1.1/timeline-light.png" });
  await page
    .locator(".timeline-bar")
    .filter({ hasText: "10月 · 变量核对" })
    .click();
  await page.getByRole("button", { name: "删除时段", exact: true }).click();
  await page.getByRole("button", { name: "保留", exact: true }).click();
  expect((await read(page)).planPeriods).toHaveLength(4);
  await page
    .locator(".timeline-bar")
    .filter({ hasText: "10月 · 变量核对" })
    .click();
  await page.getByRole("button", { name: "删除时段", exact: true }).click();
  await page.getByRole("button", { name: "确认删除", exact: true }).click();
  d = await read(page);
  expect(d.planPeriods).toHaveLength(3);
  expect(d.projects).toHaveLength(3);
  expect(d.planPeriods.some((p) => p.startDate === "2026-12-05")).toBe(true);
  await page.getByRole("button", { name: "月历", exact: true }).click();
  await page
    .getByRole("button", { name: /^2026-10-22，/ })
    .locator(".calendar-number")
    .click();
  await page.getByRole("button", { name: "在这一天安排研究" }).click();
  await expect(page.getByLabel("开始日期", { exact: true })).toHaveValue(
    "2026-10-22",
  );
  await page.getByLabel("开始日期", { exact: true }).fill("2026-10-23");
  await page.getByRole("button", { name: "保存计划", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("开始日期");
  expect((await read(page)).planPeriods).toHaveLength(3);
});

test("八阶段批量保存、排序与删除保留行动和重启卡", async ({ page }) => {
  const d = v11Fixture();
  d.milestones = [];
  d.tasks.forEach((t) => delete t.milestoneId);
  await seed(page, d, `/?page=projects&projectId=${d.projects[0].id}`);
  await page.getByRole("button", { name: "批量添加阶段" }).click();
  await page
    .getByLabel("阶段名称，每行一项")
    .fill("下载\n\n清洗\n分析\n模型\n验证\n图表\n写作\n交付");
  await page.getByRole("button", { name: "查看创建预览" }).click();
  await expect(page.locator(".batch-preview li")).toHaveCount(8);
  await page.getByRole("button", { name: "确认创建 8 个阶段" }).click();
  expect((await read(page)).milestones).toHaveLength(8);
  await page.locator(".milestone-row summary").first().click();
  await page.getByRole("button", { name: "下移 下载", exact: true }).click();
  await expect(
    page.locator(".milestone-row summary strong").first(),
  ).toHaveText("清洗");
  await page.locator(".milestone-row summary").first().click();
  await page.getByLabel("清洗 的阶段状态").selectOption("doing");
  await page
    .locator(".milestone-row")
    .filter({ has: page.locator("summary strong", { hasText: "清洗" }) })
    .getByRole("button", { name: "添加阶段行动", exact: true })
    .click();
  await page.getByLabel("具体做什么？").fill("检查变量定义");
  await page.getByRole("button", { name: "保存行动", exact: true }).click();
  let current = await read(page);
  const m = current.milestones.find((m) => m.name === "清洗")!,
    task = current.tasks.find((t) => t.name === "检查变量定义")!;
  expect(task.milestoneId).toBe(m.id);
  await page
    .getByRole("button", { name: "删除阶段 清洗", exact: true })
    .click();
  await page.getByRole("button", { name: "确认删除", exact: true }).click();
  current = await read(page);
  expect(
    current.tasks.find((t) => t.id === task.id)?.milestoneId,
  ).toBeUndefined();
  expect(current.milestones).toHaveLength(7);
  await page.reload();
  await expect(
    page.locator(".task-row").filter({ hasText: "检查变量定义" }),
  ).toBeVisible();
});

test("90分钟与正计时多次专注，暂停结束和完成语义独立", async ({ page }) => {
  const d = await seed(page, undefined, "/?page=focus");
  const action = d.tasks.find((t) => t.projectId === d.projects[0].id)!;
  await page.locator(".duration").click();
  await page.getByLabel("自定义分钟（1–240）").fill("90");
  await page.screenshot({ path: "artifacts/v1.1/custom-focus.png" });
  await page.getByRole("dialog").getByRole("button", { name: "开始专注", exact: true }).click();
  await expect(page.getByRole("timer")).toHaveAttribute("aria-label",/89:5\d|90:00/);
  await page.waitForTimeout(1100);
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  const paused = (await read(page)).timer!.elapsedMs!;
  await page.waitForTimeout(600);
  expect((await read(page)).timer!.elapsedMs).toBe(paused);
  await page.getByRole("button", { name: "继续专注", exact: true }).click();
  await page.getByRole("button", { name: "结束专注", exact: true }).click();
  expect((await read(page)).tasks.find((t) => t.id === action.id)?.status).toBe(
    "todo",
  );
  await page.locator(".duration").click();
  await page.getByRole("button", { name: "正计时", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "开始专注", exact: true }).click();
  await expect(page.getByRole("timer")).toHaveAttribute(
    "aria-label",
    /^已专注 /,
  );
  await page.getByRole("button", { name: "完成行动", exact: true }).click();
  const current = await read(page);
  expect(current.focusSessions).toHaveLength(2);
  expect(current.focusSessions.every((s) => s.status === "ended")).toBe(true);
  expect(current.tasks.find((t) => t.id === action.id)?.status).toBe("done");
  expect(current.milestones[1].status).toBe("doing");
  await page.getByRole("button", { name: "查看项目路线图" }).click();
  await expect(page.locator(".roadmap")).toBeVisible();
  await page
    .getByRole("button", { name: `编辑行动 ${action.name}`, exact: true })
    .click();
  await expect(page.getByLabel("所属项目")).toBeDisabled();
  await page.locator("dialog details summary").click();
  await expect(page.locator(".focus-history")).toHaveCount(2);
});

test("人工聚焦、无行动空状态与旧版备份保留", async ({ page }) => {
  const d = v11Fixture();
  d.settings.focusProjectId = d.projects[1].id;
  d.tasks = d.tasks.filter((t) => t.projectId !== d.projects[1].id);
  await seed(page, d, "/?page=focus");
  await expect(page.locator(".action-card h2")).toHaveText(
    "添加一个行动",
  );
  await page.getByLabel("当前科研重点").selectOption(d.projects[0].id);
  await expect
    .poll(async () => (await read(page)).settings.focusProjectId)
    .toBe(d.projects[0].id);
  await page.reload();
  await expect(page.getByLabel("当前科研重点")).toHaveValue(d.projects[0].id);
  const legacy = demoData() as unknown as Record<string, unknown>;
  legacy.schemaVersion = 1;
  delete legacy.planPeriods;
  delete legacy.milestones;
  delete legacy.focusSessions;
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "v1.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(legacy)),
    });
  await page.getByRole("button", { name: "合并恢复", exact: true }).click();
  expect((await read(page)).schemaVersion).toBe(2);
  expect((await read(page)).milestones).toHaveLength(8);
  const invalid = await read(page);
  invalid.planPeriods[0].endDate = "2026-02-30";
  const before = await read(page);
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "invalid.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(invalid)),
    });
  await expect(page.getByRole("alert")).toContainText("无效");
  expect(await read(page)).toEqual(before);
});

test("V1.1真实截图、深浅主题和大量记录页面响应", async ({ page }) => {
  const fixture = await seed(page);
  await mkdir("artifacts/v1.1", { recursive: true });
  await writeFile(
    "artifacts/v1.1/fixture.json",
    JSON.stringify(fixture, null, 2),
  );
  await page.locator("main").evaluate(el=>el.scrollTop=0);
  await page.screenshot({ path: "artifacts/v1.1/calendar-light.png" });
  await page.getByRole("button", { name: "行动视角", exact: true }).click();
  await expect(page.getByRole("button",{name:"开始专注",exact:true})).toBeInViewport({ratio:1});
  await page.screenshot({ path: "artifacts/v1.1/focus-light.png" });
  await page.getByRole("button", { name: "查看项目路线图" }).click();
  await page.screenshot({ path: "artifacts/v1.1/roadmap-light.png" });
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByRole("button", { name: "深色", exact: true }).click();
  await page.getByRole("button", { name: "科研规划", exact: true }).click();
  await page.getByRole("button", { name: "时间轴", exact: true }).click();
  await page.screenshot({ path: "artifacts/v1.1/timeline-dark.png" });
  await page.goto("/?view=widget");
  await page.setViewportSize({ width: 320, height: 400 });
  await expect(
    page.getByRole("button", { name: "开始专注", exact: true }),
  ).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: "artifacts/v1.1/widget-dark.png" });
  await page.getByRole("button", { name: "收起为胶囊" }).click();
  await page.setViewportSize({ width: 120, height: 44 });
  await page.screenshot({ path: "artifacts/v1.1/capsule-dark.png" });
  const heavy = v11Fixture();
  heavy.projects = [];
  heavy.tasks = [];
  heavy.results = [];
  heavy.ideas = [];
  heavy.milestones = [];
  heavy.planPeriods = [];
  delete heavy.settings.focusProjectId;
  for (let i = 0; i < 40; i++) {
    const p = {
      ...fixture.projects[0],
      ...base(),
      name: `研究 ${i + 1} · 长期随访数据的整理和重复验证`,
      priority: i === 0,
    };
    heavy.projects.push(p);
    for (let j = 0; j < 10; j++)
      heavy.tasks.push({
        ...fixture.tasks[1],
        ...base(),
        projectId: p.id,
        milestoneId: undefined,
      });
    addMilestones(heavy, p.id, ["数据核对", "统计分析", "论文写作"]);
    for (let j = 0; j < 3; j++)
      heavy.planPeriods.push({
        ...fixture.planPeriods[0],
        ...base(),
        projectId: p.id,
        startDate: `2026-${10 + j}-01`,
        endDate: `2026-${10 + j}-25`,
      });
  }
  await page.setViewportSize({ width: 900, height: 650 });
  await seed(page, heavy);
  const timings: number[] = [];
  for (let i = 0; i < 6; i++) {
    const start = performance.now();
    await page.getByRole("button", { name: "下一个月" }).click();
    await page.locator(".planner-toolbar h2").waitFor();
    timings.push(performance.now() - start);
  }
  const start = performance.now();
  await page.getByRole("button", { name: "时间轴", exact: true }).click();
  await expect(page.locator(".timeline-project")).toHaveCount(40);
  const timelineMs = performance.now() - start;
  await writeFile(
    "artifacts/v1.1/browser-performance.json",
    JSON.stringify(
      {
        projects: 40,
        tasks: 400,
        milestones: 120,
        periods: 120,
        monthClickMs: timings,
        timelineClickMs: timelineMs,
        method:
          "Playwright end-to-end click-to-visible; includes automation overhead",
      },
      null,
      2,
    ),
  );
  for (const scale of [1, 1.25, 1.5]) {
    await page.setViewportSize({
      width: Math.round(900 / scale),
      height: Math.round(650 / scale),
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  expect(
    rangeLanes(heavy.planPeriods, "2026-10-01", "2026-10-31"),
  ).toHaveLength(40);
});
