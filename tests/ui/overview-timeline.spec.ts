import { test, expect, Page } from "@playwright/test";
import { base, emptyData } from "../../src/types";
import { PLAN_BRIEF_FIELDS } from "../../src/aiPlan";
import { mkdir, writeFile } from "node:fs/promises";

export function timelineFixture() {
  const d=emptyData();
  for(const [id,name,track,status] of [
    ["cohort","术后队列研究：炎症指标与恢复轨迹的重复验证","deliver","active"],
    ["methods","细胞通讯方法探索","explore","active"],
    ["review","综述框架与证据整理","deliver","paused"],
  ] as const) d.projects.push({...base(),id,name,track,status,background:"仅供验收的虚构科研示例",priority:id==="cohort",startDate:"2026-09-01",targetDate:id==="cohort" ? "2026-11-06" : "2026-11-08"});
  for(const [projectId,name,startDate,endDate] of [
    ["cohort","结果验证","2026-10-07","2026-10-17"],
    ["cohort","论文初稿","2026-10-23","2026-11-04"],
    ["methods","复现实验","2026-10-11","2026-10-25"],
    ["review","框架调整","2026-10-26","2026-11-07"],
  ]) d.planPeriods.push({...base(),projectId,name,startDate,endDate,priority:projectId==="cohort",note:""});
  for(const [i,projectId,name,date] of [[0,"cohort","敏感性分析复核","2026-10-17"],[1,"cohort","初稿审阅","2026-11-04"],[2,"methods","条件评估","2026-10-20"],[3,"methods","结果复核","2026-10-21"]] as const) d.milestones.push({...base(),id:`m${i}`,projectId,name,description:"保留真实证据，结论需验证",outcome:"可检查的研究记录",targetDate:date,order:i,status:i===0 ? "doing" : "todo"});
  d.tasks.push({...base(),id:"task",projectId:"cohort",milestoneId:"m0",name:"核对验证集的敏感性分析结果",type:"数据复核",minutes:25,status:"todo",note:"打开分析日志，先检查关键变量。"});
  d.settings.focusProjectId="cohort";d.settings.theme="light";
  return d;
}
async function seed(page:Page) {
  await page.clock.setFixedTime(new Date("2026-10-12T12:00:00+08:00"));
  await page.goto("/");
  await page.evaluate(d=>localStorage.setItem("researchflow-v1",JSON.stringify(d)),timelineFixture());
  await page.reload();
}
test("近期时间轴首屏、折叠持久化、阶段定位与完整规划不改聚焦",async({page})=>{
  await seed(page);
  await expect(page.locator(".recent-row")).toHaveCount(3);
  await mkdir("artifacts/v1.4.2",{recursive:true});
  await writeFile("artifacts/ResearchFlow_1.7.2/regression-screenshots/fixture.json",JSON.stringify(timelineFixture()));
  await page.screenshot({path:"artifacts/ResearchFlow_1.7.2/regression-screenshots/overview-before-refine.png"});
  const start=await page.getByRole("button",{name:"开始专注",exact:true}).boundingBox();
  const main=await page.locator("main").boundingBox();
  expect(start!.y+start!.height).toBeLessThan(main!.y+main!.height);
  const axis=await page.locator(".recent-scale").boundingBox(), lane=await page.locator(".recent-lane").first().boundingBox();
  expect(axis!.x).toBe(lane!.x); expect(Math.abs(axis!.width-lane!.width)).toBeLessThan(1);
  expect(await page.evaluate(()=>document.body.scrollWidth)).toBe(900);
  await mkdir("artifacts/v1.4.2",{recursive:true});
  await writeFile("artifacts/ResearchFlow_1.7.2/regression-screenshots/fixture.json",JSON.stringify(timelineFixture()));
  await page.screenshot({path:"artifacts/ResearchFlow_1.7.2/regression-screenshots/overview-light.png"});
  await page.getByRole("button",{name:"收起近期时间轴"}).click();
  await expect(page.locator(".recent-row")).toHaveCount(0);
  await page.reload();await expect(page.getByRole("button",{name:"展开近期时间轴"})).toBeVisible();
  await page.screenshot({path:"artifacts/ResearchFlow_1.7.2/regression-screenshots/overview-collapsed.png"});
  await page.getByRole("button",{name:"展开近期时间轴"}).click();
  await page.getByRole("button",{name:/术后队列研究.*2026-10-17 敏感性分析复核/}).click();
  await expect(page.locator("#milestone-m0")).toHaveAttribute("open","");
  await expect(page.locator("#milestone-m0 summary")).toBeFocused();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem("researchflow-v1")!).settings.focusProjectId)).toBe("cohort");
  await page.getByRole("button",{name:"概览",exact:true}).click();
  await page.getByRole("button",{name:"完整规划",exact:true}).click();
  await expect(page.locator(".timeline-grid")).toBeVisible();
  await expect(page.locator(".timeline-head")).toContainText("2026年10月");
});
test("密集节点保留真实日期与原阶段，窄窗深色与小组件无横向溢出",async({page})=>{
  await seed(page);
  await page.getByRole("button",{name:/细胞通讯方法探索 · 2 个节点/}).click();
  await expect(page.getByRole("dialog")).toContainText("2026-10-20");
  await expect(page.getByRole("dialog")).toContainText("2026-10-21");
  await page.getByRole("button",{name:"关闭对话框"}).click();
  await page.evaluate(()=>{const d=JSON.parse(localStorage.getItem("researchflow-v1")!);d.settings.theme="dark";localStorage.setItem("researchflow-v1",JSON.stringify(d));window.dispatchEvent(new Event("researchflow-changed"));});
  await expect(page.locator("html")).toHaveAttribute("data-theme","dark");
  await page.screenshot({path:"artifacts/ResearchFlow_1.7.2/regression-screenshots/overview-dark.png"});
  await page.setViewportSize({width:720,height:560});
  expect(await page.evaluate(()=>document.body.scrollWidth)).toBe(720);
  await page.screenshot({path:"artifacts/ResearchFlow_1.7.2/regression-screenshots/overview-720.png"});
  await page.setViewportSize({width:320,height:400});await page.goto("/?view=widget");
  await expect(page.getByRole("button",{name:"开始专注",exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.body.scrollWidth)).toBe(320);
  await page.screenshot({path:"artifacts/ResearchFlow_1.7.2/regression-screenshots/widget.png"});
  await page.getByRole("button",{name:"收起为胶囊"}).click();
  await page.setViewportSize({width:120,height:44});
  await page.screenshot({path:"artifacts/ResearchFlow_1.7.2/regression-screenshots/capsule.png"});
});
test("AI资料完整填写后直接复制，规则编辑不被覆盖，项目数据保持原样",async({page,context})=>{
  await seed(page);const before=await page.evaluate(()=>localStorage.getItem("researchflow-v1"));
  await page.goto("/?page=projects&projectId=cohort");
  await page.getByRole("button",{name:"AI 科研计划导入"}).click();
  await page.getByText("查看完整提示词与调整协作要求",{exact:true}).click();
  const rules=await page.getByLabel("通用科研计划提示词").inputValue();
  await page.getByLabel("通用科研计划提示词").fill(rules+"\n额外要求：只规划剩余工作。");
  for(const f of PLAN_BRIEF_FIELDS) await page.getByLabel(f.label,{exact:true}).fill(f.key==="target" ? "2026-11-06，硬截止" : `示例：${f.label}已确认`);
  const full=await page.getByLabel("完整科研计划提示词").inputValue();expect(full).toContain("额外要求：只规划剩余工作");expect(full).not.toContain("【待填写");
  await context.grantPermissions(["clipboard-read","clipboard-write"]);
  await page.getByRole("button",{name:"复制提示词",exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>navigator.clipboard.readText().then(v=>v.replace(/\r\n/g,"\n")))).toBe(full);
  await page.getByRole("tab",{name:"导入计划"}).click();await page.getByRole("button",{name:"复制提示词",exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>navigator.clipboard.readText().then(v=>v.replace(/\r\n/g,"\n")))).toBe(full);
  expect(await page.evaluate(()=>localStorage.getItem("researchflow-v1"))).toBe(before);
  await page.getByRole("tab",{name:"准备提示词"}).click();
  await page.getByText("查看完整提示词与调整协作要求",{exact:true}).click();
  await page.locator("dialog").evaluate(e=>e.scrollTo(0,0));
  await page.screenshot({path:"artifacts/ResearchFlow_1.7.2/regression-screenshots/ai-brief.png"});
});
