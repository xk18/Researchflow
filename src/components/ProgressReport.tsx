import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Copy, Download } from 'lucide-react';
import { Modal } from './Common';
import { useData } from '../state';
import { addDays } from '../dates';
import { WeekRange, buildWeeklyReport, weekRange, weeklyAiPrompt, weeklyProjectIds, weeklyMarkdown } from '../progressReport';
import { desktop, download, native } from '../services/native';

export function ProgressReport({ onClose }: { onClose: () => void }) {
  const { data, notify } = useData();
  const [weekOffset,setWeekOffset] = useState(0);
  const week = useMemo<WeekRange>(() => {
    const current = weekRange(); const start = addDays(current.start,weekOffset * 7);
    return { start, end: addDays(start,6) };
  },[weekOffset]);
  const [selected,setSelected] = useState<Set<string>>(() => weeklyProjectIds(data!,weekRange()));
  const [view,setView] = useState<'summary'|'prompt'>('summary');
  const [ack,setAck] = useState(false);
  useEffect(() => setSelected(weeklyProjectIds(data!,week)),[data,week]);
  const reports = useMemo(() => buildWeeklyReport(data!,[...selected],week),[data,selected,week]);
  const content = view === 'summary' ? weeklyMarkdown(reports,week) : weeklyAiPrompt(reports,week);
  const titleDate = `${week.start} — ${week.end}`;
  return <Modal title="导出科研进度" onClose={onClose} wide trackChanges={false} className="report-modal">
    <div className="report-week">
      <button className="icon" aria-label="上一周" onClick={() => setWeekOffset(x => x - 1)}><ChevronLeft size={17}/></button>
      <strong>{titleDate}{weekOffset === 0 ? ' · 本周' : ''}</strong>
      <button className="icon" aria-label="下一周" disabled={weekOffset >= 0} onClick={() => setWeekOffset(x => Math.min(0,x + 1))}><ChevronRight size={17}/></button>
    </div>
    <div className="report-layout">
      <section className="report-projects" aria-label="选择项目">
        <div><strong>纳入周报的项目</strong><small>默认勾选所选周有记录或计划时段的项目</small></div>
        {data!.projects.length ? data!.projects.map(project => <label key={project.id} className="report-project-choice">
          <input type="checkbox" checked={selected.has(project.id)} onChange={e => { const checked = e.currentTarget.checked; setSelected(prev => {
            const next = new Set(prev); if (checked) next.add(project.id); else next.delete(project.id); return next;
          }); }}/>
          <span>{project.name}<small>{project.mainProjectId ? '子项目' : '主项目'}{project.demo ? ' · 演示项目' : ''}</small></span>
        </label>) : <p className="muted">还没有科研项目。</p>}
      </section>
      <section className="report-preview">
        <div className="report-tabs" role="tablist" aria-label="周报内容">
          <button role="tab" aria-selected={view === 'summary'} className={view === 'summary' ? 'selected' : ''} onClick={() => setView('summary')}>Markdown 周报</button>
          <button role="tab" aria-selected={view === 'prompt'} className={view === 'prompt' ? 'selected' : ''} onClick={() => setView('prompt')}>AI 总结提示词</button>
        </div>
        <textarea aria-label="周报预览" readOnly value={content} />
      </section>
    </div>
    <div className="report-privacy">
      <strong>分享前检查隐私</strong>
      <span>内容只基于本机记录生成。复制到外部 AI 或其他平台前，请确认所选平台符合你的数据管理要求；不要粘贴未经脱敏的敏感信息。</span>
      <label><input type="checkbox" checked={ack} onChange={e => setAck(e.currentTarget.checked)}/>我已了解，确认继续复制或导出</label>
    </div>
    <footer>
      <button onClick={onClose}>关闭</button>
      <button disabled={!ack || !reports.length} onClick={async () => {
        try { const text = weeklyAiPrompt(reports,week); if (native) await desktop('copy_text',{text}); else await navigator.clipboard.writeText(text); notify('AI 总结提示词已复制'); }
        catch { notify('复制失败，请检查剪贴板权限后重试'); }
      }}><Copy size={14}/>复制 AI 提示词</button>
      <button className="primary" disabled={!ack || !reports.length} onClick={async () => {
        try { if (await download(`科研进度周报-${week.start}.md`,weeklyMarkdown(reports,week))) notify('科研进度周报已导出'); }
        catch { notify('导出失败，请重试'); }
      }}><Download size={14}/>导出 Markdown</button>
    </footer>
  </Modal>;
}
