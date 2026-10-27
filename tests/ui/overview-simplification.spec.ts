import { test, expect, Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { base, emptyData } from "../../src/types";

function fixture() {
  const d = emptyData(); d.settings.onboarding = "skipped"; d.settings.focusProjectId = "main";
  d.projects = ["main", "other", "third", "fourth"].map((id,i) => ({...base(),id,name:i === 0 ? "食物中加盐与骨质疏松症之间的相关性：研究方案核对和可复现统计分析" : `研究项目 ${i}`,background:"虚构验收项目，不含真实科研数据",track:i % 2 ? "explore" as const : "deliver" as const,status:"active" as const,priority:false,targetDate:"2026-11-01"}));
  d.planPeriods = d.projects.flatMap(p => [0,1,15].map((offset,i) => ({...base(),projectId:p.id,name:`${p.name}的第${i+1}个推进时段`,note:"原始时段独立保存",priority:false,startDate:`2026-10-${String(10+offset).padStart(2,"0")}`,endDate:`2026-10-${String(13+offset).padStart(2,"0")}`})));
  d.milestones = [{...base(),id:"current",projectId:"main",name:"项目当前阶段",description:"",outcome:"",order:0,status:"doing",targetDate:"2026-10-17"},
    {...base(),id:"assigned",projectId:"main",name:"行动实际所属阶段",description:"",outcome:"",order:1,status:"todo",targetDate:"2026-10-22"}];
  d.tasks = [{...base(),id:"action",projectId:"main",milestoneId:"assigned",name:"编写主模型分析代码",note:"先确认研究设计与结局定义。\n"+"逐项核对变量字典、队列定义和模型假设，保留真实分析记录。".repeat(12),type:"统计分析",minutes:25,status:"todo"},
    {...base(),id:"other-action",projectId:"other",name:"评估候选数据可行性",note:"检查关键变量是否可获得。",type:"研究探索",minutes:10,status:"todo"}];
  return d;
}
async function seed(page:Page, data=fixture()) {
  await page.clock.setFixedTime(new Date("2026-10-14T12:00:00+08:00"));
  await page.addInitScript(d => localStorage.setItem("researchflow-v1",JSON.stringify(d)),data);
  await page.goto("/"); await expect(page.locator(".overview-action")).toBeVisible();
  await mkdir("artifacts/v1.4.2",{recursive:true});
}
const read = (page:Page) => page.evaluate(() => JSON.parse(localStorage.getItem("researchflow-v1")!));

test("预览折叠重叠安排仍可达，提示支持键盘并且数据只读",async({page}) => {
  await seed(page); const before = await read(page);
  await expect(page.locator(".recent-row")).toHaveCount(3);
  await expect(page.locator(".recent-name").first()).toContainText(before.projects[0].name);
  await expect(page.locator(".recent-summary")).toContainText("显示 3 / 4");
  await expect(page.locator(".recent-row").first().locator(".recent-bar")).toHaveCount(2);
  const extra=page.getByRole("button",{name:/食物中加盐.*另 1 段重叠安排/});
  await extra.click();await expect(page.getByRole("dialog").locator(".recent-node-list > button")).toHaveCount(3);
  await expect(page.getByRole("dialog")).toContainText("2026-10-11 至 2026-10-14");
  await page.screenshot({path:"artifacts/ResearchFlow_1.7.2/regression-screenshots/overlapping-periods.png"});
  await page.keyboard.press("Escape");await expect(extra).toBeFocused();
  await page.locator(".recent-name").first().focus();await expect(page.getByRole("tooltip")).toContainText(before.projects[0].name);
  await page.keyboard.press("Escape");await expect(page.getByRole("tooltip")).toHaveCount(0);
  await page.getByRole("button",{name:"图例",exact:true}).click();await expect(page.getByRole("dialog")).toContainText("不表示完成进度");await page.keyboard.press("Escape");
  expect(await read(page)).toEqual(before);
  expect(await page.locator(".recent-rows").evaluate(el=>el.scrollHeight===el.clientHeight)).toBe(true);
});

test("行动阶段准确、说明按需展开、编辑取消保护输入",async({page}) => {
  await seed(page); const before = await read(page);
  await expect(page.locator(".overview-stage")).toContainText("行动实际所属阶段");
  await expect(page.locator(".overview-stage")).not.toContainText("项目当前阶段");
  await expect(page.getByRole("button",{name:"开始专注",exact:true})).toBeInViewport({ratio:1});
  await expect(page.locator(".overview-note")).toHaveCount(0);
  await page.getByRole("button",{name:"行动详情与选项",exact:true}).click();
  await expect(page.locator(".overview-action-detail p")).toHaveText(before.tasks[0].note);
  await page.screenshot({path:"artifacts/ResearchFlow_1.7.2/regression-screenshots/action-description.png"});
  await page.getByRole("button",{name:"编辑行动",exact:true}).click();
  await page.getByLabel("具体做什么？",{exact:true}).fill("尚未保存的行动编辑");await page.keyboard.press("Escape");
  await expect(page.getByRole("alert")).toContainText("输入还没有保存");await page.getByRole("button",{name:"继续编辑",exact:true}).click();
  await expect(page.getByLabel("具体做什么？",{exact:true})).toHaveValue("尚未保存的行动编辑");
  await page.getByRole("button",{name:"关闭对话框",exact:true}).click();await page.getByRole("button",{name:"放弃编辑",exact:true}).click();
  expect(await read(page)).toEqual(before);
});

test("概览计时、动力、主线分离、结束和完成语义保留",async({page}) => {
  await seed(page);
  await page.getByLabel("当前科研动力",{exact:true}).selectOption("low");expect((await read(page)).settings.motivation).toBe("low");
  expect((await read(page)).settings.focusProjectId).toBe("main");
  await page.locator(".duration").click();await page.getByLabel("自定义分钟（1–240）").fill("90");
  await page.getByRole("dialog").getByRole("button",{name:"开始专注",exact:true}).click();
  await expect(page.getByRole("timer")).toBeVisible();expect((await read(page)).timer.plannedMinutes).toBe(90);
  await page.getByRole("button",{name:"暂停",exact:true}).click();expect((await read(page)).timer.running).toBe(false);
  await page.getByRole("button",{name:"继续专注",exact:true}).click();expect((await read(page)).timer.running).toBe(true);
  await page.locator("nav").getByRole("button",{name:"行动视角",exact:true}).click();await page.getByLabel("当前科研重点",{exact:true}).selectOption("other");
  await page.getByRole("button",{name:"概览",exact:true}).click();
  await expect(page.locator(".overview-project-context")).toContainText("正在专注");await expect(page.locator(".overview-focus-note")).toContainText("研究项目 1");
  await expect(page.locator(".overview-stage")).toContainText("行动实际所属阶段");
  await page.getByRole("button",{name:"结束专注",exact:true}).click();const ended=await read(page);
  expect(ended.timer).toBeNull();expect(ended.tasks[0].status).toBe("todo");expect(ended.focusSessions[0].status).toBe("ended");
  await expect(page.getByRole("heading",{name:"评估候选数据可行性",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"行动详情与选项",exact:true}).click();await page.getByRole("button",{name:"30分钟后再推荐",exact:true}).click();
  const deferred=await read(page);expect(deferred.tasks[1].deferredUntil).toBeTruthy();expect(deferred.settings.focusProjectId).toBe("other");
  await expect(page.getByRole("button",{name:"添加行动",exact:true})).toBeVisible();
  await page.locator("nav").getByRole("button",{name:"行动视角",exact:true}).click();await page.getByLabel("当前科研重点",{exact:true}).selectOption("main");await page.getByRole("button",{name:"概览",exact:true}).click();
  await page.getByRole("button",{name:"完成行动",exact:true}).click();expect((await read(page)).tasks[0].status).toBe("done");expect((await read(page)).milestones[1].status).toBe("todo");
});

test("长中文和密集安排在常规、窄矮、高窗口及深色下可读",async({page}) => {
  const d=fixture();d.projects[0].name="用于检验标题布局的长中文科研名称".repeat(16);d.tasks[0].name="逐项核对不同随访窗口的统计结果并记录尚需重复验证的证据".repeat(3);
  await seed(page,d);
  for(const [width,height,theme] of [[900,650,"light"],[720,560,"light"],[900,900,"light"],[900,650,"dark"]] as const) {
    await page.setViewportSize({width,height});
    await page.evaluate(theme=>{const d=JSON.parse(localStorage.getItem("researchflow-v1")!);d.settings.theme=theme;localStorage.setItem("researchflow-v1",JSON.stringify(d));window.dispatchEvent(new Event("researchflow-changed"));},theme);
    await expect(page.locator("html")).toHaveAttribute("data-theme",theme);
    await expect(page.locator(".recent-row")).toHaveCount(height<=600 ? 2 : 3);
    await expect(page.getByRole("button",{name:"开始专注",exact:true})).toBeInViewport({ratio:1});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
    const names=await page.locator(".recent-row").evaluateAll(rows=>rows.map(r=>r.getBoundingClientRect().height));expect(new Set(names).size).toBe(1);
    await page.screenshot({path:`artifacts/ResearchFlow_1.7.2/regression-screenshots/overview-${width}x${height}-${theme}.png`});
  }
});

test("无分组行动不借用阶段，无项目概览没有空卡片堆叠",async({page}) => {
  const d=fixture();delete d.tasks[0].milestoneId;await seed(page,d);
  await expect(page.locator(".overview-stage")).toContainText("未分组行动");
  await page.evaluate(()=>{const d=JSON.parse(localStorage.getItem("researchflow-v1")!);d.projects=[];d.tasks=[];d.milestones=[];d.planPeriods=[];delete d.settings.focusProjectId;localStorage.setItem("researchflow-v1",JSON.stringify(d));window.dispatchEvent(new Event("researchflow-changed"));});
  await expect(page.getByRole("button",{name:"新建项目",exact:true})).toBeVisible();
  await expect(page.locator(".action-card,.overview-timeline,.overview-records")).toHaveCount(0);
  await page.screenshot({path:"artifacts/ResearchFlow_1.7.2/regression-screenshots/overview-empty.png"});
});
