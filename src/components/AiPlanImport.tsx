import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Copy, FileJson, Sparkles } from "lucide-react";
import { Project, Task, base } from "../types";
import { useData } from "../state";
import { Modal } from "./Common";
import { actionMatches, buildPlanBrief, buildPlanInstructions, missingBrief, PlanBrief, PLAN_BRIEF_FIELDS, parseResearchPlan, PlanAction, ResearchPlan } from "../aiPlan";
import { desktop, native, pickPlanFile } from "../services/native";

type Props = { project: Project; onClose: () => void };
type StageTarget = "new" | "skip" | string;
const stageKey = (stage: number, action: number) => `${stage}:${action}`;
function findSameTask(action: PlanAction, existing: Task[]) {
  return existing.find((task) => actionMatches(action, task));
}

export function AiPlanImport({ project, onClose }: Props) {
  const { data, mutate, notify, busy } = useData();
  const [mode, setMode] = useState<"prepare" | "import">("prepare");
  const [brief, setBrief] = useState<PlanBrief>(() => ({target:project.targetDate || ""}));
  const [instructions, setInstructions] = useState(() => buildPlanInstructions(project.name));
  const [copyWarning, setCopyWarning] = useState(false);
  const missing = missingBrief(brief);
  const prompt = `${buildPlanBrief(project.name, brief)}\n\n${instructions}`;
  const copyPrompt = () => missing.length ? setCopyWarning(true) : void copy(prompt, "规划提示词");
  const warningRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (copyWarning) { warningRef.current?.scrollIntoView({block:"nearest"}); warningRef.current?.focus(); } }, [copyWarning]);
  const [source, setSource] = useState("");
  const [plan, setPlan] = useState<ResearchPlan | null>(null);
  const [error, setError] = useState("");
  const [stageTargets, setStageTargets] = useState<Record<number, StageTarget>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [looseTarget, setLooseTarget] = useState("");
  const [success, setSuccess] = useState("");
  const [previewRevision, setPreviewRevision] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const existingStages = data!.milestones.filter((item) => item.projectId === project.id).sort((a, b) => a.order - b.order);
  const allSelected = useMemo(() => {
    if (!plan) return 0;
    return plan.milestones.reduce((sum, stage, index) =>
      sum + (stageTargets[index] === "skip" ? 0 : stage.actions.filter((_, taskIndex) => selected[stageKey(index, taskIndex)] ?? true).length), 0) +
      plan.actions.filter((_, index) => selected[`loose:${index}`] ?? true).length;
  }, [plan, selected, stageTargets]);
  const stageCount = plan?.milestones.filter((_, index) => stageTargets[index] !== "skip" && (stageTargets[index] || "new") === "new").length || 0;
  const hasImports = stageCount + allSelected > 0;

  async function copy(value: string, label: string) {
    try {
      if (native) await desktop("copy_text", { text: value });
      else await navigator.clipboard.writeText(value);
      notify(`${label}已复制`);
    } catch (cause) {
      notify(`复制失败：${String(cause)}`);
    }
  }
  function parse(value = source) {
    try {
      const next = parseResearchPlan(value);
      setPlan(next);
      setError("");
      setSuccess("");
      setPreviewRevision(data!.revision);
      const defaults: Record<string, boolean> = {};
      next.milestones.forEach((stage, index) => {
        const sameNamedStages = existingStages.filter((item) => item.name.trim() === stage.name.trim());
        if (sameNamedStages.length) setError(`已存在同名阶段“${stage.name}”。请检查预览并选择新建、加入已有阶段或跳过。`);
        stage.actions.forEach((action, taskIndex) => {
          const repeatedInImport = stage.actions.slice(0, taskIndex).some((prior) => actionMatches(action, prior));
          defaults[stageKey(index, taskIndex)] = !repeatedInImport;
        });
      });
      next.actions.forEach((action, index) => {
        const alreadyLoose = findSameTask(action, data!.tasks.filter((task) => task.projectId === project.id && !task.milestoneId));
        const repeated = next.actions.slice(0, index).some((prior) => actionMatches(action, prior));
        defaults[`loose:${index}`] = !alreadyLoose && !repeated;
      });
      setSelected(defaults);
      setStageTargets({});
      setLooseTarget("");
    } catch (cause) {
      setPlan(null);
      setError(String(cause));
    }
  }
  async function pickFile() {
    if (native) {
      try {
        const text = await pickPlanFile();
        if (text !== null) setSource(text);
        setPlan(null);
        setError("");
      } catch (cause) { setError(String(cause)); }
    } else fileInput.current?.click();
  }
  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    if (file.size > 1_000_000) { setError("计划文件不能超过 1 MB。"); return; }
    setSource(await file.text());
    setPlan(null);
    setError("");
  }

  async function commit() {
    if (!plan || !hasImports) return;
    if (previewRevision !== data!.revision) {
      setError("项目数据在预览后发生了变化。请重新解析计划，再确认追加。");
      return;
    }
    const now = new Date().toISOString();
    const newStages = new Map<number, ReturnType<typeof base>>();
    const taskRows: Array<{ row: Task; createdAt: string }> = [];
    for (const [index, stage] of plan.milestones.entries()) {
      const target = stageTargets[index] || "new";
      if (target === "skip") continue;
      let milestoneId: string;
      if (target === "new") {
        const record = base();
        newStages.set(index, record);
        milestoneId = record.id;
      } else milestoneId = target;
      for (const [actionIndex, action] of stage.actions.entries()) {
        if (!(selected[stageKey(index, actionIndex)] ?? true)) continue;
        const record = base();
        taskRows.push({
          createdAt: record.createdAt,
          row: {
            ...record, projectId: project.id, milestoneId, name: action.name,
            type: action.type || "研究行动", minutes: action.minutes || 10,
            estimatedMinutes: action.estimatedMinutes, note: action.note || "", status: "todo",
          },
        });
      }
    }
    for (const [index, action] of plan.actions.entries()) {
      if (!(selected[`loose:${index}`] ?? true)) continue;
      const record = base();
      taskRows.push({
        createdAt: record.createdAt,
        row: {
          ...record, projectId: project.id, milestoneId: looseTarget || undefined, name: action.name,
          type: action.type || "研究行动", minutes: action.minutes || 10,
          estimatedMinutes: action.estimatedMinutes, note: action.note || "", status: "todo",
        },
      });
    }
    const milestoneRows = [...newStages.entries()].map(([index, record]) => {
      const stage = plan.milestones[index];
      return {
        createdAt: record.createdAt,
        row: {
          ...record, projectId: project.id, name: stage.name, description: stage.description || "",
          outcome: stage.outcome || "", order: Math.max(-1, ...data!.milestones.filter((m) => m.projectId === project.id).map((m) => m.order)) + 1 + index,
          status: "todo" as const, startDate: stage.startDate, endDate: stage.endDate, targetDate: stage.targetDate,
        },
      };
    });
    if (plan.actions.some((_, index) => selected[`loose:${index}`]) && looseTarget &&
      !existingStages.some((stage) => stage.id === looseTarget)) {
      setError("所选阶段已不存在。请重新解析计划后再导入。");
      return;
    }
    let stalePreview = false;
    const ok = await mutate((draft) => {
      if (draft.revision !== previewRevision) {
        stalePreview = true;
        throw Error("项目数据在预览后发生了变化，请重新检查计划。");
      }
      if (!draft.projects.some((item) => item.id === project.id)) throw Error("目标项目已不存在，请重新打开项目。");
      const validStageIds = new Set(draft.milestones.filter((item) => item.projectId === project.id).map((item) => item.id));
      for (const [indexText, target] of Object.entries(stageTargets)) {
        const index = Number(indexText);
        if (target !== "new" && target !== "skip" && !validStageIds.has(target))
          throw Error("所选已有阶段已变化，请重新检查导入预览。");
        if (target === "skip" && plan.milestones[index].actions.some((_, actionIndex) => selected[stageKey(index, actionIndex)]))
          throw Error("阶段选择已变化，请重新检查导入预览。");
      }
      draft.milestones.push(...milestoneRows.map(({ row }) => row));
      draft.tasks.push(...taskRows.map(({ row }) => row));
      draft.projects.find((item) => item.id === project.id)!.updatedAt = now;
    }, { backupBeforeWrite: true });
    if (ok) {
      setSuccess(`已追加 ${milestoneRows.length} 个阶段、${taskRows.length} 项行动。导入前副本已保存在本机，可到“设置 → 备份与恢复”恢复。`);
      notify("科研计划已追加到项目");
    } else if (stalePreview) setError("项目数据在预览后发生了变化。请重新解析计划，再确认追加。");
  }

  return (
    <Modal title="AI 科研计划导入" onClose={onClose} wide>
      <p className="modal-note">目标项目：<strong>{project.name}</strong>。ResearchFlow 不会自动把项目资料发给 AI。</p>
      <div className="ai-plan-tabs" role="tablist" aria-label="AI 科研计划导入步骤">
        <button role="tab" aria-selected={mode === "prepare"} className={mode === "prepare" ? "active" : ""} onClick={() => setMode("prepare")}><Sparkles size={15} />准备提示词</button>
        <button role="tab" aria-selected={mode === "import"} className={mode === "import" ? "active" : ""} onClick={() => setMode("import")}><FileJson size={15} />导入计划</button>
      </div>
      {copyWarning && <div className="ai-brief-warning" role="alert" ref={warningRef} tabIndex={-1}>
        <strong>还有信息未填写</strong><p>{missing.join("、")}。可以在这里补充；也可以复制带有【待填写】标记的模板，在发送给 AI 前填写。</p>
        <div className="row"><button className="primary" onClick={() => {setCopyWarning(false);setMode("prepare");}}>继续填写</button><button onClick={() => {setCopyWarning(false);void copy(prompt, "待填写模板");}}>复制待填写模板</button></div>
      </div>}
      {mode === "prepare" ? (
        <section className="ai-plan-prepare">
          <p>先填写项目资料，再复制到外部 AI 讨论大阶段目标与具体行动；确认后生成结构化 JSON 文件导入。填写内容仅用于本次提示词，不修改项目记录。</p>
          <div className="ai-plan-project-context" aria-label="已填入的项目名称"><strong>项目名称已自动填写</strong><span>{project.name}</span></div>
          <div className="ai-brief-heading"><h3>补充项目资料</h3><small>不确定的内容可写“尚未确定，请 AI 协助讨论”。</small></div>
          <div className="ai-brief-grid">{PLAN_BRIEF_FIELDS.map(field => <label className={`field brief-${field.key}`} key={field.key}><span>{field.label}</span>{["projectType","target","scope"].includes(field.key) ? <input maxLength={1000} value={brief[field.key] || ""} placeholder={field.placeholder} onChange={e => {const value=e.currentTarget.value;setBrief(prev => ({...prev,[field.key]:value}));setCopyWarning(false);}} /> : <textarea rows={2} maxLength={5000} value={brief[field.key] || ""} placeholder={field.placeholder} onChange={e => {const value=e.currentTarget.value;setBrief(prev => ({...prev,[field.key]:value}));setCopyWarning(false);}} />}</label>)}</div>
          <p className="ai-brief-status" role="status">{missing.length ? `还有 ${missing.length} 项资料未填写，复制时会提醒补充。` : "资料已填写，复制后即可开始与 AI 讨论。"}最终交付为可导入的计划 JSON 文件。</p>
          <details className="ai-prompt-details"><summary>查看完整提示词与调整协作要求</summary>
            <label className="field"><span>完整提示词（资料会自动写入最前面）</span><textarea aria-label="完整科研计划提示词" rows={7} readOnly value={prompt} /></label>
            <label className="field"><span>协作要求与 JSON 规则（可编辑）</span><textarea aria-label="通用科研计划提示词" rows={8} value={instructions} onChange={event => setInstructions(event.currentTarget.value)} /></label>
            <small>修改资料不会覆盖这里的自定义要求。请保留 JSON 字段规范，便于正常导入。</small>
          </details>
          <div className="ai-plan-privacy"><strong>分享前检查</strong><span>复制到外部 AI 的内容将由相应平台处理。请勿粘贴患者身份信息或不适合外发的保密资料。</span></div>
          <footer><button onClick={copyPrompt }><Copy size={15} />复制提示词</button><button className="primary" onClick={() => setMode("import")}>我已讨论好，导入计划</button></footer>
        </section>
      ) : (
        <section className="ai-plan-import">
          {success ? (
            <div className="ai-plan-success" role="status"><span className="empty-symbol">✓</span><h3>计划已保存</h3><p>{success}</p><footer><button className="primary" onClick={onClose}>返回项目路线图</button></footer></div>
          ) : (
            <>
              {!plan ? (
                <>
                  <p className="modal-note">粘贴 AI 最终输出的 JSON，或选择 .json 文件。解析与预览不会修改项目。</p>
                  <label className="field"><span>ResearchFlow 计划 JSON（最大 1 MB）</span><textarea aria-label="科研计划 JSON" rows={10} value={source} onChange={(event) => { setSource(event.target.value); setError(""); }} placeholder={'{"format":"researchflow-plan","version":1,"milestones":[...]}'} /></label>
                  <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={(event) => void handleFile(event)} />
                  <div className="row"><button onClick={() => void pickFile()}><FileJson size={15} />选择 JSON 文件</button><button onClick={copyPrompt}>复制提示词</button></div>
                  {error && <p className="inline-error" role="alert">{error}</p>}
                  <footer><button onClick={() => setMode("prepare")}><ArrowLeft size={15} />返回提示词</button><button className="primary" disabled={!source.trim()} onClick={() => parse()}>解析并预览</button></footer>
                </>
              ) : (
                <>
                  <div className="ai-plan-summary"><strong>{project.name}</strong><span>{plan.projectName && plan.projectName.trim() !== project.name.trim() ? `AI 输出提及“${plan.projectName}”，请确认导入目标仍是当前项目。` : "导入目标已固定为当前项目。"}</span><span>{stageCount} 个新阶段 · {allSelected} 项行动将加入 · 阶段顺序按计划排列</span>{plan.projectType && <small>AI 标注类型：{plan.projectType}（仅供参考，不限制导入结构）</small>}</div>
                  {plan.warnings.map((warning, index) => <p className="planning-warning" key={index}>{warning}</p>)}
                  {error && <p className="planning-warning" role="status">{error}</p>}
                  <div className="ai-plan-items">
                    {plan.milestones.map((stage, index) => {
                      const target = stageTargets[index] || "new";
                      const sameName = existingStages.some((item) => item.name.trim() === stage.name.trim());
                      return <article className="ai-plan-stage" key={index}>
                        <div className="ai-plan-stage-title"><label className="check"><input type="checkbox" checked={target !== "skip"} onChange={(event) => setStageTargets((old) => ({ ...old, [index]: event.target.checked ? "new" : "skip" }))}/><strong>{stage.name}</strong></label>{sameName && <span className="status-label">已有同名阶段</span>}</div>
                        {(stage.description || stage.outcome || stage.startDate || stage.endDate || stage.targetDate) && <p className="ai-plan-description">{stage.description}{stage.outcome && <><br/>阶段成果：{stage.outcome}</>}{(stage.startDate || stage.endDate || stage.targetDate) && <><br/>日期：{stage.startDate || "未设开始"} 至 {stage.endDate || "未设结束"}{stage.targetDate ? ` · 目标 ${stage.targetDate}` : ""}</>}</p>}
                        {target !== "skip" && <label className="field"><span>阶段处理方式</span><select value={target} onChange={(event) => { const nextTarget = event.currentTarget.value; setStageTargets((old) => ({ ...old, [index]: nextTarget })); if (nextTarget !== "new") { const existingTasks = data!.tasks.filter((task) => task.milestoneId === nextTarget && task.projectId === project.id); setSelected((old) => { const next = { ...old }; stage.actions.forEach((action, taskIndex) => { if (findSameTask(action, existingTasks)) next[stageKey(index, taskIndex)] = false; }); return next; }); } }}><option value="new">新建阶段</option>{existingStages.map((item) => <option key={item.id} value={item.id}>只向已有阶段追加行动：{item.name}</option>)}</select></label>}
                        {target !== "skip" && stage.actions.map((action, taskIndex) => {
                          const checked = selected[stageKey(index, taskIndex)] ?? true;
                          const destination = target === "new" ? [] : data!.tasks.filter((task) => task.milestoneId === target && task.projectId === project.id);
                          const duplicate = findSameTask(action, destination) || stage.actions.slice(0, taskIndex).find((prior) => actionMatches(action, prior));
                          return <label className={`ai-plan-action ${duplicate ? "duplicate" : ""}`} key={taskIndex}><input type="checkbox" checked={checked} onChange={(event) => setSelected((old) => ({ ...old, [stageKey(index, taskIndex)]: event.target.checked }))}/><span><strong>{action.name}</strong><small>{action.type || "研究行动"} · 单次 {action.minutes || 10} 分钟{action.minutes ? "" : "（默认参考值）"}{action.estimatedMinutes ? ` · 总计约 ${action.estimatedMinutes} 分钟` : ""}</small>{action.note && <small>{action.note}</small>}{duplicate && <small className="duplicate-label">与已有或本次计划内行动内容一致，默认不重复添加</small>}</span></label>;
                        })}
                      </article>;
                    })}
                    {plan.actions.length > 0 && <article className="ai-plan-stage"><strong>未分组行动</strong><label className="field"><span>加入已有阶段（可选）</span><select value={looseTarget} onChange={(event) => { const nextTarget = event.currentTarget.value; setLooseTarget(nextTarget); const existingTasks = data!.tasks.filter((task) => task.projectId === project.id && (nextTarget ? task.milestoneId === nextTarget : !task.milestoneId)); setSelected((old) => { const next = { ...old }; plan.actions.forEach((action, index) => { if (findSameTask(action, existingTasks)) next[`loose:${index}`] = false; }); return next; }); }}><option value="">保留为未分组行动</option>{existingStages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{plan.actions.map((action, index) => {const duplicate = findSameTask(action, data!.tasks.filter((task) => task.projectId === project.id && (looseTarget ? task.milestoneId === looseTarget : !task.milestoneId))) || plan.actions.slice(0, index).find((prior) => actionMatches(action, prior)); return <label className={`ai-plan-action ${duplicate ? "duplicate" : ""}`} key={index}><input type="checkbox" checked={selected[`loose:${index}`] ?? true} onChange={(event) => setSelected((old) => ({ ...old, [`loose:${index}`]: event.target.checked }))}/><span><strong>{action.name}</strong><small>{action.type || "研究行动"} · 单次 {action.minutes || 10} 分钟{action.minutes ? "" : "（默认参考值）"}{action.estimatedMinutes ? ` · 总计约 ${action.estimatedMinutes} 分钟` : ""}</small>{action.note && <small>{action.note}</small>}{duplicate && <small className="duplicate-label">与已有或本次计划内行动内容一致，默认不重复添加</small>}</span></label>;})}</article>}
                  </div>
                  <p className="modal-note">已有阶段的名称、日期、状态和成果不会更改。未填写单次参考时长的行动按 10 分钟创建。</p>
                  <footer><button onClick={() => { setPlan(null); setError(""); }}>返回修改 JSON</button><button className="primary" disabled={busy || !hasImports} onClick={() => void commit()}>{busy ? "正在保存…" : `确认追加到“${project.name}”`}</button></footer>
                </>
              )}
            </>
          )}
        </section>
      )}
    </Modal>
  );
}
