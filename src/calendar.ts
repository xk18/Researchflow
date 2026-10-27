import { AppData, Project } from "./types";
import { addDays, dayNumber, monthWeeks } from "./dates";
import { PlanningPeriod, MILESTONE_STATUS } from "./planning";

export const PROJECT_TONES = ["sage", "coral", "sand", "mint", "blue", "lavender"] as const;
// Identity-based, not array position: rename, filtering and month changes keep the color.
export function projectTone(id: string) {
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return PROJECT_TONES[(hash >>> 0) % PROJECT_TONES.length];
}
export interface CalendarEntry {
  project: Project;
  periods: PlanningPeriod[];
  stageNames: string[];
  nodes: { id: string; kind: "target" | "start" | "stage"; label: string }[];
}
export function calendarMonth(data: AppData, month: string) {
  const weeks = monthWeeks(month), days = weeks.flat();
  const first = days[0], last = days.at(-1)!;
  const projects = new Map(data.projects.map(p => [p.id, p]));
  const grouped = new Map(days.map(day => [day, new Map<string, CalendarEntry>()]));
  function entry(day: string, projectId: string) {
    const project = projects.get(projectId), bucket = grouped.get(day);
    if (!project || !bucket) return;
    if (!bucket.has(projectId)) bucket.set(projectId, { project, periods: [], stageNames: [], nodes: [] });
    return bucket.get(projectId)!;
  }
  // Clip before iterating: at most 42 dates per stored period, with no writes.
  for (const period of data.planPeriods) {
    const start = period.startDate < first ? first : period.startDate;
    const end = period.endDate > last ? last : period.endDate;
    if (start > end) continue;
    const count = dayNumber(end) - dayNumber(start) + 1;
    const stage = data.milestones.find(m => m.id === period.milestoneId && m.projectId === period.projectId);
    for (let i = 0; i < count; i++) {
      const item = entry(addDays(start, i), period.projectId);
      item?.periods.push(period);
      if (item && stage && !item.stageNames.includes(stage.name)) item.stageNames.push(stage.name);
    }
  }
  for (const project of data.projects) {
    if (project.targetDate) entry(project.targetDate, project.id)?.nodes.push({ id: `target:${project.id}`, kind: "target", label: "项目目标完成日期" });
    if (project.startDate) entry(project.startDate, project.id)?.nodes.push({ id: `start:${project.id}`, kind: "start", label: "项目启动日期" });
  }
  for (const stage of data.milestones) {
    const date = stage.targetDate || stage.endDate;
    if (date) entry(date, stage.projectId)?.nodes.push({ id: stage.id, kind: "stage", label: `阶段 · ${stage.name} · ${MILESTONE_STATUS[stage.status]}` });
  }
  return { weeks, days: new Map([...grouped].map(([day, entries]) => [day, [...entries.values()].sort((a,b) =>
    Number(b.nodes.some(n => n.kind !== "start")) - Number(a.nodes.some(n => n.kind !== "start")) ||
    Number(b.project.priority) - Number(a.project.priority) || a.project.id.localeCompare(b.project.id))])) };
}
export function calendarEntryTitle(entry: CalendarEntry) {
  return [entry.project.name,
    ...entry.stageNames.map(name => `研究阶段 · ${name}`),
    ...entry.periods.map(p => `${p.projectDates ? "项目日期" : p.name || "计划时段"} · ${p.startDate} 至 ${p.endDate}`),
    ...entry.nodes.map(n => n.label),
  ].join("\n");
}
