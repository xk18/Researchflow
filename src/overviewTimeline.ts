import { AppData, Milestone, Project } from "./types";
import { addDays, dayNumber, includesDay } from "./dates";
import { PlanningPeriod, rangeLanes } from "./planning";

export interface TimelineNode {
  id: string;
  date: string;
  name: string;
  kind: "stage" | "target" | "start";
  status?: Milestone["status"];
  milestoneId?: string;
}
export function stageNode(m: Milestone): TimelineNode | undefined {
  const date = m.targetDate || m.endDate || m.startDate;
  if (!date) return;
  return { id: m.id, date, name: `${m.name} · ${m.targetDate ? "阶段目标" : m.endDate ? "阶段计划结束" : "阶段开始"}`,
    kind: "stage", status: m.status, milestoneId: m.id };
}
export function overviewRange(today: string) {
  return { start: addDays(today, -7), end: addDays(today, 27), days: 35 };
}
export function timelineIndex(data: AppData) {
  const periods = new Map<string, PlanningPeriod[]>(), stages = new Map<string, Milestone[]>();
  for (const p of data.planPeriods) {
    if (!periods.has(p.projectId)) periods.set(p.projectId, []);
    periods.get(p.projectId)!.push(p);
  }
  for (const m of data.milestones) {
    if (!stages.has(m.projectId)) stages.set(m.projectId, []);
    stages.get(m.projectId)!.push(m);
  }
  return { periods, stages };
}
export function recentTimeline(data: AppData, today: string) {
  const range = overviewRange(today), { start, end } = range;
  const index = timelineIndex(data);
  const inRange = (date?: string) => !!date && includesDay(start, end, date);
  const intersects = (a?: string, b?: string) => !!a && !!b && a <= end && b >= start;
  const eligible = data.projects.filter(p => p.status === "active" || p.status === "paused");
  const nextDates: { date: string; project: Project }[] = [];
  let datedProjects = 0, overdue = 0;
  const rows = eligible.flatMap(project => {
    const explicit = index.periods.get(project.id) || [], stages = index.stages.get(project.id) || [];
    const nodes: TimelineNode[] = stages.map(stageNode).filter((n): n is TimelineNode => !!n);
    if (project.startDate) nodes.push({ id: `start:${project.id}`, date: project.startDate, name: "项目开始", kind: "start" });
    if (project.targetDate) nodes.push({ id: `target:${project.id}`, date: project.targetDate, name: "项目目标", kind: "target" });
    const periods: PlanningPeriod[] = explicit.length ? explicit : project.startDate && project.targetDate ? [{
      ...project, projectId: project.id, id: `project-dates:${project.id}`, startDate: project.startDate,
      endDate: project.targetDate, note: "项目日期（未细分投入时段）", projectDates: true,
    }] : [];
    const dates = [...nodes.map(n => n.date), ...explicit.flatMap(p => [p.startDate, p.endDate])];
    if (dates.length) datedProjects++;
    dates.filter(d => d > end).forEach(date => nextDates.push({ date, project }));
    if (project.status === "active") overdue += stages.filter(m => m.status !== "done" && (m.targetDate || m.endDate || "9999") < start).length;
    const visibleNodes = nodes.filter(n => inRange(n.date)).sort((a,b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const lanes = rangeLanes(periods, start, end);
    const rangeOnly = stages.filter(m => intersects(m.startDate, m.endDate) && !visibleNodes.some(n => n.id === m.id));
    if (!lanes.length && !visibleNodes.length && !rangeOnly.length) return [];
    const focused = project.id === data.settings.focusProjectId || project.priority || explicit.some(p => p.priority && includesDay(p.startDate, p.endDate, today));
    const isToday = periods.some(p => includesDay(p.startDate, p.endDate, today)) || stages.some(m => intersects(m.startDate, m.endDate) && includesDay(m.startDate!, m.endDate!, today)) || nodes.some(n => n.date === today);
    const imminent = nodes.some(n => n.kind !== "start" && n.status !== "done" && n.date >= today && n.date <= addDays(today, 7));
    const group = project.status === "paused" ? 4 : focused ? 0 : isToday ? 1 : imminent ? 2 : 3;
    const next = dates.filter(d => d >= today).sort()[0] || "9999";
    return [{ project, lanes, nodes: visibleNodes, rangeOnly, focused, group, next }];
  }).sort((a,b) => a.group-b.group || a.next.localeCompare(b.next) || a.project.createdAt.localeCompare(b.project.createdAt) || a.project.id.localeCompare(b.project.id));
  nextDates.sort((a,b) => a.date.localeCompare(b.date) || a.project.id.localeCompare(b.project.id));
  const unscheduled = eligible.filter(p => p.status === "active" && (p.priority || p.id === data.settings.focusProjectId) && !rows.some(r => r.project.id === p.id) &&
    !p.startDate && !p.targetDate && !(index.periods.get(p.id)?.length) && !(index.stages.get(p.id)?.some(m => m.startDate || m.endDate || m.targetDate)));
  return { ...range, rows, unscheduled, overdue, nextPlan: nextDates[0], empty: data.projects.length === 0 ? "projects" : eligible.length === 0 ? "inactive" : datedProjects === 0 ? "undated" : nextDates.length ? "future" : "past" };
}

// A presentation-only projection. Never change the research focus or source arrays.
export function previewTimeline(model: ReturnType<typeof recentTimeline>, data: AppData, today: string, limit: number) {
  const timerProject = data.tasks.find(t => t.id === data.timer?.taskId)?.projectId;
  const rank = (row: typeof model.rows[number]) => {
    if (row.project.status === "active" && row.project.id === data.settings.focusProjectId) return 0;
    if (row.project.id === timerProject) return 1;
    if (row.project.status === "paused") return 6;
    if (row.nodes.some(n => n.kind !== "start" && n.status !== "done" && n.date >= today && n.date <= addDays(today, 7))) return 2;
    if (row.lanes.some(l => l.item.priority && l.item.endDate >= today)) return 3;
    return row.focused || row.group === 1 ? 4 : 5;
  };
  return [...model.rows].sort((a,b) => rank(a)-rank(b) || a.next.localeCompare(b.next) ||
    a.project.createdAt.localeCompare(b.project.createdAt) || a.project.id.localeCompare(b.project.id)).slice(0, Math.max(0, limit));
}
// Group nearby screen positions; retain every date and source ID in the chooser.
export function groupTimelineNodes(nodes: TimelineNode[], start: string, days: number, width: number) {
  const groups: { nodes: TimelineNode[]; position: number }[] = [];
  for (const node of nodes) {
    const position = (dayNumber(node.date) - dayNumber(start) + .5) / days;
    const last = groups.at(-1);
    if (last && (position - last.position) * width < 28) last.nodes.push(node);
    else groups.push({ nodes: [node], position });
  }
  return groups;
}
