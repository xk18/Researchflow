export type Track = "explore" | "deliver";
export type Motivation = "high" | "normal" | "low";
export type ProjectStatus =
  "active" | "paused" | "completed" | "archived" | "terminated";
export interface RecordBase {
  id: string;
  createdAt: string;
  updatedAt: string;
  demo?: boolean;
}
export interface Snapshot extends RecordBase {
  conclusion: string;
  questions: string;
  files: string[];
  blocker: string;
  nextAction: string;
  milestoneId?: string;
  taskId?: string;
}
export interface Project extends RecordBase {
  sampleKey?: "paper" | "exploration" | "revision";
  sampleBaseline?: string;
  /** Optional single-level grouping; children remain independent records. */
  mainProjectId?: string;
  name: string;
  background: string;
  track: Track;
  status: ProjectStatus;
  priority: boolean;
  snapshot?: Snapshot;
  startDate?: string;
  targetDate?: string;
}
export interface Task extends RecordBase {
  projectId: string;
  name: string;
  type: string;
  minutes: number;
  milestoneId?: string;
  /** Stable order within its current milestone (or ungrouped action list). */
  order?: number;
  estimatedMinutes?: number;
  status: "todo" | "running" | "paused" | "done";
  note: string;
  completedAt?: string;
  completedTrack?: Track;
  deferredUntil?: string;
}
export interface ResultCard extends RecordBase {
  projectId: string;
  observation: string;
  hypothesis: string;
  evidence: string;
  support: string;
  interpretation: string;
  limitations: string;
  validation: string;
  significance: string;
}
export interface Idea extends RecordBase {
  text: string;
  projectId?: string;
  archived: boolean;
}
export interface Checkin extends RecordBase {
  date: string;
  energy: number;
  stress: number;
  sleep?: number;
  motivation: Motivation;
  note: string;
}
export interface Todo extends RecordBase {
  text: string;
  date: string;
  done: boolean;
  completedAt?: string;
}
export interface Timer {
  taskId: string;
  deadline: number;
  remaining: number;
  running: boolean;
  sessionId?: string;
  mode?: "countdown" | "countup";
  plannedMinutes?: number;
  elapsedMs?: number;
  clockToken?: string;
  startedTick?: number;
  needsRecovery?: boolean;
  awaitingDecision?: boolean;
  overtime?: boolean;
}
export interface ProjectPlanPeriod extends RecordBase {
  projectId: string;
  milestoneId?: string;
  name: string;
  note: string;
  startDate: string;
  endDate: string;
  priority: boolean;
}
export interface Milestone extends RecordBase {
  projectId: string;
  /** Optional workflow nesting; all stages still own their independent actions. */
  parentMilestoneId?: string;
  name: string;
  description: string;
  outcome: string;
  order: number;
  status: "todo" | "doing" | "done";
  startDate?: string;
  endDate?: string;
  targetDate?: string;
}
export interface FocusSession extends RecordBase {
  projectId: string;
  taskId: string;
  mode: "countdown" | "countup";
  plannedMinutes?: number;
  elapsedMs: number;
  startedAt: string;
  endedAt?: string;
  status: "running" | "paused" | "ended" | "interrupted";
}
export interface MessageSettings {
  text: string;
  font: "system" | "serif";
  size: number;
  spacing: number;
  overview: boolean;
  widget: boolean;
}
export interface Settings {
  theme: "light" | "dark" | "system";
  fontSize?: number;
  onboarding?: "completed" | "skipped";
  alwaysOnTop: boolean;
  motivation: Motivation;
  focusProjectId?: string;
  lastCustomMinutes?: number;
  message?: MessageSettings;
}
export interface AppData {
  schemaVersion: 2;
  revision: number;
  projects: Project[];
  tasks: Task[];
  results: ResultCard[];
  ideas: Idea[];
  checkins: Checkin[];
  settings: Settings;
  timer: Timer | null;
  planPeriods: ProjectPlanPeriod[];
  milestones: Milestone[];
  focusSessions: FocusSession[];
  /** Independent daily notes; absent in older backups. */
  todos?: Todo[];
}
export const TRACK: Record<Track, string> = {
  explore: "问题探索",
  deliver: "成果产出",
};
export const STATUS: Record<ProjectStatus, string> = {
  active: "进行中",
  paused: "已暂停",
  completed: "已完成",
  archived: "已归档",
  terminated: "已终止",
};
export const MOTIVATION: Record<Motivation, string> = {
  high: "高动力",
  normal: "普通动力",
  low: "低动力",
};
export const base = (): RecordBase => {
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), createdAt: now, updatedAt: now };
};
export const emptyData = (): AppData => ({
  schemaVersion: 2,
  revision: 0,
  projects: [],
  tasks: [],
  results: [],
  ideas: [],
  checkins: [],
  settings: { theme: "light", alwaysOnTop: false, motivation: "normal" },
  timer: null,
  planPeriods: [],
  milestones: [],
  focusSessions: [],
});
