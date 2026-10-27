import { test, expect } from "@playwright/test";
import { demoData } from "../fixtures";
import { AppData } from "../../src/types";
import { mkdir } from "node:fs/promises";

test("项目提示词正确复制，计划预览后一次追加且可恢复精确的导入前副本", async ({ page, context }) => {
  const fixture = demoData();
  const project = fixture.projects[0];
  project.status = "active";
  project.name = "湿实验与竞赛混合计划";
  const prior = structuredClone(fixture);
  await page.goto("/");
  await page.evaluate((data) => localStorage.setItem("researchflow-v1", JSON.stringify(data)), fixture);
  await page.goto(`/?page=projects&projectId=${project.id}`);
  await expect(page.getByRole("button", { name: "AI 科研计划导入" })).toBeVisible();
  await page.getByRole("button", { name: "AI 科研计划导入" }).click();
  await expect(page.getByLabel("已填入的项目名称")).toContainText(project.name);
  await page.getByText("查看完整提示词与调整协作要求", {exact:true}).click();
  const prompt = await page.getByLabel("完整科研计划提示词").inputValue();
  expect(prompt).toContain(`项目名称：${project.name}`);
  expect(prompt).toContain(`"projectName": ${JSON.stringify(project.name)}`);
  expect(prompt).toContain("结构化科研推进计划 JSON 文件");
  expect(prompt).toContain("小阶段目标与具体行动");
  expect(prompt).not.toContain(project.background);
  await mkdir("artifacts/screenshots", { recursive: true });
  await page.screenshot({ path: "artifacts/screenshots/ai-plan-prompt-1.2.1.png", fullPage: true });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const rules = await page.getByLabel("通用科研计划提示词").inputValue();
  await page.getByLabel("通用科研计划提示词").fill(`${rules}\n补充要求：本次只规划已确认的剩余工作。`);
  await page.getByLabel("项目简介与研究问题", {exact:true}).fill("讨论实验条件与竞赛交付，不重复已完成的预实验。");
  const edited = await page.getByLabel("完整科研计划提示词").inputValue();
  expect(edited).toContain("补充要求：本次只规划已确认的剩余工作。");
  expect(edited.indexOf("讨论实验条件")).toBeLessThan(edited.indexOf("你是一位科研"));
  await page.getByRole("button", { name: "复制提示词", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("还有信息未填写");
  await page.getByRole("button", {name:"复制待填写模板",exact:true}).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText().then((value) => value.replace(/\r\n/g, "\n")))).toBe(edited);
  await page.getByRole("tab", { name: "导入计划" }).click();
  await page.getByRole("button", { name: "复制提示词", exact: true }).click();
  await page.getByRole("button", {name:"复制待填写模板",exact:true}).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText().then((value) => value.replace(/\r\n/g, "\n")))).toBe(edited);
  const exchange = JSON.stringify({
    format: "researchflow-plan", version: 1,
    projectName: project.name, projectType: "湿实验 / 竞赛",
    milestones: [{
      name: "预实验条件评估", description: "记录尚待确认的实验条件。", outcome: "评估记录",
      startDate: "2026-11-01", endDate: "2026-11-07",
      actions: [{ name: "整理比较条件与评价指标", type: "实验设计", note: "先核对现有方案。" }],
    }],
    actions: [{ name: "确认竞赛材料清单", type: "交付准备" }],
  });
  await page.getByLabel("科研计划 JSON").fill(exchange);
  await page.getByRole("button", { name: "解析并预览" }).click();
  await expect(page.getByText("预实验条件评估")).toBeVisible();
  await expect(page.getByText("竞赛材料清单")).toBeVisible();
  await mkdir("artifacts/screenshots", { recursive: true });
  await page.screenshot({ path: "artifacts/screenshots/ai-plan-import-preview.png", fullPage: true });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("researchflow-v1")!).milestones.length)).toBe(prior.milestones.length);
  await page.getByRole("button", { name: new RegExp(`确认追加到.*${project.name}`) }).click();
  await expect(page.getByRole("heading", { name: "计划已保存" })).toBeVisible();
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem("researchflow-v1")!) as AppData);
  expect(after.milestones.some((item) => item.name === "预实验条件评估")).toBe(true);
  expect(after.tasks.some((item) => item.name === "确认竞赛材料清单" && !item.milestoneId)).toBe(true);
  expect(after.tasks.find((item) => item.name === "整理比较条件与评价指标")?.minutes).toBe(10);
  expect(after.projects.map((item) => item.id)).toEqual(prior.projects.map((item) => item.id));
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("researchflow-before-import")!))).toEqual(prior);

  await page.getByRole("button", { name: "返回项目路线图" }).click();
  await page.getByRole("button", { name: "设置" }).click();
  await page.getByRole("button", { name: "恢复导入前副本" }).click();
  await page.getByRole("button", { name: "覆盖恢复" }).click();
  await expect(page.getByText("数据已恢复。窗口偏好保持当前设置。")).toBeVisible();
  const restored = await page.evaluate(() => JSON.parse(localStorage.getItem("researchflow-v1")!) as AppData);
  expect(restored.milestones.some((item) => item.name === "预实验条件评估")).toBe(false);
  expect(restored.projects.map((item) => item.id)).toEqual(prior.projects.map((item) => item.id));
});

test("预览后项目数据变化时要求重新解析，不提交旧预览", async ({ page }) => {
  const fixture = demoData();
  const project = fixture.projects[0];
  await page.goto("/");
  await page.evaluate((data) => localStorage.setItem("researchflow-v1", JSON.stringify(data)), fixture);
  await page.goto(`/?page=projects&projectId=${project.id}`);
  await page.getByRole("button", { name: "AI 科研计划导入" }).click();
  await page.getByRole("tab", { name: "导入计划" }).click();
  await page.getByLabel("科研计划 JSON").fill(JSON.stringify({
    format: "researchflow-plan", version: 1, actions: [{ name: "旧预览中的行动" }],
  }));
  await page.getByRole("button", { name: "解析并预览" }).click();
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("researchflow-v1")!);
    data.revision += 1;
    data.projects[0].background = "另一窗口刚刚更新";
    localStorage.setItem("researchflow-v1", JSON.stringify(data));
    window.dispatchEvent(new Event("researchflow-changed"));
  });
  await expect(page.getByText("另一窗口刚刚更新")).toHaveCount(1);
  await page.getByRole("button", { name: new RegExp(`确认追加到.*${project.name}`) }).click();
  await expect(page.getByRole("status").filter({ hasText: "项目数据在预览后发生了变化" })).toBeVisible();
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem("researchflow-v1")!) as AppData);
  expect(after.tasks.some((item) => item.name === "旧预览中的行动")).toBe(false);
  expect(after.projects.find((item) => item.id === project.id)?.background).toBe("另一窗口刚刚更新");
});
