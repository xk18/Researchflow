import { useState } from "react";
import { ArrowUpRight, Lightbulb, RotateCcw, CheckCheck, NotebookPen, SlidersHorizontal } from "lucide-react";
import { Motivation, MOTIVATION } from "../types";
import { useData } from "../state";
import { recommend } from "../domain";
import { ActionCard } from "../components/ActionCard";
import { IdeaEditor, ProjectEditor, TaskEditor } from "../components/Editors";
import { Restart } from "./Projects";
import { OverviewTimeline } from "../components/OverviewTimeline";
import { OverviewHint } from "../components/OverviewHint";
import { Navigate } from "../navigation";
import { useToday } from "../dates";
import { currentMilestone, focusedProject, MILESTONE_STATUS } from "../planning";
import { Welcome } from "../components/Samples";
import { needsWelcome } from "../samples";
import { projectPath } from '../projectRelations';
import { Message } from '../components/Message';

export function MotivationPicker({ compact = false }: { compact?: boolean }) {
  const { data, mutate, busy } = useData();
  if (compact) return <label className="overview-motivation" title="当前科研动力"><SlidersHorizontal size={13} aria-hidden="true"/>
    <select aria-label="当前科研动力" value={data!.settings.motivation} disabled={busy} onChange={e => {
      const motivation = e.currentTarget.value as Motivation;
      void mutate(d => { d.settings.motivation = motivation; });
    }}>{(["high", "normal", "low"] as Motivation[]).map(m => <option key={m} value={m}>{MOTIVATION[m]}</option>)}</select>
  </label>;
  return <div className="motivation" role="group" aria-label="当前科研动力">
    {(["high", "normal", "low"] as Motivation[]).map(m => <button key={m} aria-pressed={data!.settings.motivation === m}
      className={data!.settings.motivation === m ? "selected" : ""} onClick={() => void mutate(d => { d.settings.motivation = m; })}>{MOTIVATION[m]}</button>)}
  </div>;
}
export function Overview({ navigate }: { navigate: Navigate }) {
  const { data } = useData();
  const [editor, setEditor] = useState<"project" | "task" | "idea" | null>(null), [restart, setRestart] = useState<string | null>(null);
  const task = recommend(data!), today = useToday();
  const context = task ? data!.projects.find(p => p.id === task.projectId) : focusedProject(data!, today);
  const stage = task ? data!.milestones.find(m => m.id === task.milestoneId && m.projectId === task.projectId) : context && currentMilestone(data!, context.id);
  const manual = data!.projects.find(p => p.id === data!.settings.focusProjectId && p.status === "active");
  const otherFocus = data!.timer?.taskId === task?.id && manual && manual.id !== context?.id;
  const paused = data!.projects.filter(p => p.status === "paused").sort((a,b) =>
    (b.snapshot?.updatedAt || b.updatedAt).localeCompare(a.snapshot?.updatedAt || a.updatedAt) || a.id.localeCompare(b.id));
  const done = data!.tasks.filter(t => t.status === "done" && t.completedAt && Date.parse(t.completedAt) > Date.now() - 7 * 86400000).length;
  if (needsWelcome(data!)) return <><Welcome navigate={navigate} onCreate={() => setEditor("project")} />
    {editor === "project" && <ProjectEditor onClose={() => setEditor(null)} />}</>;
  return <>
    <div className="page-heading overview-heading"><div>
      <h1>今天的研究</h1><span className="date-label">{new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(new Date(`${today}T12:00:00`))}</span>
    </div><button className="icon" aria-label="记录灵感" title="记录灵感" onClick={() => setEditor("idea")}><Lightbulb aria-hidden="true" size={17} /></button></div>
    <Message place="overview"/>
    {!data!.projects.length ? <div className="overview-blank"><h2>暂无项目</h2>
      <button className="primary" onClick={() => setEditor("project")}>新建项目</button><button onClick={() => navigate("settings")}>体验示例项目</button></div> : <>
      <OverviewTimeline today={today} navigate={navigate} />
      <section className="overview-action" aria-label="当前研究与下一步行动">
        <div className="overview-context-heading"><div className="overview-project-context">
          {otherFocus && <span>{data!.timer?.running ? "正在专注" : "本次专注"}</span>}
          {context ? <OverviewHint className="text-button overview-context-name" hint={projectPath(data!,context)} onClick={() => navigate(`projects:${context.id}`)}>{projectPath(data!,context)}</OverviewHint> : <span>选择一个研究项目</span>}
        </div><button className="icon" title="行动视角" aria-label="行动视角" onClick={() => navigate("focus")}><ArrowUpRight aria-hidden="true" size={15} /></button></div>
        {otherFocus && <p className="overview-focus-note" title="当前选定项目"><button className="text-button" onClick={() => navigate(`projects:${manual.id}`)}>{manual.name}</button></p>}
        <div className="overview-stage-row"><p className="overview-stage">
          {stage && context ? <OverviewHint className="text-button" hint={`${stage.name} · ${MILESTONE_STATUS[stage.status]}`} onClick={() => navigate({ page: "projects", projectId: context.id, milestoneId: stage.id })}>{stage.name}</OverviewHint> : <span>{task ? "未分组行动" : "暂无阶段"}</span>}
        </p><MotivationPicker compact /></div>
        <ActionCard overview task={task} onAdd={() => setEditor(data!.projects.some(p => p.status === "active") ? "task" : "project")} />
      </section>
      <section className="overview-records" aria-label="研究记录与恢复">
        <div className="overview-counts"><span title="近7天完成行动" aria-label={`近7天完成 ${done} 项行动`}><CheckCheck size={15}/><strong>{done}</strong><small>近7天</small></span><button className="text-button" title="查看成果卡" aria-label="查看成果卡" onClick={() => navigate("results")}><NotebookPen size={15}/><strong>{data!.results.length}</strong><small>成果卡</small></button></div>
        {!!paused.length && <div><span>继续上次</span><OverviewHint className="text-button overview-resume-name" hint={paused[0].name} onClick={() => setRestart(paused[0].id)}>{paused[0].name}</OverviewHint>
          <button className="icon" aria-label="找回研究思路" title="找回研究思路" onClick={() => setRestart(paused[0].id)}><RotateCcw aria-hidden="true" size={15} /></button>{paused.length > 1 && <button className="text-button" onClick={() => navigate({page:"projects",projectStatus:"paused"})}>{paused.length} 个暂停</button>}</div>}
      </section>
    </>}
    {editor === "project" && <ProjectEditor onClose={() => setEditor(null)} />}
    {editor === "task" && <TaskEditor projectId={context?.id} milestoneId={stage?.id} onClose={() => setEditor(null)} />}
    {editor === "idea" && <IdeaEditor onClose={() => setEditor(null)} />}
    {restart && data!.projects.some(p => p.id === restart) && <Restart project={data!.projects.find(p => p.id === restart)!} onClose={() => setRestart(null)} />}
  </>;
}
