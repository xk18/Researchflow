import { describe, expect, it } from 'vitest';
import { base, emptyData, Todo } from '../src/types';
import { demoData } from './fixtures';
import { mergeBackup, parseBackup } from '../src/domain';
import { calendarMonth, calendarEntryTitle } from '../src/calendar';
import { deleteMilestone, planningPeriods, schedulingProjects, withinProjectDates } from '../src/planning';

const todo = (): Todo => ({ ...base(), text: '核对分析变量', date: '2026-10-27', done: false });
const read = (d: unknown) => parseBackup(JSON.stringify(d));
describe('1.7.2 optional data compatibility', () => {
  it('reads old backups without adding todos or changing any research record', () => {
    const d = demoData(), before = JSON.stringify(d);
    expect(read(d)).toEqual(d);
    expect(read(d).todos).toBeUndefined();
    expect(JSON.stringify(d)).toBe(before);
  });
  it('round trips todos and merges by id and latest timestamp without altering projects', () => {
    const d = demoData(); d.todos = [todo()];
    const imported = read(d), original = read(d);
    imported.todos![0].text = '核对变量和缺失值';
    imported.todos![0].updatedAt = '2099-10-27T12:00:00Z';
    imported.todos!.push(todo());
    const merged = mergeBackup(d, imported);
    expect(merged.todos).toHaveLength(2);
    expect(merged.todos![0].text).toBe('核对变量和缺失值');
    expect(merged.projects).toEqual(d.projects);
    expect(mergeBackup(merged, original).todos![0].text).toBe('核对变量和缺失值');
    expect(mergeBackup(merged, demoData()).todos).toEqual(merged.todos);
    expect(read(merged)).toEqual(merged);
  });
  it.each([
    { text: '' }, { text: '  ' }, { text: '字'.repeat(501) },
    { date: '2026-02-30' }, { done: 'false' }, { completedAt: 'invalid' },
  ])('rejects invalid todo fields %j before writing', change => {
    const d = emptyData(); d.todos = [{ ...todo(), ...change } as Todo];
    expect(() => read(d)).toThrow();
  });
  it('rejects malformed collections and duplicate ids across all record types', () => {
    expect(() => read({ ...emptyData(), todos: null })).toThrow();
    const d = demoData(); d.todos = [{ ...todo(), id: d.projects[0].id }];
    expect(() => read(d)).toThrow();
  });
});
describe('explicit calendar scheduling', () => {
  it('uses start/target bounds only for stable suggestions, preserving the input order and data', () => {
    const d = demoData();
    Object.assign(d.projects[1], { startDate: '2026-10-01', targetDate: '2026-10-31' });
    const before = JSON.stringify(d), p = d.projects[1];
    expect(withinProjectDates(p, '2026-10-01')).toBe(true);
    expect(withinProjectDates(p, '2026-10-31')).toBe(true);
    expect(withinProjectDates(p, '2026-11-01')).toBe(false);
    expect(withinProjectDates(p, '2026-10-99')).toBe(false);
    expect(withinProjectDates(d.projects[0], '2026-10-27')).toBe(false);
    expect(schedulingProjects(d, '2026-10-27').map(p => p.id)).toEqual([p.id, d.projects[0].id]);
    expect(schedulingProjects(d, '2026-10-27', d.projects[2].id)).toHaveLength(3);
    expect(calendarMonth(d, '2026-10-01').days.get('2026-10-27')).toHaveLength(0);
    expect(planningPeriods(d)[0].projectDates).toBe(true);
    expect(JSON.stringify(d)).toBe(before);
  });
  it('supports open ended suggestion bounds without creating assignments', () => {
    const p = demoData().projects[0];
    p.startDate = '2026-10-27';
    expect(withinProjectDates(p, '2026-10-26')).toBe(false);
    expect(withinProjectDates(p, '2026-10-28')).toBe(true);
    delete p.startDate; p.targetDate = '2026-10-27';
    expect(withinProjectDates(p, '2026-10-26')).toBe(true);
    expect(withinProjectDates(p, '2026-10-28')).toBe(false);
  });
  it('retains independent overlapping stage assignments and only clears a deleted stage link', () => {
    const d = demoData(), p = d.projects[0];
    d.milestones = ['主模型', '敏感性分析'].map((name, order) => ({ ...base(), projectId: p.id, name, order, status: 'todo', description: '', outcome: '' }));
    d.planPeriods = d.milestones.map(m => ({ ...base(), projectId: p.id, milestoneId: m.id, name: '', note: '', priority: false, startDate: '2026-10-27', endDate: '2026-10-27' }));
    const before = JSON.stringify(d), entries = calendarMonth(d, '2026-10-01').days.get('2026-10-27')!;
    expect(entries).toHaveLength(1);
    expect(entries[0].periods).toHaveLength(2);
    expect(entries[0].stageNames).toEqual(['主模型', '敏感性分析']);
    expect(calendarEntryTitle(entries[0])).toContain('研究阶段 · 主模型');
    expect(calendarMonth(d, '2026-10-01').days.get('2026-10-28')).toHaveLength(0);
    expect(JSON.stringify(d)).toBe(before);
    const ids = d.planPeriods.map(x => x.id), projects = structuredClone(d.projects);
    deleteMilestone(d, d.milestones[0].id);
    expect(d.planPeriods.map(x => x.id)).toEqual(ids);
    expect(d.planPeriods[0].milestoneId).toBeUndefined();
    expect(d.planPeriods[1].milestoneId).toBe(d.milestones[0].id);
    expect(d.projects).toEqual(projects);
    expect(() => read(d)).not.toThrow();
  });
  it('rejects missing and cross-project stage references', () => {
    const d = demoData();
    d.milestones.push({ ...base(), id: 'stage', projectId: d.projects[1].id, name: '阶段', order: 0, status: 'todo', description: '', outcome: '' });
    d.planPeriods.push({ ...base(), projectId: d.projects[0].id, milestoneId: 'stage', name: '', note: '', priority: false, startDate: '2026-10-27', endDate: '2026-10-27' });
    expect(() => read(d)).toThrow();
    d.planPeriods[0].milestoneId = 'missing';
    expect(() => read(d)).toThrow();
  });
});
