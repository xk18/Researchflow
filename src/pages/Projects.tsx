import { useState } from "react";
import {
  Archive,
  Check,
  ChevronRight,
  FileDown,
  Sparkles,
  Pause,
  Play,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  GripVertical,
  ArrowUp,
  ArrowDown,
  Network,
  CalendarDays,
} from "lucide-react";
import { base, Project, STATUS, Task, TRACK, Track } from "../types";
import { useData } from "../state";
import { Confirm, Empty, Modal } from "../components/Common";
import { PauseEditor, ProjectEditor, TaskEditor } from "../components/Editors";
import { download, desktop } from "../services/native";
import { projectMarkdown, setPriority, clearPriority } from "../domain";
import { ActionCard } from "../components/ActionCard";
import { Roadmap } from "../components/Roadmap";
import {
  endFocus,
  focusClock,
  pauseFocus,
  resumeFocus,
  startFocus,
} from "../focus";
import { dueLabel, useToday } from "../dates";
import { AiPlanImport } from "../components/AiPlanImport";
import { groupProjects, releaseChildren } from "../projectRelations";
import { moveTask, orderedTasks, reorderTasks } from "../ordering";
import { WorkflowMap } from '../components/WorkflowMap';
export function Restart({
  project,
  onClose,
  onRoadmap,
}: {
  project: Project;
  onClose: () => void;
  onRoadmap?: () => void;
}) {
  const { data, mutate, notify } = useData();
  const [fileError, setFileError] = useState("");
  const s = project.snapshot;
  async function restart(start = false) {
    const clock = await focusClock();
    if (
      await mutate((d) => {
        const p = d.projects.find((p) => p.id === project.id)!;
        p.status = "active";
        p.updatedAt = new Date().toISOString();
        setPriority(d, p);
        let t = d.tasks.find(
          (t) =>
            t.projectId === p.id &&
            (t.id === s?.taskId || t.name === s?.nextAction) &&
            t.status !== "done",
        );
        if (!t && s) {
          t = {
            ...base(),
            projectId: p.id,
            name: s.nextAction,
            type: "项目重启",
            minutes: 10,
            status: "todo",
            note: "",
            milestoneId: s.milestoneId,
          };
          d.tasks.unshift(t);
        }
        if (start && t) {
          if (d.timer?.taskId === t.id) resumeFocus(d, clock);
          else startFocus(d, t, "countdown", 10, clock);
        }
      })
    ) {
      notify(start ? "已开始10分钟，慢慢找回思路。" : "项目已恢复");
      onClose();
    }
  }
  return (
    <Modal title="找回研究思路" onClose={onClose} wide>
      <div className="restart">
        <p className="project-label">{TRACK[project.track]}</p>
        <h3>{project.name}</h3>
        <p>{project.background || "尚未记录项目背景。"}</p>
        {s ? (
          <>
            <div className="restart-next">
              <span>回来后的第一步</span>
              <h3>{s.nextAction}</h3>
            </div>
            {s.milestoneId && (
              <p>
                当前阶段：
                {data!.milestones.find((m) => m.id === s.milestoneId)?.name ||
                  "原阶段已删除，文字线索仍保留。"}
              </p>
            )}
            {[
              ["已经确定的结论", s.conclusion],
              ["未解决的问题", s.questions],
              ["当前阻碍", s.blocker],
            ].map(([k, v]) => (
              <section key={k}>
                <h4>{k}</h4>
                <p>{v || "未记录"}</p>
              </section>
            ))}
            <section>
              <h4>关键工作文件</h4>
              {s.files.length ? (
                s.files.map((f) => (
                  <button
                    key={f}
                    className="file-link"
                    onClick={async () => {
                      try {
                        await desktop("open_research_path", { path: f });
                        setFileError("");
                      } catch (e) {
                        setFileError(
                          `无法打开：${String(e)}。文件可能已移动，请更新快照路径。`,
                        );
                      }
                    }}
                  >
                    {f}
                  </button>
                ))
              ) : (
                <p>未记录文件位置。</p>
              )}
              {fileError && (
                <p className="inline-error" role="alert">
                  {fileError}
                </p>
              )}
            </section>
          </>
        ) : (
          <p>暂无暂停快照</p>
        )}
      </div>
      <footer>
        {onRoadmap && <button onClick={onRoadmap}>查看项目路线图</button>}
        <button onClick={() => void restart()}>恢复项目</button>
        {s && (
          <button className="primary" onClick={() => void restart(true)}>
            开始10分钟
          </button>
        )}
      </footer>
    </Modal>
  );
}
export function Projects({
  trackFilter,
  restartOnly = false,
  initialProjectId,
  initialMilestoneId,
  initialStatus,
}: {
  trackFilter?: Track;
  restartOnly?: boolean;
  initialProjectId?: string;
  initialMilestoneId?: string;
  initialStatus?: Project["status"] | "all";
}) {
  const { data, mutate, notify, busy } = useData();
  const [edit, setEdit] = useState<Project | null | undefined>(),
    [pause, setPause] = useState<Project | null>(null),
    [restart, setRestart] = useState<Project | null>(null),
    [remove, setRemove] = useState<Project | null>(null),
    [taskEdit, setTaskEdit] = useState<{
      projectId?: string;
      milestoneId?: string;
      task?: Task;
    } | null>(null),
    [open, setOpen] = useState<string>(initialProjectId || ""),
    [showInactive, setShowInactive] = useState(
      !!initialProjectId &&
        !["active", "paused"].includes(
          data!.projects.find((p) => p.id === initialProjectId)?.status ||
            "active",
        ),
    ),
    [search, setSearch] = useState(""),
    [trackChoice, setTrackChoice] = useState<Track | "all">(trackFilter || "all"),
    [statusChoice, setStatusChoice] = useState<Project["status"] | "all">(initialStatus || (restartOnly ? "paused" : "all")),
    [focusTask, setFocusTask] = useState<Task | null>(null);
  const [dragTask,setDragTask] = useState<string | null>(null);
  const [aiPlanProject, setAiPlanProject] = useState<Project | null>(null);
  const [mapProject, setMapProject] = useState<Project | null>(null);
  const [mapStage, setMapStage] = useState<{ projectId: string; id: string; sequence: number }>();
  const today = useToday();
  const filteredProjects = data!.projects.filter(
    (p) =>
      (trackChoice === "all" || p.track === trackChoice) &&
      (statusChoice === "all" ? (showInactive || ["active", "paused"].includes(p.status)) : p.status === statusChoice) &&
      p.name.toLowerCase().includes(search.toLowerCase()),
  );
  const projects = groupProjects(filteredProjects);
  const childrenCount = data!.projects.filter(p => p.mainProjectId === remove?.id).length;
  async function status(p: Project, value: Project["status"]) {
    const clock = await focusClock();
    await mutate((d) => {
      const project = d.projects.find((x) => x.id === p.id)!;
      project.status = value;
      project.updatedAt = new Date().toISOString();
      d.tasks
        .filter((t) => t.projectId === p.id && t.status === "running")
        .forEach((t) => (t.status = "paused"));
      if (
        d.timer &&
        d.tasks.find((t) => t.id === d.timer!.taskId)?.projectId === p.id
      )
        if (value === "paused") pauseFocus(d, clock);
        else endFocus(d, clock);
    });
  }
  return (
    <>
      {initialProjectId && !data!.projects.some(p => p.id === initialProjectId) && <p className="planning-warning" role="status">该项目已不存在，请选择其他项目。</p>}
      <div className="page-heading projects-heading">
        <div>
          <h1>
            科研项目
          </h1>
        </div>
        <button className="primary" onClick={() => setEdit(null)}>
          <Plus aria-hidden="true" size={16} />
          新建项目
        </button>
      </div>
      <div className="toolbar">
        <input
          aria-label="搜索科研项目"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索项目…"
        />
        <label className="check">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          显示完成与归档
        </label>
      </div>
      <div className="project-filters" role="group" aria-label="项目筛选">
        {(["all","explore","deliver"] as const).map(key => <button key={key} className={trackChoice === key ? "selected" : ""} aria-pressed={trackChoice === key} onClick={() => setTrackChoice(key)}>{key === "all" ? "全部方向" : TRACK[key]}</button>)}
        <label>项目状态 <select aria-label="项目状态" value={statusChoice} onChange={e => setStatusChoice(e.target.value as Project["status"] | "all")}>
          <option value="all">进行中与暂停</option><option value="active">进行中</option><option value="paused">已暂停</option><option value="completed">已完成</option><option value="archived">已归档</option><option value="terminated">已终止</option>
        </select></label>
      </div>
      {projects.length ? (
        <div className="project-list">
          {projects.map((p) => (
            <article className={`project-item${p.mainProjectId ? " subproject-item" : ""}`} key={p.id}>
              <div className="project-item-top">
                {p.mainProjectId && <span className="project-parent-path">{data!.projects.find(x => x.id === p.mainProjectId)?.name || "主项目"} / 子项目</span>}
                <span className={`track-label ${p.track}`}>
                  {TRACK[p.track]}
                </span>
                <span className="status-label">{STATUS[p.status]}</span>
                {p.demo && <span className="demo-label">演示项目</span>}
                {p.priority && <span className="priority-label">当前重点</span>}
              </div>
              <button
                className="project-name"
                onClick={() => setOpen(open === p.id ? "" : p.id)}
                aria-expanded={open === p.id}
              >
                <h2>{p.name}</h2>
                <ChevronRight
                  aria-hidden="true"
                  className={open === p.id ? "rotated" : ""}
                  size={18}
                />
              </button>
              {(p.startDate || p.targetDate) && (
                <p className="project-due" title={p.targetDate ? dueLabel(p.targetDate,today) : undefined}>
                  <CalendarDays size={12} aria-hidden="true"/>{[p.startDate,p.targetDate].filter(Boolean).join(' → ')}
                </p>
              )}
              <div className="project-controls">
                <button onClick={() => setMapProject(p)}><Network aria-hidden="true" size={14}/>流程图</button>
                <button title="编辑项目" onClick={() => setEdit(p)}>
                  <Pencil aria-hidden="true" size={13} />
                  编辑
                </button>
                {p.status === "active" && (
                  <button onClick={() => setPause(p)}><Pause aria-hidden="true" size={13} />暂停</button>
                )}
                {p.status === "paused" && (
                  <button
                    className="restart-button"
                    onClick={() => setRestart(p)}
                  >
                    <RotateCcw aria-hidden="true" size={13} />
                    找回研究思路
                  </button>
                )}
                <details className="project-more">
                  <summary>更多操作</summary>
                  <div className="project-more-menu">
                    {p.status === "active" && <>
                      <button onClick={() => void mutate(d => { const x=d.projects.find(x => x.id === p.id)!; x.track=x.track === "explore" ? "deliver" : "explore"; clearPriority(d,x); x.updatedAt=new Date().toISOString(); })}>转入{p.track === "explore" ? "成果产出" : "问题探索"}</button>
                      {p.priority || data!.settings.focusProjectId === p.id || data!.planPeriods.some(period => period.projectId === p.id && period.priority) ?
                        <button onClick={() => void mutate(d => clearPriority(d,d.projects.find(x => x.id === p.id)!))}>取消重点</button> :
                        <button onClick={() => void mutate(d => { const x=d.projects.find(x => x.id === p.id)!; setPriority(d,x); d.settings.focusProjectId=x.id; x.updatedAt=new Date().toISOString(); })}>设为重点</button>}
                      <button onClick={() => void status(p,"completed")}><Check aria-hidden="true" size={13}/>项目完成</button>
                    </>}
                    <button onClick={async () => { if (await download(`${p.name.replace(/[<>:"/\\|?*]/g, "_")}.md`,projectMarkdown(p,data!))) notify("项目 Markdown 已导出"); }}><FileDown aria-hidden="true" size={13}/>导出 Markdown</button>
                  </div>
                </details>
              </div>
              {open === p.id && (
                <div className="project-detail">
                  {p.background && <details className="project-background-details"><summary>项目背景</summary><p>{p.background}</p></details>}
                  {p.mainProjectId && <p className="project-detail-path">主项目：{data!.projects.find(x => x.id === p.mainProjectId)?.name || "已关联项目"} / 子项目：{p.name}</p>}
                  {!p.mainProjectId && data!.projects.some(child => child.mainProjectId === p.id) && <p className="project-detail-path">主项目 · {data!.projects.filter(child => child.mainProjectId === p.id).length} 个子项目</p>}
                  {(p.status === "active" || p.status === "paused") && (
                    <div className="ai-plan-entry">
                      <button onClick={() => setAiPlanProject(p)}><Sparkles aria-hidden="true" size={15} />AI 科研计划导入</button>
                    </div>
                  )}
                  <Roadmap key={mapStage?.projectId === p.id ? mapStage.sequence : p.id} project={p} initialMilestoneId={mapStage?.projectId === p.id ? mapStage.id : initialMilestoneId} onEditTask={setTaskEdit} />
                  <div className="section-heading">
                    <h3>未分组行动</h3>
                    {p.status === "active" && (
                      <button onClick={() => setTaskEdit({ projectId: p.id })}>
                        <Plus aria-hidden="true" size={14} />
                        添加行动
                      </button>
                    )}
                  </div>
                  {orderedTasks(data!,p.id,undefined)
                    .map((t) => (
                      <div
                        key={t.id}
                        className={`task-row ${t.status === "done" ? "done" : ""}`}
                        onDragOver={e => { if (dragTask) e.preventDefault(); }}
                        onDrop={e => { e.preventDefault(); const from = e.dataTransfer.getData("text/plain") || dragTask; if (from && from !== t.id) void mutate(d => reorderTasks(d,from,t.id)).then(ok => ok && notify("行动顺序已保存")); setDragTask(null); }}
                      >
                        <button type="button" className="icon order-handle" draggable aria-label={`拖动排序 ${t.name}`} title="拖动调整行动顺序" onClick={e => e.stopPropagation()} onDragStart={e => { setDragTask(t.id); e.dataTransfer.setData("text/plain",t.id); e.dataTransfer.effectAllowed="move"; }} onDragEnd={() => setDragTask(null)}><GripVertical size={13}/></button>
                        <button
                          className="task-check"
                          disabled={busy}
                          aria-label={
                            t.status === "done" ? "重新打开行动" : "完成行动"
                          }
                          onClick={async () => {
                            const clock = await focusClock();
                            await mutate((d) => {
                              const x = d.tasks.find((x) => x.id === t.id)!;
                              x.status = x.status === "done" ? "todo" : "done";
                              x.updatedAt = new Date().toISOString();
                              if (x.status === "done") {
                                x.completedAt = x.updatedAt;
                                x.completedTrack = p.track;
                              } else {
                                delete x.completedAt;
                                delete x.completedTrack;
                              }
                              if (d.timer?.taskId === x.id) endFocus(d, clock);
                            });
                          }}
                        >
                          {t.status === "done" && (
                            <Check aria-hidden="true" size={13} />
                          )}
                        </button>
                        <span>{t.name}</span>
                        <small>
                          {t.minutes}分钟
                          {t.status === "paused" ? " / 已暂停" : ""}
                        </small>
                        <button className="icon order-fallback" aria-label={`上移行动 ${t.name}`} disabled={busy || orderedTasks(data!,p.id,undefined).findIndex(x => x.id === t.id) === 0} onClick={() => void mutate(d => moveTask(d,t.id,-1))}><ArrowUp size={13}/></button>
                        <button className="icon order-fallback" aria-label={`下移行动 ${t.name}`} disabled={busy || orderedTasks(data!,p.id,undefined).findIndex(x => x.id === t.id) === orderedTasks(data!,p.id,undefined).length - 1} onClick={() => void mutate(d => moveTask(d,t.id,1))}><ArrowDown size={13}/></button>
                        {p.status === "active" && (
                          <button
                            className="icon"
                            aria-label={`专注行动 ${t.name}`}
                            onClick={() => setFocusTask(t)}
                          >
                            <Play size={14} />
                          </button>
                        )}
                        {p.status === "active" && (
                          <button
                            className="icon"
                            aria-label={`编辑行动 ${t.name}`}
                            onClick={() => setTaskEdit({ task: t })}
                          >
                            <Pencil aria-hidden="true" size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                  {!data!.tasks.some((t) => t.projectId === p.id) && (
                    <p className="muted">暂无行动</p>
                  )}
                  <div className="project-maintenance">
                    {["completed", "archived", "terminated"].includes(
                      p.status,
                    ) && (
                      <button onClick={() => void status(p, "active")}>
                        恢复为进行中
                      </button>
                    )}
                    {p.status !== "archived" && (
                      <button onClick={() => void status(p, "archived")}>
                        <Archive aria-hidden="true" size={13} />
                        归档
                      </button>
                    )}
                    {p.status !== "terminated" && (
                      <button onClick={() => void status(p, "terminated")}>
                        终止课题
                      </button>
                    )}
                    <button
                      className="danger-text"
                      onClick={() => setRemove(p)}
                    >
                      <Trash2 aria-hidden="true" size={13} />
                      删除项目
                    </button>
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title={
            search
              ? "没有匹配的项目"
              : restartOnly
                ? "暂时没有需要重启的课题"
                : "从一个值得研究的问题开始"
          }
          detail={
            restartOnly
              ? "暂停项目时，留下下次的第一步。"
              : "不必建立完整计划。一个项目、一个小动作就足够。"
          }
          action={restartOnly ? undefined : () => setEdit(null)}
        />
      )}
      {edit !== undefined && (
        <ProjectEditor
          project={edit || undefined}
          initialTrack={trackFilter}
          onClose={() => setEdit(undefined)}
        />
      )}
      {pause && <PauseEditor project={pause} onClose={() => setPause(null)} />}
      {restart && (
        <Restart
          project={restart}
          onClose={() => setRestart(null)}
          onRoadmap={() => {
            setShowInactive(true);
            setOpen(restart.id);
            setRestart(null);
          }}
        />
      )}
      {taskEdit && (
        <TaskEditor {...taskEdit} onClose={() => setTaskEdit(null)} />
      )}
      {remove && (
        <Confirm
          title="删除这个项目？"
          detail={`项目自身的行动、计划、成果卡与专注记录会一并删除，相关灵感解除关联。${childrenCount ? `它包含 ${childrenCount} 个子项目；删除后子项目及其记录会保留，并提升为独立项目。` : "其他项目不受影响。"}建议先导出备份。`}
          onClose={() => setRemove(null)}
          onConfirm={async () => {
            if (
              await mutate((d) => {
                const pid = remove.id;
                releaseChildren(d,new Set([pid]));
                d.projects = d.projects.filter((p) => p.id !== pid);
                const removedTasks = d.tasks
                  .filter((t) => t.projectId === pid)
                  .map((t) => t.id);
                d.tasks = d.tasks.filter((t) => t.projectId !== pid);
                d.planPeriods = d.planPeriods.filter(
                  (p) => p.projectId !== pid,
                );
                d.milestones = d.milestones.filter((m) => m.projectId !== pid);
                d.focusSessions = d.focusSessions.filter(
                  (s) => s.projectId !== pid,
                );
                if (d.settings.focusProjectId === pid)
                  delete d.settings.focusProjectId;
                d.results = d.results.filter((r) => r.projectId !== pid);
                d.ideas.forEach((i) => {
                  if (i.projectId === pid) {
                    delete i.projectId;
                    i.updatedAt = new Date().toISOString();
                  }
                });
                if (d.timer && removedTasks.includes(d.timer.taskId))
                  d.timer = null;
              })
            ) {
              setRemove(null);
              notify("项目已删除");
            }
          }}
        />
      )}
      {focusTask && (
        <Modal title="推进行动" onClose={() => setFocusTask(null)}>
          <ActionCard
            task={data!.tasks.find((t) => t.id === focusTask.id)}
            onAdd={() => {}}
          />
        </Modal>
      )}
      {aiPlanProject && <AiPlanImport project={aiPlanProject} onClose={() => setAiPlanProject(null)} />}
      {mapProject && data!.projects.some(p => p.id === mapProject.id) && <WorkflowMap project={data!.projects.find(p => p.id === mapProject.id)!} onClose={() => setMapProject(null)} onStage={id => { setShowInactive(true); setOpen(mapProject.id); setMapStage(s => ({ projectId: mapProject.id, id, sequence: (s?.sequence || 0) + 1 })); setMapProject(null); }} onTask={task => { setMapProject(null); setTaskEdit({ task }); }}/>}
    </>
  );
}
export function TrackPage() {
  const [track, setTrack] = useState<Track>("explore");
  const { data } = useData();
  const task = data!.tasks.find((t) => t.status === "running");
  return (
    <>
      <div className="track-tabs" role="group" aria-label="选择科研方向">
        <button
          className={track === "explore" ? "selected" : ""}
          onClick={() => setTrack("explore")}
        >
          问题探索
        </button>
        <button
          className={track === "deliver" ? "selected" : ""}
          onClick={() => setTrack("deliver")}
        >
          成果产出
        </button>
      </div>
      {task && <ActionCard task={task} onAdd={() => {}} />}
      <Projects trackFilter={track} />
    </>
  );
}
