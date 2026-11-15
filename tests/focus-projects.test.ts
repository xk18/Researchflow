import { describe, expect, it } from 'vitest';
import { demoData } from './fixtures';
import { base, ProjectStatus } from '../src/types';
import { cycleFocusProject, focusedProject, focusProjectOptions } from '../src/planning';
import { recommend, parseBackup } from '../src/domain';
import { endFocus, startFocus } from '../src/focus';

const today = '2026-11-15';
function fixture() {
  const d = demoData();
  d.projects.forEach(p => { p.priority = false; });
  d.planPeriods.push({...base(), projectId:d.projects[0].id, name:'今日安排', note:'', startDate:today, endDate:today, priority:false});
  return d;
}
describe('完整项目切换列表', () => {
  it('当天安排只影响排序，不排除无计划、无日期或无行动项目', () => {
    const d = fixture();
    const p = {...base(), name:'新建项目', background:'', track:'explore' as const, status:'active' as const, priority:false};
    d.projects.push(p);
    const before = structuredClone(d);
    expect(focusProjectOptions(d,today).map(p => p.id)).toEqual([d.projects[0].id,d.projects[1].id,p.id,d.projects[2].id]);
    expect(d).toEqual(before);
    d.tasks.push({...base(),projectId:p.id,name:'当天新建行动',type:'分析',minutes:20,status:'todo',note:''});
    d.settings.focusProjectId = p.id;
    expect(focusedProject(d,today)?.id).toBe(p.id);
    expect(recommend(d)?.projectId).toBe(p.id);
    expect(d.planPeriods).toEqual(before.planPeriods);
    expect(d.projects).toEqual(before.projects);
  });
  it.each<ProjectStatus>(['paused','completed','archived','terminated'])('%s 项目可选择，但不自动恢复或推荐其行动', status => {
    const d = fixture(), p = d.projects[0];
    p.status = status;
    d.settings.focusProjectId = p.id;
    expect(focusProjectOptions(d,today).some(x => x.id === p.id)).toBe(true);
    expect(focusedProject(d,today)?.id).toBe(p.id);
    expect(recommend(d)).toBeUndefined();
    expect(parseBackup(JSON.stringify(d)).settings.focusProjectId).toBe(p.id);
    expect(p.status).toBe(status);
  });
  it('循环使用实际默认选中项目，并能遍历全部项目', () => {
    const d = fixture();
    expect(focusedProject(d,today)?.id).toBe(d.projects[0].id);
    expect(cycleFocusProject(d,1,today)?.id).toBe(d.projects[1].id);
    expect(cycleFocusProject(d,-1,today)?.id).toBe(d.projects[2].id);
    d.settings.focusProjectId = 'deleted-project';
    expect(cycleFocusProject(d,1,today)?.id).toBe(d.projects[1].id);
    d.projects = [];
    expect(cycleFocusProject(d,1,today)).toBeUndefined();
  });
  it('无计划时仍保留全部项目，并对项目起止日期内的安排优先排序', () => {
    const d = fixture(); d.planPeriods = [];
    Object.assign(d.projects[1],{startDate:today,targetDate:today});
    expect(focusProjectOptions(d,today).map(p => p.id)).toEqual([d.projects[1].id,d.projects[0].id,d.projects[2].id]);
    expect(focusProjectOptions(d,'2026-11-16').map(p => p.id)).toEqual(d.projects.map(p => p.id));
  });
  it('切换到其他项目保留专注，结束后推荐选中项目', () => {
    const d = fixture(), task = d.tasks[0];
    startFocus(d,task,'countup',0,{token:'test',tick:0});
    const before = structuredClone(d);
    d.settings.focusProjectId = d.projects[0].id;
    expect(recommend(d)?.id).toBe(task.id);
    expect(d.timer).toEqual(before.timer);
    expect(d.focusSessions).toEqual(before.focusSessions);
    endFocus(d,{token:'test',tick:1000});
    expect(recommend(d)?.projectId).toBe(d.projects[0].id);
    expect(d.tasks.find(t => t.id === task.id)?.status).not.toBe('done');
  });
});
