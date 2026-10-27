import { AppData, base, Task, Timer } from "./types";
import { desktop, native } from "./services/native";
export interface Clock {
  token: string;
  tick: number;
}
const browserToken = `browser-${crypto.randomUUID()}`;
export async function focusClock(): Promise<Clock> {
  return native
    ? ((await desktop("focus_clock")) as Clock)
    : { token: browserToken, tick: performance.now() };
}
export function elapsed(timer: Timer, clock: Clock): number {
  const saved = timer.elapsedMs || 0;
  if (!timer.running || timer.clockToken !== clock.token) return saved;
  return saved + Math.max(0, clock.tick - (timer.startedTick || 0));
}
export function checkpoint(d: AppData, clock: Clock) {
  const t = d.timer;
  if (!t?.sessionId) return;
  let ms = elapsed(t, clock);
  if (t.clockToken !== clock.token && t.running) {
    t.running = false;
    t.needsRecovery = true;
  }
  if (
    t.mode === "countdown" &&
    !t.overtime &&
    ms >= (t.plannedMinutes || 0) * 60000
  ) {
    ms = (t.plannedMinutes || 0) * 60000;
    t.running = false;
    t.awaitingDecision = true;
  }
  t.elapsedMs = ms;
  t.startedTick = clock.tick;
  t.clockToken = clock.token;
  t.remaining = Math.max(0, (t.plannedMinutes || 0) * 60000 - ms);
  t.deadline = Date.now() + t.remaining;
  const s = d.focusSessions.find((s) => s.id === t.sessionId);
  if (s) {
    s.elapsedMs = ms;
    s.status = t.needsRecovery
      ? "interrupted"
      : t.running
        ? "running"
        : "paused";
    s.updatedAt = new Date().toISOString();
  }
  const task = d.tasks.find((x) => x.id === t.taskId);
  if (task && task.status !== "done")
    task.status = t.running ? "running" : "paused";
}
export function endFocus(d: AppData, clock?: Clock) {
  if (clock) checkpoint(d, clock);
  const t = d.timer;
  if (!t) return;
  const session = d.focusSessions.find((s) => s.id === t.sessionId);
  if (session && session.status !== "ended") {
    session.elapsedMs = t.elapsedMs || 0;
    session.endedAt = new Date().toISOString();
    session.updatedAt = session.endedAt;
    session.status = "ended";
  }
  const task = d.tasks.find((x) => x.id === t.taskId);
  if (task && task.status !== "done") {
    task.status = "todo";
    task.updatedAt = new Date().toISOString();
  }
  d.timer = null;
}
export function startFocus(
  d: AppData,
  task: Task,
  mode: "countdown" | "countup",
  minutes: number,
  clock: Clock,
) {
  if (
    mode === "countdown" &&
    (!Number.isInteger(minutes) || minutes < 1 || minutes > 240)
  )
    throw Error("专注时长应为 1–240 的整数分钟。");
  const actual = d.tasks.find((t) => t.id === task.id);
  if (
    !actual ||
    actual.status === "done" ||
    d.projects.find((p) => p.id === actual.projectId)?.status !== "active"
  )
    throw Error("请先恢复项目和行动。");
  if (d.timer)
    throw Error("请先结束当前专注，再开始另一项行动。暂停的会话仍可继续。");
  const b = base();
  d.focusSessions.push({
    ...b,
    projectId: actual.projectId,
    taskId: actual.id,
    mode,
    plannedMinutes: mode === "countdown" ? minutes : undefined,
    elapsedMs: 0,
    startedAt: b.createdAt,
    status: "running",
  });
  actual.status = "running";
  actual.updatedAt = b.createdAt;
  delete actual.deferredUntil;
  d.timer = {
    taskId: actual.id,
    sessionId: b.id,
    mode,
    plannedMinutes: mode === "countdown" ? minutes : undefined,
    elapsedMs: 0,
    clockToken: clock.token,
    startedTick: clock.tick,
    running: true,
    deadline: Date.now() + minutes * 60000,
    remaining: mode === "countdown" ? minutes * 60000 : 0,
  };
}
export function pauseFocus(d: AppData, clock: Clock) {
  checkpoint(d, clock);
  if (d.timer) {
    d.timer.running = false;
    checkpoint(d, clock);
  }
}
export function resumeFocus(d: AppData, clock: Clock) {
  const t = d.timer;
  if (!t) return;
  if (
    d.projects.find(
      (p) => p.id === d.tasks.find((x) => x.id === t.taskId)?.projectId,
    )?.status !== "active"
  )
    throw Error("请先恢复项目。");
  t.clockToken = clock.token;
  t.startedTick = clock.tick;
  t.running = true;
  t.needsRecovery = false;
  if (t.awaitingDecision) {
    t.overtime = true;
    t.awaitingDecision = false;
  }
  checkpoint(d, clock);
}
export function completeTask(d: AppData, id: string, clock?: Clock) {
  if (d.timer?.taskId === id) endFocus(d, clock);
  const t = d.tasks.find((t) => t.id === id);
  if (!t) return;
  t.status = "done";
  t.completedAt = new Date().toISOString();
  t.updatedAt = t.completedAt;
  t.completedTrack = d.projects.find((p) => p.id === t.projectId)?.track;
}
export function timeText(ms: number) {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
