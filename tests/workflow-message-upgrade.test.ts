import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoData } from './fixtures';
import { base } from '../src/types';
import { parseBackup } from '../src/domain';
import { workflowBranches, workflowLayout } from '../src/workflowMap';
import { APP_VERSION } from '../src/version';
import { loadData, loadUpgradeBackup, saveData } from '../src/services/native';

describe('项目流程图使用真实数据', () => {
  it('保持阶段与行动顺序、隔离项目、保留未分组行动', () => {
    const d = demoData(), p = d.projects[1];
    d.milestones = [
      {...base(), id:'later', projectId:p.id, name:'写作', description:'', outcome:'', order:1, status:'todo'},
      {...base(), id:'first', projectId:p.id, name:'分析', description:'', outcome:'', order:0, status:'doing'},
    ];
    d.tasks[0].milestoneId = 'first'; d.tasks[0].order = 1;
    d.tasks.push({...d.tasks[0], id:'earlier', name:'主模型', order:0});
    const before = structuredClone(d);
    const branches = workflowBranches(d,p);
    expect(branches.map(b => b.id)).toEqual(['first','later','ungrouped']);
    expect(branches[0].tasks.map(t => t.id)).toEqual(['earlier',d.tasks[0].id]);
    expect(branches[1].tasks).toEqual([]);
    expect(branches[2].tasks.map(t => t.id)).toEqual([d.tasks[2].id]);
    const folded = workflowLayout(branches,new Set());
    const open = workflowLayout(branches,new Set(['first']));
    expect(open.rows[0].height).toBe(112);
    expect(open.rows[1].y).toBeGreaterThan(open.rows[0].y + open.rows[0].height);
    expect(open.height).toBeGreaterThan(folded.height);
    expect(d).toEqual(before);
  });
  it('空项目可以显示，布局不生成阶段或行动', () => {
    const d = demoData(); d.tasks=[];
    expect(workflowBranches(d,d.projects[0])).toEqual([]);
    expect(workflowLayout([],new Set()).height).toBe(280);
  });
});

describe('寄语备份兼容与校验', () => {
  it('旧备份无需寄语字段；自定义寄语完整往返', () => {
    const d = demoData(); expect(parseBackup(JSON.stringify(d))).toEqual(d);
    d.settings.message={text:'认真核对每一项证据。',font:'serif',size:18,spacing:1.5,overview:true,widget:false};
    expect(parseBackup(JSON.stringify(d))).toEqual(d);
  });
  it.each([
    {text:'长'.repeat(501)}, {font:'remote'}, {size:9}, {size:14.5},
    {spacing:5}, {overview:'true'}, {widget:null},
  ])('拒绝损坏的寄语设置 %j', patch => {
    const d = demoData(); d.settings.message={text:'寄语',font:'system',size:14,spacing:0,overview:true,widget:true,...patch} as never;
    expect(() => parseBackup(JSON.stringify(d))).toThrow();
  });
});

describe('升级数据保护（浏览器存储适配）', () => {
  function storage() {
    const values = new Map<string,string>();
    const store = {getItem:(k:string)=>values.get(k) ?? null,setItem:(k:string,v:string)=>{values.set(k,v);}};
    vi.stubGlobal('localStorage',store); vi.stubGlobal('window',{dispatchEvent:vi.fn()});
    return {values,store};
  }
  afterEach(() => vi.unstubAllGlobals());
  it('升级保留全部旧记录与偏好，后续保存不覆盖升级副本', async () => {
    const {values}=storage(), d=demoData(); d.settings.theme='dark';
    const bytes=JSON.stringify(d,null,2); values.set('researchflow-v1',bytes);
    values.set('researchflow-app-version','1.5.0');
    const current=await loadData(); expect(current.settings.theme).toBe('dark');
    expect(values.get(`researchflow-before-upgrade-${APP_VERSION}`)).toBe(bytes);
    current.projects[0].name='升级后修改';
    await saveData(current,current.revision);
    expect((await loadData()).projects[0].name).toBe('升级后修改');
    expect((await loadUpgradeBackup())!.projects).toEqual(d.projects);
    expect(values.get(`researchflow-before-upgrade-${APP_VERSION}`)).toBe(bytes);
  });
  it('副本保存失败时阻止读取迁移和后续写入，原数据保持原样', async () => {
    const {values,store}=storage(); const original=JSON.stringify(demoData()); values.set('researchflow-v1',original);
    const set=store.setItem;
    store.setItem=(k,v)=>{if(k.startsWith('researchflow-before-upgrade')) throw new Error('disk full'); set(k,v);};
    await expect(loadData()).rejects.toThrow('disk full');
    await expect(saveData(demoData(),0)).rejects.toThrow('disk full');
    expect(values.get('researchflow-v1')).toBe(original);
    expect(values.has('researchflow-app-version')).toBe(false);
  });
  it('未知版本和损坏的数据不会被初始化为空数据', async () => {
    const {values}=storage(); const bad=JSON.stringify({...demoData(),schemaVersion:99}); values.set('researchflow-v1',bad);
    await expect(loadData()).rejects.toThrow();
    expect(values.get('researchflow-v1')).toBe(bad);
    expect(values.has('researchflow-app-version')).toBe(false);
  });
});
