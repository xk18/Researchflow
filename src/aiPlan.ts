import { validDate } from "./dates";

export const PLAN_BRIEF_FIELDS = [
  { key: "projectType", label: "项目类型", placeholder: "例如湿实验、数据分析、综述、竞赛；也可填写其他类型" },
  { key: "target", label: "预期完成时间", placeholder: "例如 2027-03-31，投稿硬截止；或尚未确定" },
  { key: "background", label: "项目简介与研究问题", placeholder: "想解决什么问题？为什么值得做？" },
  { key: "outcome", label: "希望完成的研究成果", placeholder: "例如论文初稿、实验报告；怎样才算完成？" },
  { key: "progress", label: "当前进展与保留的工作", placeholder: "已经做了什么？哪些工作已完成或不应重复安排？" },
  { key: "resources", label: "投入时间、资源与限制", placeholder: "每周可投入时间、数据/材料、人员/设备、等待环节等" },
  { key: "scope", label: "本次规划范围", placeholder: "整个项目、剩余工作或某个阶段；哪些安排希望保留？" },
] as const;
export type PlanBrief = Partial<Record<typeof PLAN_BRIEF_FIELDS[number]["key"], string>>;
export function missingBrief(info: PlanBrief) {
  return PLAN_BRIEF_FIELDS.filter(field => !info[field.key]?.trim()).map(field => field.label);
}
export function buildPlanBrief(projectName: string, info: PlanBrief = {}): string {
  const missing = missingBrief(info);
  return `【先核对项目资料，再开始与 AI 讨论】
${missing.length ? `以下还有待填写的信息：${missing.join("、")}。请先替换下方【待填写】标记；如果尚不确定，请写“尚未确定，请 AI 协助讨论”，不要直接把未填写模板当作完整资料发送。` : "以下信息由我在 ResearchFlow 中填写；请依据这些信息讨论计划，未知内容先向我确认。"}
项目名称：${projectName}
${PLAN_BRIEF_FIELDS.map(field => `${field.label}：${info[field.key]?.trim() || `【待填写：${field.placeholder}】`}`).join("\n")}
本次 AI 协作的最终交付：讨论、修订并经我确认后，生成一份可导入 ResearchFlow 的结构化科研推进计划 JSON 文件（UTF-8 .json，researchflow-plan version 1）。上面的“研究成果”指项目要完成的成果，与计划 JSON 文件不同。
（项目名称已自动带入；其他资料仅来自我本次填写，软件不会自动附带已有记录。你无法读取我的软件或本地文件。）`;
}
export function buildPlanPrompt(projectName: string, info: PlanBrief = {}): string {
  return `${buildPlanBrief(projectName, info)}\n\n${buildPlanInstructions(projectName)}`;
}

export const PLAN_MAX_BYTES = 1_000_000;
export function buildPlanInstructions(projectName: string): string {
  return `你是一位科研项目规划与执行协作助手。我正在使用 ResearchFlow（科研续航），一款在本地电脑上管理科研项目、阶段性目标和具体行动的科研项目规划软件。我希望与你充分讨论这个项目的研究目标、当前进展、阶段安排与实际执行，形成适合我的推进计划，再把确认后的计划导入软件，减少手动录入。

本次 AI 协作的最终交付：一份可导入 ResearchFlow 的结构化科研推进计划 JSON 文件（UTF-8 编码、.json 扩展名，使用下述 researchflow-plan version 1 协议），包含大阶段目标、阶段预期成果和阶段内的小目标与具体行动。不要只交付一段建议、Markdown 表格或另一个不兼容的 JSON 格式。讨论阶段先用普通文字交流，待我明确确认后再生成最终文件。

二、先讨论，再确认
1. 先简要复述你对项目、规划范围和最终研究成果的理解。如果关键信息缺失，每轮最多询问我 3 个最影响计划的问题；对未知项明确标记“待确认”，不要擅自补全事实。
2. 提出供讨论的大阶段目标、顺序和每阶段可检查的预期成果，再把阶段拆成小目标与具体行动。说明重要前置条件、风险和等待环节。不要一次堆出大量任务；近期工作可以细化，远期工作保留弹性。
3. 与我逐轮检查计划的必要性和可执行性：哪些工作已完成、哪些不适用、哪些需要合并或增加、顺序是否合理、资源和截止时间能否支持。根据我的反馈修改，并在最终确认前概括修订后的计划及仍待确认的问题。
4. 只有当我明确说“计划已确认，请输出 ResearchFlow 格式”后，才生成最终 JSON。未经确认不要把初稿当作可直接导入的最终计划。

三、目标层级与软件字段的对应
- 大阶段目标对应 milestones 中的一个阶段：name 写清阶段目标，description 写工作范围、前置条件与待确认事项，outcome 写可检查的阶段成果或完成标准。
- 小阶段目标与具体行动对应该阶段的 actions：name 写能开始执行的明确动作，note 写小目标的预期产物、完成标准、第一步或必要线索。小目标若包含多个独立动作，拆成几项行动放在同一阶段下；本次 AI 计划交换格式使用平面阶段，不要输出 subgoals、subtasks 或多层 milestones；导入后可在项目流程图中调整阶段层级。
- 尚不适合归入特定阶段的独立行动，可放在根层级 actions；同一行动只出现一次，不要在根层级和阶段内重复列出。
- 简单项目可以只提供未分组行动；不必为了层级而强行增加阶段。不同研究类型可自由命名阶段和行动，不套用固定的数据分析或实验模板。

四、规划边界
- 不编造研究事实、实验结果、文献结论或用户未提供的进展；区分我提供的事实和仍待验证的假设，不保证预设的研究结论。
- 不重复已经完成、或我明确说要保留的现有工作。最终 JSON 只包含本次确认要新增的内容；ResearchFlow 的导入会追加记录，不能自动更新、删除或覆盖已有阶段。
- 行动应具体、可开始，避免“开展研究”“完成论文”这类过大的空泛任务，也避免没有执行价值的过度拆分。
- 区分日历等待时间与实际投入工时。不要把培养、审批、设备预约等等待时长写成专注分钟数。
- 日期、单次参考时长和预计总工作量只有在我明确提供或确认后才填写，否则省略相关字段，不编造精确排期。
- 前置依赖、执行顺序和等待条件用阶段说明或行动备注表达；当前协议不支持依赖连线、行动日期、负责人、优先级或额外子阶段字段。

五、最终 JSON 交付规范
优先提供可下载的 UTF-8 JSON 文件，文件名可用 researchflow-plan.json，文件内容必须是一个完整 JSON 对象。如果你所在的平台无法生成附件，直接输出完整的单个 JSON 对象，供我复制到 ResearchFlow 或另存为 UTF-8 .json 文件；不要声称已创建无法下载的文件。最终 JSON 文本不要包含 Markdown 代码围栏、注释或前后解释，讨论文字留在确认之前。

以下是字段结构示例，不是本项目的实际计划；请用我们确认的内容替换示例名称和说明：
{
  "format": "researchflow-plan",
  "version": 1,
  "projectName": ${JSON.stringify(projectName)},
  "projectType": "我们确认的项目类型",
  "milestones": [
    {
      "name": "我们确认的大阶段目标",
      "description": "工作范围、前置条件或待确认事项",
      "outcome": "可检查的阶段成果或完成标准",
      "actions": [
        {
          "name": "为实现阶段内小目标而执行的具体行动",
          "type": "自由文本类型；没有则省略",
          "note": "小目标的预期产物、完成标准或执行第一步"
        }
      ]
    }
  ],
  "actions": [
    {
      "name": "尚未归入特定阶段的行动",
      "type": "自由文本类型；没有则省略",
      "note": "备注；没有则省略"
    }
  ]
}

字段规则与自检要求：
- format 必须为 "researchflow-plan"，version 必须为数字 1；projectName 使用上面的项目名称，不用内部编号。projectType 是自由文本，可省略。
- 根层级只使用 format、version、projectName、projectType、milestones、actions。milestones 与根层级 actions 可以为空数组或省略，但整份计划至少有一个阶段或一项行动；阶段按确认的顺序排列。
- 阶段只使用 name、description、outcome、startDate、endDate、targetDate、actions。name 必填；其余字段按需填写，没有内容就省略。startDate 为开始日期，endDate 为结束日期，targetDate 为目标完成日期；日期使用 1900-2199 年的 YYYY-MM-DD，开始日期不得晚于结束日期。
- 行动只使用 name、type、note、minutes、estimatedMinutes。name 必填；type 为自由文本类型，note 为备注；minutes 是单次专注参考时长，范围为 1-240 的整数分钟，estimatedMinutes 是完成该行动的预计总工作量，范围为 1-1000000 的整数分钟。两者含义不同，可省略；不填 minutes 时软件默认按 10 分钟创建，这只是开始参考值，不是任务总工作量。
- 整份 JSON 最多 50 个阶段、500 项行动，文件不超过 1 MB。项目名称最多 200 字、项目类型最多 100 字；阶段名称最多 200 字、说明最多 5000 字、预期成果最多 3000 字；行动名称最多 300 字、类型最多 50 字、备注最多 3000 字。
- 不输出内部 ID、状态、项目设置、已有数据的修改指令或未列出的字段。未确认的可选值应省略，不使用 null、“待填写”的假日期或虚构分钟数；必要的不确定信息保留在 description 或 note 中。
- 提交前自检：JSON 使用双引号、正确转义、没有注释或尾随逗号；结构可解析，大小与字段范围符合以上规则，内容与我们确认的计划一致，不把示例文字当作实际任务。`;
}

export interface PlanAction {
  name: string;
  type?: string;
  minutes?: number;
  estimatedMinutes?: number;
  note?: string;
}
export interface PlanMilestone {
  name: string;
  description?: string;
  outcome?: string;
  startDate?: string;
  endDate?: string;
  targetDate?: string;
  actions: PlanAction[];
}
export interface ResearchPlan {
  format: "researchflow-plan";
  version: 1;
  projectName?: string;
  projectType?: string;
  milestones: PlanMilestone[];
  actions: PlanAction[];
  warnings: string[];
}

type Obj = Record<string, unknown>;
const isObject = (value: unknown): value is Obj =>
  !!value && typeof value === "object" && !Array.isArray(value);
function text(value: unknown, label: string, max: number, optional = false) {
  if (value === undefined && optional) return undefined;
  if (typeof value !== "string" || value.length > max)
    throw Error(`${label}必须是 ${max} 字以内的文本。`);
  return value.trim();
}
function optionalDate(value: unknown, label: string) {
  if (value === undefined || value === "") return undefined;
  if (!validDate(value)) throw Error(`${label}日期无效，请使用 1900–2199 年的 YYYY-MM-DD。`);
  return value;
}
function parseAction(value: unknown, label: string, warnings: string[]): PlanAction {
  if (!isObject(value)) throw Error(`${label}必须是 JSON 对象。`);
  unknownKeys(value, ["name", "type", "minutes", "estimatedMinutes", "note"], label, warnings);
  const name = text(value.name, `${label}名称`, 300);
  if (!name) throw Error(`${label}名称不能为空。`);
  const type = text(value.type, `${label}类型`, 50, true);
  const note = text(value.note, `${label}备注`, 3000, true);
  const minutes = value.minutes;
  if (minutes !== undefined && (!Number.isSafeInteger(minutes) || (minutes as number) < 1 || (minutes as number) > 240))
    throw Error(`${label}单次参考时长必须为 1–240 分钟的整数。`);
  const estimatedMinutes = value.estimatedMinutes;
  if (estimatedMinutes !== undefined && (!Number.isSafeInteger(estimatedMinutes) || (estimatedMinutes as number) < 1 || (estimatedMinutes as number) > 1_000_000))
    throw Error(`${label}预计总工作量必须为 1–1,000,000 分钟的整数。`);
  return { name, type, note, minutes: minutes as number | undefined, estimatedMinutes: estimatedMinutes as number | undefined };
}
function unknownKeys(value: Obj, allowed: string[], label: string, warnings: string[]) {
  const keys = Object.keys(value).filter((key) => !allowed.includes(key));
  if (keys.length) warnings.push(`${label}含未识别字段：${keys.slice(0, 5).join("、")}${keys.length > 5 ? "等" : ""}；这些字段不会导入。`);
}

export function parseResearchPlan(input: string): ResearchPlan {
  if (new TextEncoder().encode(input).byteLength > PLAN_MAX_BYTES)
    throw Error("计划文件不能超过 1 MB。请删去无关文字后重试。");
  const trimmed = input.trim();
  const jsonText = trimmed.startsWith("```") && trimmed.endsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*\r?\n?/i, "").replace(/\r?\n?```$/, "").trim()
    : trimmed;
  let parsed: unknown;
  try { parsed = JSON.parse(jsonText); }
  catch (error) { throw Error(`JSON 无法解析：${error instanceof Error ? error.message : String(error)}`); }
  if (!isObject(parsed)) throw Error("计划必须是一个 JSON 对象。");
  if (parsed.format !== "researchflow-plan") throw Error("格式标识不正确；请确认使用 ResearchFlow 计划格式。");
  if (parsed.version !== 1) throw Error("计划版本不受支持；请让 AI 按 researchflow-plan version 1 重新输出。");
  const warnings: string[] = [];
  unknownKeys(parsed, ["format", "version", "projectName", "projectType", "milestones", "actions"], "计划", warnings);
  const projectName = text(parsed.projectName, "项目名称", 200, true);
  const projectType = text(parsed.projectType, "项目类型", 100, true);
  const milestoneList: unknown = parsed.milestones ?? [];
  const actionList: unknown = parsed.actions ?? [];
  if (!Array.isArray(milestoneList) || milestoneList.length > 50) throw Error("阶段数量最多为 50 个。");
  if (!Array.isArray(actionList) || actionList.length > 500) throw Error("未分组行动数量最多为 500 项。");
  const rawMilestones = milestoneList as unknown[];
  const rawActions = actionList as unknown[];
  let actionCount = rawActions.length;
  const milestones = rawMilestones.map((raw, index): PlanMilestone => {
    const label = `第 ${index + 1} 个阶段`;
    if (!isObject(raw)) throw Error(`${label}必须是 JSON 对象。`);
    unknownKeys(raw, ["name", "description", "outcome", "startDate", "endDate", "targetDate", "actions"], label, warnings);
    const name = text(raw.name, `${label}名称`, 200);
    if (!name) throw Error(`${label}名称不能为空。`);
    const description = text(raw.description, `${label}说明`, 5000, true);
    const outcome = text(raw.outcome, `${label}预期成果`, 3000, true);
    const startDate = optionalDate(raw.startDate, `${label}开始`);
    const endDate = optionalDate(raw.endDate, `${label}结束`);
    const targetDate = optionalDate(raw.targetDate, `${label}目标`);
    if (startDate && endDate && startDate > endDate) throw Error(`${label}开始日期不能晚于结束日期。`);
    const stageActions: unknown = raw.actions ?? [];
    if (!Array.isArray(stageActions) || stageActions.length > 500) throw Error(`${label}行动列表格式无效或超过 500 项。`);
    actionCount += stageActions.length;
    if (actionCount > 500) throw Error("整份计划最多包含 500 项行动。");
    const actions = (stageActions as unknown[]).map((action, taskIndex) => parseAction(action, `${label}的第 ${taskIndex + 1} 项行动`, warnings));
    return { name, description, outcome, startDate, endDate, targetDate, actions };
  });
  const actions = rawActions.map((action, index) => parseAction(action, `第 ${index + 1} 项未分组行动`, warnings));
  if (!milestones.length && !actions.length) throw Error("计划至少需要包含一个阶段或一项行动。");
  return { format: "researchflow-plan", version: 1, projectName, projectType, milestones, actions, warnings };
}

export function comparableText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}
export function actionMatches(a: PlanAction, b: PlanAction) {
  return comparableText(a.name) === comparableText(b.name) &&
    comparableText(a.type || "研究行动") === comparableText(b.type || "研究行动") &&
    comparableText(a.note || "") === comparableText(b.note || "") &&
    (a.minutes ?? 10) === b.minutes &&
    (a.estimatedMinutes ?? undefined) === b.estimatedMinutes;
}
