import { demoData } from "./fixtures";
import { clearPriority } from "../src/domain";
import { base } from "../src/types";
import { describe, it, expect } from "vitest";
import {
  addDays,
  dayNumber,
  daysUntil,
  dueLabel,
  includesDay,
  localDate,
  monthWeeks,
  overlaps,
  validDate,
} from "../src/dates";
import {
  parseBackup,
  mergeBackup,
  recommend,
  projectMarkdown,
} from "../src/domain";
import {
  addMilestones,
  batchNames,
  currentProjects,
  planningPeriods,
  deleteMilestone,
  milestoneProgress,
  moveMilestone,
  rangeLanes,
} from "../src/planning";
import {
  checkpoint,
  completeTask,
  elapsed,
  endFocus,
  pauseFocus,
  resumeFocus,
  startFocus,
} from "../src/focus";
describe("本地日历日期", () => {
  it("首尾年份自然月不越界崩溃", () => {
    expect(monthWeeks("1900-01-01")).toHaveLength(5);
    expect(monthWeeks("2199-12-01").flat()).toContain("2200-01-01");
  });
  it("目标日自然日差和空日期", () => {
    expect(daysUntil("2026-10-30", "2026-10-10")).toBe(20);
    expect(dueLabel("2026-10-30", "2026-10-30")).toBe("今天到期");
    expect(dueLabel("2026-10-30", "2026-10-31")).toContain("1 天");
    expect(dueLabel()).toBe("");
  });
  it.each(["2024-02-29", "2026-12-31", "1900-01-01", "2199-12-31"])(
    "合法日期 %s",
    (d) => expect(validDate(d)).toBe(true),
  );
  it.each([
    "2026-02-29",
    "2026-04-31",
    "2026-13-01",
    "2026-10-00",
    "1899-12-31",
    "2200-01-01",
    "",
    "2026-1-1",
  ])("非法日期 %s", (d) => expect(validDate(d)).toBe(false));
  it("跨年、闰日和 DST 与时区独立", () => {
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(daysUntil("2027-01-01", "2026-12-31")).toBe(1);
    expect(daysUntil("2026-03-09", "2026-03-07")).toBe(2);
    const prior = process.env.TZ;
    try {
      for (const tz of [
        "Asia/Shanghai",
        "America/New_York",
        "Pacific/Honolulu",
      ]) {
        process.env.TZ = tz;
        expect(daysUntil("2026-03-09", "2026-03-07")).toBe(2);
      }
    } finally {
      process.env.TZ = prior;
    }
  });
  it("月历周一起始，真实周数，闰月与跨月", () => {
    for (let m = 1; m <= 12; m++) {
      const month = `2026-${String(m).padStart(2, "0")}-01`,
        weeks = monthWeeks(month);
      expect(new Date(dayNumber(weeks[0][0]) * 86400000).getUTCDay()).toBe(1);
      expect(weeks.every((w) => w.length === 7)).toBe(true);
      expect(
        weeks.flat().filter((d) => d.startsWith(month.slice(0, 7))).length,
      ).toBe(new Date(Date.UTC(2026, m, 0)).getUTCDate());
    }
    expect(monthWeeks("2024-02-01").flat()).toContain("2024-02-29");
    expect(includesDay("2026-10-10", "2026-10-30", "2026-10-30")).toBe(true);
    expect(
      overlaps(
        { startDate: "2026-10-10", endDate: "2026-11-02" },
        { startDate: "2026-11-01", endDate: "2026-11-29" },
      ),
    ).toBe(true);
  });
});
describe("迁移与规划关系", () => {
  it("独立跨月时段与重叠行不合并", () => {
    const items = [
      { id: "a", startDate: "2026-10-10", endDate: "2026-10-20" },
      { id: "b", startDate: "2026-10-18", endDate: "2026-11-03" },
      { id: "c", startDate: "2026-12-01", endDate: "2026-12-05" },
    ];
    const rows = rangeLanes(items, "2026-10-01", "2026-12-31");
    expect(rows.map((r) => r.lane)).toEqual([0, 1, 0]);
    expect(rows[2].start).toBe(61);
    expect(rangeLanes(items, "2026-11-01", "2026-11-30")[0].length).toBe(3);
  });
  it("人工聚焦项目无行动时不推荐其他项目", () => {
    const d = demoData();
    d.settings.focusProjectId = d.projects[0].id;
    d.tasks = d.tasks.filter((t) => t.projectId !== d.projects[0].id);
    expect(recommend(d)).toBeUndefined();
  });
  it("项目Markdown包含新增规划与专注，成果仍保留", () => {
    const d = demoData();
    const p = d.projects[0];
    p.targetDate = "2026-10-30";
    addMilestones(d, p.id, ["数据清洗"]);
    startFocus(d, d.tasks[1], "countup", 0, { token: "x", tick: 0 });
    endFocus(d, { token: "x", tick: 12000 });
    const md = projectMarkdown(p, d);
    expect(md).toContain("数据清洗");
    expect(md).toContain("2026-10-30");
    expect(md).toContain("有效 0.2 分钟");
  });
  it("旧数据迁移幂等，未知字段、ID 和成果不丢失", () => {
    const legacy = demoData() as unknown as Record<string, unknown>;
    legacy.schemaVersion = 1;
    delete legacy.planPeriods;
    delete legacy.milestones;
    delete legacy.focusSessions;
    legacy.customResearch = { name: "保留" };
    const migrated = parseBackup(JSON.stringify(legacy));
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.tasks).toEqual(legacy.tasks);
    expect(migrated.results).toEqual(legacy.results);
    expect(parseBackup(JSON.stringify(migrated))).toEqual(migrated);
    expect(
      (migrated as unknown as Record<string, unknown>).customResearch,
    ).toEqual({ name: "保留" });
  });
  it("旧计时保守迁移为可恢复暂停，同 ID 不重复", () => {
    const d = demoData();
    const legacy = {
      ...d,
      schemaVersion: 1,
      timer: {
        taskId: d.tasks[0].id,
        deadline: 100,
        remaining: 300000,
        running: true,
      },
    };
    const m = parseBackup(JSON.stringify(legacy));
    expect(m.timer?.needsRecovery).toBe(true);
    expect(m.timer?.running).toBe(false);
    expect(parseBackup(JSON.stringify(m)).focusSessions).toHaveLength(1);
  });
  it("多时段和同期主线不覆盖，人工聚焦优先", () => {
    const d = demoData(),
      today = localDate();
    d.planPeriods = [
      {
        ...d.projects[0],
        projectId: d.projects[0].id,
        name: "一",
        note: "",
        startDate: today,
        endDate: addDays(today, 10),
        priority: true,
      },
      {
        ...d.projects[1],
        id: "period-two",
        projectId: d.projects[1].id,
        name: "二",
        note: "",
        startDate: today,
        endDate: addDays(today, 10),
        priority: true,
      },
    ];
    expect(currentProjects(d)).toHaveLength(2);
    d.settings.focusProjectId = d.projects[1].id;
    d.settings.motivation = "high";
    expect(recommend(d)?.projectId).toBe(d.projects[1].id);
  });
  it("批量预览保留重复，限制标题与数量", () => {
    expect(batchNames("\n A \n\nA\nB ")).toEqual({
      names: ["A", "A", "B"],
      duplicates: ["A"],
    });
    expect(() => batchNames("x\n".repeat(51))).toThrow();
    expect(() => batchNames("x".repeat(201))).toThrow();
  });
  it("阶段排序、手动完成、删除后任务与快照保留", () => {
    const d = demoData(),
      p = d.projects[0];
    addMilestones(d, p.id, ["清洗", "分析"]);
    const m = d.milestones[0];
    d.tasks[1].milestoneId = m.id;
    d.tasks[1].status = "done";
    p.snapshot = {
      ...p,
      conclusion: "结论",
      questions: "",
      blocker: "",
      nextAction: "下一步",
      files: ["C:/data.csv"],
      milestoneId: m.id,
      taskId: d.tasks[1].id,
    };
    expect(milestoneProgress(d, m)).toEqual({ done: 1, total: 1 });
    expect(m.status).toBe("todo");
    moveMilestone(d, m.id, 1);
    expect(d.milestones[0].order).toBe(1);
    deleteMilestone(d, m.id);
    expect(d.tasks[1].milestoneId).toBeUndefined();
    expect(p.snapshot.conclusion).toBe("结论");
    expect(p.snapshot.files).toHaveLength(1);
    expect(p.snapshot.milestoneId).toBeUndefined();
    expect(parseBackup(JSON.stringify(d))).toEqual(d);
  });
  it("非法日期、引用和重复新增 ID 都拒绝", () => {
    const d = demoData();
    addMilestones(d, d.projects[0].id, ["阶段"]);
    d.milestones[0].targetDate = "2026-02-30";
    expect(() => parseBackup(JSON.stringify(d))).toThrow();
    delete d.milestones[0].targetDate;
    d.tasks[0].milestoneId = d.milestones[0].id;
    expect(() => parseBackup(JSON.stringify(d))).toThrow();
    delete d.tasks[0].milestoneId;
    d.milestones[0].id = d.projects[0].id;
    expect(() => parseBackup(JSON.stringify(d))).toThrow();
  });
  it("新集合重复合并不重复，较新阶段保留", () => {
    const d = demoData();
    addMilestones(d, d.projects[0].id, ["阶段"]);
    const other = structuredClone(d);
    other.milestones[0].name = "修改阶段";
    other.milestones[0].updatedAt = new Date(Date.now() + 1000).toISOString();
    expect(mergeBackup(mergeBackup(d, other), other).milestones).toHaveLength(
      1,
    );
    expect(mergeBackup(d, other).milestones[0].name).toBe("修改阶段");
  });
});
describe("专注状态机", () => {
  const clock = (tick: number) => ({ token: "native-test", tick });
  it("自定义 90 分钟，暂停不累加、继续后正确结束", () => {
    const d = demoData();
    startFocus(d, d.tasks[0], "countdown", 90, clock(100));
    expect(elapsed(d.timer!, clock(1800100))).toBe(1800000);
    pauseFocus(d, clock(1800100));
    expect(elapsed(d.timer!, clock(2400100))).toBe(1800000);
    resumeFocus(d, clock(2400100));
    endFocus(d, clock(6000100));
    expect(d.focusSessions[0].elapsedMs).toBe(5400000);
    expect(d.tasks[0].status).toBe("todo");
    expect(d.focusSessions[0].status).toBe("ended");
    endFocus(d, clock(7000000));
    expect(d.focusSessions).toHaveLength(1);
  });
  it("时间到不自动完成，确认后超时继续工作", () => {
    const d = demoData();
    startFocus(d, d.tasks[0], "countdown", 1, clock(0));
    checkpoint(d, clock(70000));
    expect(d.timer?.awaitingDecision).toBe(true);
    expect(d.timer?.elapsedMs).toBe(60000);
    expect(d.tasks[0].status).not.toBe("done");
    resumeFocus(d, clock(90000));
    endFocus(d, clock(100000));
    expect(d.focusSessions[0].elapsedMs).toBe(70000);
  });
  it("正计时多次同任务，重复结束不生成新会话", () => {
    const d = demoData();
    startFocus(d, d.tasks[0], "countup", 0, clock(0));
    pauseFocus(d, clock(12000));
    resumeFocus(d, clock(25000));
    endFocus(d, clock(45000));
    expect(d.focusSessions[0].elapsedMs).toBe(32000);
    startFocus(d, d.tasks[0], "countup", 0, clock(50000));
    completeTask(d, d.tasks[0].id, clock(70000));
    expect(d.tasks[0].status).toBe("done");
    expect(d.focusSessions).toHaveLength(2);
    expect(parseBackup(JSON.stringify(d))).toEqual(d);
  });
  it("进程变化、安全异常恢复与时钟回退", () => {
    const d = demoData();
    startFocus(d, d.tasks[0], "countup", 0, clock(1000));
    checkpoint(d, clock(5000));
    checkpoint(d, { token: "restarted", tick: 999999999 });
    expect(d.timer?.elapsedMs).toBe(4000);
    expect(d.timer?.running).toBe(false);
    expect(d.timer?.needsRecovery).toBe(true);
    expect(
      elapsed(
        { ...d.timer!, running: true, startedTick: 1000 },
        { token: "restarted", tick: 500 },
      ),
    ).toBe(4000);
  });
  it.each([0, -1, 241, 1.5, NaN])("拒绝非法时长 %s", (m) => {
    const d = demoData();
    expect(() => startFocus(d, d.tasks[0], "countdown", m, clock(0))).toThrow();
    expect(d.focusSessions).toHaveLength(0);
  });
});


describe("项目日期单一来源与重点切换", () => {
  it("日期修改和清空更新规划投影，不新增或覆盖独立时段", () => {
    const d = demoData(), p = d.projects[0];
    p.startDate = "2026-10-10"; p.targetDate = "2026-10-30";
    d.planPeriods.push({ ...base(), projectId: p.id, name: "额外验证", note: "", startDate: "2026-12-01", endDate: "2026-12-20", priority: false });
    const before = structuredClone(d.planPeriods);
    expect(planningPeriods(d).find((x) => x.projectDates)?.endDate).toBe("2026-10-30");
    p.targetDate = "2026-11-05";
    expect(planningPeriods(d).find((x) => x.projectDates)?.endDate).toBe("2026-11-05");
    expect(d.planPeriods).toEqual(before);
    delete p.startDate;
    expect(planningPeriods(d)).toEqual(before);
    expect(parseBackup(JSON.stringify(d)).projects[0].targetDate).toBe("2026-11-05");
  });
  it("旧项目无需补日期；非法启动日期和反向日期拒绝导入", () => {
    const d = demoData();
    expect(parseBackup(JSON.stringify(d)).projects[0].startDate).toBeUndefined();
    d.projects[0].startDate = "2026-02-30";
    expect(() => parseBackup(JSON.stringify(d))).toThrow();
    Object.assign(d.projects[0], { startDate: "2026-11-01", targetDate: "2026-10-30" });
    expect(() => parseBackup(JSON.stringify(d))).toThrow();
    d.projects[0].targetDate = "2026-11-10";
    expect(parseBackup(JSON.stringify(d)).projects[0].startDate).toBe("2026-11-01");
  });
  it("取消重点释放该项目的计划和手动选择，保留其他项目和科研记录", () => {
    const d = demoData(), p = d.projects[0], q = d.projects[1];
    d.settings.focusProjectId = p.id;
    for (const pid of [p.id, q.id]) d.planPeriods.push({ ...base(), projectId: pid, name: "研究", note: "", startDate: "2026-10-01", endDate: "2026-10-30", priority: true });
    const records = structuredClone({ tasks: d.tasks, results: d.results, milestones: d.milestones });
    clearPriority(d, p);
    expect(p.priority).toBe(false);
    expect(d.settings.focusProjectId).toBeUndefined();
    expect(d.planPeriods[0].priority).toBe(false);
    expect(d.planPeriods[1].priority).toBe(true);
    expect(currentProjects(d, "2026-10-10").map((p) => p.id)).toEqual([q.id]);
    expect({ tasks: d.tasks, results: d.results, milestones: d.milestones }).toEqual(records);
  });
});
