import { AppData, base, emptyData, Project } from "../src/types";
// Legacy fixture keeps pre-existing workflow tests independent of the onboarding seed.
export function demoData(): AppData {
  const d = emptyData();
  const p1: Project = {
    ...base(),
    demo: true,
    name: "材料微结构与性能的关系",
    background:
      "比较不同实验条件下的结果，寻找值得验证的结构与性能关系。示例内容不代表真实科研结论。",
    track: "explore",
    status: "active",
    priority: true,
  };
  const p2: Project = {
    ...base(),
    demo: true,
    name: "实验结果整理与研究论文初稿",
    background: "已完成首轮分析，准备将现有结果整理为论文素材。",
    track: "deliver",
    status: "active",
    priority: true,
  };
  const p3: Project = {
    ...base(),
    demo: true,
    name: "模型参数的重复验证",
    background: "暂存分析进展与下一步，获得新数据后继续验证。",
    track: "deliver",
    status: "paused",
    priority: false,
    snapshot: {
      ...base(),
      conclusion: "首轮分析已经完成，结果尚需重复验证。",
      questions: "第三组参数的日志需要检查。",
      files: [],
      blocker: "等待下一轮数据。",
      nextAction: "整理上一轮实验的错误记录",
    },
  };
  d.projects = [p1, p2, p3];
  d.tasks = [
    {
      ...base(),
      demo: true,
      projectId: p2.id,
      name: "核对 Figure 2 的统计结果",
      minutes: 10,
      type: "结果检查",
      status: "todo",
      note: "打开上一轮结果，先核对一组数据。",
    },
    {
      ...base(),
      demo: true,
      projectId: p1.id,
      name: "梳理一个待验证的实验假设",
      minutes: 20,
      type: "科学问题",
      status: "todo",
      note: "",
    },
    {
      ...base(),
      demo: true,
      projectId: p2.id,
      name: "完成 Results 第二段的初稿",
      minutes: 45,
      type: "论文写作",
      status: "todo",
      note: "",
    },
  ];
  d.results = [
    {
      ...base(),
      demo: true,
      projectId: p1.id,
      observation: "这里可以先保存一句观察，再慢慢补全证据。",
      hypothesis: "【示例】一个待验证的研究问题",
      evidence: "",
      support: "尚待验证",
      interpretation: "",
      limitations: "",
      validation: "重复验证并检查混杂因素",
      significance: "",
    },
  ];
  d.ideas = [
    {
      ...base(),
      demo: true,
      text: "试着用不同的时间窗口观察结果是否稳定。",
      archived: false,
    },
  ];
  return d;
}
