// WebView2 integration harness. Requires an isolated build; never opens the user's app profile.
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { expect } from '@playwright/test';

const records=resolve('../05-agent-records/ResearchFlow_1.6.0');
const manifest=JSON.parse(await readFile(join(records,'native-test-build.json'),'utf8'));
const identifier='com.researchflow.integration.v160';
assert.equal(manifest.identifier,identifier);
const bytes=await readFile(manifest.executable);
assert.equal(createHash('sha256').update(bytes).digest('hex').toUpperCase(),manifest.sha256);
const profile=join(process.env.APPDATA,identifier);
try { await access(profile); throw new Error('Isolated test profile already exists; preserve it and use a fresh test identifier.'); }
catch(e) { if(e.code!=='ENOENT') throw e; }
await mkdir(profile,{recursive:true});
const fixture=JSON.parse(await readFile(join(records,'native-fixture.json'),'utf8'));
fixture.settings.theme='dark';
const original=JSON.stringify(fixture,null,2);
await writeFile(join(profile,'researchflow.json'),original);
await writeFile(join(profile,'researchflow.version.json'),JSON.stringify({version:'1.5.0'}));
await writeFile(join(profile,'desktop.json'),JSON.stringify({mini:false}));
const screenshots=join(records,'native-screenshots'); await mkdir(screenshots,{recursive:true});
const endpoint='http://127.0.0.1:9446';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let child,browser,widget,manager;
const invoke=(page,command,args={})=>page.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});
async function launch() {
  child=spawn(manifest.executable,[],{windowsHide:true,stdio:'ignore',env:{...process.env,WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port=9446'}});
  for(let i=0;i<150;i++) {
    try { const response=await fetch(`${endpoint}/json/list`); const pages=await response.json(); if(pages.some(p=>p.url?.includes('view=widget'))) break; } catch {}
    if(i===149) throw Error('WebView2 did not start'); await pause(200);
  }
  browser=await chromium.connectOverCDP(endpoint);
  for(let i=0;i<100;i++) {
    widget=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('view=widget'));
    if(widget) break; await pause(100);
  }
  assert(widget,'Widget WebView was not exposed over CDP');
  await expect(widget.locator('.widget,.capsule')).toBeVisible();
  assert.equal(await invoke(widget,'data_path'),join(profile,'researchflow.json'));
}
async function openManager(page='overview') {
  await invoke(widget,'manager_show',{page});
  for(let i=0;i<100;i++) {
    manager=browser.contexts().flatMap(c=>c.pages()).find(p=>!p.url().includes('view=widget'));
    if(manager) break; await pause(100);
  }
  assert(manager,'Manager WebView was not exposed over CDP');
  await expect(manager.locator('main')).toBeVisible();
}
async function quit() {
  await invoke(widget,'quit_app').catch(()=>{});
  await Promise.race([new Promise(r=>child.once('exit',r)),pause(5000)]);
  if(child.exitCode===null) throw Error('The test app did not exit normally; it has not been force terminated.');
  await browser.close().catch(()=>{});
}
const report={identifier,profile,passed:false,checks:[]};
try {
  await launch();
  await expect(widget.locator('html')).toHaveAttribute('data-theme','dark');
  assert.equal(await readFile(join(profile,'researchflow.json'),'utf8'),original);
  assert.equal(await readFile(join(profile,'backups/before-1.6.0/researchflow.json'),'utf8'),original);
  assert.equal(JSON.parse(await readFile(join(profile,'backups/before-1.6.0/desktop.json'),'utf8')).mini,false);
  assert.deepEqual((await invoke(widget,'load_data')).projects,fixture.projects);
  report.checks.push('1.5.0 records and dark preference survive upgrade; exact bytes and desktop preferences are backed up');
  await openManager('settings');
  await manager.getByRole('button',{name:'浅色',exact:true}).click();
  await expect(widget.locator('html')).toHaveAttribute('data-theme','light');
  await manager.getByRole('button',{name:'编辑寄语',exact:true}).click();
  await manager.getByLabel('寄语内容',{exact:true}).fill('先核对证据，再写下结论。');
  await manager.getByRole('button',{name:'保存寄语',exact:true}).click();
  await expect(widget.locator('.widget-message')).toHaveText('先核对证据，再写下结论。');
  await manager.getByRole('button',{name:'概览',exact:true}).click();
  await expect(manager.locator('.overview-message')).toHaveText('先核对证据，再写下结论。');
  await manager.screenshot({path:join(screenshots,'overview-light.png')});
  await widget.getByRole('button',{name:'开始专注',exact:true}).click();
  await expect(manager.getByRole('timer')).toBeVisible();
  await widget.screenshot({path:join(screenshots,'widget-clock.png')});
  await manager.getByRole('button',{name:'暂停',exact:true}).click();
  await expect(widget.getByRole('timer')).toHaveAttribute('aria-label',/已暂停/);
  await widget.getByRole('button',{name:'继续专注',exact:true}).click();
  await expect(manager.getByRole('button',{name:'暂停',exact:true})).toBeVisible();
  report.checks.push('message, theme and focus session changes synchronize between two real native windows');
  await manager.getByRole('button',{name:'科研项目',exact:true}).click();
  const row=manager.locator('.project-item').filter({has:manager.getByRole('heading',{name:fixture.projects[0].name,exact:true})});
  await row.getByRole('button',{name:'流程图',exact:true}).click();
  await expect(manager.locator('.workflow-stage')).toHaveCount(6);
  await manager.getByRole('button',{name:'收起所有行动',exact:true}).click();
  await manager.getByRole('button',{name:'适应流程图窗口',exact:true}).click();
  await manager.screenshot({path:join(screenshots,'workflow.png')});
  await manager.keyboard.press('Escape');
  const firstState=await invoke(widget,'desktop_state');
  assert.equal(firstState.trayExists,true);
  await invoke(widget,'set_top',{value:true}); assert.equal((await invoke(widget,'desktop_state')).widget.alwaysOnTop,true);
  await invoke(widget,'set_top',{value:false});
  await invoke(widget,'hide_all'); assert.equal((await invoke(widget,'desktop_state')).widget.visible,false);
  await invoke(widget,'widget_show'); assert.equal((await invoke(widget,'desktop_state')).widget.visible,true);
  await invoke(widget,'manager_show',{page:'overview'});
  const second=spawn(manifest.executable,[],{windowsHide:true,stdio:'ignore'});
  await Promise.race([new Promise(r=>second.once('exit',r)),pause(5000)]);
  assert.notEqual(second.exitCode,null,'second instance must exit');
  report.checks.push('single instance, tray existence, hide and show command handlers, and always-on-top');
  await widget.getByRole('button',{name:'收起为胶囊',exact:true}).click();
  await expect.poll(()=>widget.evaluate(()=>innerWidth)).toBe(120);
  await widget.screenshot({path:join(screenshots,'capsule.png')});
  report.beforeRestart=await invoke(widget,'desktop_state');
  await quit();
  const beforeRestart=JSON.parse(await readFile(join(profile,'researchflow.json'),'utf8'));
  assert.equal(beforeRestart.timer.running,false); assert.equal(beforeRestart.timer.needsRecovery,true);
  await launch();
  await expect(widget.getByRole('button',{name:'展开科研卡片'})).toBeVisible();
  await widget.getByRole('button',{name:'展开科研卡片'}).click();
  await expect(widget.locator('.widget-message')).toHaveText('先核对证据，再写下结论。');
  await expect(widget.getByRole('timer')).toHaveAttribute('aria-label',/待恢复/);
  await expect(widget.locator('html')).toHaveAttribute('data-theme','light');
  await widget.getByRole('button',{name:'结束专注',exact:true}).click();
  assert.equal((await invoke(widget,'load_data')).focusSessions.at(-1).status,'ended');
  report.afterRestart=await invoke(widget,'desktop_state');
  assert.equal(report.afterRestart.widget.x,report.beforeRestart.widget.x);
  assert.equal(report.afterRestart.widget.y,report.beforeRestart.widget.y);
  assert.equal(await readFile(join(profile,'backups/before-1.6.0/researchflow.json'),'utf8'),original);
  report.checks.push('normal quit saves active focus; restart restores capsule, position, message, theme and recoverable session; upgrade snapshot remains unchanged');
  report.passed=true;
} catch(e) { report.error=String(e.stack||e); throw e; }
finally {
  if(child && child.exitCode===null && widget) await quit().catch(e=>{report.exitError=String(e);});
  await writeFile(join(records,'native-verification.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}
