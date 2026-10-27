import { useEffect, useMemo, useRef, useState } from "react";
import { Flag } from "lucide-react";
import { useData } from "../state";
import { useToday, validDate } from "../dates";
import { calendarMonth, calendarEntryTitle, projectTone, CalendarEntry } from "../calendar";

export function MonthCalendar({ month, selected, onSelect, onEntry }: {
  month: string; selected: string; onSelect: (date: string) => void;
  onEntry: (date: string, entry: CalendarEntry) => void;
}) {
  const { data } = useData(), today = useToday();
  const model = useMemo(() => calendarMonth(data!, month), [data, month]);
  const firstWeek = useRef<HTMLDivElement>(null);
  const [capacity, setCapacity] = useState(2);
  useEffect(() => {
    const element = firstWeek.current;
    if (!element) return;
    const observer = new ResizeObserver(([size]) => setCapacity(Math.max(1, Math.min(5, Math.floor((size.contentRect.height - 24) / 22)))));
    observer.observe(element);
    return () => observer.disconnect();
  }, [model.weeks.length]);
  const hasEntries = [...model.days].some(([day, entries]) => day.startsWith(month.slice(0,7)) && entries.length);
  return <div className="plan-calendar">
    <div className="calendar-scroll" tabIndex={0} aria-label="月份日期网格，空间不足时可滚动查看">
      <div className="calendar-table" style={{"--calendar-weeks":model.weeks.length} as React.CSSProperties}>
        <div className="calendar-weekdays">{["一","二","三","四","五","六","日"].map(d => <span key={d}>周{d}</span>)}</div>
        <div className="calendar-weeks">
          {model.weeks.map((week, index) => <div className="calendar-week" key={week[0]} ref={index === 0 ? firstWeek : undefined}>
            {week.map(day => {
              const entries = model.days.get(day)!, inside = day.startsWith(month.slice(0,7));
              const hidden = Math.max(0, entries.length - capacity);
              return <div key={day} data-date={day} className={`calendar-day ${inside ? "" : "outside"} ${day === today ? "today" : ""} ${selected === day ? "selected" : ""}`}>
                <div className="calendar-date-row">
                  <button type="button" className="calendar-date-button" aria-label={`${day}，${entries.length} 个项目安排`} aria-current={day === today ? "date" : undefined} aria-pressed={day === selected} disabled={!validDate(day)} onClick={() => onSelect(day)}>
                    <span className="calendar-number">{Number(day.slice(-2))}</span>{day === today && <span className="calendar-today-text">今天</span>}
                  </button>
                  {!!hidden && <button className="calendar-more" title={`查看 ${day} 全部 ${entries.length} 个项目`} aria-label={`${day} 还有 ${hidden} 个项目，查看全部安排`} onClick={() => onSelect(day)}>+{hidden} 项</button>}
                </div>
                <div className="calendar-tags">{entries.slice(0,capacity).map(entry => {
                  const target = entry.nodes.some(n => n.kind === "target"), stage = entry.nodes.some(n => n.kind === "stage");
                  const start = entry.nodes.some(n => n.kind === 'start');
                  return <button key={entry.project.id} type="button" data-project={entry.project.id} data-tone={projectTone(entry.project.id)}
                    className="calendar-tag" title={calendarEntryTitle(entry)}
                    aria-label={`${day} · ${entry.project.name}${entry.stageNames.length ? ` · ${entry.stageNames.join(' / ')}` : ''}${target ? " · 项目目标" : stage ? " · 阶段节点" : ""}，查看安排`}
                    onClick={() => onEntry(day,entry)}>
                    {target ? <Flag size={11} aria-hidden="true" /> : stage ? <span aria-hidden="true">◇</span> : start ? <span aria-hidden="true">○</span> : null}
                    <span className="calendar-tag-name">{entry.project.name}{entry.stageNames.length ? ` · ${entry.stageNames.join(' / ')}` : ''}</span>
                    {entry.periods.filter(p => !p.projectDates).length > 1 && <small title="多个独立时段">×{entry.periods.filter(p => !p.projectDates).length}</small>}
                  </button>;
                })}</div>
                <button className="calendar-day-space" tabIndex={-1} aria-hidden="true" disabled={!validDate(day)} onClick={() => onSelect(day)} />
              </div>;
            })}
          </div>)}
        </div>
      </div>
    </div>
    <div className="calendar-legend"><span>{hasEntries ? "仅显示已安排时段与日期节点" : "本月暂无安排，可添加计划"}</span><span>○ 启动日</span><span>◇ 阶段</span><span><Flag size={11} />目标日</span><span className="calendar-legend-hint">点击日期安排研究</span></div>
  </div>;
}
