import { test, expect } from "@playwright/test";
import { base, emptyData } from "../../src/types";

test("时间轴偏好写入失败可重试，不误报已保存",async({page})=>{
  const data=emptyData(); data.settings.onboarding="skipped";
  data.projects.push({...base(),id:"p",name:"已有研究",background:"",track:"explore",status:"active",priority:false});
  await page.addInitScript(data=>localStorage.setItem("researchflow-v1",JSON.stringify(data)),data);
  await page.addInitScript(()=>{
    const original=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value){
      if(key==="researchflow-ui-overview-timeline-collapsed" && !sessionStorage.getItem("allow-preference")) throw Error("模拟磁盘不可写");
      return original.call(this,key,value);
    };
  });
  await page.goto("/");await page.getByRole("button",{name:"收起近期时间轴"}).click();
  await expect(page.getByRole("status")).toContainText("显示偏好未保存");
  await expect(page.getByRole("button",{name:"收起近期时间轴"})).toHaveAttribute("aria-expanded","true");
  await page.evaluate(()=>sessionStorage.setItem("allow-preference","true"));
  await page.getByRole("button",{name:"收起近期时间轴"}).click();await page.reload();
  await expect(page.getByRole("button",{name:"展开近期时间轴"})).toBeVisible();
});
test("大量近期项目都可达，折叠卸载泳道而保留数据",async({page})=>{
  const d=emptyData();
  for(let i=0;i<40;i++) {
    d.projects.push({...base(),id:`p${i}`,name:`科研项目 ${i}`,background:"",track:"explore",status:"active",priority:false,targetDate:"2026-10-20"});
    for(let j=0;j<3;j++) d.planPeriods.push({...base(),projectId:`p${i}`,name:`时段${j}`,note:"",priority:false,startDate:"2026-10-10",endDate:"2026-10-18"});
  }
  await page.clock.setFixedTime(new Date("2026-10-12T12:00:00+08:00"));await page.goto("/");
  await page.evaluate(d=>localStorage.setItem("researchflow-v1",JSON.stringify(d)),d);await page.reload();
  await expect(page.locator(".recent-row")).toHaveCount(3);
  await expect(page.locator(".recent-summary")).toContainText("显示 3 / 40");
  await page.getByRole("button",{name:"完整规划",exact:true}).click();
  await expect(page.locator(".timeline-grid")).toContainText("科研项目 39");
  await page.getByRole("button",{name:"概览",exact:true}).click();
  await page.getByRole("button",{name:"收起近期时间轴"}).click();
  await expect(page.locator(".recent-row")).toHaveCount(0);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem("researchflow-v1")!).planPeriods.length)).toBe(120);
});
