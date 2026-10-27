import { AppData } from "./types";
import { validDate } from "./dates";
export function upgradeAndValidate(data: unknown): AppData {
  // The caller already validated legacy fields. Preserve unknown business fields.
  const d = data as AppData;
  const fail = () => {
    throw Error("新增规划或专注数据无效，原有数据未改变。");
  };
  if ((d.schemaVersion as number) === 1) {
    d.schemaVersion = 2;
    d.planPeriods ??= [];
    d.milestones ??= [];
    d.focusSessions ??= [];
    if (d.timer) {
      const t = d.timer,
        task = d.tasks.find((x) => x.id === t.taskId)!;
      const started = task.updatedAt,
        id = `legacy-focus-${task.id}-${t.deadline}`;
      const elapsedMs = Math.max(0, task.minutes * 60000 - t.remaining);
      d.focusSessions.push({
        id,
        createdAt: started,
        updatedAt: started,
        projectId: task.projectId,
        taskId: task.id,
        mode: "countdown",
        plannedMinutes: task.minutes,
        elapsedMs,
        startedAt: started,
        status: "interrupted",
      });
      Object.assign(t, {
        sessionId: id,
        mode: "countdown",
        plannedMinutes: task.minutes,
        elapsedMs,
        clockToken: "legacy",
        startedTick: 0,
        needsRecovery: true,
        running: false,
      });
      task.status = "paused";
    }
  }
  const ids = new Set(
    [...d.projects, ...d.tasks, ...d.results, ...d.ideas, ...d.checkins].map(
      (r) => r.id,
    ),
  );
  const integer = (n: unknown, min: number, max: number) =>
    typeof n === "number" && Number.isSafeInteger(n) && n >= min && n <= max;
  const text = (n: unknown, max = 100000) =>
    typeof n === "string" && n.length <= max;
  const optionalDate = (n: unknown) => n === undefined || validDate(n);
  const message = d.settings.message;
  if (d.settings.fontSize !== undefined && !integer(d.settings.fontSize, 12, 18)) return fail();
  if (message !== undefined && (!message || typeof message !== "object" ||
      !text(message.text, 500) || !["system", "serif"].includes(message.font) ||
      !integer(message.size, 12, 22) || typeof message.spacing !== "number" ||
      !Number.isFinite(message.spacing) || message.spacing < 0 || message.spacing > 4 ||
      typeof message.overview !== "boolean" || typeof message.widget !== "boolean")) return fail();
  const pid = (id: unknown) =>
    typeof id === "string" && d.projects.some((p) => p.id === id);
  for (const list of [d.planPeriods, d.milestones, d.focusSessions, d.todos === undefined ? [] : d.todos]) {
    if (!Array.isArray(list) || list.length > 50000) return fail();
    for (const r of list) {
      if (
        !r ||
        !text(r.id) ||
        !r.id ||
        ids.has(r.id) ||
        !Number.isFinite(Date.parse(r.createdAt)) ||
        !Number.isFinite(Date.parse(r.updatedAt)) ||
        (r.demo !== undefined && typeof r.demo !== "boolean")
      )
        return fail();
      ids.add(r.id);
    }
  }
  for (const t of d.todos || []) {
    if (!text(t.text, 500) || !t.text.trim() || !validDate(t.date) ||
        typeof t.done !== 'boolean' ||
        (t.completedAt !== undefined && (typeof t.completedAt !== 'string' || !Number.isFinite(Date.parse(t.completedAt))))) return fail();
  }
  for (const p of d.projects) {
    if ((p.sampleKey !== undefined && !["paper", "exploration", "revision"].includes(p.sampleKey)) ||
        (p.sampleBaseline !== undefined && (typeof p.sampleBaseline !== "string" || !/^[0-9a-f]{16}$/.test(p.sampleBaseline))) ||
        (p.mainProjectId !== undefined && (typeof p.mainProjectId !== "string" || !d.projects.some(parent => parent.id === p.mainProjectId) || p.mainProjectId === p.id))) return fail();
    if (!optionalDate(p.startDate) || !optionalDate(p.targetDate) ||
        (p.startDate && p.targetDate && p.startDate > p.targetDate)) return fail();
  }
  // Only one relationship level is supported: a child cannot itself own a child.
  for (const p of d.projects) {
    if (p.mainProjectId && d.projects.some(parent => parent.id === p.mainProjectId && parent.mainProjectId)) return fail();
  }
  for (const p of d.planPeriods)
    if (
      !pid(p.projectId) ||
      (p.milestoneId !== undefined && !d.milestones.some(m => m.id === p.milestoneId && m.projectId === p.projectId)) ||
      !text(p.name, 200) ||
      !text(p.note) ||
      !validDate(p.startDate) ||
      !validDate(p.endDate) ||
      p.startDate > p.endDate ||
      typeof p.priority !== "boolean"
    )
      return fail();
  for (const m of d.milestones)
    if (
      !pid(m.projectId) ||
      !text(m.name, 200) ||
      !m.name.trim() ||
      !text(m.description) ||
      !text(m.outcome) ||
      !integer(m.order, 0, 1000000) ||
      !["todo", "doing", "done"].includes(m.status) ||
      !optionalDate(m.startDate) ||
      !optionalDate(m.endDate) ||
      !optionalDate(m.targetDate) ||
      (m.startDate && m.endDate && m.startDate > m.endDate)
    )
      return fail();
  for (const m of d.milestones) {
    const seen = new Set([m.id]);
    let next = m.parentMilestoneId;
    while (next !== undefined) {
      if (typeof next !== 'string' || seen.has(next)) return fail();
      seen.add(next);
      const owner = d.milestones.find(x => x.id === next && x.projectId === m.projectId);
      if (!owner) return fail();
      next = owner.parentMilestoneId;
    }
  }
  for (const t of d.tasks)
    if (
      (t.milestoneId !== undefined &&
        !d.milestones.some(
          (m) => m.id === t.milestoneId && m.projectId === t.projectId,
        )) ||
      (t.estimatedMinutes !== undefined &&
        !integer(t.estimatedMinutes, 1, 1000000)) ||
      (t.order !== undefined && !integer(t.order, 0, 1000000))
    )
      return fail();
  for (const p of d.projects) {
    const s = p.snapshot;
    if (!s) continue;
    if (
      s.milestoneId !== undefined &&
      !d.milestones.some((m) => m.id === s.milestoneId && m.projectId === p.id)
    )
      return fail();
    if (
      s.taskId !== undefined &&
      !d.tasks.some((t) => t.id === s.taskId && t.projectId === p.id)
    )
      return fail();
  }
  for (const s of d.focusSessions)
    if (
      !pid(s.projectId) ||
      !d.tasks.some((t) => t.id === s.taskId && t.projectId === s.projectId) ||
      !["countdown", "countup"].includes(s.mode) ||
      !["running", "paused", "ended", "interrupted"].includes(s.status) ||
      typeof s.elapsedMs !== "number" ||
      !Number.isFinite(s.elapsedMs) ||
      s.elapsedMs < 0 ||
      s.elapsedMs > 31536000000 ||
      !Number.isFinite(Date.parse(s.startedAt)) ||
      (s.endedAt !== undefined && !Number.isFinite(Date.parse(s.endedAt))) ||
      (s.mode === "countdown" && !integer(s.plannedMinutes, 1, 240))
    )
      return fail();
  if (
    d.settings.focusProjectId !== undefined &&
    !pid(d.settings.focusProjectId)
  )
    return fail();
  if (
    d.settings.lastCustomMinutes !== undefined &&
    !integer(d.settings.lastCustomMinutes, 1, 240)
  )
    return fail();
  const t = d.timer;
  if (t) {
    const s = d.focusSessions.find(
      (s) =>
        s.id === t.sessionId && s.taskId === t.taskId && s.status !== "ended",
    );
    if (
      !s ||
      s.mode !== t.mode ||
      s.plannedMinutes !== t.plannedMinutes ||
      typeof t.elapsedMs !== "number" ||
      !Number.isFinite(t.elapsedMs) ||
      t.elapsedMs < 0 ||
      t.elapsedMs > 31536000000 ||
      typeof t.clockToken !== "string" ||
      typeof t.startedTick !== "number" ||
      !Number.isFinite(t.startedTick) ||
      t.startedTick < 0
    )
      return fail();
    for (const flag of [t.needsRecovery, t.awaitingDecision, t.overtime])
      if (flag !== undefined && typeof flag !== "boolean") return fail();
  }
  return d;
}
