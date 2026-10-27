import { expect, test, Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { emptyData } from '../../src/types';
import { createSampleData, loadSamples } from '../../src/samples';

const screenshots='../05-agent-records/ResearchFlow_1.7.2/screenshots';
function example() {
  const d=emptyData(); loadSamples(d,createSampleData()); return d;
}
async function seed(page:Page) {
  await mkdir(screenshots,{recursive:true});
  const d=example();
  await writeFile('../05-agent-records/ResearchFlow_1.7.2/native-fixture.json',JSON.stringify(d,null,2));
  await page.addInitScript(d=>{if(!localStorage.getItem('researchflow-v1')) localStorage.setItem('researchflow-v1',JSON.stringify(d));},d);
  await page.goto('/'); await expect(page.locator('.overview-action')).toBeVisible(); return d;
}
const read=(page:Page)=>page.evaluate(()=>JSON.parse(localStorage.getItem('researchflow-v1')!));

test('图形倒计时到期后可继续计时，结束专注不完成行动',async({page})=>{
  await page.clock.install(); await seed(page); await page.goto('/?view=widget');
  await page.setViewportSize({width:320,height:400});
  await page.locator('.duration').click();
  await page.getByLabel('自定义分钟（1–240）').fill('1');
  await page.getByRole('dialog').getByRole('button',{name:'开始专注',exact:true}).click();
  await page.clock.fastForward(61000);
  await expect(page.getByRole('timer')).toHaveAttribute('aria-label',/时间到/);
  await expect(page.locator('.dial-state')).toHaveText('时间到');
  const id=(await read(page)).timer.taskId;
  await page.getByRole('button',{name:'继续专注',exact:true}).click();
  await expect(page.getByRole('timer')).toHaveAttribute('aria-label',/已专注 .*超时继续/);
  await page.getByRole('button',{name:'结束专注',exact:true}).click();
  const saved=await read(page); expect(saved.timer).toBeNull();
  expect(saved.tasks.find((t:{id:string})=>t.id===id).status).toBe('todo');
});

test('寄语保存失败保留输入和旧数据，可重试后清空',async({page})=>{
  await seed(page); const before=await read(page);
  await page.getByRole('button',{name:'设置',exact:true}).click();
  await page.getByRole('button',{name:'编辑寄语',exact:true}).click();
  await page.getByLabel('寄语内容',{exact:true}).fill('待保存的寄语');
  await page.evaluate(()=>{
    const original=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value){if(key==='researchflow-v1' && !sessionStorage.getItem('allow-save')) throw Error('模拟磁盘已满'); return original.call(this,key,value);};
  });
  await page.getByRole('button',{name:'保存寄语',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('保存失败');
  await expect(page.getByLabel('寄语内容',{exact:true})).toHaveValue('待保存的寄语');
  expect(await read(page)).toEqual(before);
  await expect(page.getByRole('status')).toHaveCount(0);
  await page.evaluate(()=>sessionStorage.setItem('allow-save','true'));
  await page.getByRole('button',{name:'保存寄语',exact:true}).click();
  await expect(page.getByRole('status')).toHaveText('寄语已保存');
  await page.getByRole('button',{name:'编辑寄语',exact:true}).click();
  await page.getByLabel('寄语内容',{exact:true}).fill('');
  await page.getByRole('button',{name:'保存寄语',exact:true}).click();
  await page.getByRole('button',{name:'概览',exact:true}).click();
  await expect(page.locator('.personal-message')).toHaveCount(0);
});

test('寄语编辑保存、重启恢复、分窗口显示及取消保护',async({page})=>{
  await seed(page); await page.getByRole('button',{name:'设置',exact:true}).click();
  await page.getByRole('button',{name:'编辑寄语',exact:true}).click();
  await page.getByLabel('寄语内容',{exact:true}).fill('先核对证据，再写下结论。');
  await page.getByLabel('字体',{exact:true}).selectOption('serif');
  await page.getByLabel('字号',{exact:true}).selectOption('18');
  await page.getByLabel('字间距',{exact:true}).fill('1.5');
  await expect(page.getByLabel('寄语预览')).toContainText('先核对证据');
  await page.screenshot({path:`${screenshots}/message-editor.png`});
  await page.getByRole('button',{name:'保存寄语',exact:true}).click();
  await expect(page.getByRole('status')).toHaveText('寄语已保存');
  expect((await read(page)).settings.message).toEqual({text:'先核对证据，再写下结论。',font:'serif',size:18,spacing:1.5,overview:true,widget:true});
  await page.reload(); await page.getByRole('button',{name:'概览',exact:true}).click();
  await expect(page.locator('.overview-message')).toHaveText('先核对证据，再写下结论。');
  await expect(page.locator('.overview-message')).toHaveCSS('font-size','18px');
  await page.getByRole('button',{name:'设置',exact:true}).click();
  await page.getByRole('button',{name:'编辑寄语',exact:true}).click();
  await page.getByLabel('寄语内容',{exact:true}).fill('尚未保存');
  await page.keyboard.press('Escape'); await expect(page.getByRole('alert')).toContainText('输入还没有保存');
  await page.getByRole('button',{name:'继续编辑',exact:true}).click();
  await expect(page.getByLabel('寄语内容',{exact:true})).toHaveValue('尚未保存');
  await page.getByRole('button',{name:'关闭对话框',exact:true}).click(); await page.getByRole('button',{name:'放弃编辑',exact:true}).click();
  expect((await read(page)).settings.message.text).toBe('先核对证据，再写下结论。');
  await page.getByRole('button',{name:'编辑寄语',exact:true}).click();
  await page.getByLabel('概览显示',{exact:true}).uncheck();
  await page.getByRole('button',{name:'保存寄语',exact:true}).click();
  await page.getByRole('button',{name:'概览',exact:true}).click(); await expect(page.locator('.overview-message')).toHaveCount(0);
  await page.setViewportSize({width:320,height:400}); await page.goto('/?view=widget');
  await expect(page.locator('.widget-message')).toHaveText('先核对证据，再写下结论。');
  await expect(page.getByRole('button',{name:'开始专注',exact:true})).toBeInViewport({ratio:1});
});

test('流程图浏览与原位编辑，保留列表定位入口',async({page})=>{
  const d=await seed(page); const before=await read(page);
  await page.getByRole('button',{name:'科研项目',exact:true}).click();
  const row=page.locator('.project-item').filter({has:page.getByRole('heading',{name:d.projects[0].name,exact:true})});
  await row.getByRole('button',{name:'流程图',exact:true}).click();
  await expect(page.locator('.workflow-stage')).toHaveCount(6);
  await expect(page.locator('.workflow-task')).toHaveCount(9);
  await page.screenshot({path:`${screenshots}/workflow-expanded.png`});
  await page.getByRole('button',{name:'收起所有行动',exact:true}).click(); await expect(page.locator('.workflow-task')).toHaveCount(0);
  await page.getByRole('button',{name:'适应流程图窗口',exact:true}).click();
  await page.screenshot({path:`${screenshots}/workflow-overview.png`});
  await page.getByRole('button',{name:'展开所有行动',exact:true}).click();
  expect(await page.locator('.workflow-task').count()).toBe(d.tasks.filter(t=>t.projectId===d.projects[0].id).length);
  await page.getByRole('button',{name:'重置流程图缩放',exact:true}).click();
  await page.getByRole('button',{name:'缩小流程图',exact:true}).click(); await expect(page.getByRole('button',{name:'重置流程图缩放'})).toHaveText('90%');
  await page.getByRole('button',{name:'适应流程图窗口',exact:true}).click();
  expect(await read(page)).toEqual(before);
  await page.getByRole('button',{name:'收起所有行动',exact:true}).click();
  await page.getByRole('button',{name:'展开 撰写代码 的行动',exact:true}).click();
  await page.locator('.workflow-task').filter({hasText:'编写主模型分析代码'}).dblclick();
  await expect(page.getByLabel('具体做什么？',{exact:true})).toHaveValue('编写主模型分析代码。');
  await page.getByLabel('具体做什么？',{exact:true}).fill('核对主模型代码和结局定义');
  await page.getByRole('button',{name:'保存行动',exact:true}).click();
  expect((await read(page)).tasks.some((t:{name:string})=>t.name==='核对主模型代码和结局定义')).toBe(true);
  await page.locator('.workflow-stage-name').filter({hasText:'撰写代码'}).click();
  await page.getByRole('button',{name:'在列表中打开',exact:true}).click();
  await expect(row.locator('.milestone-row.doing')).toHaveAttribute('open','');
  await expect(row.locator('.milestone-row.doing')).toContainText('核对主模型代码和结局定义');
});

test('升级前副本可预览，用户修改不会覆盖旧科研记录',async({page})=>{
  const d=await seed(page);
  await page.getByRole('button',{name:'设置',exact:true}).click();
  await page.getByRole('button',{name:'查看升级前副本',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('包含 3 个项目'); await page.keyboard.press('Escape');
  const snapshot=await page.evaluate(()=>localStorage.getItem('researchflow-before-upgrade-1.7.2'));
  expect(JSON.parse(snapshot!).projects).toEqual(d.projects);
  await page.getByRole('button',{name:'深色',exact:true}).click();
  await page.reload(); await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  expect(await page.evaluate(()=>localStorage.getItem('researchflow-before-upgrade-1.7.2'))).toBe(snapshot);
  expect((await read(page)).projects).toEqual(d.projects);
});

test('精简概览、图形计时器、长中文与深浅窗口截图',async({page})=>{
  await seed(page);
  await page.screenshot({path:`${screenshots}/overview-light.png`});
  await expect(page.locator('.overview-note,.action-foot')).toHaveCount(0);
  await expect(page.locator('.main-footer')).toContainText('由雪冠制作');
  for (const [width,height] of [[900,650],[720,560]]) {
    await page.setViewportSize({width,height});
    await expect(page.getByRole('button',{name:'开始专注',exact:true})).toBeInViewport({ratio:1});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
    await page.screenshot({path:`${screenshots}/overview-${width}x${height}.png`});
  }
  await page.getByRole('button',{name:'开始专注',exact:true}).click();
  await page.setViewportSize({width:320,height:400}); await page.goto('/?view=widget');
  await expect(page.getByRole('button',{name:'继续专注',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'继续专注',exact:true}).click();
  await expect(page.getByRole('timer')).toHaveAttribute('aria-label',/剩余 .*正在专注/);
  await expect(page.locator('.compact .timer')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'暂停',exact:true})).toBeInViewport({ratio:1});
  await expect(page.getByRole('button',{name:'完成行动',exact:true})).toHaveText('');
  await page.screenshot({path:`${screenshots}/widget-clock-light.png`});
  await page.getByRole('button',{name:'暂停',exact:true}).click();
  await expect(page.getByRole('timer')).toHaveAttribute('aria-label',/已暂停/);
  await page.getByRole('button',{name:'继续专注',exact:true}).click();
  await page.getByRole('button',{name:'结束专注',exact:true}).click();
  expect((await read(page)).focusSessions[0].status).toBe('ended');
  expect((await read(page)).tasks.some((t:{status:string})=>t.status==='done')).toBe(true);
  await page.screenshot({path:`${screenshots}/widget-idle-light.png`});
  await page.evaluate(()=>{const d=JSON.parse(localStorage.getItem('researchflow-v1')!);d.settings.theme='dark';localStorage.setItem('researchflow-v1',JSON.stringify(d));window.dispatchEvent(new Event('researchflow-changed'));});
  await page.getByRole('button',{name:'开始专注',exact:true}).click(); await page.screenshot({path:`${screenshots}/widget-clock-dark.png`});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(320);
  await page.getByRole('button',{name:'收起为胶囊',exact:true}).click(); await page.setViewportSize({width:120,height:44});
  await page.screenshot({path:`${screenshots}/capsule.png`});
  await expect(page.getByRole('button',{name:'展开科研卡片'})).toBeInViewport({ratio:1});
});
