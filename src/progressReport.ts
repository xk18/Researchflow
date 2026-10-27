import { AppData, FocusSession, Project, ProjectPlanPeriod, ResultCard, Task } from './types';
import { addDays, localDate, overlaps } from './dates';
import { currentMilestone, planningPeriods } from './planning';
import { projectPath } from './projectRelations';

export interface WeekRange { start: string; end: string }
export interface WeeklyProjectReport {
  project: Project;
  path: string;
  currentStage: string;
  milestoneNames: Record<string,string>;
  completed: Task[];
  open: Task[];
  plans: ProjectPlanPeriod[];
  sessions: FocusSession[];
  results: ResultCard[];
  questions: string[];
}
const timestamp = (value?: string) => value ? Date.parse(value) : Number.NaN;
const inside = (value: string | undefined, start: number, end: number) => {
  const n = timestamp(value); return Number.isFinite(n) && n >= start && n < end;
};
export function weekRange(date = localDate()): WeekRange {
  const d = new Date(`${date}T12:00:00`), dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  const start = localDate(d);
  return { start, end: addDays(start, 6) };
}
export function weeklyProjectIds(d: AppData, week: WeekRange): Set<string> {
  const start = new Date(`${week.start}T00:00:00`).getTime();
  const end = new Date(`${addDays(week.end,1)}T00:00:00`).getTime();
  const scheduled = planningPeriods(d);
  const ids = new Set<string>();
  for (const p of d.projects) {
    const activity = inside(p.updatedAt,start,end) ||
      scheduled.some(period => period.projectId === p.id && overlaps(period,{startDate:week.start,endDate:week.end})) ||
      d.milestones.some(m => m.projectId === p.id && inside(m.updatedAt,start,end)) ||
      d.tasks.some(t => t.projectId === p.id && (inside(t.completedAt,start,end) || inside(t.updatedAt,start,end))) ||
      d.focusSessions.some(s => s.projectId === p.id && (inside(s.startedAt,start,end) || inside(s.endedAt,start,end) || inside(s.updatedAt,start,end))) ||
      d.results.some(r => r.projectId === p.id && (inside(r.createdAt,start,end) || inside(r.updatedAt,start,end))) ||
      d.ideas.some(i => i.projectId === p.id && inside(i.updatedAt,start,end)) ||
      (!!p.snapshot && inside(p.snapshot.updatedAt,start,end) && !!(p.snapshot.questions.trim() || p.snapshot.blocker.trim()));
    if (activity) ids.add(p.id);
  }
  return ids;
}
export function buildWeeklyReport(d: AppData, projectIds: string[], week: WeekRange): WeeklyProjectReport[] {
  const start = new Date(`${week.start}T00:00:00`).getTime();
  const end = new Date(`${addDays(week.end,1)}T00:00:00`).getTime();
  const periods = planningPeriods(d);
  return projectIds.map(id => d.projects.find(p => p.id === id)).filter((p): p is Project => !!p).map(project => {
    const tasks = d.tasks.filter(t => t.projectId === project.id);
    const stage = currentMilestone(d,project.id);
    const questions = [project.snapshot?.questions, project.snapshot?.blocker].filter((x): x is string => !!x?.trim());
    return {
      project,
      path: projectPath(d,project),
      currentStage: stage?.name || '尚未设置',
      milestoneNames: Object.fromEntries(d.milestones.filter(m => m.projectId === project.id).map(m => [m.id,m.name])),
      completed: tasks.filter(t => t.status === 'done' && inside(t.completedAt,start,end)),
      open: tasks.filter(t => t.status !== 'done'),
      plans: periods.filter(p => p.projectId === project.id && overlaps(p,{startDate:week.start,endDate:week.end})).sort((a,b) => a.startDate.localeCompare(b.startDate)),
      sessions: d.focusSessions.filter(s => s.projectId === project.id && (inside(s.startedAt,start,end) || inside(s.endedAt,start,end) || inside(s.updatedAt,start,end))),
      results: d.results.filter(r => r.projectId === project.id && (inside(r.createdAt,start,end) || inside(r.updatedAt,start,end))),
      questions: [...new Set(questions)],
    };
  });
}
const statusLabel = (t: Task) => t.status === 'running' ? '进行中' : t.status === 'paused' ? '已暂停' : '待开始';
export function weeklyMarkdown(rows: WeeklyProjectReport[], week: WeekRange): string {
  return `# 科研进度周报\n\n时间范围：${week.start} 至 ${week.end}\n\n` + rows.map(row => {
    const sessions = row.sessions.map(s => `- ${new Date(s.startedAt).toLocaleString()} · ${row.project.name} · ${s.mode === 'countup' ? '正计时' : `${s.plannedMinutes ?? 0} 分钟计划`} · 已记录 ${(s.elapsedMs/60000).toFixed(1)} 分钟 · ${s.status === 'ended' ? '已结束' : '未结束'}`).join('\n');
    return `## ${row.path}\n\n当前阶段：${row.currentStage}\n\n### 本周完成的行动\n${row.completed.length ? row.completed.map(t => `- ${t.name}（${t.completedAt ? new Date(t.completedAt).toLocaleDateString() : ''}）`).join('\n') : '- 本周没有记录到已完成行动'}\n\n### 尚未完成的行动\n${row.open.length ? row.open.map(t => `- ${t.name}（${statusLabel(t)}${t.milestoneId ? ` · ${row.milestoneNames[t.milestoneId] || ''}` : ''}）`).join('\n') : '- 暂无'}\n\n### 本周覆盖的计划时段\n${row.plans.length ? row.plans.map(p => `- ${p.startDate} 至 ${p.endDate}：${p.name || '研究计划'}${p.milestoneId ? ` · ${row.milestoneNames[p.milestoneId] || ''}` : ''}${p.note ? `；${p.note}` : ''}`).join('\n') : '- 本周没有覆盖的计划时段'}\n\n### 本周专注记录\n${sessions || '- 本周没有专注记录'}\n\n### 本周更新的成果卡\n${row.results.length ? row.results.map(r => `- ${r.observation}${r.evidence ? `；证据：${r.evidence}` : ''}`).join('\n') : '- 本周没有更新成果卡'}\n\n### 待解决问题\n${row.questions.length ? row.questions.map(q => `- ${q}`).join('\n') : '- 尚未记录待解决问题'}`;
  }).join('\n\n---\n\n');
}
export function weeklyAiPrompt(rows: WeeklyProjectReport[], week: WeekRange): string {
  const facts = weeklyMarkdown(rows,week);
  return `请根据以下 ResearchFlow 科研进度周报，协助整理一份适合每周组会汇报的摘要。\n\n请严格遵守：\n1. 只基于提供的记录总结，不推测未记录的结果、进度或结论。\n2. 清楚区分已完成事实、正在推进的事项、待确认问题和下一步计划。\n3. 不根据日期或任务数量推算完成百分比，不把相关性表述成因果关系。\n4. 对缺少的信息标注“待补充”，保留研究不确定性。\n5. 用简洁、客观、适合口头汇报的中文输出，并按项目分别组织。\n\n${facts}`;
}
