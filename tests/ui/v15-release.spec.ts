import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const screenshots = '../05-agent-records/ResearchFlow_1.7.2/regression-screenshots';

test('ResearchFlow 1.5.0 交付截图', async ({ page }) => {
  await mkdir(screenshots,{recursive:true});
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'欢迎使用 ResearchFlow'})).toBeVisible();
  await page.screenshot({path:`${screenshots}/first-use.png`});
  await page.getByRole('button',{name:'体验示例科研项目',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('已加载 3 个演示项目');
  await expect(page.getByRole('status')).toBeHidden({timeout:6000});
  await page.screenshot({path:`${screenshots}/overview.png`});

  await page.getByRole('button',{name:'科研项目',exact:true}).click();
  await expect(page.locator('.demo-label')).toHaveCount(3);
  await page.screenshot({path:`${screenshots}/projects.png`});

  const name = '食物中加盐与骨质疏松症之间的相关性';
  const row = page.locator('.project-item').filter({has:page.getByRole('heading',{name,exact:true})});
  await row.getByRole('button',{name,exact:true}).click();
  const roadmap = row.locator('.roadmap');
  await expect(roadmap.locator('.milestone-row')).toHaveCount(6);
  await page.screenshot({path:`${screenshots}/project-a-roadmap.png`,fullPage:true});
  const code = roadmap.locator('.milestone-row.doing').first();
  await expect(code.locator('.task-row')).toHaveCount(9);
  await code.screenshot({path:`${screenshots}/project-a-code-actions.png`});

  await page.getByRole('button',{name:'设置',exact:true}).click();
  const manager = page.locator('.sample-manager');
  await manager.scrollIntoViewIfNeeded();
  await manager.screenshot({path:`${screenshots}/demo-management.png`});
  await manager.getByRole('button',{name:'移除示例项目',exact:true}).click();
  await page.locator('.modal').screenshot({path:`${screenshots}/demo-removal-confirmation.png`});
});
