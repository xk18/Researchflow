import { describe, expect, it } from "vitest";
import { base, emptyData } from "../src/types";
import { calendarMonth, projectTone, PROJECT_TONES } from "../src/calendar";

describe("monthly read-only projection", () => {
  it("supports four/five/six rows and boundary months", () => {
    const d = emptyData();
    expect(calendarMonth(d,"2021-02-01").weeks).toHaveLength(4);
    expect(calendarMonth(d,"2026-10-01").weeks).toHaveLength(5);
    expect(calendarMonth(d,"2026-11-01").weeks).toHaveLength(6);
    expect(calendarMonth(d,"2199-12-01").weeks.flat().at(-1)).toMatch(/^2200/);
    expect(calendarMonth(d,"1900-01-01").weeks.flat()[0]).toBe("1900-01-01");
  });
  it("clips cross-month periods, preserves gaps and groups overlaps without merging records", () => {
    const d=emptyData();
    d.projects.push({...base(),id:"p",name:"研究",track:"explore",status:"active",priority:false,background:""});
    for(const [id,startDate,endDate] of [["a","2026-09-29","2026-10-15"],["b","2026-10-14","2026-10-18"],["c","2026-10-23","2026-11-02"]]) d.planPeriods.push({...base(),id,projectId:"p",name:id,startDate,endDate,priority:false,note:""});
    const before=JSON.stringify(d), model=calendarMonth(d,"2026-10-01");
    expect(model.days.get("2026-09-29")?.[0].periods[0].startDate).toBe("2026-09-29");
    expect(model.days.get("2026-10-14")).toHaveLength(1);
    expect(model.days.get("2026-10-14")?.[0].periods.map(p=>p.id)).toEqual(["a","b"]);
    expect(model.days.get("2026-10-20")).toHaveLength(0);
    expect(model.days.get("2026-11-01")?.[0].periods[0].id).toBe("c");
    expect(JSON.stringify(d)).toBe(before);
  });
  it("retains overall dates and every deadline with its actual status", () => {
    const d=emptyData();
    d.projects.push({...base(),id:"p",name:"论文",track:"deliver",status:"active",priority:false,background:"",startDate:"2026-10-01",targetDate:"2026-10-14"});
    d.milestones.push({...base(),id:"m",projectId:"p",name:"复核",status:"todo",order:0,description:"",outcome:"",targetDate:"2026-10-14"});
    const entry=calendarMonth(d,"2026-10-01").days.get("2026-10-14")![0];
    expect(entry.periods).toHaveLength(0);
    expect(calendarMonth(d,"2026-10-01").days.get("2026-10-08")).toHaveLength(0);
    expect(calendarMonth(d,"2026-10-01").days.get("2026-10-01")![0].nodes[0].kind).toBe("start");
    expect(entry.nodes.map(n=>n.kind)).toEqual(["target","stage"]);
    expect(entry.nodes[1].label).toContain("未开始");
    expect(d.planPeriods).toHaveLength(0);
  });
  it("identity colors are stable across filtering, renaming and repeated calculations", () => {
    const ids=Array.from({length:24},(_,i)=>`project-${i}`);
    const original=Object.fromEntries(ids.map(id=>[id,projectTone(id)]));
    for (const id of ids.reverse().slice(2)) expect(projectTone(id)).toBe(original[id]);
    expect(new Set(Object.values(original)).size).toBe(PROJECT_TONES.length);
  });
});
