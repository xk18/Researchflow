import { AppData, Project } from './types';

export function projectPath(d: AppData, p: Project): string {
  const main = d.projects.find(x => x.id === p.mainProjectId);
  return main ? `${main.name} / ${p.name}` : p.name;
}
export function setMainProject(d: AppData, p: Project, id?: string) {
  if (id && (id === p.id || !d.projects.some(x => x.id === id && !x.mainProjectId) || d.projects.some(x => x.mainProjectId === p.id)))
    throw Error('仅支持一级主项目与子项目关系，请先调整关联。');
  if (id) p.mainProjectId = id; else delete p.mainProjectId;
}
export function releaseChildren(d: AppData, ids: Set<string>) {
  for (const p of d.projects) if (p.mainProjectId && ids.has(p.mainProjectId)) {
    delete p.mainProjectId; p.updatedAt = new Date().toISOString();
  }
}
/** Filtered children remain searchable even when their main project is hidden. */
export function groupProjects(projects: Project[]) {
  const ids = new Set(projects.map(p => p.id));
  return projects.filter(p => !p.mainProjectId || !ids.has(p.mainProjectId))
    .flatMap(p => [p, ...projects.filter(c => c.mainProjectId === p.id)]);
}
