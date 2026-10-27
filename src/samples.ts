import { AppData, base, emptyData, Milestone, Project, Task } from "./types";
import { addDays, localDate } from "./dates";
import { releaseChildren } from './projectRelations';

type StageSeed = [string, string, string, number, number, Milestone["status"], number, string[]];
const teachingNote = "教学示例：完成标记仅用于说明工作流程，软件没有下载数据库、运行分析或取得研究结果。";
const seeds: { key: NonNullable<Project["sampleKey"]>; name: string; background: string; track: Project["track"]; start: number; end: number; stages: StageSeed[] }[] = [
  { key: "paper", name: "食物中加盐与骨质疏松症之间的相关性", track: "deliver", start: -14, end: 84,
    background: "研究食物中加盐习惯与骨质疏松症相关结局之间的关联，完成数据分析、研究结果整理、论文撰写和投稿准备。观察性研究应根据实际数据与研究设计选择方法；关联不代表因果。" + teachingNote,
    stages: [
      ["下载数据", "确定合适的数据来源，获取原始数据和变量说明；先核查授权和关键变量是否存在。", "获得版本清楚、完整性已核查的数据与变量字典。", -14, -3, "done", 2, ["确认研究数据库、访问权限及需要下载的数据范围。", "下载原始数据与变量说明文件，并按版本整理保存。"]],
      ["撰写代码", "组织可复现的分析流程，依实际结局类型与研究设计选择模型；主模型与敏感性分析分别管理。", "形成可运行、经过诊断且输出结构明确的分析脚本。", -2, 21, "doing", 3, ["建立分析代码结构。", "编写数据清洗代码。", "明确研究队列与变量定义。", "编写主模型分析代码。", "编写协变量调整模型。", "编写敏感性分析代码。", "评估是否需要亚组分析。", "检查统计模型和代码运行。", "整理最终分析脚本。"]],
      ["整理结果数据", "对真实、已核查的分析输出进行系统整理。示例没有统计结果，不预设关联方向或显著性。", "形成与脚本输出一致的结果表和 Results 写作材料。", 22, 34, "todo", 0, ["核对主要模型结果。", "整理研究对象的基本特征。", "整理主要分析结果表。", "整理敏感性分析结果。", "检查结果表格与模型输出的一致性。", "记录尚需进一步验证的分析问题。", "为论文 Results 部分整理写作材料。"]],
      ["绘图", "根据真实分析结果设计图表，保留可重复生成的绘图代码。", "导出标注完整、规格符合论文要求的图形文件。", 35, 45, "todo", 0, ["明确需要制作的主要图表。", "整理绘图所需的数据格式。", "编写主要结果绘图代码。", "根据研究需要制作敏感性分析相关图表。", "统一图形配色、字体和标注方式。", "检查图例、坐标轴与统计信息。", "导出适合论文使用的图形文件。"]],
      ["完成最终写作", "以真实研究方法与结果撰写稿件，区分观察、解释和局限，不自动生成研究结论。", "形成章节、图表、正文引用和补充材料一致的投稿前稿件。", 46, 70, "todo", 0, ["完善 Introduction。", "完善 Methods。", "根据真实结果撰写 Results。", "撰写 Discussion。", "总结研究优势与局限。", "完善 Abstract。", "整理补充材料。", "检查图表与正文引用。", "统一术语和语言表达。", "完成稿件修改。"]],
      ["投稿", "按真实目标期刊要求准备文件，核实作者与声明后再提交。", "完成投稿文件核查，记录实际提交状态和后续安排。", 71, 84, "todo", 0, ["选择目标期刊。", "核查期刊投稿要求。", "调整稿件格式。", "整理作者信息及必要声明。", "准备投稿信。", "检查投稿文件完整性。", "完成投稿。", "记录投稿状态和后续安排。"]],
    ] },
  { key: "exploration", name: "睡眠质量与老年人跌倒风险的关联探索", track: "explore", start: 0, end: 42,
    background: "探索睡眠质量与老年人跌倒风险之间潜在的研究关联，评估研究问题、数据来源及开展正式研究的可行性。现阶段只形成问题和方案，不代表关联已被证实。" + teachingNote,
    stages: [
      ["明确研究问题", "从人群、暴露、结局与混杂因素定义可讨论的研究问题。", "形成清晰的候选研究问题和待确认变量清单。", 0, 6, "doing", 1, ["明确目标研究人群。", "确定需要研究的睡眠相关因素。", "明确候选研究结局。", "列出可能需要控制的混杂因素。"]],
      ["评估数据可行性", "先核实访问条件、变量覆盖和缺失情况，再判断数据是否适用。", "得到候选数据源比较与关键变量可用性说明。", 7, 14, "todo", 0, ["搜索并整理候选数据来源。", "检查关键变量是否可获得。", "评估样本规模和数据完整性是否满足初步研究需要。"]],
      ["形成初步研究方案", "按可用数据讨论研究设计与分析方法，提前记录偏倚和局限。", "形成可复核的初步研究设计与变量定义方案。", 15, 25, "todo", 0, ["确定候选研究设计。", "明确变量定义方案。", "制定初步统计分析思路。", "列出可能存在的研究偏倚与局限。"]],
      ["开展可行性验证", "以最小流程验证研究方案能否执行；结果只用于评估可行性。", "记录数据与方案不匹配之处及需要解决的问题。", 26, 35, "todo", 0, ["设计最小可行分析流程。", "检查研究方案与现有数据是否匹配。", "整理验证过程中发现的问题。"]],
      ["确定后续研究方向", "根据真实检查情况决定继续、调整问题或暂缓。", "写明继续研究的条件与下一步优先问题。", 36, 42, "todo", 0, ["汇总可行性检查情况。", "评估是否具备继续开展正式研究的条件。", "明确下一阶段需要优先解决的问题。"]],
    ] },
  { key: "revision", name: "骨质疏松症风险因素综述的大纲修订", track: "deliver", start: -7, end: 21,
    background: "完善综述论文的大纲结构、章节逻辑与证据组织方式，形成可以用于后续写作或讨论的修订版研究大纲。以已有大纲为教学情境，尚未提供实际稿件或文献证据。" + teachingNote,
    stages: [
      ["梳理现有综述大纲", "检查已有章节与主题的关系，识别重复和衔接问题。", "形成章节问题清单与重点修订范围。", -7, -2, "done", 3, ["检查已有章节结构。", "标记内容重复或衔接不清楚的部分。", "列出需要重点修订的章节。"]],
      ["调整整体章节结构", "围绕综述主题重新组织章节，明确合并与拆分依据。", "得到逻辑连贯、层级清晰的修订章节框架。", -1, 5, "doing", 1, ["重新组织主要章节。", "优化各章节的小标题。", "检查章节之间的逻辑顺序。", "明确需要合并或拆分的内容。"]],
      ["完善证据组织方案", "明确每节观点需要的证据，逐条核实来源和适用范围。", "形成观点与证据的对应清单及待补充内容。", 6, 10, "todo", 0, ["梳理各章节需要支持的主要观点。", "确认需要进一步核实的证据。", "整理尚需补充的研究内容。"]],
      ["形成修订版大纲", "把章节框架与核心摘要整理为可供讨论的版本。", "得到主题一致、摘要完整的修订大纲。", 11, 15, "todo", 0, ["完成修订后的章节结构。", "为各章节补充核心内容摘要。", "检查整体结构与综述主题的一致性。"]],
      ["修改与最终交付", "整理讨论问题，根据实际收到的反馈修改并归档版本。", "交付版本明确的大纲和待处理问题清单。", 16, 21, "todo", 0, ["整理需要进一步讨论的问题。", "根据真实反馈开展修改。", "完成最终大纲版本整理。"]],
    ] },
];
const actionNotes: Record<string, string> = {
  "建立分析代码结构。": "整理数据导入、清洗、统计分析、输出与绘图的脚本组织方式。",
  "编写数据清洗代码。": "检查变量格式、异常值、缺失值与数据表关联；记录处理规则。",
  "明确研究队列与变量定义。": "按研究设计定义纳入排除标准、加盐暴露、骨质疏松症相关结局与协变量。",
  "编写主模型分析代码。": "先确认结局类型与数据设计，再选择合适模型；从读取变量定义并写一个可运行的模型块开始。",
  "编写协变量调整模型。": "依据研究方案选择混杂因素，核查编码、共线性与模型设置。",
  "编写敏感性分析代码。": "根据合理假设检验主要分析对定义或处理方式的敏感性；独立保存脚本和输出。",
  "评估是否需要亚组分析。": "检查研究方案、样本规模是否支持分层或交互检验，不机械增加分析。",
  "检查统计模型和代码运行。": "核查错误、模型诊断、研究假设和输出完整性。",
  "整理最终分析脚本。": "统一路径、依赖说明、输出命名与运行顺序，使分析可复现。",
};

/** Creates small, formal records once; dates are persisted and never rebased on startup. */
export function createSampleData(today = localDate()): AppData {
  const d = emptyData();
  d.settings.onboarding = "completed";
  for (const seed of seeds) {
    const p: Project = { ...base(), demo: true, sampleKey: seed.key, name: seed.name,
      background: seed.background, track: seed.track, status: "active", priority: seed.key === "paper",
      startDate: addDays(today, seed.start), targetDate: addDays(today, seed.end) };
    d.projects.push(p);
    for (const [name, description, outcome, start, end, status, completed, actions] of seed.stages) {
      const m: Milestone = { ...base(), demo: true, projectId: p.id, name, description, outcome,
        order: d.milestones.filter(x => x.projectId === p.id).length, status,
        startDate: addDays(today, start), endDate: addDays(today, end), targetDate: addDays(today, end) };
      d.milestones.push(m);
      actions.forEach((name, i) => {
        const t: Task = { ...base(), demo: true, projectId: p.id, milestoneId: m.id, name,
          note: actionNotes[name] || `先围绕“${m.name}”完成这一项可检查的工作，再对照阶段预期成果记录进展。${teachingNote}`,
          type: seed.track === "explore" ? "研究探索" : m.name, minutes: 25, estimatedMinutes: 25,
          status: i < completed ? "done" : "todo", order: i };
        if (t.status === "done") { t.completedAt = t.createdAt; t.completedTrack = p.track; }
        d.tasks.push(t);
      });
      d.planPeriods.push({ ...base(), demo: true, projectId: p.id, name, note: `教学计划：${outcome}`,
        startDate: m.startDate!, endDate: m.endDate!, priority: seed.key === "paper" && status === "doing" });
    }
    p.sampleBaseline = sampleFingerprint(d, p.id);
  }
  return d;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([k,v]) => v !== undefined && k !== "sampleBaseline")
    .sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
export function sampleFingerprint(d: AppData, id: string): string {
  const content = canonical([d.projects.find(p => p.id === id),
    ...(["tasks", "milestones", "planPeriods", "results", "ideas", "focusSessions"] as const)
      .map(k => d[k].filter(x => x.projectId === id).sort((a,b) => a.id.localeCompare(b.id)))]);
  // Two independent 32-bit hashes; a compact change detector, not a security credential.
  let a = 2166136261, b = 2246822519;
  for (let i = 0; i < content.length; i++) { a = Math.imul(a ^ content.charCodeAt(i), 16777619); b = Math.imul(b ^ content.charCodeAt(i), 3266489917); }
  return (a >>> 0).toString(16).padStart(8,"0") + (b >>> 0).toString(16).padStart(8,"0");
}
export function sampleInventory(d: AppData) {
  return d.projects.filter(p => p.demo === true).map(project => {
    const fingerprint = sampleFingerprint(d, project.id);
    return { project, fingerprint, modified: !project.sampleBaseline || project.sampleBaseline !== fingerprint,
      tasks: d.tasks.filter(t => t.projectId === project.id).length,
      stages: d.milestones.filter(m => m.projectId === project.id).length,
      results: d.results.filter(r => r.projectId === project.id).length,
      sessions: d.focusSessions.filter(s => s.projectId === project.id).length,
      children: d.projects.filter(child => child.mainProjectId === project.id).length };
  });
}
export function needsWelcome(d: AppData) {
  return !d.settings.onboarding && d.revision === 0 && !d.timer &&
    [d.projects,d.tasks,d.results,d.ideas,d.checkins,d.milestones,d.planPeriods,d.focusSessions].every(x => !x.length);
}
export function loadSamples(d: AppData, prepared: AppData): number {
  let count = 0;
  for (const p of prepared.projects) {
    // Retained ordinary projects keep their origin key so loading never duplicates them.
    if (d.projects.some(x => x.sampleKey === p.sampleKey)) continue;
    if (d.projects.some(x => x.id === p.id)) throw Error("示例 ID 冲突，请重新加载。");
    d.projects.push(structuredClone(p));
    for (const k of ["tasks", "milestones", "planPeriods"] as const)
      (d[k] as unknown[]).push(...structuredClone(prepared[k].filter(x => x.projectId === p.id)));
    count++;
  }
  d.settings.onboarding = "completed";
  return count;
}
export function retainSample(d: AppData, id: string) {
  const p = d.projects.find(p => p.id === id && p.demo);
  if (!p) throw Error("该示例项目已变化，请重新查看。");
  delete p.demo; delete p.sampleBaseline;
  p.updatedAt = new Date().toISOString();
  if (p.snapshot) delete p.snapshot.demo;
  for (const k of ["tasks","milestones","planPeriods","results","ideas","focusSessions"] as const)
    d[k].filter(x => x.projectId === id).forEach(x => { delete x.demo; });
}
export function removeSamples(d: AppData, selected: {id: string; fingerprint: string}[]) {
  const ids = new Set(selected.map(x => x.id));
  // Validate the entire selection before any mutation; stale confirmations cannot delete new edits.
  for (const x of selected) {
    if (!d.projects.some(p => p.id === x.id && p.demo) || sampleFingerprint(d,x.id) !== x.fingerprint)
      throw Error("示例项目在确认期间已发生变化，请关闭并重新检查移除范围。");
    if (d.tasks.some(t => t.id === d.timer?.taskId && t.projectId === x.id))
      throw Error("该项目有未结束的专注，请先结束专注，或保留为普通项目。");
  }
  releaseChildren(d,ids);
  d.projects = d.projects.filter(p => !ids.has(p.id));
  for (const k of ["tasks","milestones","planPeriods","results","ideas","focusSessions"] as const)
    (d[k] as unknown[]) = d[k].filter(x => !x.projectId || !ids.has(x.projectId));
  if (d.settings.focusProjectId && ids.has(d.settings.focusProjectId)) delete d.settings.focusProjectId;
}
