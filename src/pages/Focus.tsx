import { useMemo, useState } from 'react';
import { ArrowUpRight, Plus } from 'lucide-react';
import { useData } from '../state';
import { focusedProject, currentMilestone, focusProjectOptions } from '../planning';
import { ActionCard } from '../components/ActionCard';
import { dueLabel, useToday } from '../dates';
import { TaskEditor, ProjectEditor } from '../components/Editors';
import { projectPath } from '../projectRelations';
export function Focus({ navigate }: { navigate: (page: string) => void }) {
  const { data, mutate } = useData();
  const [editor, setEditor] = useState<'task' | 'project' | null>(null);
  const today = useToday(), project = focusedProject(data!,today);
  const projectOptions = focusProjectOptions(data!,today);
  const stage = project ? currentMilestone(data!, project.id) : undefined;
  const task = useMemo(() => {
    const running = data!.tasks.find(t => t.id === data!.timer?.taskId);
    if (running) return running;
    if (!project) return undefined;
    const candidates = data!.tasks.filter(t => t.status !== 'done' && t.projectId === project.id && (!t.deferredUntil || Date.parse(t.deferredUntil) <= Date.now()));
    return candidates.find(t => t.milestoneId === stage?.id) || candidates[0];
  }, [data, project?.id, stage?.id]);
  const activeProject = data!.projects.find(p => p.id === task?.projectId);
  const stageTasks = stage ? data!.tasks.filter(t => t.milestoneId === stage.id) : [];
  return <>
    <div className="page-heading focus-heading">
      <h1>行动视角</h1>
      <button onClick={() => navigate('plan')}><ArrowUpRight size={15}/>查看计划</button>
    </div>
    {project ? <>
      <section className="focus-project-panel">
        <div className="section-heading">
          <label htmlFor="focus-project">当前科研重点</label>
          <select id="focus-project" value={project.id} onChange={e => {
            const id = e.currentTarget.value;
            void mutate(d => { d.settings.focusProjectId = id; });
          }}>
            {projectOptions.map(p => <option key={p.id} value={p.id}>{projectPath(data!, p)}</option>)}
          </select>
        </div>
        <h2>{projectPath(data!, project)}</h2>
        <div className="focus-project-meta">
          <span className={`track-label ${project.track}`}>{project.track === 'explore' ? '问题探索' : '成果产出'}</span>
          {project.targetDate && <span>{dueLabel(project.targetDate, today)}</span>}
        </div>
        {stage && <div className="focus-current-stage">
          <span>当前阶段</span><strong>{stage.name}</strong>
          <small title="已完成行动 / 全部行动">{stageTasks.filter(t => t.status === 'done').length} / {stageTasks.length}</small>
          <button className="text-button" aria-label="查看项目路线图" onClick={() => navigate(`projects:${project.id}`)}>项目路线图<ArrowUpRight size={13}/></button>
        </div>}
        {!stage && <button className="text-button focus-roadmap-link" aria-label="查看项目路线图" onClick={() => navigate(`projects:${project.id}`)}>项目路线图<ArrowUpRight size={13}/></button>}
      </section>
      <section className="today">
        {activeProject && activeProject.id !== project.id && <p className="focus-session-context">正在专注：{projectPath(data!, activeProject)}</p>}
        <ActionCard task={task} hideContext={task?.projectId === project.id} onAdd={() => setEditor('task')}/>
      </section>
    </> : <div className="planning-empty">暂无进行中的项目<button className="primary" onClick={() => setEditor('project')}><Plus size={15}/>新建项目</button></div>}
    {editor === 'project' && <ProjectEditor onClose={() => setEditor(null)}/>}
    {editor === 'task' && project && <TaskEditor projectId={project.id} milestoneId={stage?.id} onClose={() => setEditor(null)}/>}
  </>;
}
