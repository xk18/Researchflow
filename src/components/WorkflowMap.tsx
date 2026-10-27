import { useEffect, useMemo, useRef, useState, DragEvent } from 'react';
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronRight, Expand, List, Minus, Pencil, Plus, Trash2, Unlink, X } from 'lucide-react';
import { Milestone, Project, Task } from '../types';
import { useData } from '../state';
import { Confirm, Modal } from './Common';
import { assignWorkflowTask, canNestStage, moveWorkflowStage, nestStage, workflowBranches, workflowLayout } from '../workflowMap';
import { completeTask, focusClock } from '../focus';
import { deleteMilestone, MILESTONE_STATUS } from '../planning';
import { moveTask } from '../ordering';
import { projectPath } from '../projectRelations';
import { MilestoneEditor } from './Roadmap';
import { TaskEditor } from './Editors';

export function WorkflowMap({ project, onClose, onStage, onTask }: {
  project: Project; onClose: () => void; onStage: (id: string) => void; onTask: (task: Task) => void;
}) {
  const { data, mutate, busy, notify, error } = useData();
  const branches = useMemo(() => workflowBranches(data!, project), [data, project]);
  const [expanded, setExpanded] = useState(() => {
    const opened = new Set<string>();
    for (const b of branches.filter(b => b.milestone?.status === 'doing' || !b.milestone)) {
      let id: string | undefined = b.id;
      while (id) {opened.add(id);id = data!.milestones.find(m => m.id === id)?.parentMilestoneId;}
    }
    return opened;
  });
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState<{ kind: 'stage' | 'task'; id: string }>();
  const [editor, setEditor] = useState<{ kind: 'stage'; stage?: Milestone; owner?: string } | { kind: 'task'; task?: Task; owner?: string }>();
  const [removing, setRemoving] = useState<Milestone>();
  const [dragging, setDragging] = useState<{kind: 'stage' | 'task'; id: string}>();
  const [dropTarget, setDropTarget] = useState<string>();
  const viewport = useRef<HTMLDivElement>(null);
  const selectionTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(selectionTimer.current), []);
  // Wait for the double-click before opening an inspector that changes canvas width.
  function selectNode(kind: 'stage' | 'task', id: string) {
    clearTimeout(selectionTimer.current);
    selectionTimer.current = setTimeout(() => setSelected({kind,id}), 240);
  }
  function editNode(value: NonNullable<typeof editor>) {
    clearTimeout(selectionTimer.current); setEditor(value);
  }
  const layout = workflowLayout(branches, expanded);
  const stage = selected?.kind === 'stage' ? data!.milestones.find(m => m.id === selected.id) : undefined;
  const task = selected?.kind === 'task' ? data!.tasks.find(t => t.id === selected.id) : undefined;
  function toggle(id: string) { setExpanded(s => { const next = new Set(s); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  function reveal(owner?: string) { setExpanded(s => { const next = new Set(s); while (owner) { next.add(owner); owner = data!.milestones.find(m => m.id === owner)?.parentMilestoneId; } return next; }); }
  function fit() {
    const el = viewport.current; if (!el) return;
    setZoom(Math.max(0.4, Math.min(1, (el.clientWidth - 24) / layout.width)));
    el.scrollTo({ left: 0, top: 0 });
  }
  async function relocate(kind: 'stage' | 'task', id: string, owner?: string) {
    if (await mutate(d => { if (kind === 'stage') nestStage(d, id, owner); else assignWorkflowTask(d, id, owner); })) {
      reveal(owner); notify('层级已保存');
    }
  }
  function accept(e: DragEvent, owner?: string) {
    if (!dragging || busy || (dragging.kind === 'stage' && !canNestStage(data!, dragging.id, owner))) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropTarget(owner || 'root');
  }
  function drop(e: DragEvent, owner?: string) {
    e.preventDefault(); e.stopPropagation();
    if (dragging) void relocate(dragging.kind, dragging.id, owner);
    setDragging(undefined); setDropTarget(undefined);
  }
  function drag(e: DragEvent, kind: 'stage' | 'task', id: string) {
    e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed = 'move'; setDragging({kind,id});
  }
  const rootCenter = 82;
  return <Modal title="项目流程图" wide className="workflow-modal" trackChanges={false} onClose={onClose}>
    <div className="workflow-toolbar"><span title={projectPath(data!, project)}>{projectPath(data!, project)}</span><div className="row">
      <button aria-label="新建阶段" title="新建阶段" onClick={() => setEditor({kind:'stage'})}><Plus size={15}/>阶段</button>
      <button className="icon" aria-label="新建未分组行动" title="新建行动" onClick={() => setEditor({kind:'task'})}><Plus size={15}/></button>
      <button className="icon" aria-label="收起所有行动" title="收起" onClick={() => setExpanded(new Set())}><ChevronRight size={16}/></button>
      <button className="icon" aria-label="展开所有行动" title="展开" onClick={() => setExpanded(new Set(branches.map(b => b.id)))}><ChevronDown size={16}/></button>
      <button className="icon" aria-label="缩小流程图" title="缩小" disabled={zoom <= 0.4} onClick={() => setZoom(z => Math.max(0.4, z - 0.1))}><Minus size={15}/></button>
      <button className="text-button workflow-zoom" aria-label="重置流程图缩放" title="100%" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
      <button className="icon" aria-label="放大流程图" title="放大" disabled={zoom >= 1.5} onClick={() => setZoom(z => Math.min(1.5, z + 0.1))}><Plus size={15}/></button>
      <button className="icon" aria-label="适应流程图窗口" title="适应宽度" onClick={fit}><Expand size={15}/></button>
    </div></div>
    {error && <p className="inline-error workflow-error" role="alert">{error}</p>}
    <div className="workflow-workspace">
      <div className="workflow-viewport" ref={viewport} tabIndex={0} role="region" aria-label="项目阶段与行动流程图，可滚动查看">
        <div style={{ width: layout.width * zoom, height: layout.height * zoom }}><div className="workflow-canvas" style={{ width: layout.width, height: layout.height, transform: `scale(${zoom})` }}>
          <svg className="workflow-lines" width={layout.width} height={layout.height} aria-hidden="true">
            {layout.rows.map(({ branch, y, center, left }) => {
              const parent = layout.rows.find(r => r.branch.id === branch.milestone?.parentMilestoneId);
              const sx = parent ? parent.left + 230 : 210, sy = parent?.center || rootCenter;
              return <g key={branch.id}><path d={`M ${sx} ${sy} H ${left-24} V ${center} H ${left}`}/>{expanded.has(branch.id) && branch.tasks.map((t, i) => <path key={t.id} d={`M ${left+230} ${center} H ${left+260} V ${y+i*56+24} H ${left+290}`}/>)}</g>;
            })}
          </svg>
          <button className={`workflow-root ${dropTarget === 'root' ? 'drop-target' : ''}`} style={{ left: 24, top: rootCenter - 44 }} title="新建阶段；拖入节点可移至项目直属层级" onClick={() => setEditor({kind:'stage'})} onDragOver={e => accept(e)} onDrop={e => drop(e)}>
            <strong>{project.name}</strong><small>{branches.filter(b => b.milestone).length} 阶段 · {data!.tasks.filter(t => t.projectId === project.id).length} 行动 <Plus size={12}/></small>
          </button>
          {layout.rows.map(({ branch, y, center, left }) => <div key={branch.id}>
            <div className={`workflow-stage ${branch.milestone?.status || 'todo'} ${selected?.id === branch.id ? 'node-selected' : ''} ${dropTarget === branch.id ? 'drop-target' : ''}`} style={{ left, top: center - 36 }}
              onDragOver={e => accept(e, branch.milestone?.id)} onDrop={e => drop(e, branch.milestone?.id)}>
              <button className="workflow-stage-name" draggable={!!branch.milestone && !busy} onDragStart={e => drag(e,'stage',branch.id)} onDragEnd={() => {setDragging(undefined);setDropTarget(undefined);}} title={branch.milestone?.name || '未分组行动'} onClick={() => branch.milestone ? selectNode('stage',branch.id) : toggle(branch.id)} onDoubleClick={() => branch.milestone && editNode({kind:'stage',stage:branch.milestone})}>
                <strong>{branch.milestone?.name || '未分组行动'}</strong><small>{branch.milestone ? MILESTONE_STATUS[branch.milestone.status] : ''} · {branch.tasks.filter(t => t.status === 'done').length}/{branch.tasks.length}</small>
              </button>
              <button className="icon" aria-label={`${expanded.has(branch.id) ? '收起' : '展开'} ${branch.milestone?.name || '未分组行动'} 的行动`} aria-expanded={expanded.has(branch.id)} onClick={() => toggle(branch.id)}>{expanded.has(branch.id) ? <ChevronDown size={15}/> : <ChevronRight size={15}/>}</button>
            </div>
            {expanded.has(branch.id) && branch.tasks.map((t, i) => <button key={t.id} draggable={!busy} onDragStart={e => drag(e,'task',t.id)} onDragEnd={() => {setDragging(undefined);setDropTarget(undefined);}} className={`workflow-task ${t.status} ${selected?.id === t.id ? 'node-selected' : ''}`} style={{ left:left+290, top:y+i*56 }} title={[t.name, t.note].filter(Boolean).join(' · ')} onClick={() => selectNode('task',t.id)} onDoubleClick={() => editNode({kind:'task',task:t})}>
              <span className="workflow-task-state" aria-label={t.status === 'done' ? '已完成' : '未完成'}>{t.status === 'done' ? <Check size={12}/> : null}</span><span>{t.name}</span>
            </button>)}
          </div>)}
        </div></div>
      </div>
      {(stage || task) && <aside className="workflow-inspector" aria-label="节点操作">
        <div className="section-heading"><strong>{stage ? '阶段' : '行动'}</strong><button className="icon" aria-label="取消节点选择" onClick={() => setSelected(undefined)}><X size={14}/></button></div>
        <h3>{(stage || task)!.name}</h3>
        <div className="row">
          <button className="icon" aria-label="编辑节点" title="编辑" onClick={() => setEditor(stage ? {kind:'stage',stage} : {kind:'task',task})}><Pencil size={15}/></button>
          <button className="icon" aria-label="在列表中打开" title="在列表中打开" onClick={() => stage ? onStage(stage.id) : onTask(task!)}><List size={15}/></button>
          {stage && <button className="icon danger" aria-label="删除阶段" title="删除阶段" onClick={() => setRemoving(stage)}><Trash2 size={15}/></button>}
          <button className="icon" aria-label="上移节点" title="上移" disabled={busy} onClick={() => void mutate(d => stage ? moveWorkflowStage(d,stage.id,-1) : moveTask(d,task!.id,-1))}><ArrowUp size={15}/></button>
          <button className="icon" aria-label="下移节点" title="下移" disabled={busy} onClick={() => void mutate(d => stage ? moveWorkflowStage(d,stage.id,1) : moveTask(d,task!.id,1))}><ArrowDown size={15}/></button>
        </div>
        <label className="workflow-owner">{stage ? '上级阶段' : '所属阶段'}<select aria-label="调整节点层级" value={stage ? stage.parentMilestoneId || '' : task?.milestoneId || ''} disabled={busy} onChange={e => {const owner=e.currentTarget.value || undefined; void relocate(stage ? 'stage' : 'task',(stage || task)!.id,owner);}}>
          <option value="">{stage ? '项目直属阶段' : '未分组行动'}</option>
          {branches.filter(b => b.milestone && (!stage || canNestStage(data!,stage.id,b.id))).map(b => <option key={b.id} value={b.id}>{'　'.repeat(b.depth || 0)}{b.milestone!.name}</option>)}
        </select></label>
        {stage && <label className="workflow-owner">状态<select aria-label="阶段状态" value={stage.status} disabled={busy} onChange={e => {const value=e.currentTarget.value as Milestone['status'];void mutate(d => {const m=d.milestones.find(m => m.id===stage.id)!;m.status=value;m.updatedAt=new Date().toISOString();});}}>{Object.entries(MILESTONE_STATUS).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
        {task && <button className="text-button" disabled={busy} onClick={async () => { const clock=await focusClock();void mutate(d => {const current=d.tasks.find(t=>t.id===task.id);if(!current)throw Error('行动已不存在');if(current.status==='done'){const t=current;t.status='todo';delete t.completedAt;delete t.completedTrack;t.updatedAt=new Date().toISOString();}else completeTask(d,task.id,clock);}); }}><Check size={14}/>{task.status==='done' ? '重新打开行动' : '完成行动'}</button>}
        {(stage?.parentMilestoneId || task?.milestoneId) && <button className="text-button" disabled={busy} onClick={() => void relocate(stage ? 'stage' : 'task',(stage || task)!.id)}><Unlink size={13}/>移至项目下</button>}
        {stage && <div className="workflow-create"><button onClick={() => {reveal(stage.id);setEditor({kind:'stage',owner:stage.id});}}><Plus size={14}/>子阶段</button><button onClick={() => {reveal(stage.id);setEditor({kind:'task',owner:stage.id});}}><Plus size={14}/>行动</button></div>}
      </aside>}
    </div>
    <div className="workflow-caption">拖至阶段调整层级 · 双击编辑</div>
    {editor?.kind === 'stage' && <MilestoneEditor project={project} milestone={editor.stage} initialParentId={editor.owner} onClose={() => {setExpanded(new Set([...expanded,...data!.milestones.map(m => m.id)]));setEditor(undefined);}}/>}
    {editor?.kind === 'task' && <TaskEditor projectId={project.id} milestoneId={editor.owner} task={editor.task} onClose={() => {reveal(editor.owner || editor.task?.milestoneId);if(!editor.owner && !editor.task?.milestoneId)setExpanded(s => new Set([...s,"ungrouped"]));setEditor(undefined);}}/>}
    {removing && <Confirm title="删除这个阶段？" detail="阶段内的行动将移至未分组列表；子阶段提升一级，专注与研究记录保留。" onClose={() => setRemoving(undefined)} onConfirm={async () => {if (await mutate(d => deleteMilestone(d,removing.id))) {setRemoving(undefined);setSelected(undefined);notify('阶段已删除');}}}/>}
  </Modal>;
}
