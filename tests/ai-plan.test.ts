import { describe, expect, it } from "vitest";
import { actionMatches, buildPlanPrompt, parseResearchPlan } from "../src/aiPlan";

describe("ResearchFlow 外部计划协议", () => {
  it("通用自由文本协议可表示湿实验、竞赛以及不分阶段的行动", () => {
    const result = parseResearchPlan(JSON.stringify({
      format: "researchflow-plan", version: 1,
      projectName: "湿实验优化", projectType: "湿实验 / 方案尚在调整",
      milestones: [{ name: "预实验条件评估", outcome: "形成可复核的评估记录", actions: [{ name: "整理条件与观察指标", type: "实验设计" }] }],
      actions: [{ name: "确认比赛提交清单", type: "竞赛交付" }],
    }));
    expect(result.milestones[0].name).toBe("预实验条件评估");
    expect(result.actions[0].name).toBe("确认比赛提交清单");
    expect(result.warnings).toEqual([]);
  });

  it("兼容单层 JSON 代码围栏并拒绝整份应用备份", () => {
    expect(parseResearchPlan('```json\n{"format":"researchflow-plan","version":1,"actions":[{"name":"写作提纲"}]}\n```').actions).toHaveLength(1);
    expect(() => parseResearchPlan('{"schemaVersion":2,"projects":[]}')).toThrow("格式标识");
  });

  it("对未知协议字段给出可见警告，不把它们混入本地记录", () => {
    const result = parseResearchPlan(JSON.stringify({
      format: "researchflow-plan", version: 1, vendor: "external",
      milestones: [{ name: "条件评估", vendorStageCode: "abc", actions: [{ name: "整理记录", vendorActionId: "123" }] }],
    }));
    expect(result.warnings).toHaveLength(3);
    expect(result.milestones[0]).not.toHaveProperty("vendorStageCode");
    expect(result.milestones[0].actions[0]).not.toHaveProperty("vendorActionId");
  });

  it("拒绝未来版本、无效日期、超限结构和空计划", () => {
    const parse = (value: unknown) => parseResearchPlan(JSON.stringify(value));
    expect(() => parse({ format: "researchflow-plan", version: 2, actions: [{ name: "x" }] })).toThrow("版本");
    expect(() => parse({ format: "researchflow-plan", version: 1, milestones: [{ name: "阶段", startDate: "2026-02-30" }] })).toThrow("日期无效");
    expect(() => parse({ format: "researchflow-plan", version: 1 })).toThrow("至少需要");
    expect(() => parse({ format: "researchflow-plan", version: 1, milestones: Array.from({ length: 51 }, (_, i) => ({ name: `阶段${i}` })) })).toThrow("最多为 50");
  });

  it("以透明的字段完全一致检查提示重复，不把相似命名当作重复", () => {
    const first = { name: "整理 变量定义表", type: "数据整理", note: "先核对字段", minutes: 25 };
    expect(actionMatches(first, { ...first, name: "整理   变量定义表" })).toBe(true);
    expect(actionMatches(first, { ...first, name: "更新变量定义表" })).toBe(false);
  });

  it("项目名称含引号、反斜杠和换行时，提示词内的协议示例仍可被导入器解析", () => {
    const projectName = '研究“甲”与"乙"：C:\\实验\\数据\n补充验证';
    const prompt = buildPlanPrompt(projectName);
    expect(prompt).toContain(`项目名称：${projectName}`);
    const example = prompt.slice(prompt.indexOf('\n{\n') + 1, prompt.indexOf('\n}\n') + 2);
    const parsed = parseResearchPlan(example);
    expect(parsed.projectName).toBe(projectName);
    expect(parsed.warnings).toEqual([]);
    expect(parsed.milestones[0].actions).toHaveLength(1);
  });
});
