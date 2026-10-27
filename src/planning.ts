import { AppData, Milestone, Project, ProjectPlanPeriod, base } from "./types";
import { dayNumber, includesDay, localDate, validDate } from "./dates";
export const MILESTONE_STATUS = {
  todo: "未开始",
  doing: "进行中",
  done: "已完成",
};
// A read-only projection keeps project dates in one place. Never persist these rows.
export interface PlanningPeriod extends ProjectPlanPeriod {
  projectDates?: true;
}
export function planningPeriods(d: AppData): PlanningPeriod[] {
  const projects: PlanningPeriod[] = d.projects
    .filter((p) => p.startDate && p.targetDate &&
      p.status !== "archived" && p.status !== "terminated")
    .map((p) => ({
      id: `project-dates:${p.id}`, projectId: p.id, name: p.name,
      note: "项目日期 · 修改项目后自动同步", startDate: p.startDate!,
      endDate: p.targetDate!, priority: p.priority, projectDates: true,
      createdAt: p.createdAt, updatedAt: p.updatedAt,
    }));
  return [...projects, ...d.planPeriods];
}
/** Suggestions never create a daily assignment or alter a project's dates. */
export function withinProjectDates(p: Project, date: string) {
  return validDate(date) && !!(p.startDate || p.targetDate) &&
    (!p.startDate || p.startDate <= date) && (!p.targetDate || date <= p.targetDate);
}
export function schedulingProjects(d: AppData, date: string, includeId?: string) {
  return d.projects.filter(p => p.status === 'active' || p.id === includeId)
    .map((p, index) => ({ p, index }))
    .sort((a, b) => Number(withinProjectDates(b.p, date)) - Number(withinProjectDates(a.p, date)) || a.index - b.index)
    .map(x => x.p);
}
export function currentProjects(d: AppData, today = localDate()): Project[] {
  const active = d.projects.filter((p) => p.status === "active");
  const ids = new Set(
    planningPeriods(d)
      .filter((p) => p.priority && includesDay(p.startDate, p.endDate, today))
      .map((p) => p.projectId),
  );
  const planned = active.filter((p) => ids.has(p.id));
  return planned.length ? planned : active.filter((p) => p.priority);
}
export function focusedProject(
  d: AppData,
  today = localDate(),
): Project | undefined {
  const manual = d.projects.find(
    (p) => p.id === d.settings.focusProjectId && p.status === "active",
  );
  return (
    manual ||
    focusProjectOptions(d, today)[0] ||
    d.projects.find((p) => p.status === "active")
  );
}
/** Scheduled active projects first; otherwise all active projects, in stable order. */
export function focusProjectOptions(d: AppData, today = localDate()): Project[] {
  const active = d.projects.filter(p => p.status === 'active');
  const ids = new Set(planningPeriods(d).filter(p => includesDay(p.startDate,p.endDate,today)).map(p => p.projectId));
  const scheduled = active.filter(p => ids.has(p.id));
  if (!scheduled.length) return active;
  const manual = active.find(p => p.id === d.settings.focusProjectId);
  return manual && !ids.has(manual.id) ? [...scheduled,manual] : scheduled;
}
export function cycleFocusProject(d: AppData, direction: -1 | 1, today = localDate()) {
  const options = focusProjectOptions(d,today);
  if (options.length < 2) return options[0];
  const current = options.findIndex(p => p.id === d.settings.focusProjectId);
  return options[(Math.max(0,current) + direction + options.length) % options.length];
}
export function orderedMilestones(d: AppData, pid: string) {
  return d.milestones
    .filter((m) => m.projectId === pid)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}
export function currentMilestone(d: AppData, pid: string) {
  const list = orderedMilestones(d, pid);
  return (
    list.find((m) => m.status === "doing") ||
    list.find((m) => m.status !== "done")
  );
}
export function validateRange(start?: string, end?: string, target?: string) {
  for (const date of [start, end, target])
    if (date && !validDate(date))
      throw Error("日期无效，请使用 1900–2199 年的真实日期。");
  if (start && end && start > end) throw Error("开始日期不能晚于结束日期。");
}
export function batchNames(input: string): {
  names: string[];
  duplicates: string[];
} {
  const names = input
    .split(/\r?\n/)
    .map((n) => n.trim())
    .filter(Boolean);
  if (names.length > 50) throw Error("一次最多添加 50 个阶段。");
  if (names.some((n) => n.length > 200))
    throw Error("阶段名称最多 200 个字符。");
  return {
    names,
    duplicates: [...new Set(names.filter((n, i) => names.indexOf(n) !== i))],
  };
}
export function addMilestones(d: AppData, pid: string, names: string[]) {
  if (!d.projects.some((p) => p.id === pid)) throw Error("项目已不存在。");
  const order =
    Math.max(-1, ...orderedMilestones(d, pid).map((m) => m.order)) + 1;
  names.forEach((name, i) =>
    d.milestones.push({
      ...base(),
      projectId: pid,
      name,
      description: "",
      outcome: "",
      order: order + i,
      status: "todo",
    }),
  );
}
export function moveMilestone(d: AppData, id: string, direction: -1 | 1) {
  const item = d.milestones.find((m) => m.id === id);
  if (!item) return;
  const list = orderedMilestones(d, item.projectId),
    index = list.findIndex((m) => m.id === id),
    next = index + direction;
  if (next < 0 || next >= list.length) return;
  [list[index], list[next]] = [list[next], list[index]];
  const now = new Date().toISOString();
  list.forEach((m, i) => {
    m.order = i;
    m.updatedAt = now;
  });
}
export function deleteMilestone(d: AppData, id: string) {
  const owner = d.milestones.find(m => m.id === id)?.parentMilestoneId;
  d.milestones = d.milestones.filter((m) => m.id !== id);
  const now = new Date().toISOString();
  d.planPeriods.forEach(p => {
    if (p.milestoneId === id) { delete p.milestoneId; p.updatedAt = now; }
  });
  d.milestones.forEach(m => {
    if (m.parentMilestoneId === id) { m.parentMilestoneId = owner; m.updatedAt = now; }
  });
  d.tasks.forEach((t) => {
    if (t.milestoneId === id) {
      delete t.milestoneId;
      t.updatedAt = now;
    }
  });
  d.projects.forEach((p) => {
    if (p.snapshot?.milestoneId === id) {
      delete p.snapshot.milestoneId;
      p.snapshot.updatedAt = now;
    }
  });
}
export function milestoneProgress(d: AppData, m: Milestone) {
  const tasks = d.tasks.filter((t) => t.milestoneId === m.id);
  return {
    done: tasks.filter((t) => t.status === "done").length,
    total: tasks.length,
  };
}
// Inclusive dates: adjacent, non-overlapping ranges can share one lane.
export function rangeLanes<
  T extends { id: string; startDate: string; endDate: string },
>(items: T[], start: string, end: string) {
  const occupied: number[] = [];
  return items
    .filter((p) => p.endDate >= start && p.startDate <= end)
    .sort(
      (a, b) =>
        a.startDate.localeCompare(b.startDate) ||
        a.endDate.localeCompare(b.endDate) ||
        a.id.localeCompare(b.id),
    )
    .map((item) => {
      const a = dayNumber(item.startDate < start ? start : item.startDate),
        b = dayNumber(item.endDate > end ? end : item.endDate);
      let lane = occupied.findIndex((last) => last < a);
      if (lane < 0) lane = occupied.length;
      occupied[lane] = b;
      return { item, lane, start: a - dayNumber(start), length: b - a + 1 };
    });
}
