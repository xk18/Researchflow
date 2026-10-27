import { demoData } from "./fixtures";
import { describe, expect, it } from "vitest";
import {
  mergeBackup,
  parseBackup,
  recommend,
  resultMarkdown,
} from "../src/domain";
import { emptyData } from "../src/types";
describe("透明的行动推荐", () => {
  it("空数据不编造行动", () => expect(recommend(emptyData())).toBeUndefined());
  it("低动力推荐最短时长；暂停项目不参与", () => {
    const d = demoData();
    d.settings.motivation = "low";
    expect(recommend(d)?.minutes).toBe(10);
    const p = d.projects.find((p) => p.id === recommend(d)!.projectId)!;
    p.status = "paused";
    expect(recommend(d)?.minutes).toBe(20);
  });
  it("高动力优先探索", () => {
    const d = demoData();
    d.settings.motivation = "high";
    expect(
      d.projects.find((p) => p.id === recommend(d)!.projectId)?.track,
    ).toBe("explore");
  });
  it("进行中的任务不被新推荐打断", () => {
    const d = demoData();
    d.tasks[2].status = "running";
    d.settings.motivation = "low";
    expect(recommend(d)?.id).toBe(d.tasks[2].id);
  });
  it("已完成和稍后任务被排除", () => {
    const d = demoData();
    d.tasks[0].status = "done";
    d.tasks[1].deferredUntil = new Date(Date.now() + 50000).toISOString();
    expect(recommend(d)?.id).toBe(d.tasks[2].id);
  });
});
describe("备份可靠性", () => {
  it("完整中文数据往返保持一致", () => {
    const d = demoData();
    expect(parseBackup(JSON.stringify(d))).toEqual(d);
  });
  it.each(["schemaVersion", "projects", "settings"])("缺少%s被拒绝", (k) => {
    const d = demoData() as unknown as Record<string, unknown>;
    delete d[k];
    expect(() => parseBackup(JSON.stringify(d))).toThrow();
  });
  it("拒绝孤立行动和非法枚举", () => {
    const d = demoData();
    d.tasks[0].projectId = "unknown";
    expect(() => parseBackup(JSON.stringify(d))).toThrow();
  });
  it("拒绝无效计时器", () => {
    const d = demoData();
    d.timer = { taskId: "bad", deadline: 0, remaining: 0, running: true };
    expect(() => parseBackup(JSON.stringify(d))).toThrow();
  });
  it("重复导入不会复制项目，较新记录获保留", () => {
    const d = demoData();
    const newer = structuredClone(d);
    newer.projects[0].name = "更新后的中文课题";
    newer.projects[0].updatedAt = new Date(Date.now() + 1000).toISOString();
    const merged = mergeBackup(d, newer);
    expect(merged.projects).toHaveLength(3);
    expect(merged.projects[0].name).toBe("更新后的中文课题");
    expect(mergeBackup(merged, newer).projects).toHaveLength(3);
  });
  it("跨集合重复ID被拒绝", () => {
    const d = demoData();
    d.ideas[0].id = d.projects[0].id;
    expect(() => parseBackup(JSON.stringify(d))).toThrow();
  });
  it("超大备份被拒绝", () =>
    expect(() => parseBackup(" ".repeat(20_000_001))).toThrow());
});
describe("成果模板", () => {
  it("不补造数据，缺项使用占位符", () => {
    const d = demoData();
    const text = resultMarkdown(d.results[0], d.projects[0].name, true);
    expect(text).toContain("【待补充】");
    expect(text).toContain(d.results[0].observation);
    expect(text).toContain("Discussion：结果解释");
  });
});
