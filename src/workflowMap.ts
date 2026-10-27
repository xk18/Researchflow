import { AppData, Project, Task, Milestone } from './types';
import { orderedMilestones } from './planning';
import { nextTaskOrder, orderedTasks } from './ordering';

export interface WorkflowBranch { id: string; milestone?: Milestone; tasks: Task[]; depth?: number }
/** Projection of real records; layout never duplicates planning data. */
export function workflowBranches(data: AppData, project: Project): WorkflowBranch[] {
  const stages = orderedMilestones(data, project.id), branches: WorkflowBranch[] = [];
  const visited = new Set<string>();
  function visit(parent: string | undefined, depth: number) {
    for (const milestone of stages.filter(m => m.parentMilestoneId === parent)) {
      if (visited.has(milestone.id)) continue;
      visited.add(milestone.id);
      branches.push({ id: milestone.id, milestone, depth, tasks: orderedTasks(data, project.id, milestone.id) });
      visit(milestone.id, depth + 1);
    }
  }
  visit(undefined, 0);
  const ungrouped = orderedTasks(data, project.id, undefined);
  if (ungrouped.length) branches.push({ id: 'ungrouped', depth: 0, tasks: ungrouped });
  return branches;
}
export function workflowLayout(branches: WorkflowBranch[], expanded: Set<string>) {
  let y = 28;
  const visible = new Set<string>();
  const rows = branches.filter(b => {
    const owner = b.milestone?.parentMilestoneId;
    if (owner && (!visible.has(owner) || !expanded.has(owner))) return false;
    visible.add(b.id); return true;
  }).map(branch => {
    const height = Math.max(72, expanded.has(branch.id) ? branch.tasks.length * 56 : 0);
    const left = 270 + (branch.depth || 0) * 290;
    const row = { branch, y, center: y + height / 2, height, left };
    y += height + 24;
    return row;
  });
  return { rows, width: Math.max(850, ...rows.map(r => r.left + (expanded.has(r.branch.id) && r.branch.tasks.length ? 590 : 260))), height: Math.max(280, y + 4) };
}
export function canNestStage(data: AppData, id: string, owner?: string): boolean {
  const stage = data.milestones.find(m => m.id === id);
  if (!stage) return false;
  const seen = new Set([id]);
  while (owner !== undefined) {
    if (seen.has(owner)) return false;
    seen.add(owner);
    const next = data.milestones.find(m => m.id === owner && m.projectId === stage.projectId);
    if (!next) return false;
    owner = next.parentMilestoneId;
  }
  return true;
}
export function nestStage(data: AppData, id: string, owner?: string) {
  if (!canNestStage(data, id, owner)) throw Error('不能建立此层级：请选择同项目内的其他阶段，且不能形成循环。');
  const stage = data.milestones.find(m => m.id === id)!;
  if (stage.parentMilestoneId === owner) return;
  stage.parentMilestoneId = owner;
  stage.order = Math.max(-1, ...data.milestones.filter(m => m.projectId === stage.projectId).map(m => m.order)) + 1;
  stage.updatedAt = new Date().toISOString();
}
export function assignWorkflowTask(data: AppData, id: string, owner?: string) {
  const task = data.tasks.find(t => t.id === id);
  if (!task || (owner !== undefined && !data.milestones.some(m => m.id === owner && m.projectId === task.projectId)))
    throw Error('请选择同项目内的阶段。');
  if (task.milestoneId === owner) return;
  task.order = nextTaskOrder(data, task.projectId, owner);
  task.milestoneId = owner;
  task.updatedAt = new Date().toISOString();
}
export function moveWorkflowStage(data: AppData, id: string, direction: -1 | 1) {
  const stage = data.milestones.find(m => m.id === id);
  if (!stage) throw Error('阶段已不存在');
  const siblings = orderedMilestones(data, stage.projectId).filter(m => m.parentMilestoneId === stage.parentMilestoneId);
  const index = siblings.findIndex(m => m.id === id), other = siblings[index + direction];
  if (!other) return;
  // Normalize once so legacy equal orders still have an unambiguous result.
  const now = new Date().toISOString();
  orderedMilestones(data, stage.projectId).forEach((m,i) => {if(m.order !== i){m.order=i;m.updatedAt=now;}});
  [stage.order,other.order] = [other.order,stage.order];
  stage.updatedAt = other.updatedAt = now;
}
