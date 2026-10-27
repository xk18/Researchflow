import { describe, expect, it } from "vitest";
import { base, emptyData, Project } from "../src/types";
import { addDays } from "../src/dates";
import { groupTimelineNodes, overviewRange, previewTimeline, recentTimeline, stageNode } from "../src/overviewTimeline";
import { buildPlanPrompt, missingBrief, PLAN_BRIEF_FIELDS, PlanBrief } from "../src/aiPlan";

const project = (id: string, extra: Partial<Project> = {}): Project => ({...base(),id,name:id,background:"",track:"explore",status:"active",priority:false,...extra});
describe("近期科研时间轴的只读投影", () => {
  it("35个含首尾自然日，跨年不改变范围", () => {
    expect(overviewRange("2026-10-12")).toEqual({start:"2026-10-05",end:"2026-11-08",days:35});
    expect(overviewRange("2026-12-30").end).toBe("2027-01-26");
  });
  it("独立时段保留空档；有窗外独立时段时也不生成总体填色条", () => {
    const d=emptyData(); d.projects=[project("a",{startDate:"2026-01-01",targetDate:"2027-01-01"})];
    d.planPeriods=[0,10].map(i=>({...base(), projectId:"a",name:"实际投入",note:"",priority:false,startDate:addDays("2026-10-10",i),endDate:addDays("2026-10-11",i)}));
    const before=structuredClone(d), model=recentTimeline(d,"2026-10-12");
    expect(model.rows[0].lanes).toHaveLength(2); expect(model.rows[0].lanes.map(l=>l.length)).toEqual([2,2]);
    expect(model.rows[0].lanes[1].start-model.rows[0].lanes[0].start).toBe(10);
    d.planPeriods[0].startDate="2026-12-01";d.planPeriods[0].endDate="2026-12-02";d.planPeriods.pop();
    expect(recentTimeline(d,"2026-10-12").rows).toHaveLength(0);
    expect(before.projects).toEqual(d.projects);
    expect(model.rows[0].lanes.some(l=>l.item.projectDates)).toBe(false);
  });
  it("总体日期为空心来源，单独目标是节点，暂停保留且完成项目隐藏", () => {
    const d=emptyData();d.projects=[project("a",{startDate:"2026-09-01",targetDate:"2026-11-01"}),project("b",{targetDate:"2026-10-20"}),project("c",{status:"paused",targetDate:"2026-10-12"}),project("done",{status:"completed",targetDate:"2026-10-12"})];
    const before=JSON.stringify(d),m=recentTimeline(d,"2026-10-12");
    expect(m.rows.map(r=>r.project.id)).toEqual(["a","b","c"]);
    expect(m.rows.find(r=>r.project.id==="a")!.lanes[0].item.projectDates).toBe(true);
    expect(m.rows.find(r=>r.project.id==="b")!.lanes).toHaveLength(0);
    expect(JSON.stringify(d)).toBe(before);
  });
  it("阶段范围可相交但节点留在真实日期；聚合保留所有ID和日期", () => {
    const d=emptyData();d.projects=[project("a")];d.milestones=[{...base(),projectId:"a",name:"长阶段",description:"",outcome:"",order:0,status:"doing",startDate:"2026-10-01",endDate:"2026-12-01"}];
    const row=recentTimeline(d,"2026-10-12").rows[0];expect(row.rangeOnly).toHaveLength(1);expect(row.nodes).toHaveLength(0);
    const nodes=[0,1,10].map(i=>({id:String(i),date:addDays("2026-10-10",i),kind:"stage" as const,name:"节点"}));
    const groups=groupTimelineNodes(nodes,"2026-10-05",35,320);
    expect(groups.map(g=>g.nodes.length)).toEqual([2,1]);expect(groups.flatMap(g=>g.nodes)).toEqual(nodes);
    expect(stageNode({...d.milestones[0],targetDate:"2026-11-08"})?.date).toBe("2026-11-08");
  });
  it("空状态与无日期重点保留，逾期不自动完成", () => {
    const d=emptyData();expect(recentTimeline(d,"2026-10-12").empty).toBe("projects");
    d.projects=[project("a",{priority:true})];expect(recentTimeline(d,"2026-10-12").unscheduled).toHaveLength(1);
    expect(recentTimeline(d,"2026-10-12").empty).toBe("undated");
    d.projects[0].targetDate="2026-12-01";expect(recentTimeline(d,"2026-10-12").empty).toBe("future");
    d.milestones=[{...base(),projectId:"a",name:"旧阶段",description:"",outcome:"",order:0,status:"doing",targetDate:"2026-09-01"}];
    expect(recentTimeline(d,"2026-10-12").overdue).toBe(1);expect(d.milestones[0].status).toBe("doing");
  });
  it("预览尊重手动主线与未结束专注，截止日期不改变业务数据", () => {
    const d=emptyData();
    d.projects=[project("deadline",{targetDate:"2026-10-13"}),project("manual",{priority:true,targetDate:"2026-11-01"}),project("timer",{targetDate:"2026-10-28"}),project("paused",{status:"paused",targetDate:"2026-10-12"})];
    d.settings.focusProjectId="manual";
    d.tasks=[{...base(),id:"task",projectId:"timer",name:"保留正在执行的行动",note:"",type:"研究",minutes:25,status:"paused"}];
    d.timer={taskId:"task",running:false,deadline:0,remaining:1500};
    const before=structuredClone(d), model=recentTimeline(d,"2026-10-12");
    expect(previewTimeline(model,d,"2026-10-12",3).map(r=>r.project.id)).toEqual(["manual","timer","deadline"]);
    expect(previewTimeline(model,d,"2026-10-12",2).map(r=>r.project.id)).toEqual(["manual","timer"]);
    expect(previewTimeline(model,d,"2026-10-12",0)).toEqual([]);
    expect(d).toEqual(before); expect(model.rows).toHaveLength(4);
  });
  it("预览不复制或合并重叠与不连续时段，无日期主线不伪造范围", () => {
    const d=emptyData();d.settings.focusProjectId="manual";
    d.projects=[project("manual"),project("dated")];
    d.planPeriods=[0,1,15].map(i=>({...base(),projectId:"dated",name:`原始安排${i}`,note:"",priority:false,startDate:addDays("2026-10-10",i),endDate:addDays("2026-10-13",i)}));
    const before=structuredClone(d), model=recentTimeline(d,"2026-10-12");
    const rows=previewTimeline(model,d,"2026-10-12",3);
    expect(rows.map(r=>r.project.id)).toEqual(["dated"]); expect(model.unscheduled.map(p=>p.id)).toEqual(["manual"]);
    expect(rows[0].lanes).toHaveLength(3); expect(rows[0].lanes.filter(l=>l.lane>0)).toHaveLength(1);
    expect(previewTimeline(model,d,"2026-10-12",3)).toEqual(rows);expect(d).toEqual(before);
  });
});
describe("提示词项目前置信息", () => {
  it("缺失标记和项目名称在协作规则前，完整填写不再显示待填标记", () => {
    const prompt=buildPlanPrompt('实验"A"');expect(prompt.startsWith("【先核对项目资料")).toBe(true);
    expect(prompt.indexOf("项目名称：")).toBeLessThan(prompt.indexOf("你是一位科研"));
    expect(missingBrief({})).toHaveLength(7);
    const info:PlanBrief=Object.fromEntries(PLAN_BRIEF_FIELDS.map(f=>[f.key,`已填写${f.label}`]));
    const full=buildPlanPrompt('实验"A"',info);expect(full).not.toContain("【待填写");expect(full).toContain('"projectName": "实验\\"A\\""');
    for(const field of PLAN_BRIEF_FIELDS) expect(full).toContain(`${field.label}：已填写${field.label}`);
  });
});
