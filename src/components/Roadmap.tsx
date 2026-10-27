import { useEffect, useState } from "react";
import {
  ArrowUp,
  ArrowDown,
  GripVertical,
  Check,
  Pencil,
  Plus,
  Trash2,
  Play,
} from "lucide-react";
import { Milestone, Project, Task, base } from "../types";
import { useData } from "../state";
import {
  addMilestones,
  batchNames,
  deleteMilestone,
  milestoneProgress,
  moveMilestone,
  orderedMilestones,
  validateRange,
  MILESTONE_STATUS,
} from "../planning";
import { Confirm, Field, Modal } from "./Common";
import { ActionCard } from "./ActionCard";
import { completeTask, focusClock } from "../focus";
import { dueLabel } from "../dates";
import { moveTask, orderedTasks, reorderMilestones, reorderTasks } from "../ordering";
import { canNestStage, nestStage } from '../workflowMap';
export function MilestoneEditor({
  project,
  milestone,
  initialParentId,
  onClose,
}: {
  project: Project;
  milestone?: Milestone;
  initialParentId?: string;
  onClose: () => void;
}) {
  const { data, mutate, notify, busy } = useData();
  const [name, setName] = useState(milestone?.name || ""),
    [owner, setOwner] = useState(milestone?.parentMilestoneId || initialParentId || ''),
    [description, setDescription] = useState(milestone?.description || ""),
    [outcome, setOutcome] = useState(milestone?.outcome || ""),
    [start, setStart] = useState(milestone?.startDate || ""),
    [end, setEnd] = useState(milestone?.endDate || ""),
    [target, setTarget] = useState(milestone?.targetDate || ""),
    [error, setError] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      validateRange(start, end, target);
    } catch (e) {
      setError(String(e));
      return;
    }
    if (
      await mutate((d) => {
        const m = milestone
          ? d.milestones.find((x) => x.id === milestone.id)!
          : {
              ...base(),
              projectId: project.id,
              name,
              description,
              outcome,
              order:
                Math.max(
                  -1,
                  ...d.milestones
                    .filter((x) => x.projectId === project.id)
                    .map((x) => x.order),
                ) + 1,
              status: "todo" as const,
            };
        Object.assign(m, {
          name: name.trim(),
          description,
          outcome,
          startDate: start || undefined,
          endDate: end || undefined,
          targetDate: target || undefined,
          updatedAt: new Date().toISOString(),
        });
        if (!milestone) d.milestones.push(m);
        nestStage(d, m.id, owner || undefined);
      })
    ) {
      notify("阶段已保存");
      onClose();
    }
  }
  const outside =
    start &&
    end &&
    data!.planPeriods.some((p) => p.projectId === project.id) &&
    !data!.planPeriods.some(
      (p) =>
        p.projectId === project.id && p.startDate <= start && p.endDate >= end,
    );
  return (
    <Modal title={milestone ? "编辑阶段性目标" : "添加阶段性目标"} onClose={onClose}>
      <form onSubmit={(e) => void save(e)}>
        <p className="modal-note">{project.name}</p>
        <Field label="阶段名称">
          <input
            maxLength={200}
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="上级阶段">
          <select value={owner} onChange={e => setOwner(e.currentTarget.value)}>
            <option value="">项目直属阶段</option>
            {data!.milestones.filter(m => m.projectId === project.id && (!milestone || canNestStage(data!, milestone.id, m.id))).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </Field>
        <Field label="阶段说明（可选）">
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <Field label="预期成果（可选）">
          <textarea
            rows={2}
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            placeholder="完成这个阶段后应该得到什么？"
          />
        </Field>
        <div className="form-grid">
          <Field label="计划开始日期（可选）">
            <input
              type="date"
              value={start}
              min="1900-01-01"
              max="2199-12-31"
              onChange={(e) => setStart(e.target.value)}
            />
          </Field>
          <Field label="计划结束日期（可选）">
            <input
              type="date"
              value={end}
              min="1900-01-01"
              max="2199-12-31"
              onChange={(e) => setEnd(e.target.value)}
            />
          </Field>
        </div>
        <Field label="阶段目标日期（可选）">
          <input
            type="date"
            value={target}
            min="1900-01-01"
            max="2199-12-31"
            onChange={(e) => setTarget(e.target.value)}
          />
        </Field>
        {outside && (
          <p className="planning-warning">
            阶段日期超出已安排的项目时段，可保留这项安排。
          </p>
        )}
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
        <footer>
          <button type="button" data-dismiss onClick={onClose}>
            取消
          </button>
          <button className="primary" disabled={busy}>
            保存阶段
          </button>
        </footer>
      </form>
    </Modal>
  );
}
function BatchEditor({
  project,
  onClose,
}: {
  project: Project;
  onClose: () => void;
}) {
  const { data, mutate, notify, busy } = useData();
  const [input, setInput] = useState(""),
    [preview, setPreview] = useState<string[] | null>(null),
    [duplicates, setDuplicates] = useState<string[]>([]),
    [error, setError] = useState("");
  return (
    <Modal title="批量添加阶段" onClose={onClose}>
      <p className="modal-note">
        每行一个阶段，最多 50 项。确认后作为一次操作保存。
      </p>
      <Field label="阶段名称，每行一项">
        <textarea
          rows={8}
          value={input}
          maxLength={15000}
          onChange={(e) => {
            setInput(e.target.value);
            setPreview(null);
          }}
          placeholder={
            "数据库下载\n数据清洗\n模型运行\n结果验证\n图表整理\n论文写作"
          }
        />
      </Field>
      {preview && (
        <>
          <ol className="batch-preview">
            {preview.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ol>
          {duplicates.length > 0 && (
            <p className="planning-warning">
              检测到重复名称：{duplicates.join("、")}
              。确认后会全部保留，你也可以修改输入。
            </p>
          )}
        </>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <footer>
        <button data-dismiss onClick={onClose}>
          取消
        </button>
        {preview ? (
          <button
            className="primary"
            disabled={busy || !preview.length}
            onClick={async () => {
              if (await mutate((d) => addMilestones(d, project.id, preview))) {
                notify(`已一次保存 ${preview.length} 个阶段`);
                onClose();
              }
            }}
          >
            确认创建 {preview.length} 个阶段
          </button>
        ) : (
          <button
            className="primary"
            onClick={() => {
              try {
                const p = batchNames(input);
                setPreview(p.names);
                setDuplicates([
                  ...new Set([
                    ...p.duplicates,
                    ...p.names.filter((n) =>
                      data!.milestones.some(
                        (m) => m.projectId === project.id && m.name === n,
                      ),
                    ),
                  ]),
                ]);
                setError("");
              } catch (e) {
                setError(String(e));
              }
            }}
          >
            查看创建预览
          </button>
        )}
      </footer>
    </Modal>
  );
}
export function Roadmap({
  project,
  onEditTask,
  initialMilestoneId,
}: {
  project: Project;
  initialMilestoneId?: string;
  onEditTask: (edit: {
    projectId?: string;
    milestoneId?: string;
    task?: Task;
  }) => void;
}) {
  const { data, mutate, notify, busy } = useData();
  const list = orderedMilestones(data!, project.id);
  const [editor, setEditor] = useState<Milestone | null | undefined>(),
    [batch, setBatch] = useState(false),
    [remove, setRemove] = useState<Milestone | null>(null),
    [selected, setSelected] = useState<Task | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [dragMilestone,setDragMilestone] = useState<string | null>(null);
  const [dragTask,setDragTask] = useState<string | null>(null);
  function dropMilestone(e: React.DragEvent, milestoneId: string) {
    e.preventDefault();
    e.stopPropagation();
    const from = e.dataTransfer.getData("text/plain") || dragMilestone;
    if (from && from !== milestoneId) void mutate(d => reorderMilestones(d,from,milestoneId)).then(ok => ok && notify("阶段顺序已保存"));
    setDragMilestone(null);
  }
  useEffect(() => {
    if (!initialMilestoneId) return;
    if (!data!.milestones.some(m => m.id === initialMilestoneId && m.projectId === project.id)) {
      notify("该阶段已不存在，已打开所属项目。"); return;
    }
    setExpanded(s => ({...s, [initialMilestoneId]:true}));
    const frame = requestAnimationFrame(() => {
      const summary = document.getElementById(`milestone-${initialMilestoneId}`)?.querySelector("summary");
      summary?.scrollIntoView({block:"nearest"}); summary?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [initialMilestoneId, project.id]);
  const active = project.status === "active";
  return (
    <section className="roadmap">
      <div className="section-heading">
        <div>
          <h3>项目路线图</h3>
          <small>
            {list.length
              ? `${list.filter((m) => m.status === "done").length} / ${list.length} 个阶段完成`
              : "暂无阶段"}
          </small>
        </div>
        <div className="row">
          <button onClick={() => setBatch(true)}>批量添加阶段</button>
          <button onClick={() => setEditor(null)}>
            <Plus size={13} />
            添加阶段
          </button>
        </div>
      </div>
      {list.map((m, i) => {
        const progress = milestoneProgress(data!, m);
        return (
          <details
            id={`milestone-${m.id}`}
            className={`milestone-row ${m.status}`}
            key={m.id}
            open={expanded[m.id] ?? m.status === "doing"}
            onDragOver={e => { if (dragMilestone || e.dataTransfer.types.includes("text/plain")) e.preventDefault(); }}
            onDrop={e => dropMilestone(e,m.id)}
          >
            <summary
              onClick={(e) => {
                e.preventDefault();
                setExpanded((s) => ({
                  ...s,
                  [m.id]: !(s[m.id] ?? m.status === "doing"),
                }));
              }}
              onDragOver={e => { if (dragMilestone || e.dataTransfer.types.includes("text/plain")) e.preventDefault(); }}
              onDrop={e => dropMilestone(e,m.id)}
            >
              <span className="milestone-position">
                {m.status === "done" ? <Check size={13} /> : i + 1}
              </span>
              <button type="button" className="icon order-handle" draggable aria-label={`拖动排序 ${m.name}`} title="拖动调整阶段顺序"
                onClick={e => e.preventDefault()} onDragStart={e => { e.stopPropagation(); setDragMilestone(m.id); e.dataTransfer.setData("text/plain",m.id); e.dataTransfer.effectAllowed="move"; }} onDragEnd={() => setDragMilestone(null)}><GripVertical size={14}/></button>
              <strong>{m.name}</strong>
              <span>{MILESTONE_STATUS[m.status]}</span>
              <small>
                {progress.done} / {progress.total} 项行动
              </small>
            </summary>
            <div className="milestone-content">
              {m.parentMilestoneId && <p className="milestone-owner">上级阶段：{data!.milestones.find(owner => owner.id === m.parentMilestoneId)?.name}</p>}
              {m.description && <p>{m.description}</p>}
              {m.outcome && (
                <p className="milestone-outcome">
                  <span>预期成果</span>
                  {m.outcome}
                </p>
              )}
              {(m.startDate || m.endDate || m.targetDate) && (
                <p className="muted">
                  {m.startDate || "未设开始"} → {m.endDate || "未设结束"}
                  {m.targetDate && ` · ${dueLabel(m.targetDate)}`}
                </p>
              )}
              <div className="milestone-tools">
                <select
                  aria-label={`${m.name} 的阶段状态`}
                  value={m.status}
                  onChange={(e) => {
                    const status = e.currentTarget.value as Milestone["status"];
                    void mutate((d) => {
                      const item = d.milestones.find((x) => x.id === m.id)!;
                      item.status = status;
                      item.updatedAt = new Date().toISOString();
                    });
                  }}
                >
                  {Object.entries(MILESTONE_STATUS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
                <button
                  className="icon"
                  aria-label={`上移 ${m.name}`}
                  disabled={i === 0 || busy}
                  onClick={() => void mutate((d) => moveMilestone(d, m.id, -1))}
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  className="icon"
                  aria-label={`下移 ${m.name}`}
                  disabled={i === list.length - 1 || busy}
                  onClick={() => void mutate((d) => moveMilestone(d, m.id, 1))}
                >
                  <ArrowDown size={14} />
                </button>
                <button
                  className="icon"
                  aria-label={`编辑阶段 ${m.name}`}
                  onClick={() => setEditor(m)}
                >
                  <Pencil size={14} />
                </button>
                <button
                  className="icon danger-text"
                  aria-label={`删除阶段 ${m.name}`}
                  onClick={() => setRemove(m)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              {orderedTasks(data!,project.id,m.id)
                .map((t) => (
                  <div
                    className={`task-row ${t.status === "done" ? "done" : ""}`}
                    key={t.id}
                    onDragOver={e => { if (dragTask) e.preventDefault(); }}
                    onDrop={e => { e.preventDefault(); const from = e.dataTransfer.getData("text/plain") || dragTask; if (from && from !== t.id) void mutate(d => reorderTasks(d,from,t.id)).then(ok => ok && notify("行动顺序已保存")); setDragTask(null); }}
                  >
                    <button type="button" className="icon order-handle" draggable aria-label={`拖动排序 ${t.name}`} title="拖动调整行动顺序"
                      onClick={e => e.stopPropagation()} onDragStart={e => { setDragTask(t.id); e.dataTransfer.setData("text/plain",t.id); e.dataTransfer.effectAllowed="move"; }} onDragEnd={() => setDragTask(null)}><GripVertical size={13}/></button>
                    <button
                      className="task-check"
                      aria-label={
                        t.status === "done" ? "重新打开行动" : "完成行动"
                      }
                      disabled={busy}
                      onClick={async () => {
                        const c = await focusClock();
                        await mutate((d) => {
                          if (t.status === "done") {
                            const x = d.tasks.find((x) => x.id === t.id)!;
                            x.status = "todo";
                            delete x.completedAt;
                            delete x.completedTrack;
                            x.updatedAt = new Date().toISOString();
                          } else completeTask(d, t.id, c);
                        });
                      }}
                    >
                      {t.status === "done" && <Check size={13} />}
                    </button>
                    <span>{t.name}</span>
                    <small>{t.minutes}分钟</small>
                    <button className="icon order-fallback" aria-label={`上移行动 ${t.name}`} disabled={busy || orderedTasks(data!,project.id,m.id).findIndex(x => x.id === t.id) === 0} onClick={() => void mutate(d => moveTask(d,t.id,-1))}><ArrowUp size={13}/></button>
                    <button className="icon order-fallback" aria-label={`下移行动 ${t.name}`} disabled={busy || orderedTasks(data!,project.id,m.id).findIndex(x => x.id === t.id) === orderedTasks(data!,project.id,m.id).length - 1} onClick={() => void mutate(d => moveTask(d,t.id,1))}><ArrowDown size={13}/></button>
                    {active && t.status !== "done" && (
                      <button
                        className="icon"
                        aria-label={`专注行动 ${t.name}`}
                        onClick={() => setSelected(t)}
                      >
                        <Play size={14} />
                      </button>
                    )}
                    <button
                      className="icon"
                      aria-label={`编辑行动 ${t.name}`}
                      onClick={() => onEditTask({ task: t })}
                    >
                      <Pencil size={14} />
                    </button>
                  </div>
                ))}
              {progress.total > 0 &&
                progress.done === progress.total &&
                m.status !== "done" && (
                  <p className="milestone-ready">
                    阶段行动已全部完成，可用状态控件确认阶段成果。
                  </p>
                )}
              {active && (
                <button
                  className="text-button"
                  onClick={() =>
                    onEditTask({ projectId: project.id, milestoneId: m.id })
                  }
                >
                  <Plus size={13} />
                  添加阶段行动
                </button>
              )}
            </div>
          </details>
        );
      })}
      {editor !== undefined && (
        <MilestoneEditor
          project={project}
          milestone={editor || undefined}
          onClose={() => setEditor(undefined)}
        />
      )}{" "}
      {batch && (
        <BatchEditor project={project} onClose={() => setBatch(false)} />
      )}{" "}
      {remove && (
        <Confirm
          title="删除这个阶段？"
          detail={`该阶段包含 ${data!.tasks.filter((t) => t.milestoneId === remove.id).length} 项行动。删除后行动保留并移至未分组，子阶段提升一级；重启卡文字和成果记录不会删除。`}
          onClose={() => setRemove(null)}
          onConfirm={async () => {
            if (await mutate((d) => deleteMilestone(d, remove.id))) {
              setRemove(null);
              notify("阶段已删除，关联行动已保留。");
            }
          }}
        />
      )}{" "}
      {selected && (
        <Modal title="推进行动" onClose={() => setSelected(null)}>
          <ActionCard
            task={data!.tasks.find((t) => t.id === selected.id)}
            onAdd={() => {}}
          />
        </Modal>
      )}
    </section>
  );
}
