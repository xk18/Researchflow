import { describe, expect, it } from "vitest";
import { base, emptyData } from "../src/types";
import { mergeBackup, parseBackup, recommend } from "../src/domain";
import { currentMilestone } from "../src/planning";
import { createSampleData, loadSamples, needsWelcome, removeSamples, retainSample, sampleInventory } from "../src/samples";
const seed = () => createSampleData("2026-10-14");
describe("浅色默认与首次使用兼容", () => {
  it("无偏好默认浅色；已存主题完整保留", () => {
    expect(emptyData().settings.theme).toBe("light");
    for (const theme of ["dark","light","system"] as const) { const d=emptyData(); d.settings.theme=theme; expect(parseBackup(JSON.stringify(d)).settings.theme).toBe(theme); }
    const d=emptyData() as unknown as {settings:Record<string,unknown>}; delete d.settings.theme;
    expect(parseBackup(JSON.stringify(d)).settings.theme).toBe("light");
  });
  it("旧版空工作区、真实记录和明确跳过均不重复引导", () => {
    const d=emptyData(); expect(needsWelcome(d)).toBe(true);
    d.revision=1; expect(needsWelcome(d)).toBe(false); d.revision=0;
    d.settings.onboarding="skipped"; expect(needsWelcome(d)).toBe(false);
    delete d.settings.onboarding; d.ideas.push({...base(),text:"真实灵感",archived:false}); expect(needsWelcome(d)).toBe(false);
  });
  it("非法标识和首次使用字段被拒绝", () => {
    const d=seed(); (d.settings as unknown as Record<string,unknown>).onboarding="bad"; expect(()=>parseBackup(JSON.stringify(d))).toThrow();
    const s=seed(); s.projects[0].sampleBaseline="invalid"; expect(()=>parseBackup(JSON.stringify(s))).toThrow();
  });
});
describe("完整科研示例", () => {
  it("正式模型往返，六阶段与独立分析行动齐全，状态一致", () => {
    const d=seed(), p=d.projects[0], stages=d.milestones.filter(x=>x.projectId===p.id);
    expect(d.projects).toHaveLength(3); expect(parseBackup(JSON.stringify(d))).toEqual(d);
    expect(stages.map(x=>x.name)).toEqual(["下载数据","撰写代码","整理结果数据","绘图","完成最终写作","投稿"]);
    expect(stages.map(x=>x.status)).toEqual(["done","doing","todo","todo","todo","todo"]);
    expect(d.tasks.filter(x=>x.milestoneId===stages[0].id)).toHaveLength(2);
    const code=d.tasks.filter(x=>x.milestoneId===stages[1].id);
    expect(code).toHaveLength(9); expect(code.find(x=>x.name==="编写主模型分析代码。")?.status).toBe("todo");
    expect(code.find(x=>x.name==="编写敏感性分析代码。")?.status).toBe("todo");
    expect(currentMilestone(d,p.id)?.name).toBe("撰写代码"); expect(recommend(d)?.name).toBe("编写主模型分析代码。");
    expect(d.results).toHaveLength(0); expect(d.focusSessions).toHaveLength(0);
    expect(sampleInventory(d).every(x=>!x.modified)).toBe(true);
    for(const m of d.milestones) if(m.status==="done") expect(d.tasks.filter(t=>t.milestoneId===m.id).every(t=>t.status==="done")).toBe(true);
  });
  it("B、C 各五阶段且分别体现探索和交付", () => {
    const d=seed(); expect(d.projects.map(p=>p.track)).toEqual(["deliver","explore","deliver"]);
    expect(d.milestones.filter(x=>x.projectId===d.projects[1].id).map(x=>x.status)).toEqual(["doing","todo","todo","todo","todo"]);
    expect(d.milestones.filter(x=>x.projectId===d.projects[2].id).map(x=>x.status)).toEqual(["done","doing","todo","todo","todo"]);
  });
  it("日期基于加载日一次生成，保存重读不漂移", () => {
    const d=seed(); expect(d.projects[0].targetDate).toBe("2027-01-06"); expect(d.planPeriods.some(x=>x.startDate<="2026-10-14"&&x.endDate>="2026-10-14")).toBe(true);
    expect(parseBackup(JSON.stringify(d)).planPeriods).toEqual(d.planPeriods);
  });
  it("重复、部分、备份合并加载不覆盖修改或复制示例", () => {
    const d=emptyData(), prepared=seed(); expect(loadSamples(d,prepared)).toBe(3);
    const p=d.projects[0]; p.name="自己的改名"; expect(loadSamples(d,seed())).toBe(0); expect(p.name).toBe("自己的改名");
    const x=sampleInventory(d)[1]; removeSamples(d,[{id:x.project.id,fingerprint:x.fingerprint}]);
    expect(loadSamples(d,seed())).toBe(1); expect(d.projects).toHaveLength(3);
    const merged=mergeBackup(d,parseBackup(JSON.stringify(d))); expect(loadSamples(merged,seed())).toBe(0);
  });
});
describe("示例移除保护", () => {
  it.each(["name","task","stage","plan","snapshot","result","session","idea"])("检测 %s 修改或新增", kind => {
    const d=seed(), p=d.projects[0];
    if(kind==="name") p.name="新标题";
    if(kind==="task") d.tasks[0].status="todo";
    if(kind==="stage") d.milestones[0].outcome="新的标准";
    if(kind==="plan") d.planPeriods[0].endDate="2026-10-15";
    if(kind==="snapshot") p.snapshot={...base(),conclusion:"真实内容",questions:"",files:[],blocker:"",nextAction:"下一步"};
    if(kind==="result") d.results.push({...base(),projectId:p.id,observation:"真实观察",hypothesis:"",evidence:"",support:"",interpretation:"",limitations:"",validation:"",significance:""});
    if(kind==="session") d.focusSessions.push({...base(),projectId:p.id,taskId:d.tasks[0].id,mode:"countup",elapsedMs:1000,startedAt:new Date().toISOString(),status:"ended"});
    if(kind==="idea") d.ideas.push({...base(),projectId:p.id,text:"真实想法",archived:false});
    expect(sampleInventory(d)[0].modified).toBe(true);
    const before=structuredClone(d); retainSample(d,p.id);
    expect(d.projects[0].demo).toBeUndefined(); expect(d.tasks.length).toBe(before.tasks.length); expect(d.milestones).toHaveLength(before.milestones.length);
    expect(loadSamples(d,seed())).toBe(0); expect(parseBackup(JSON.stringify(d))).toBeTruthy();
  });
  it("同名真实项目和其他关联记录均完整保留，移除后可再次加载", () => {
    const d=seed(); const real={...base(),name:d.projects[0].name,background:"真实内容",track:"explore" as const,status:"active" as const,priority:false}; d.projects.push(real);
    d.ideas.push({...base(),projectId:real.id,text:"真实灵感",archived:false}); const idea=structuredClone(d.ideas[0]);
    d.settings.theme="dark"; const targets=sampleInventory(d).map(x=>({id:x.project.id,fingerprint:x.fingerprint})); removeSamples(d,targets);
    expect(d.projects).toEqual([real]); expect(d.ideas).toEqual([idea]); expect(d.settings.theme).toBe("dark"); expect(d.tasks).toHaveLength(0);
    expect(loadSamples(d,seed())).toBe(3); expect(d.projects).toHaveLength(4); expect(parseBackup(JSON.stringify(d))).toBeTruthy();
  });
  it("确认期间的新修改阻止整个删除；旧演示默认保留", () => {
    const d=seed(), targets=sampleInventory(d).map(x=>({id:x.project.id,fingerprint:x.fingerprint})); d.tasks[0].note="新输入"; const before=structuredClone(d);
    expect(()=>removeSamples(d,targets)).toThrow(/发生变化/); expect(d).toEqual(before);
    delete d.projects[0].sampleBaseline; expect(sampleInventory(d)[0].modified).toBe(true);
  });
  it("存在未结束计时不允许移除", () => {
    const d=seed(), targets=sampleInventory(d).map(x=>({id:x.project.id,fingerprint:x.fingerprint}));
    d.timer={taskId:d.tasks[0].id,remaining:1000,deadline:0,running:false}; expect(()=>removeSamples(d,targets)).toThrow(/专注/); expect(d.projects).toHaveLength(3);
  });
});
