import { expect, test } from '@playwright/test';
import { demoData } from '../fixtures';
import { base } from '../../src/types';
import { mkdir } from 'node:fs/promises';
import { addMilestones } from '../../src/planning';

test('科研周报预览先提示外部分享隐私并允许导出', async ({ page }) => {
  await mkdir('../05-agent-records/ResearchFlow_1.7.2/regression-screenshots',{recursive:true});
  const d = demoData();
  await page.goto('/');
  await page.evaluate(value => localStorage.setItem('researchflow-v1',JSON.stringify(value)),d);
  await page.reload();
  await page.locator('.nav-records > summary').click();
  await page.getByRole('button',{name:'状态回顾',exact:true}).click();
  await page.getByRole('button',{name:'导出科研进度'}).click();
  const dialog = page.locator('.report-modal');
  await expect(dialog.getByLabel('周报预览')).toHaveValue(/科研进度周报/);
  await expect(dialog.getByLabel('我已了解，确认继续复制或导出')).toBeInViewport();
  await page.screenshot({path:'../05-agent-records/ResearchFlow_1.7.2/regression-screenshots/weekly-report.png'});
  await dialog.getByRole('tab',{name:'AI 总结提示词'}).click();
  await expect(dialog.getByLabel('周报预览')).toHaveValue(/不根据日期或任务数量推算完成百分比/);
  const exportButton = dialog.getByRole('button',{name:'导出 Markdown'});
  await expect(exportButton).toBeDisabled();
  await expect(dialog.getByText('分享前检查隐私')).toBeVisible();
  await dialog.getByLabel('我已了解，确认继续复制或导出').check();
  const [download] = await Promise.all([page.waitForEvent('download'),exportButton.click()]);
  expect(await download.suggestedFilename()).toContain('科研进度周报-');
});

test('周报项目默认选择包含本周的计划时段', async ({ page }) => {
  const d = demoData();
  const scheduled = d.projects[0], adjacent = d.projects[1];
  const week = await page.evaluate(() => {
    const start = new Date();
    start.setHours(0,0,0,0);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const format = (date: Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    const previous = new Date(start);
    previous.setDate(previous.getDate()-7);
    const priorSunday = new Date(start);
    priorSunday.setDate(priorSunday.getDate()-1);
    return { start:format(start), end:format(end), priorStart:format(previous), priorEnd:format(priorSunday) };
  });
  const old = '2025-01-01T00:00:00.000Z';
  d.projects.forEach(p => { p.updatedAt = old; if (p.snapshot) p.snapshot.updatedAt = old; });
  d.tasks.forEach(t => { t.updatedAt = old; delete t.completedAt; });
  d.milestones.forEach(m => { m.updatedAt = old; });
  d.results.forEach(r => { r.updatedAt = old; });
  d.ideas.forEach(i => { i.updatedAt = old; });
  d.focusSessions = [];
  d.planPeriods = [
    {...base(),projectId:scheduled.id,name:'本周计划',note:'',startDate:week.start,endDate:week.end,priority:false},
    {...base(),projectId:adjacent.id,name:'上周计划',note:'',startDate:week.priorStart,endDate:week.priorEnd,priority:false},
  ];
  await page.goto('/');
  await page.evaluate(value => localStorage.setItem('researchflow-v1',JSON.stringify(value)),d);
  await page.reload();
  await page.locator('.nav-records > summary').click();
  await page.getByRole('button',{name:'状态回顾',exact:true}).click();
  await page.getByRole('button',{name:'导出科研进度'}).click();
  const choices = page.locator('.report-project-choice');
  await expect(choices.filter({hasText:scheduled.name}).locator('input')).toBeChecked();
  await expect(choices.filter({hasText:adjacent.name}).locator('input')).not.toBeChecked();
});

test('主项目删除只解除子项目关系并保留子项目记录', async ({ page }) => {
  await mkdir('../05-agent-records/ResearchFlow_1.7.2/regression-screenshots',{recursive:true});
  const d = demoData();
  const main = d.projects[0], child = d.projects[1];
  child.mainProjectId = main.id;
  await page.goto('/');
  await page.evaluate(value => localStorage.setItem('researchflow-v1',JSON.stringify(value)),d);
  await page.reload();
  await page.getByRole('button',{name:'科研项目',exact:true}).click();
  await page.screenshot({path:'../05-agent-records/ResearchFlow_1.7.2/regression-screenshots/project-hierarchy.png'});
  const mainRow = page.locator('.project-item').filter({has:page.getByRole('heading',{name:main.name,exact:true})});
  await mainRow.getByRole('button',{name:main.name}).click();
  await mainRow.getByRole('button',{name:'删除项目'}).click();
  await expect(page.getByText(/子项目及其记录会保留/)).toBeVisible();
  await page.getByRole('button',{name:'确认删除'}).click();
  await expect(page.getByRole('status')).toContainText('项目已删除');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('researchflow-v1')!));
  expect(saved.projects.some((p: {id:string;mainProjectId?:string}) => p.id === child.id && !p.mainProjectId)).toBe(true);
  expect(saved.tasks.some((t: {projectId:string}) => t.projectId === child.id)).toBe(true);
});

test('行动可通过键盘备用按钮排序，并在重载后保持', async ({ page }) => {
  const d = demoData(), project = d.projects[0];
  const existing = d.tasks.find(t => t.projectId === project.id)!;
  const second = {...base(),projectId:project.id,name:'第二项排序检查行动',type:'研究行动',minutes:10,status:'todo' as const,note:''};
  d.tasks.push(second);
  await page.goto('/');
  await page.evaluate(value => localStorage.setItem('researchflow-v1',JSON.stringify(value)),d);
  await page.reload();
  await page.getByRole('button',{name:'科研项目',exact:true}).click();
  const row = page.locator('.project-item').filter({has:page.getByRole('heading',{name:project.name,exact:true})});
  await row.getByRole('button',{name:project.name}).click();
  await row.getByRole('button',{name:`上移行动 ${second.name}`}).click();
  await expect.poll(() => page.evaluate(projectId => {
    const stored = JSON.parse(localStorage.getItem('researchflow-v1')!);
    return stored.tasks.filter((t: {projectId:string}) => t.projectId === projectId).sort((a: {order?:number},b: {order?:number}) => (a.order ?? 999) - (b.order ?? 999)).map((t: {id:string}) => t.id);
  },project.id)).toEqual([second.id,existing.id]);
  await page.reload();
  await row.getByRole('button',{name:project.name}).click();
  await expect(row.locator('.task-row').first()).toContainText(second.name);
});

test('阶段可用鼠标拖动排序并立即持久化', async ({ page }) => {
  const d = demoData(), project = d.projects[0];
  addMilestones(d,project.id,['阶段排序甲','阶段排序乙']);
  await page.goto('/');
  await page.evaluate(value => localStorage.setItem('researchflow-v1',JSON.stringify(value)),d);
  await page.reload();
  await page.getByRole('button',{name:'科研项目',exact:true}).click();
  const projectRow = page.locator('.project-item').filter({has:page.getByRole('heading',{name:project.name,exact:true})});
  await projectRow.getByRole('button',{name:project.name}).click();
  const source = projectRow.getByRole('button',{name:'拖动排序 阶段排序甲'});
  const target = projectRow.locator('.milestone-row summary').filter({hasText:'阶段排序乙'});
  await target.scrollIntoViewIfNeeded();
  const from = await source.boundingBox(), to = await target.boundingBox();
  expect(from).not.toBeNull();
  expect(to).not.toBeNull();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  for (let step = 1; step <= 8; step++) {
    await page.mouse.move(
      from!.x + from!.width / 2 + (to!.x + to!.width / 2 - from!.x - from!.width / 2) * step / 8,
      from!.y + from!.height / 2 + (to!.y + to!.height / 2 - from!.y - from!.height / 2) * step / 8,
      { steps: 1 },
    );
  }
  await page.mouse.up();
  await expect.poll(() => page.evaluate(projectId => JSON.parse(localStorage.getItem('researchflow-v1')!).milestones.filter((m:{projectId:string}) => m.projectId === projectId).sort((a:{order:number},b:{order:number}) => a.order-b.order).map((m:{name:string}) => m.name),project.id)).toEqual(['阶段排序乙','阶段排序甲']);
});

test('未分组行动可用鼠标拖动排序且不会改变所属项目', async ({ page }) => {
  const d = demoData(), project = d.projects[0];
  const existing = d.tasks.find(t => t.projectId === project.id && !t.milestoneId)!;
  const second = {...base(),projectId:project.id,name:'鼠标拖动排序第二项',type:'研究行动',minutes:15,status:'todo' as const,note:''};
  d.tasks.push(second);
  await page.goto('/');
  await page.evaluate(value => localStorage.setItem('researchflow-v1',JSON.stringify(value)),d);
  await page.reload();
  await page.getByRole('button',{name:'科研项目',exact:true}).click();
  const projectRow = page.locator('.project-item').filter({has:page.getByRole('heading',{name:project.name,exact:true})});
  await projectRow.getByRole('button',{name:project.name}).click();
  const source = projectRow.getByRole('button',{name:`拖动排序 ${second.name}`});
  const target = projectRow.locator('.task-row').filter({hasText:existing.name});
  await source.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();
  const from = await source.boundingBox(), to = await target.boundingBox();
  expect(from).not.toBeNull();
  expect(to).not.toBeNull();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  for (let step = 1; step <= 8; step++) {
    await page.mouse.move(
      from!.x + from!.width / 2 + (to!.x + to!.width / 2 - from!.x - from!.width / 2) * step / 8,
      from!.y + from!.height / 2 + (to!.y + to!.height / 2 - from!.y - from!.height / 2) * step / 8,
      { steps: 1 },
    );
  }
  await page.mouse.up();
  await expect.poll(() => page.evaluate(projectId => JSON.parse(localStorage.getItem('researchflow-v1')!).tasks.filter((t:{projectId:string;milestoneId?:string}) => t.projectId === projectId && !t.milestoneId).sort((a:{order:number},b:{order:number}) => a.order-b.order).map((t:{name:string}) => t.name),project.id)).toEqual([second.name,existing.name]);
});

test('悬浮窗优先列出当天已安排的进行中项目并保留当前专注', async ({ page }) => {
  const d = demoData(), [scheduled, second, paused] = d.projects;
  const today = new Date();
  const date = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const old = '2025-01-01T00:00:00.000Z';
  d.projects.forEach(project => { project.updatedAt = old; });
  d.tasks.forEach(task => { task.updatedAt = old; });
  paused.status = 'paused';
  d.settings.focusProjectId = scheduled.id;
  d.planPeriods = [{...base(),projectId:scheduled.id,name:'今日安排',note:'',startDate:date,endDate:date,priority:false}];
  const task = d.tasks.find(candidate => candidate.projectId === scheduled.id)!;
  const session = {...base(),projectId:scheduled.id,taskId:task.id,mode:'countdown' as const,plannedMinutes:25,elapsedMs:60000,startedAt:new Date().toISOString(),status:'running' as const};
  d.focusSessions = [session];
  d.timer = {taskId:task.id,sessionId:session.id,deadline:Date.now()+1_200_000,remaining:1_200_000,running:true,mode:'countdown',plannedMinutes:25,elapsedMs:60_000,clockToken:'ui-test',startedTick:0};
  await page.goto('/?view=widget');
  await page.evaluate(value => localStorage.setItem('researchflow-v1',JSON.stringify(value)),d);
  await page.reload();
  const select = page.getByRole('combobox',{name:'切换当前科研项目'});
  await expect(select.locator('option')).toHaveCount(1);
  await expect(page.getByRole('button',{name:'下一个科研项目'})).toBeDisabled();
  await expect(select).toHaveValue(scheduled.id);
  const more = {...base(),projectId:second.id,name:'今天需要推进的子研究',type:'分析',minutes:20,status:'todo' as const,note:''};
  d.tasks.push(more);
  d.planPeriods.push({...base(),projectId:second.id,name:'第二个今日安排',note:'',startDate:date,endDate:date,priority:false});
  await page.evaluate(value => localStorage.setItem('researchflow-v1',JSON.stringify(value)),d);
  await page.reload();
  const switcher = page.getByRole('combobox',{name:'切换当前科研项目'});
  await expect(switcher.locator('option')).toHaveCount(2);
  await page.getByRole('button',{name:'下一个科研项目'}).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('researchflow-v1')!).settings.focusProjectId)).toBe(second.id);
  await expect(page.locator('.widget-session-project')).toContainText(scheduled.name);
  await expect(switcher).toHaveValue(second.id);
});
