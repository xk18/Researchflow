import { describe, expect, it } from 'vitest';
import { emptyData, base, Milestone } from '../src/types';
import { parseBackup } from '../src/domain';
import { assignWorkflowTask, canNestStage, moveWorkflowStage, nestStage, workflowBranches, workflowLayout } from '../src/workflowMap';
import { deleteMilestone } from '../src/planning';
import { demoData } from './fixtures';
function fixture() {
  const d=demoData(), pid=d.projects[1].id;
  d.milestones=['准备','分析','交付'].map((name,order)=>({...base(),id:`stage-${order}`,projectId:pid,name,description:'',outcome:'',order,status:'todo'} as Milestone));
  d.tasks[0].milestoneId='stage-1';return d;
}
describe('流程图持久层级与记录保护',()=>{
  it('嵌套、提升和行动移动保留ID、日期、状态与专注记录',()=>{
    const d=fixture(), original=structuredClone(d), id=d.tasks[0].id;
    nestStage(d,'stage-1','stage-0');nestStage(d,'stage-2','stage-1');
    expect(workflowBranches(d,d.projects[1]).map(b=>b.depth)).toEqual([0,1,2,0]);
    expect(workflowLayout(workflowBranches(d,d.projects[1]),new Set(['stage-0'])).rows.map(r=>r.branch.id)).toEqual(['stage-0','stage-1','ungrouped']);
    assignWorkflowTask(d,id,'stage-2');
    expect(d.tasks[0]).toMatchObject({id,status:original.tasks[0].status,milestoneId:'stage-2'});
    expect(d.focusSessions).toEqual(original.focusSessions);expect(d.planPeriods).toEqual(original.planPeriods);
    nestStage(d,'stage-2');expect(d.milestones[2].parentMilestoneId).toBeUndefined();
    expect(parseBackup(JSON.stringify(d))).toEqual(d);
  });
  it('拒绝自引用、循环、跨项目和失效关联，失败不改任何记录',()=>{
    const d=fixture();nestStage(d,'stage-1','stage-0');
    d.milestones.push({...d.milestones[0],id:'foreign',projectId:d.projects[0].id});
    for(const owner of ['stage-1','stage-0','foreign','missing']){
      const before=structuredClone(d);expect(canNestStage(d,'stage-0',owner)).toBe(false);
      expect(()=>nestStage(d,'stage-0',owner)).toThrow();expect(d).toEqual(before);
    }
    const before=structuredClone(d);expect(()=>assignWorkflowTask(d,d.tasks[0].id,'foreign')).toThrow();expect(d).toEqual(before);
  });
  it('删除上级只提升直属子阶段，行动与其他记录保留',()=>{
    const d=fixture();nestStage(d,'stage-1','stage-0');nestStage(d,'stage-2','stage-1');
    const original=structuredClone(d);deleteMilestone(d,'stage-1');
    expect(d.milestones.find(m=>m.id==='stage-2')?.parentMilestoneId).toBe('stage-0');
    expect(d.tasks[0].milestoneId).toBeUndefined();expect(d.tasks.map(t=>t.id)).toEqual(original.tasks.map(t=>t.id));
    expect(d.projects).toEqual(original.projects);expect(d.focusSessions).toEqual(original.focusSessions);
    expect(parseBackup(JSON.stringify(d))).toEqual(d);
  });
  it('同层键盘排序不改变层级，旧相同order也能排序',()=>{
    const d=fixture();d.milestones.forEach(m=>m.order=0);moveWorkflowStage(d,'stage-1',-1);
    expect(workflowBranches(d,d.projects[1]).map(b=>b.id).slice(0,3)).toEqual(['stage-1','stage-0','stage-2']);
    expect(d.milestones.every(m=>!m.parentMilestoneId)).toBe(true);
  });
  it.each(['stage-0','missing','foreign',null,7])('非法备份层级 %j 在写入前拒绝',owner=>{
    const d=fixture();d.milestones[0].parentMilestoneId=owner as never;
    expect(()=>parseBackup(JSON.stringify(d))).toThrow();
  });
  it('旧版平面阶段保持平面，空项目不自动创建内容',()=>{
    const d=fixture();expect(parseBackup(JSON.stringify(d))).toEqual(d);
    expect(workflowBranches(d,d.projects[1]).every(b=>b.depth===0)).toBe(true);
    const empty=emptyData();expect(empty.milestones).toEqual([]);
  });
});
describe('全局字号备份兼容',()=>{
  it.each([12,14,16,18])('保存并恢复字号 %s',fontSize=>{
    const d=fixture();d.settings.fontSize=fontSize;expect(parseBackup(JSON.stringify(d)).settings.fontSize).toBe(fontSize);
  });
  it.each([0,11,19,14.5,'16',null])('拒绝无效字号 %j',fontSize=>{
    const d=fixture();d.settings.fontSize=fontSize as never;expect(()=>parseBackup(JSON.stringify(d))).toThrow();
  });
});
