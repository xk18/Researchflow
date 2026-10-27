import { test, expect, Page } from "@playwright/test";
import { base, emptyData } from "../../src/types";
import { projectTone } from "../../src/calendar";
import { mkdir, writeFile } from "node:fs/promises";

function fixture() {
  const d=emptyData();d.settings.theme="light";
  const names=["实验结果整理与研究论文初稿", "细胞通讯的独立重复验证", "综述证据筛选与框架调整", "算法竞赛与模型误差分析", "实验材料准备与条件优化", "研究方案讨论与预注册"];
  const used=new Set<string>();
  for(let i=0;d.projects.length<6;i++) {
    const id=`project-${i}`,tone=projectTone(id);if(used.has(tone)) continue;used.add(tone);
    const n=d.projects.length;
    d.projects.push({...base(),id,name:names[n],track:n%2 ? "explore":"deliver",status:"active",background:"仅供验收的虚构资料",priority:n===0});
    d.planPeriods.push({...base(),id:`period-${n}`,projectId:id,name:`${names[n]} · 推进时段`,note:"验收示例",priority:n===0,startDate:["2026-10-14","2026-10-05","2026-10-09","2026-10-18","2026-10-14","2026-10-14"][n],endDate:["2026-10-25","2026-10-09","2026-10-19","2026-11-04","2026-10-14","2026-10-14"][n]});
  }
  const p=d.projects[0];p.targetDate="2026-10-25";
  d.planPeriods.push({...base(),id:"overlap",projectId:p.id,name:"额外复核",note:"独立记录不得合并",priority:false,startDate:"2026-10-14",endDate:"2026-10-17"});
  d.planPeriods.push({...base(),id:"later",projectId:p.id,name:"修订",note:"",priority:false,startDate:"2026-11-26",endDate:"2026-12-04"});
  d.milestones.push({...base(),id:"stage",projectId:p.id,name:"敏感性分析结果复核",status:"todo",order:0,description:"",outcome:"",targetDate:"2026-10-14"});
  return d;
}
async function seed(page:Page, d=fixture(), month="2026-10-01") {
  await page.clock.setFixedTime(new Date("2026-10-14T12:00:00+08:00"));
  await page.goto("/");await page.evaluate(d=>localStorage.setItem("researchflow-v1",JSON.stringify(d)),d);
  await page.goto(`/?page=plan&planningDate=${month}`);
  await expect(page.locator(".calendar-week").first()).toBeVisible();
  await mkdir("artifacts/v1.3.1",{recursive:true});
  return d;
}
async function geometry(page:Page) {
  const grid=await page.locator(".calendar-table").boundingBox(), last=await page.locator(".calendar-week").last().boundingBox(), main=await page.locator("main").boundingBox();
  expect(last!.y+last!.height).toBeLessThanOrEqual(main!.y+main!.height);
  expect(grid!.width).toBeGreaterThan(480);
  const overflow=await page.locator(".calendar-tag").evaluateAll(tags=>tags.some(tag=>{const a=tag.getBoundingClientRect(),b=tag.closest(".calendar-day")!.getBoundingClientRect();return a.left<b.left+1 || a.right>b.right-1 || a.bottom>b.bottom-1;}));
  expect(overflow).toBe(false);
  expect(await page.locator(".calendar-scroll").evaluate(e=>e.scrollHeight-e.clientHeight)).toBeLessThanOrEqual(1);
}
test("五周整月可见，每日独立标签，重叠和溢出可达且不写入数据",async({page})=>{
  const d=await seed(page),before=await page.evaluate(()=>localStorage.getItem("researchflow-v1"));
  await geometry(page);await expect(page.locator(".calendar-week")).toHaveCount(5);
  const day=page.locator('[data-date="2026-10-14"]');
  await expect(day.locator(".calendar-more")).toBeVisible();
  await expect(day.locator(`[data-project="${d.projects[0].id}"]`)).toHaveCount(1);
  await page.screenshot({path:"artifacts/v1.3.1/month-light.png",animations:"disabled"});
  await writeFile("artifacts/v1.3.1/fixture.json",JSON.stringify(d));
  await day.locator(".calendar-more").click();
  await expect(page.getByRole("dialog")).toContainText("研究方案讨论与预注册");
  await expect(page.getByRole("dialog")).toContainText("额外复核");
  await expect(page.getByRole("dialog")).toContainText("未开始");
  await page.screenshot({path:"artifacts/v1.3.1/day-dense.png",animations:"disabled"});
  await page.getByRole("button",{name:"关闭对话框"}).click();
  expect(await page.evaluate(()=>localStorage.getItem("researchflow-v1"))).toBe(before);
  const tags=page.locator(`[data-project="${d.projects[0].id}"]`);expect(await tags.count()).toBe(12);
  expect(new Set(await tags.evaluateAll(es=>es.map(e=>e.getAttribute("data-tone")))).size).toBe(1);
});
test("四周、六周、空月和窄窗口保持完整七列与可读字号",async({page})=>{
  await seed(page,fixture(),"2026-11-01");await expect(page.locator(".calendar-week")).toHaveCount(6);await geometry(page);
  await page.screenshot({path:"artifacts/v1.3.1/month-six-weeks.png",animations:"disabled"});
  await page.setViewportSize({width:720,height:560});await geometry(page);
  await page.screenshot({path:"artifacts/v1.3.1/month-narrow.png",animations:"disabled"});
  await page.setViewportSize({width:900,height:650});await page.goto('/?page=plan&planningDate=2021-02-01');
  await expect(page.locator(".calendar-week")).toHaveCount(4);await geometry(page);
  await expect(page.locator(".calendar-tag")).toHaveCount(0);await expect(page.locator(".calendar-legend")).toContainText("本月暂无安排");
  await page.screenshot({path:"artifacts/v1.3.1/month-four-weeks-empty.png",animations:"disabled"});
});
test("编辑时段后月历与时间轴同步，日期选择和键盘焦点可用",async({page})=>{
  const d=await seed(page);
  const tag=page.locator(`[data-date="2026-10-05"] [data-project="${d.projects[1].id}"]`);
  await tag.focus();await expect(tag).toBeFocused();await tag.press("Enter");
  await expect(page.getByRole("heading",{name:"编辑计划时段"})).toBeVisible();
  await page.getByLabel("结束日期（含当天）").fill("2026-10-07");await page.getByRole("button",{name:"保存计划",exact:true}).click();
  await expect(page.locator(`[data-date="2026-10-08"] [data-project="${d.projects[1].id}"]`)).toHaveCount(0);
  await page.getByRole("button",{name:"时间轴",exact:true}).click();await expect(page.locator(".timeline-bar").filter({hasText:d.projects[1].name}).first()).toHaveAttribute("title",/2026-10-07/);
  await page.getByRole("button",{name:"月历",exact:true}).click();
  await page.getByRole("button",{name:/^2026-10-22，/}).click();await page.getByRole("button",{name:"在这一天安排研究"}).click();
  await expect(page.getByLabel("开始日期",{exact:true})).toHaveValue("2026-10-22");
});
test("深色配色可读且一致，放大显示采用局部滚动",async({page})=>{
  const d=fixture();d.settings.theme="dark";await seed(page,d);
  await expect(page.locator("html")).toHaveAttribute("data-theme","dark");
  await geometry(page);
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('.calendar-tag')).every(e=>e.getAnimations().every(a=>a.playState==='finished'))).catch(()=>{});
  await page.locator('.calendar-tag').first().evaluate(async e=>{await Promise.all(e.getAnimations().map(a=>a.finished));});
  const contrast=await page.locator(".calendar-tag:not(.project-dates)").evaluateAll(tags=>{
    const lum=(s:string)=>{const a=s.match(/[\d.]+/g)!.slice(0,3).map(Number).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;});return a[0]*.2126+a[1]*.7152+a[2]*.0722;};
    return tags.map(e=>{const s=getComputedStyle(e),a=lum(s.color),b=lum(s.backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);});
  });expect(Math.min(...contrast)).toBeGreaterThanOrEqual(4.5);
  await page.screenshot({path:"artifacts/v1.3.1/month-dark.png",animations:"disabled"});
  await page.setViewportSize({width:600,height:400});await page.goto('/?page=plan&planningDate=2026-11-01');
  expect(await page.locator(".calendar-scroll").evaluate(e=>e.scrollHeight>e.clientHeight)).toBe(true);
  expect(await page.evaluate(()=>document.body.scrollWidth)).toBe(600);
  await page.locator('[data-date="2026-12-06"] .calendar-date-button').scrollIntoViewIfNeeded();
  await expect(page.locator('[data-date="2026-12-06"] .calendar-date-button')).toBeVisible();
});
