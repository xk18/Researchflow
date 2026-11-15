import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useData } from '../state';
import { useToday } from '../dates';
import { cycleFocusProject, focusedProject, focusProjectOptions } from '../planning';
import { projectPath } from '../projectRelations';
import { AppData, Project, STATUS } from '../types';

export function FocusProjectOptions({ data, projects }: { data: AppData; projects: Project[] }) {
  return <>{projects.map(p => <option key={p.id} value={p.id}>
    {projectPath(data,p)}{p.status !== 'active' ? ` · ${STATUS[p.status]}` : ''}
  </option>)}</>;
}

export function ProjectSwitcher() {
  const { data, mutate, busy } = useData();
  const today = useToday();
  const options = focusProjectOptions(data!,today), selected = focusedProject(data!,today);
  if (!options.length) return null;
  function cycle(direction: -1 | 1) {
    void mutate(d => {
      const project = cycleFocusProject(d,direction,today);
      if (project) d.settings.focusProjectId = project.id;
    });
  }
  return <div className="widget-project-switcher project-switcher">
    <button className="icon" disabled={busy || options.length < 2} aria-label="上一个科研项目" title="上一个项目" onClick={() => cycle(-1)}><ChevronLeft size={16}/></button>
    <select className="widget-focus-select" aria-label="切换当前科研项目" title={selected ? projectPath(data!,selected) : undefined} value={selected?.id || ''} disabled={busy} onChange={e => {
      const id = e.currentTarget.value;
      void mutate(d => {
        if (!d.projects.some(p => p.id === id)) throw Error('项目已不存在，请重新选择。');
        d.settings.focusProjectId = id;
      });
    }}><FocusProjectOptions data={data!} projects={options}/></select>
    <button className="icon" disabled={busy || options.length < 2} aria-label="下一个科研项目" title="下一个项目" onClick={() => cycle(1)}><ChevronRight size={16}/></button>
  </div>;
}

export function InactiveProjectNotice({ project, onOpen }: { project: Project; onOpen: () => void }) {
  return <section className="action-card inactive-project-notice">
    <h2>{STATUS[project.status]}</h2>
    <p>恢复为进行中后可专注</p>
    <button onClick={onOpen}>打开项目</button>
  </section>;
}
