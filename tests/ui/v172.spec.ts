import { test, expect, Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { demoData } from '../fixtures';
import { base } from '../../src/types';

const out = '../05-agent-records/ResearchFlow_1.7.2/screenshots';
const read = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('researchflow-v1')!));
async function seed(page: Page, route = 'todos') {
  await mkdir(out, { recursive: true });
  await page.clock.setFixedTime(new Date('2026-10-27T12:00:00+08:00'));
  const d = demoData(); d.settings.theme = 'light';
  Object.assign(d.projects[1], { startDate: '2026-10-01', targetDate: '2026-11-20' });
  d.milestones.push({ ...base(), id: 'analysis', projectId: d.projects[1].id, name: '撰写代码与主模型分析', order: 0, status: 'doing', description: '', outcome: '' });
  d.planPeriods.push({ ...base(), id: 'existing', projectId: d.projects[0].id, name: '原有安排', startDate: '2026-10-12', endDate: '2026-10-14', priority: true, note: '应保留' });
  await page.addInitScript(d => { if (!localStorage.getItem('researchflow-v1')) localStorage.setItem('researchflow-v1', JSON.stringify(d)); }, d);
  await page.goto(`/?page=${route}&planningDate=2026-10-27`);
  await expect(page.locator('main')).toBeVisible();
  return d;
}

test('待办入口、快速录入、完成、编辑、历史、删除与刷新保存；科研记录保持', async ({ page }) => {
  const d = await seed(page, 'overview');
  await page.locator('.nav-records summary').click();
  await page.getByRole('button', { name: '待办', exact: true }).click();
  await expect(page.getByLabel('查看待办日期')).toHaveValue('2026-10-27');
  for (const text of ['核对主模型的变量定义', '准备明日组会材料', '与合作者确认数据版本']) {
    await page.getByLabel('新增待办').fill(text); await page.getByLabel('新增待办').press('Enter');
    await expect(page.getByLabel('新增待办')).toHaveValue('');
  }
  await page.getByRole('button', { name: '完成待办 核对主模型的变量定义', exact: true }).click();
  await expect(page.locator('.todo-row.done')).toHaveCount(1);
  await page.screenshot({ path: `${out}/todos-light.png` });
  await page.reload(); await expect(page.locator('.todo-row')).toHaveCount(3);
  await page.getByRole('button', { name: '编辑待办 准备明日组会材料', exact: true }).click();
  await page.getByLabel('待办内容').fill('准备组会提纲与待讨论问题');
  await page.getByLabel('待办日期', { exact: true }).fill('2026-10-26');
  await page.getByRole('button', { name: '保存待办', exact: true }).click();
  await expect(page.locator('.todo-row')).toHaveCount(2);
  await page.getByRole('button', { name: '全部未完成', exact: true }).click();
  await expect(page.locator('.todo-row')).toHaveCount(2);
  await expect(page.locator('.todo-row').first()).toContainText('2026-10-26');
  await page.screenshot({ path: `${out}/todos-pending.png` });
  await page.getByRole('button', { name: '删除待办 准备组会提纲与待讨论问题', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('准备组会提纲与待讨论问题');
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await expect(page.locator('.todo-row')).toHaveCount(1);
  await page.getByRole('button', { name: '今天', exact: true }).click();
  await page.getByRole('button', { name: '重新打开待办 核对主模型的变量定义', exact: true }).click();
  await expect(page.locator('.todo-row.done')).toHaveCount(0);
  const after = await read(page);
  for (const key of ['projects', 'tasks', 'milestones', 'planPeriods', 'results', 'focusSessions'] as const) expect(after[key]).toEqual(d[key]);
  expect(after.todos).toHaveLength(2); expect(after.schemaVersion).toBe(2);
});

test('待办写入失败保留输入和原数据，重试与另一窗口同步', async ({ page, context }) => {
  const d = await seed(page);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'researchflow-v1') throw Error('模拟磁盘保存失败');
      return original.call(this, key, value);
    };
    (window as any).restoreStorage = () => { Storage.prototype.setItem = original; };
  });
  await page.getByLabel('新增待办').fill('保存失败也不能丢失'); await page.getByLabel('新增待办').press('Enter');
  await expect(page.getByRole('alert')).toContainText('保存失败');
  await expect(page.getByLabel('新增待办')).toHaveValue('保存失败也不能丢失');
  expect((await read(page)).todos).toBeUndefined(); expect((await read(page)).projects).toEqual(d.projects);
  await page.evaluate(() => (window as any).restoreStorage());
  await page.getByLabel('新增待办').press('Enter'); await expect(page.locator('.todo-row')).toHaveCount(1);
  const other = await context.newPage(); await other.goto('/?page=todos');
  await expect(other.locator('.todo-row')).toHaveCount(1);
  await other.getByLabel('新增待办').fill('第二窗口新增'); await other.getByLabel('新增待办').press('Enter');
  await expect(page.locator('.todo-row')).toHaveCount(2);
  await page.getByRole('button', { name: '完成待办 第二窗口新增', exact: true }).click();
  await expect(other.locator('.todo-row.done')).toHaveCount(1);
});

test('日期范围只推荐项目，主动安排单日与研究阶段，默认不勾选重点', async ({ page }) => {
  const d = await seed(page, 'plan');
  const day = page.locator('[data-date="2026-10-27"]');
  await expect(day.locator('.calendar-tag')).toHaveCount(0);
  await expect(page.locator('[data-date="2026-10-12"] .calendar-tag')).toHaveCount(1);
  await page.screenshot({ path: `${out}/calendar-before-schedule.png` });
  await day.locator('.calendar-date-button').click();
  await page.getByRole('button', { name: '在这一天安排研究', exact: true }).click();
  await expect(page.getByLabel('科研项目', { exact: true })).toHaveValue(d.projects[1].id);
  await expect(page.getByLabel('科研项目', { exact: true }).locator('optgroup').first()).toHaveAttribute('label', '所选日期范围内');
  await expect(page.getByLabel('作为这段时间的重点计划')).not.toBeChecked();
  await expect(page.getByLabel('开始日期', { exact: true })).toHaveValue('2026-10-27');
  await expect(page.getByLabel('结束日期（含当天）')).toHaveValue('2026-10-27');
  await page.getByLabel('研究阶段（可选）').selectOption('analysis');
  await page.screenshot({ path: `${out}/schedule-stage.png` });
  await page.getByLabel('科研项目', { exact: true }).selectOption(d.projects[0].id);
  await expect(page.getByLabel('研究阶段（可选）')).toHaveValue('');
  await page.getByLabel('科研项目', { exact: true }).selectOption(d.projects[1].id);
  await page.getByLabel('研究阶段（可选）').selectOption('analysis');
  await page.getByRole('button', { name: '保存计划', exact: true }).click();
  await expect(day.locator('.calendar-tag')).toHaveAttribute('title', /研究阶段 · 撰写代码与主模型分析/);
  await expect(page.locator('[data-date="2026-10-28"] .calendar-tag')).toHaveCount(0);
  await page.getByRole('status').waitFor({ state: 'hidden' });
  await page.screenshot({ path: `${out}/calendar-explicit.png` });
  await day.locator('.calendar-tag').click(); await expect(page.getByLabel('研究阶段（可选）')).toHaveValue('analysis');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.reload();
  const after = await read(page);
  expect(after.planPeriods).toHaveLength(2); expect(after.planPeriods[0]).toEqual(d.planPeriods[0]);
  expect(after.planPeriods[1]).toMatchObject({ projectId: d.projects[1].id, milestoneId: 'analysis', priority: false, startDate: '2026-10-27', endDate: '2026-10-27' });
  for (const key of ['projects', 'tasks', 'milestones', 'results', 'focusSessions'] as const) expect(after[key]).toEqual(d[key]);
  await page.locator('[data-date="2026-10-12"] .calendar-tag').click();
  await expect(page.getByLabel('作为这段时间的重点计划')).toBeChecked();
});

test('计划保存失败无部分写入，研究阶段和输入保留', async ({ page }) => {
  const d = await seed(page, 'plan');
  await page.getByRole('button', { name: '添加计划', exact: true }).click();
  await page.getByLabel('研究阶段（可选）').selectOption('analysis');
  await page.getByLabel('计划名称（可选）').fill('单日统计代码复核');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) { if (key === 'researchflow-v1') throw Error('模拟保存失败'); return original.call(this, key, value); };
  });
  await page.getByRole('button', { name: '保存计划', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('保存失败');
  await expect(page.getByLabel('研究阶段（可选）')).toHaveValue('analysis');
  await expect(page.getByLabel('计划名称（可选）')).toHaveValue('单日统计代码复核');
  expect((await read(page)).planPeriods).toEqual(d.planPeriods); expect((await read(page)).projects).toEqual(d.projects);
});

test('长待办、深色、大字号和窄窗口可读，六周月历不填满', async ({ page }) => {
  await seed(page);
  await page.getByLabel('新增待办').fill('核对主模型分析变量、缺失值处理与敏感性分析方案，记录需要在下次讨论时进一步确认的问题');
  await page.getByLabel('新增待办').press('Enter'); await expect(page.locator('.todo-row')).toHaveCount(1);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '深色', exact: true }).click(); await page.getByLabel('全局字号').fill('18');
  await page.setViewportSize({ width: 720, height: 560 });
  await page.goto('/?page=todos'); await expect(page.locator('html')).toHaveCSS('font-size', '18px');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => document.body.scrollWidth)).toBe(720);
  await expect(page.getByLabel('新增待办')).toBeInViewport();
  await page.screenshot({ path: `${out}/todos-dark-720.png` });
  await page.goto('/?page=plan&planningDate=2026-11-01');
  await expect(page.locator('.calendar-week')).toHaveCount(6);
  await expect(page.locator('.calendar-tag')).toHaveCount(1);
  await page.screenshot({ path: `${out}/calendar-six-weeks-dark-720.png` });
});
