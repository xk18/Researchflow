import { test, expect, Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { demoData } from '../fixtures';
import { base } from '../../src/types';

const out = '../05-agent-records/ResearchFlow_1.7.3/screenshots';
const read = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('researchflow-v1')!));
async function seed(page: Page, route = '/?page=overview') {
  const d = demoData(); d.settings.focusProjectId = d.projects[0].id;
  d.projects.forEach(p => p.priority = false);
  d.planPeriods = [{...base(),projectId:d.projects[0].id,name:'今日安排',note:'',startDate:'2026-11-15',endDate:'2026-11-15',priority:false}];
  const fresh = {...base(),name:'未设重点且没有日期的新研究',background:'隔离测试内容',track:'deliver' as const,status:'active' as const,priority:false};
  d.projects.push(fresh);
  for (const status of ['completed','archived','terminated'] as const) d.projects.push({...base(),name:`状态-${status}`,background:'',track:'explore',status,priority:false});
  await page.clock.setFixedTime(new Date('2026-11-15T12:00:00+08:00'));
  await page.addInitScript(d => { if (!localStorage.getItem('researchflow-v1')) localStorage.setItem('researchflow-v1',JSON.stringify(d)); },d);
  await page.goto(route);
  await expect(page.getByRole('combobox',{name:'切换当前科研项目'})).toBeVisible();
  return { d, fresh };
}

test('概览中新建行动后可选全部项目，选择持久化并同步至悬浮窗', async ({page,context}) => {
  const {d,fresh} = await seed(page);
  const select = page.getByRole('combobox',{name:'切换当前科研项目'});
  await expect(select.locator('option')).toHaveCount(d.projects.length);
  await select.selectOption(fresh.id);
  await expect(page.getByRole('button',{name:'添加行动',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'添加行动',exact:true}).click();
  await expect(page.getByLabel('所属项目')).toHaveValue(fresh.id);
  await page.getByLabel('具体做什么？').fill('今天为新研究核对变量定义');
  await page.getByRole('button',{name:'保存行动',exact:true}).click();
  await expect(page.getByRole('heading',{name:'今天为新研究核对变量定义',exact:true})).toBeVisible();
  await select.selectOption(d.projects[0].id);
  await select.selectOption(fresh.id);
  await page.reload(); await expect(select).toHaveValue(fresh.id);
  const other = await context.newPage(); await other.goto('/?view=widget');
  const widgetSelect = other.getByRole('combobox',{name:'切换当前科研项目'});
  await expect(widgetSelect).toHaveValue(fresh.id);
  await widgetSelect.selectOption(d.projects[1].id);
  await expect(select).toHaveValue(d.projects[1].id);
  await select.selectOption(fresh.id);
  await expect(widgetSelect).toHaveValue(fresh.id);
  const saved = await read(page);
  expect(saved.projects).toEqual(d.projects); expect(saved.planPeriods).toEqual(d.planPeriods);
  expect(saved.tasks.slice(0,d.tasks.length)).toEqual(d.tasks);
  expect(saved.tasks.at(-1).projectId).toBe(fresh.id);
  await mkdir(out,{recursive:true});
  await page.screenshot({path:`${out}/overview-all-projects.png`});
  await other.setViewportSize({width:320,height:400});
  await other.screenshot({path:`${out}/widget-new-project.png`});
});

test('所有状态可选择和查看，不会切回其他项目或自动恢复', async ({page}) => {
  const {d} = await seed(page);
  const select = page.getByRole('combobox',{name:'切换当前科研项目'});
  for (const project of d.projects.filter(p => p.status !== 'active')) {
    await select.selectOption(project.id);
    await expect(select).toHaveValue(project.id);
    await expect(page.locator('.inactive-project-notice')).toContainText('恢复为进行中后可专注');
    await expect(page.getByRole('button',{name:'开始专注',exact:true})).toHaveCount(0);
    await page.reload(); await expect(select).toHaveValue(project.id);
    expect((await read(page)).projects).toEqual(d.projects);
  }
  await page.getByRole('button',{name:'打开项目',exact:true}).click();
  await expect(page.locator('.project-item').filter({has:page.getByRole('heading',{name:'状态-terminated',exact:true})})).toBeVisible();
  await page.goto(`/?page=projects:${d.projects[2].id}`);
  await expect(page.locator('.project-item').filter({has:page.getByRole('heading',{name:d.projects[2].name,exact:true})})).toBeVisible();
});

test('切换项目保留计时，结束后显示新项目；选择保存失败可重试', async ({page}) => {
  const {d} = await seed(page);
  const select = page.getByRole('combobox',{name:'切换当前科研项目'});
  await page.getByRole('button',{name:'开始专注',exact:true}).click();
  const before = await read(page);
  await select.selectOption(d.projects[1].id);
  await expect(select).toHaveValue(d.projects[1].id);
  expect((await read(page)).timer.sessionId).toBe(before.timer.sessionId);
  expect((await read(page)).focusSessions[0].projectId).toBe(d.projects[0].id);
  await expect(page.locator('.overview-focus-note')).toContainText('正在专注');
  await page.getByRole('button',{name:'结束专注',exact:true}).click();
  await expect(page.getByRole('heading',{name:d.tasks[0].name,exact:true})).toBeVisible();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key,value) {
      if (key === 'researchflow-v1' && !sessionStorage.getItem('allow-write')) throw Error('模拟保存失败');
      return original.call(this,key,value);
    };
  });
  await select.selectOption(d.projects[0].id);
  await expect(page.getByRole('alert')).toContainText('保存失败');
  expect((await read(page)).settings.focusProjectId).toBe(d.projects[1].id);
  await expect(select).toHaveValue(d.projects[1].id);
  await page.evaluate(() => sessionStorage.setItem('allow-write','1'));
  await select.selectOption(d.projects[0].id); await expect(select).toHaveValue(d.projects[0].id);
});

test('窄窗口和深色长中文切换不溢出，行动视角使用相同完整列表', async ({page}) => {
  const {d,fresh} = await seed(page,'/?view=widget');
  await page.setViewportSize({width:320,height:400});
  await page.evaluate(id => {
    const data=JSON.parse(localStorage.getItem('researchflow-v1')!);
    data.projects.find((p:{id:string})=>p.id===id).name='用于验证长中文项目切换可读性与完整性的科研项目'.repeat(5);
    data.settings.theme='dark';localStorage.setItem('researchflow-v1',JSON.stringify(data));window.dispatchEvent(new Event('researchflow-changed'));
  },fresh.id);
  await page.getByRole('combobox',{name:'切换当前科研项目'}).selectOption(fresh.id);
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(320);
  await mkdir(out,{recursive:true});await page.screenshot({path:`${out}/widget-dark-long-title.png`});
  await page.setViewportSize({width:720,height:560});await page.goto('/?page=focus');
  const select = page.getByLabel('当前科研重点',{exact:true});
  await expect(select.locator('option')).toHaveCount(d.projects.length);
  await expect(select).toHaveValue(fresh.id);
  await select.selectOption(d.projects[2].id);
  await expect(page.locator('.inactive-project-notice')).toBeVisible();
});
