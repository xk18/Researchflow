import {
  AppData,
  Project,
  ResultCard,
  Task,
  Track,
} from "./types";
import { upgradeAndValidate } from "./validation";
import { focusedProject, currentMilestone, planningPeriods } from "./planning";
import { localDate } from "./dates";
export function recommend(data: AppData, track?: Track): Task | undefined {
  const active = new Map(
    data.projects
      .filter((p) => p.status === "active" && (!track || p.track === track))
      .map((p) => [p.id, p]),
  );
  const candidates = data.tasks.filter(
    (t) =>
      active.has(t.projectId) &&
      t.status !== "done" &&
      (!t.deferredUntil || Date.parse(t.deferredUntil) <= Date.now()),
  );
  const manual = data.projects.find(
    (p) => p.id === data.settings.focusProjectId && active.has(p.id),
  );
  const pool = manual
    ? candidates.filter(
        (t) => t.projectId === manual.id || t.id === data.timer?.taskId,
      )
    : candidates;
  return pool.sort((a, b) => {
    if (a.status === "running") return -1;
    if (b.status === "running") return 1;
    if (data.timer?.taskId === a.id) return -1;
    if (data.timer?.taskId === b.id) return 1;
    const focused =
      data.settings.focusProjectId ||
      planningPeriods(data).some(
        (p) =>
          p.priority && p.startDate <= localDate() && p.endDate >= localDate(),
      )
        ? focusedProject(data)
        : undefined;
    if (focused) {
      const diff =
        Number(b.projectId === focused.id) - Number(a.projectId === focused.id);
      if (diff) return diff;
      const stage = currentMilestone(data, focused.id);
      if (stage) {
        const md =
          Number(b.milestoneId === stage.id) -
          Number(a.milestoneId === stage.id);
        if (md) return md;
      }
    }
    if (data.settings.motivation === "low")
      return (
        a.minutes - b.minutes ||
        Number(active.get(b.projectId)!.priority) -
          Number(active.get(a.projectId)!.priority)
      );
    if (data.settings.motivation === "high") {
      const diff =
        Number(active.get(b.projectId)!.track === "explore") -
        Number(active.get(a.projectId)!.track === "explore");
      if (diff) return diff;
    }
    return (
      Number(active.get(b.projectId)!.priority) -
        Number(active.get(a.projectId)!.priority) ||
      Date.parse(a.createdAt) - Date.parse(b.createdAt)
    );
  })[0];
}
export function setPriority(_data: AppData, project: Project) {
  const now = new Date().toISOString();
  project.priority = true;
  project.updatedAt = now;
}
export function clearPriority(data: AppData, project: Project) {
  const now = new Date().toISOString();
  project.priority = false;
  project.updatedAt = now;
  // Release the same project's scheduled and manually selected focus as well.
  for (const period of data.planPeriods.filter((p) => p.projectId === project.id)) {
    period.priority = false;
    period.updatedAt = now;
  }
  if (data.settings.focusProjectId === project.id) delete data.settings.focusProjectId;
}
const missing = (v: string) => v.trim() || "【待补充】";
export function resultMarkdown(
  r: ResultCard,
  projectName: string,
  outline = false,
): string {
  const rows = outline
    ? [
        ["科学问题", r.hypothesis],
        ["Results：结果证据", r.observation],
        ["数据与图表", r.evidence],
        ["Discussion：结果解释", r.interpretation],
        ["对假设的支持程度", r.support],
        ["研究局限", r.limitations],
        ["下一步验证", r.validation],
        ["可能的科学意义", r.significance],
      ]
    : [
        ["科学假设", r.hypothesis],
        ["主要观察结果", r.observation],
        ["关键数据或图表", r.evidence],
        ["支持程度", r.support],
        ["结果解释", r.interpretation],
        ["研究局限", r.limitations],
        ["尚需完成的验证", r.validation],
        ["可能的科学意义", r.significance],
      ];
  return (
    `# ${outline ? "论文素材" : "科研成果卡"}\n\n项目：${projectName}\n\n` +
    rows.map(([k, v]) => `## ${k}\n\n${missing(v)}\n`).join("\n")
  );
}
export function projectMarkdown(p: Project, data: AppData): string {
  const plans = data.planPeriods
    .filter((x) => x.projectId === p.id)
    .map(
      (x) =>
        `- ${x.startDate} 至 ${x.endDate}：${x.name || "研究计划"}${x.milestoneId ? ` · ${data.milestones.find(m => m.id === x.milestoneId)?.name || ""}` : ""}${x.priority ? "（重点）" : ""}${x.note ? ` — ${x.note}` : ""}`,
    )
    .join("\n");
  const stages = data.milestones
    .filter((x) => x.projectId === p.id)
    .sort((a, b) => a.order - b.order)
    .map(
      (x) =>
        `### ${x.name}（${x.status === "done" ? "已完成" : x.status === "doing" ? "进行中" : "未开始"}）\n\n${x.description}\n\n预期成果：${missing(x.outcome)}\n\n计划：${x.startDate || "未设开始"} 至 ${x.endDate || "未设结束"}；目标：${x.targetDate || "未设置"}`,
    )
    .join("\n\n");
  const sessions = data.focusSessions
    .filter((x) => x.projectId === p.id)
    .map(
      (x) =>
        `- ${new Date(x.startedAt).toLocaleString()}：${data.tasks.find((t) => t.id === x.taskId)?.name || "行动"}；${x.mode === "countup" ? "正计时" : `计划 ${x.plannedMinutes} 分钟`}；有效 ${(x.elapsedMs / 60000).toFixed(1)} 分钟；${x.status === "ended" ? "已结束" : "待继续"}`,
    )
    .join("\n");
  return `# ${p.name}\n\n${p.background}\n\n启动日期：${p.startDate || "未设置"}\n\n目标日期：${p.targetDate || "未设置"}\n\n## 计划时段\n\n${plans || "尚未安排"}\n\n## 项目路线图\n\n${stages || "尚未设置阶段"}\n\n## 下一步行动\n\n${
    data.tasks
      .filter((t) => t.projectId === p.id)
      .map(
        (t) =>
          `- [${t.status === "done" ? "x" : " "}] ${t.name}（${t.minutes}分钟；${data.milestones.find((m) => m.id === t.milestoneId)?.name || "未分组"}）`,
      )
      .join("\n") || "【待添加】"
  }\n\n## 专注记录\n\n${sessions || "尚无专注记录"}\n\n## 暂停快照\n\n${p.snapshot ? `已知结论：${missing(p.snapshot.conclusion)}\n\n未解决问题：${missing(p.snapshot.questions)}\n\n阻碍：${missing(p.snapshot.blocker)}\n\n文件：\n${p.snapshot.files.join("\n")}\n\n下次第一步：${p.snapshot.nextAction}` : "尚无快照"}\n\n${data.results
    .filter((r) => r.projectId === p.id)
    .map((r) => resultMarkdown(r, p.name))
    .join("\n")}`;
}
export function parseBackup(text: string): AppData {
  if (text.length > 20_000_000)
    throw new Error("备份超过20 MB，请拆分后重试。");
  const d: unknown = JSON.parse(text);
  const obj = (x: unknown): x is Record<string, unknown> =>
    !!x && typeof x === "object" && !Array.isArray(x);
  const fail = () => {
    throw new Error("备份格式不完整或不受支持，原有数据未改变。");
  };
  if (
    !obj(d) ||
    ![1, 2].includes(d.schemaVersion as number) ||
    !Number.isSafeInteger(d.revision) ||
    (d.revision as number) < 0
  )
    return fail();
  for (const list of ["projects", "tasks", "results", "ideas", "checkins"]) {
    if (!Array.isArray(d[list]) || (d[list] as unknown[]).length > 50000)
      return fail();
  }
  const ids = new Set<string>();
  for (const list of ["projects", "tasks", "results", "ideas", "checkins"])
    for (const r of d[list] as unknown[]) {
      if (
        !obj(r) ||
        typeof r.id !== "string" ||
        !r.id ||
        ids.has(r.id) ||
        typeof r.createdAt !== "string" ||
        !Number.isFinite(Date.parse(r.createdAt)) ||
        typeof r.updatedAt !== "string" ||
        !Number.isFinite(Date.parse(r.updatedAt)) ||
        (r.demo !== undefined && typeof r.demo !== "boolean")
      )
        return fail();
      ids.add(r.id);
    }
  const strings = (r: Record<string, unknown>, keys: string[]) =>
    keys.every(
      (k) => typeof r[k] === "string" && (r[k] as string).length <= 100000,
    );
  const projectIds = new Set(
    (d.projects as Record<string, unknown>[]).map((p) => p.id),
  );
  for (const p of d.projects as Record<string, unknown>[]) {
    if (
      !strings(p, ["name", "background"]) ||
      !(p.name as string).trim() ||
      !["explore", "deliver"].includes(p.track as string) ||
      !["active", "paused", "completed", "archived", "terminated"].includes(
        p.status as string,
      ) ||
      typeof p.priority !== "boolean"
    )
      return fail();
    if (p.mainProjectId !== undefined && (typeof p.mainProjectId !== "string" || !projectIds.has(p.mainProjectId) || p.mainProjectId === p.id))
      return fail();
    if (p.snapshot !== undefined) {
      const s = p.snapshot;
      if (
        !obj(s) ||
        !strings(s, [
          "id",
          "createdAt",
          "updatedAt",
          "conclusion",
          "questions",
          "blocker",
          "nextAction",
        ]) ||
        !(s.nextAction as string).trim() ||
        !Array.isArray(s.files) ||
        !s.files.every((f) => typeof f === "string") ||
        !Number.isFinite(Date.parse(s.createdAt as string)) ||
        !Number.isFinite(Date.parse(s.updatedAt as string))
      )
        return fail();
    }
  }
  for (const p of d.projects as Record<string, unknown>[]) {
    if (p.mainProjectId !== undefined && (d.projects as Record<string, unknown>[]).some(parent => parent.id === p.mainProjectId && parent.mainProjectId !== undefined)) return fail();
  }
  const taskIds = new Set(
    (d.tasks as Record<string, unknown>[]).map((t) => t.id),
  );
  for (const t of d.tasks as Record<string, unknown>[])
    if (
      !strings(t, ["projectId", "name", "type", "note"]) ||
      !(t.name as string).trim() ||
      !projectIds.has(t.projectId) ||
      !Number.isInteger(t.minutes) ||
      (t.minutes as number) < 1 ||
      (t.minutes as number) > 240 ||
      !["todo", "running", "paused", "done"].includes(t.status as string) ||
      (t.completedAt !== undefined &&
        (typeof t.completedAt !== "string" ||
          !Number.isFinite(Date.parse(t.completedAt)))) ||
      (t.completedTrack !== undefined &&
        !["explore", "deliver"].includes(t.completedTrack as string)) ||
      (t.deferredUntil !== undefined &&
        (typeof t.deferredUntil !== "string" ||
          !Number.isFinite(Date.parse(t.deferredUntil)))) ||
      (t.order !== undefined && (!Number.isSafeInteger(t.order) || (t.order as number) < 0 || (t.order as number) > 1000000))
    )
      return fail();
  for (const r of d.results as Record<string, unknown>[])
    if (
      !strings(r, [
        "projectId",
        "observation",
        "hypothesis",
        "evidence",
        "support",
        "interpretation",
        "limitations",
        "validation",
        "significance",
      ]) ||
      !(r.observation as string).trim() ||
      !projectIds.has(r.projectId)
    )
      return fail();
  for (const i of d.ideas as Record<string, unknown>[])
    if (
      !strings(i, ["text"]) ||
      !(i.text as string).trim() ||
      typeof i.archived !== "boolean" ||
      (i.projectId !== undefined && !projectIds.has(i.projectId))
    )
      return fail();
  for (const c of d.checkins as Record<string, unknown>[])
    if (
      !strings(c, ["date", "note"]) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(c.date as string) ||
      !Number.isFinite(Date.parse(c.date as string)) ||
      ![1, 2, 3, 4, 5].includes(c.energy as number) ||
      ![1, 2, 3, 4, 5].includes(c.stress as number) ||
      !["high", "normal", "low"].includes(c.motivation as string) ||
      (c.sleep !== undefined &&
        (typeof c.sleep !== "number" || c.sleep < 0 || c.sleep > 24))
    )
      return fail();
  // Absence is distinct from an explicit dark/system choice in older records.
  if (obj(d.settings) && d.settings.theme === undefined) d.settings.theme = "light";
  if (
    !obj(d.settings) ||
    !["light", "dark", "system"].includes(d.settings.theme as string) ||
    typeof d.settings.alwaysOnTop !== "boolean" ||
    !["high", "normal", "low"].includes(d.settings.motivation as string)
  )
    return fail();
  if (d.settings.onboarding !== undefined && !["completed", "skipped"].includes(d.settings.onboarding as string)) return fail();
  if (
    d.timer !== null &&
    (!obj(d.timer) ||
      !taskIds.has(d.timer.taskId) ||
      typeof d.timer.running !== "boolean" ||
      typeof d.timer.deadline !== "number" ||
      !Number.isFinite(d.timer.deadline) ||
      typeof d.timer.remaining !== "number" ||
      d.timer.remaining < 0 ||
      !Number.isFinite(d.timer.remaining))
  )
    return fail();
  // Normalise to known fields; legacy v1 optional fields are preserved by the model.
  return upgradeAndValidate(d);
}
export function mergeBackup(current: AppData, imported: AppData): AppData {
  const d = structuredClone(current);
  for (const k of [
    "projects",
    "tasks",
    "results",
    "ideas",
    "checkins",
    "planPeriods",
    "milestones",
    "focusSessions",
  ] as const) {
    const map = new Map<string, (typeof d)[typeof k][number]>();
    for (const r of [...current[k], ...imported[k]]) {
      const prior = map.get(r.id);
      if (!prior || Date.parse(r.updatedAt) > Date.parse(prior.updatedAt))
        map.set(r.id, r);
    }
    (d[k] as unknown[]) = [...map.values()];
  }
  // Imported running tasks must not create a second live timer.
  if (current.todos !== undefined || imported.todos !== undefined) {
    const map = new Map((current.todos || []).map(t => [t.id, t]));
    for (const item of imported.todos || []) {
      const prior = map.get(item.id);
      if (!prior || Date.parse(item.updatedAt) > Date.parse(prior.updatedAt)) map.set(item.id, item);
    }
    d.todos = [...map.values()];
  }
  d.tasks.forEach((t) => {
    if (t.status === "running" && d.timer?.taskId !== t.id) t.status = "paused";
  });
  return parseBackup(JSON.stringify(d));
}
