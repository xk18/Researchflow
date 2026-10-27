import { describe, expect, it } from 'vitest';
import { demoData } from './fixtures';
import { base } from '../src/types';
import { buildWeeklyReport, weekRange, weeklyAiPrompt, weeklyMarkdown, weeklyProjectIds } from '../src/progressReport';
import { moveTask, orderedTasks, reorderTasks } from '../src/ordering';
import { parseBackup } from '../src/domain';
import { groupProjects, projectPath, releaseChildren } from '../src/projectRelations';

describe('科研进度周报', () => {
  it('以本地周一至周日构造周范围，正确跨月', () => {
    expect(weekRange('2026-10-26')).toEqual({ start: '2026-10-26', end: '2026-11-01' });
    expect(weekRange('2026-10-25')).toEqual({ start: '2026-10-19', end: '2026-10-25' });
  });
  it('只汇总本周真实记录并生成隐私提示和周报', () => {
    const d = demoData(), p = d.projects[0], t = d.tasks.find(task => task.projectId === p.id)!;
    t.status = 'done'; t.completedAt = '2026-10-27T08:00:00.000Z'; t.updatedAt = t.completedAt;
    const week = { start:'2026-10-26', end:'2026-11-01' };
    const ids = weeklyProjectIds(d,week);
    expect(ids.has(p.id)).toBe(true);
    const report = buildWeeklyReport(d,[p.id],week);
    expect(report[0].completed).toContain(t);
    const md = weeklyMarkdown(report,week);
    expect(md).toContain('本周完成的行动');
    expect(weeklyAiPrompt(report,week)).toContain('不根据日期或任务数量推算完成百分比');
    expect(weeklyAiPrompt(report,week)).toContain(md);
  });
  it('默认选择覆盖本周的科研计划时段，而排除仅与本周相邻的时段', () => {
    const d = demoData();
    const [scheduled, adjacent] = d.projects;
    const old = '2025-01-01T00:00:00.000Z';
    d.projects.forEach(p => { p.updatedAt = old; if (p.snapshot) p.snapshot.updatedAt = old; });
    d.tasks.forEach(t => { t.updatedAt = old; delete t.completedAt; });
    d.milestones.forEach(m => { m.updatedAt = old; });
    d.results.forEach(r => { r.updatedAt = old; });
    d.ideas.forEach(i => { i.updatedAt = old; });
    d.focusSessions = [];
    const week = { start:'2026-10-26', end:'2026-11-01' };
    d.planPeriods = [
      { ...base(), projectId:scheduled.id, name:'跨周计划', note:'', startDate:'2026-10-31', endDate:'2026-11-03', priority:false },
      { ...base(), projectId:adjacent.id, name:'上周计划', note:'', startDate:'2026-10-19', endDate:'2026-10-25', priority:false },
    ];
    const selected = weeklyProjectIds(d,week);
    expect(selected.has(scheduled.id)).toBe(true);
    expect(selected.has(adjacent.id)).toBe(false);
  });
});

describe('行动顺序', () => {
  it('旧行动没有 order 时沿用数组次序，调整后写入顺序且不跨分组', () => {
    const d = demoData(), project = d.projects[0];
    d.tasks = d.tasks.filter(t => t.projectId === project.id);
    d.tasks.push({ ...d.tasks[0], id:'second', name:'第二项', milestoneId:undefined, order:undefined });
    d.tasks[0].order = undefined;
    expect(orderedTasks(d,project.id).map(t => t.name)).toEqual([d.tasks[0].name,'第二项']);
    moveTask(d,d.tasks[0].id,1);
    expect(orderedTasks(d,project.id).map(t => t.name)).toEqual(['第二项',d.tasks[0].name]);
    const other = { ...d.tasks[0], id:'other-group', milestoneId:'different' };
    d.tasks.push(other);
    reorderTasks(d,d.tasks[0].id,other.id);
    expect(orderedTasks(d,project.id).map(t => t.id)).toEqual(['second',d.tasks[0].id]);
  });
});

describe('主项目与子项目', () => {
  it('能显示层级路径并在主项目删除时保留子项目', () => {
    const d = demoData(), main = d.projects[0], child = d.projects[1];
    child.mainProjectId = main.id;
    expect(projectPath(d,child)).toBe(`${main.name} / ${child.name}`);
    expect(groupProjects([child,main]).map(p => p.id)).toEqual([main.id,child.id]);
    releaseChildren(d,new Set([main.id]));
    d.projects = d.projects.filter(p => p.id !== main.id);
    expect(d.projects.some(p => p.id === child.id && !p.mainProjectId)).toBe(true);
  });
  it('拒绝自引用、悬空关联和超过一级的关系', () => {
    const d = demoData();
    d.projects[0].mainProjectId = d.projects[0].id;
    expect(() => parseBackup(JSON.stringify(d))).toThrow();
    d.projects[0].mainProjectId = undefined;
    d.projects[1].mainProjectId = 'missing';
    expect(() => parseBackup(JSON.stringify(d))).toThrow();
    d.projects[1].mainProjectId = d.projects[0].id;
    d.projects[2].mainProjectId = d.projects[1].id;
    expect(() => parseBackup(JSON.stringify(d))).toThrow();
  });
});
