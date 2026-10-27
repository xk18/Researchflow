import { useState, FormEvent } from "react";
import { FolderOpen, Plus, Trash2 } from "lucide-react";
import { base, Project, ResultCard, Track, Task } from "../types";
import { useData } from "../state";
import { Field, Modal } from "./Common";
import { pickFile } from "../services/native";
import { clearPriority, setPriority } from "../domain";
import { validateRange } from "../planning";
import { pauseFocus, focusClock, timeText } from "../focus";
import { setMainProject } from "../projectRelations";
import { nextTaskOrder } from "../ordering";
export function ProjectEditor({
  project,
  onClose,
  initialTrack = "explore",
  initialName = "",
}: {
  project?: Project;
  onClose: () => void;
  initialTrack?: Track;
  initialName?: string;
}) {
  const { data, mutate, busy, notify } = useData();
  const [name, setName] = useState(project?.name || initialName),
    [background, setBackground] = useState(project?.background || ""),
    [track, setTrack] = useState<Track>(project?.track || initialTrack),
    [priority, setFocus] = useState(project?.priority ?? true),
    [mainProjectId, setMainProjectId] = useState(project?.mainProjectId || ""),
    [startDate, setStartDate] = useState(project?.startDate || ""),
    [targetDate, setTargetDate] = useState(project?.targetDate || ""),
    [dateError, setDateError] = useState("");
  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      validateRange(startDate, targetDate);
    } catch (e) {
      setDateError(String(e));
      return;
    }
    if (!name.trim()) {
      notify("请输入项目名称");
      return;
    }
    if (
      await mutate((d) => {
        const p = project
          ? d.projects.find((p) => p.id === project.id)!
          : {
              ...base(),
              name,
              background,
              track,
              status: "active" as const,
              priority,
            };
        const wasPriority = p.priority;
        const nextMainId = mainProjectId || undefined;
        if (nextMainId && d.projects.some(child => child.mainProjectId === p.id))
          throw Error("当前主项目还有子项目，不能再设为子项目；请先调整这些关系。");
        Object.assign(p, {
          name: name.trim(),
          background,
          track,
          priority,
          startDate: startDate || undefined,
          targetDate: targetDate || undefined,
          updatedAt: new Date().toISOString(),
        });
        setMainProject(d,p,nextMainId);
        if (!project) {
          d.projects.push(p);
          d.settings.onboarding ??= "completed";
        }
        if (priority) setPriority(d, p);
        else if (wasPriority) clearPriority(d, p);
      })
    ) {
      notify("项目已保存");
      onClose();
    }
  }
  return (
    <Modal title={project ? "编辑科研项目" : "新建科研项目"} onClose={onClose}>
      <form onSubmit={save}>
        <Field label="项目名称">
          <input
            name="name"
            autoComplete="off"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={200}
            placeholder="例如：材料性能实验的重复验证"
          />
        </Field>
        <Field label="工作方向">
          <select
            value={track}
            onChange={(e) => setTrack(e.target.value as Track)}
          >
            <option value="explore">问题探索</option>
            <option value="deliver">成果产出</option>
          </select>
        </Field>
        <Field label="所属主项目（可选）">
          <select value={mainProjectId} disabled={!!project && !!data?.projects.some(child => child.mainProjectId === project.id)} onChange={e => setMainProjectId(e.target.value)}>
            <option value="">不隶属于其他项目</option>
            {data?.projects.filter(candidate => !candidate.mainProjectId && candidate.id !== project?.id)
              .map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
          </select>
        </Field>
        {project && data?.projects.some(child => child.mainProjectId === project.id) &&
          <p className="muted">这个主项目已有子项目，需先解除或调整它们的关系，才能将本项目改为子项目。</p>}
        <Field label="项目背景（可选）">
          <textarea
            name="background"
            value={background}
            onChange={(e) => setBackground(e.target.value)}
            rows={3}
            placeholder="研究目标与背景"
          />
        </Field>
        <label className="check">
          <input
            type="checkbox"
            checked={priority}
            onChange={(e) => setFocus(e.target.checked)}
          />
          设为当前重点
        </label>
        <p className="muted">
          可保留多个重点。取消重点会同时取消该项目的重点计划和手动聚焦。
        </p>
        <Field label="项目启动日期（可选）">
          <input type="date" min="1900-01-01" max="2199-12-31"
            value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <Field label="目标完成日期（可选）">
          <input
            type="date"
            min="1900-01-01"
            max="2199-12-31"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
          />
        </Field>
        
        {dateError && (
          <p className="inline-error" role="alert">
            {dateError}
          </p>
        )}
        <footer>
          <button data-dismiss type="button" onClick={onClose}>
            取消
          </button>
          <button className="primary" disabled={busy}>
            保存项目
          </button>
        </footer>
      </form>
    </Modal>
  );
}
export function TaskEditor({
  projectId,
  milestoneId,
  task,
  onClose,
}: {
  projectId?: string;
  milestoneId?: string;
  task?: Task;
  onClose: () => void;
}) {
  const { data, mutate, busy, notify } = useData();
  const projects = data!.projects.filter(
    (p) => p.status === "active" || p.id === task?.projectId,
  );
  const hasHistory =
    !!task && data!.focusSessions.some((s) => s.taskId === task.id);
  const [pid, setPid] = useState(
      task?.projectId || projectId || projects[0]?.id || "",
    ),
    [name, setName] = useState(task?.name || ""),
    [minutes, setMinutes] = useState<Task["minutes"]>(task?.minutes || 10),
    [type, setType] = useState(task?.type || "研究行动"),
    [note, setNote] = useState(task?.note || ""),
    [mid, setMid] = useState(task?.milestoneId || milestoneId || ""),
    [estimate, setEstimate] = useState(
      task?.estimatedMinutes ? String(task.estimatedMinutes) : "",
    );
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      notify("请写下一个具体行动");
      return;
    }
    if (
      await mutate((d) => {
        if (task && pid !== task.projectId) {
          if (d.focusSessions.some((s) => s.taskId === task.id))
            throw Error(
              "这个行动已有专注记录，请保留所属项目；可以在新项目创建行动。",
            );
          d.projects.forEach((p) => {
            if (p.snapshot?.taskId === task.id) {
              delete p.snapshot.taskId;
              p.snapshot.updatedAt = new Date().toISOString();
            }
          });
        }
        if (task) {
          const current = d.tasks.find(t => t.id === task.id)!;
          const movedGroup = current.projectId !== pid || current.milestoneId !== (mid || undefined);
          const order = movedGroup ? nextTaskOrder(d,pid,mid || undefined) : current.order;
          Object.assign(
            current,
            {
              projectId: pid,
              name: name.trim(),
              minutes,
              type,
              note,
              milestoneId: mid || undefined,
              estimatedMinutes: estimate ? Number(estimate) : undefined,
              order,
              updatedAt: new Date().toISOString(),
            },
          );
        } else {
          d.tasks.push({
            ...base(),
            projectId: pid,
            name: name.trim(),
            minutes,
            type,
            note,
            milestoneId: mid || undefined,
            estimatedMinutes: estimate ? Number(estimate) : undefined,
            status: "todo",
            order: nextTaskOrder(d,pid,mid || undefined),
          });
          }
      })
    ) {
      notify("下一步行动已保存");
      onClose();
    }
  }
  return (
    <Modal title={task ? "编辑行动" : "添加下一步行动"} onClose={onClose}>
      <form onSubmit={save}>
        <Field label="所属项目">
          <select
            value={pid}
            required
            disabled={hasHistory}
            onChange={(e) => {
              setPid(e.target.value);
              setMid("");
            }}
          >
            <option value="" disabled>
              选择项目
            </option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        {hasHistory && (
          <p className="modal-note">
            专注记录已关联这个项目。阶段仍可调整；迁移到其他项目时请创建新的行动。
          </p>
        )}
        <Field label="具体做什么？">
          <input
            name="action"
            autoComplete="off"
            required
            maxLength={300}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：检查第3组参数的运行日志…"
          />
        </Field>
        <div className="form-grid">
          <Field label="参考时长">
            <input
              type="number"
              required
              min={1}
              max={240}
              step={1}
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
            />
          </Field>
          <Field label="任务类型">
            <input
              value={type}
              maxLength={50}
              onChange={(e) => setType(e.target.value)}
            />
          </Field>
        </div>
        <div className="form-grid">
          <Field label="所属阶段性目标（可选）">
            <select value={mid} onChange={(e) => setMid(e.target.value)}>
              <option value="">未分组行动</option>
              {data!.milestones
                .filter((m) => m.projectId === pid)
                .sort((a, b) => a.order - b.order)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="预计总工作量（分钟，可选）">
            <input
              type="number"
              min={1}
              max={1000000}
              step={1}
              value={estimate}
              onChange={(e) => setEstimate(e.target.value)}
            />
          </Field>
        </div>
        <Field label="简短备注（可选）">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="补充备注"
          />
        </Field>
        <footer>
          <button data-dismiss type="button" onClick={onClose}>
            取消
          </button>
          <button className="primary" disabled={busy}>
            保存行动
          </button>
        </footer>
        {task && (
          <details>
            <summary>已有专注记录</summary>
            {data!.focusSessions
              .filter((s) => s.taskId === task.id)
              .map((s) => (
                <p className="focus-history" key={s.id}>
                  {new Date(s.startedAt).toLocaleString()} ·{" "}
                  {s.mode === "countup"
                    ? "正计时"
                    : `${s.plannedMinutes}分钟计划`}{" "}
                  · 有效 {timeText(s.elapsedMs)} ·{" "}
                  {s.status === "ended"
                    ? "已结束"
                    : s.status === "running"
                      ? "进行中"
                      : "待继续"}
                </p>
              ))}
          </details>
        )}
      </form>
    </Modal>
  );
}
export function PauseEditor({
  project,
  onClose,
}: {
  project: Project;
  onClose: () => void;
}) {
  const { data, mutate, busy, notify } = useData();
  const s = project.snapshot;
  const [nextAction, setNext] = useState(s?.nextAction || ""),
    [conclusion, setConclusion] = useState(s?.conclusion || ""),
    [questions, setQuestions] = useState(s?.questions || ""),
    [blocker, setBlocker] = useState(s?.blocker || ""),
    [files, setFiles] = useState<string[]>(s?.files || []),
    [path, setPath] = useState(""),
    [pathError, setPathError] = useState(""),
    [mid, setMid] = useState(s?.milestoneId || ""),
    [tid, setTid] = useState(s?.taskId || "");
  async function choose(directory = false) {
    try {
      const p = await pickFile(directory);
      if (p) setFiles([...new Set([...files, p])]);
    } catch (e) {
      setPathError(String(e));
    }
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!nextAction.trim()) {
      notify("请留下下次开始的第一个动作");
      return;
    }
    const clock = await focusClock();
    if (
      await mutate((d) => {
        const p = d.projects.find((p) => p.id === project.id)!;
        p.status = "paused";
        p.updatedAt = new Date().toISOString();
        p.snapshot = {
          ...(s || base()),
          conclusion,
          questions,
          blocker,
          files: [
            ...new Set([...files, ...(path.trim() ? [path.trim()] : [])]),
          ],
          nextAction: nextAction.trim(),
          milestoneId: mid || undefined,
          taskId: tid || undefined,
          updatedAt: p.updatedAt,
        };
        d.tasks
          .filter((t) => t.projectId === p.id && t.status === "running")
          .forEach((t) => (t.status = "paused"));
        if (
          d.timer &&
          d.tasks.find((t) => t.id === d.timer!.taskId)?.projectId === p.id
        )
          pauseFocus(d, clock);
      })
    ) {
      notify("暂停快照已保存");
      onClose();
    }
  }
  return (
    <Modal title="暂停项目" onClose={onClose} wide>
      <form onSubmit={save}>
        <p className="modal-note">
          {project.name}
        </p>
        <Field label="下次重新开始的第一个动作">
          <input
            required
            name="restart"
            maxLength={300}
            value={nextAction}
            onChange={(e) => setNext(e.target.value)}
            placeholder="例如：打开 run_06.log，核对第三组参数…"
          />
        </Field>
        
        <div className="form-grid">
          <Field label="当前阶段性目标（可选）">
            <select value={mid} onChange={(e) => setMid(e.target.value)}>
              <option value="">不关联阶段</option>
              {data!.milestones
                .filter((m) => m.projectId === project.id)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="下一步已有行动（可选）">
            <select
              value={tid}
              onChange={(e) => {
                const id = e.target.value;
                setTid(id);
                if (id) {
                  const task = data!.tasks.find((t) => t.id === id)!;
                  setNext(task.name);
                  setMid(task.milestoneId || "");
                }
              }}
            >
              <option value="">使用文字第一步</option>
              {data!.tasks
                .filter(
                  (t) => t.projectId === project.id && t.status !== "done",
                )
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
          </Field>
        </div>
        <details>
          <summary>补充结论、问题与文件（可选）</summary>
          <Field label="目前已经确定的研究结论">
            <textarea
              value={conclusion}
              onChange={(e) => setConclusion(e.target.value)}
              rows={3}
            />
          </Field>
          <Field label="尚未解决的问题">
            <textarea
              value={questions}
              onChange={(e) => setQuestions(e.target.value)}
              rows={2}
            />
          </Field>
          <Field label="当前阻碍">
            <textarea
              value={blocker}
              onChange={(e) => setBlocker(e.target.value)}
              rows={2}
            />
          </Field>
          <Field label="关键文件或文件夹路径">
            <input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              spellCheck={false}
              placeholder="粘贴一个你希望保存的本地路径…"
            />
          </Field>
          <div className="row">
            <button type="button" onClick={() => void choose()}>
              <FolderOpen aria-hidden="true" size={15} />
              选择文件
            </button>
            <button type="button" onClick={() => void choose(true)}>
              选择文件夹
            </button>
            {path.trim() && (
              <button
                type="button"
                onClick={() => {
                  setFiles([...new Set([...files, path.trim()])]);
                  setPath("");
                }}
              >
                <Plus aria-hidden="true" size={15} />
                加入路径
              </button>
            )}
          </div>
          {pathError && <p role="alert">{pathError}</p>}
          {files.map((f) => (
            <div className="file-row" key={f}>
              <span>{f}</span>
              <button
                className="icon"
                aria-label={`移除路径 ${f}`}
                type="button"
                onClick={() => setFiles(files.filter((x) => x !== f))}
              >
                <Trash2 aria-hidden="true" size={14} />
              </button>
            </div>
          ))}
        </details>
        <footer>
          <button data-dismiss type="button" onClick={onClose}>
            取消
          </button>
          <button className="primary" disabled={busy}>
            保存并暂停
          </button>
        </footer>
      </form>
    </Modal>
  );
}
export function ResultEditor({
  card,
  projectId,
  onClose,
}: {
  card?: ResultCard;
  projectId?: string;
  onClose: () => void;
}) {
  const { data, mutate, busy, notify } = useData();
  const [pid, setPid] = useState(
    card?.projectId || projectId || data!.projects[0]?.id || "",
  );
  const [fields, setFields] = useState({
    observation: card?.observation || "",
    hypothesis: card?.hypothesis || "",
    evidence: card?.evidence || "",
    support: card?.support || "",
    interpretation: card?.interpretation || "",
    limitations: card?.limitations || "",
    validation: card?.validation || "",
    significance: card?.significance || "",
  });
  const labels: Record<keyof typeof fields, string> = {
    observation: "发现了什么？",
    hypothesis: "科学假设",
    evidence: "关键数据或图表位置",
    support: "对假设的支持程度",
    interpretation: "结果解释",
    limitations: "研究局限",
    validation: "尚需完成的验证",
    significance: "可能的科学意义",
  };
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!fields.observation.trim()) {
      notify("请先记录一句观察");
      return;
    }
    if (
      await mutate((d) => {
        if (card)
          Object.assign(
            d.results.find((r) => r.id === card.id)!,
            fields,
            {
              projectId: pid,
              updatedAt: new Date().toISOString(),
            },
          );
        else d.results.push({ ...base(), ...fields, projectId: pid });
      })
    ) {
      notify("成果卡已保存");
      onClose();
    }
  }
  return (
    <Modal title={card ? "编辑成果卡" : "记录成果"} onClose={onClose} wide>
      <form onSubmit={save} className="result-editor">
        <p className="editor-intro">
          观察为必填项
        </p>
        <Field label="所属项目">
          <select value={pid} required onChange={(e) => setPid(e.target.value)}>
            <option disabled value="">
              选择项目
            </option>
            {data!.projects.map((p) => (
              <option value={p.id} key={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={labels.observation}>
          <textarea
            required
            name="observation"
            value={fields.observation}
            onChange={(e) =>
              setFields({ ...fields, observation: e.target.value })
            }
            rows={4}
            maxLength={100000}
            placeholder="观察内容"
          />
        </Field>
        <details open={!!card} className="result-properties">
          <summary>完善为论文素材（可选）</summary>
          <div className="property-grid">
            {(Object.keys(fields) as (keyof typeof fields)[])
              .filter((k) => k !== "observation")
              .map((k) => (
                <Field key={k} label={labels[k]}>
                  <textarea
                    value={fields[k]}
                    maxLength={100000}
                    onChange={(e) =>
                      setFields({ ...fields, [k]: e.target.value })
                    }
                    rows={3}
                    placeholder={
                      k === "hypothesis"
                        ? "这个结果在回答什么问题？"
                        : k === "evidence"
                          ? "数据、图表编号或文件位置"
                          : k === "limitations"
                            ? "哪些因素限制了当前结论？"
                            : "尚未记录"
                    }
                  />
                </Field>
              ))}
          </div>
        </details>
        <footer>
          <button data-dismiss type="button" onClick={onClose}>
            取消
          </button>
          <button className="primary" disabled={busy}>
            保存成果卡
          </button>
        </footer>
      </form>
    </Modal>
  );
}
export function IdeaEditor({ onClose }: { onClose: () => void }) {
  const { mutate, busy, notify } = useData();
  const [text, setText] = useState("");
  return (
    <Modal title="先把灵感放在这里" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!text.trim()) {
            notify("请先写下一点灵感");
            return;
          }
          if (
            await mutate((d) => {
              d.ideas.unshift({
                ...base(),
                text: text.trim(),
                archived: false,
              });
            })
          ) {
            notify("灵感已保存，不必现在就开始。");
            onClose();
          }
        }}
      >
        <Field label="一个问题，或一个想法">
          <textarea
            required
            name="idea"
            rows={5}
            maxLength={100000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="灵感内容"
          />
        </Field>
        <footer>
          <button data-dismiss type="button" onClick={onClose}>
            取消
          </button>
          <button className="primary" disabled={busy}>
            保存灵感
          </button>
        </footer>
      </form>
    </Modal>
  );
}
