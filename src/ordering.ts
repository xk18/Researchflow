import { AppData, Task } from './types';
import { orderedMilestones } from './planning';

export function orderedTasks(d: AppData, projectId: string, milestoneId?: string): Task[] {
  const list = d.tasks.filter(t => t.projectId === projectId && t.milestoneId === milestoneId);
  const index = new Map(list.map((t,i) => [t.id,i]));
  return list.sort((a,b) => (a.order ?? index.get(a.id)!) - (b.order ?? index.get(b.id)!));
}
export function nextTaskOrder(d: AppData, projectId: string, milestoneId?: string) {
  const list = d.tasks.filter(t => t.projectId === projectId && t.milestoneId === milestoneId);
  return Math.max(-1,...list.map((t,i) => t.order ?? i)) + 1;
}
function reorder<T extends {id: string; order?: number; updatedAt: string}>(list: T[], from: string, to: string) {
  const a = list.findIndex(x => x.id === from), b = list.findIndex(x => x.id === to);
  if (a < 0 || b < 0 || a === b) return;
  list.splice(b, 0, list.splice(a, 1)[0]);
  const now = new Date().toISOString();
  list.forEach((x,i) => { x.order = i; x.updatedAt = now; });
}
export function reorderTasks(d: AppData, from: string, to: string) {
  const t = d.tasks.find(x => x.id === from);
  if (!t) return;
  reorder(orderedTasks(d,t.projectId,t.milestoneId),from,to);
}
export function moveTask(d: AppData, id: string, direction: -1 | 1) {
  const t = d.tasks.find(x => x.id === id);
  if (!t) return;
  const list = orderedTasks(d,t.projectId,t.milestoneId), target = list[list.findIndex(x => x.id === id) + direction];
  if (target) reorderTasks(d,id,target.id);
}
export function reorderMilestones(d: AppData, from: string, to: string) {
  const m = d.milestones.find(x => x.id === from);
  if (m) reorder(orderedMilestones(d,m.projectId),from,to);
}
