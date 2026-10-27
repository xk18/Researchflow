import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, ChevronDown, ChevronUp, CircleHelp, Flag, Pause, Star } from "lucide-react";
import { useData } from "../state";
import { addDays, dayNumber } from "../dates";
import { groupTimelineNodes, previewTimeline, recentTimeline, TimelineNode } from "../overviewTimeline";
import { Navigate } from "../navigation";
import { TRACK } from "../types";
import { MILESTONE_STATUS } from "../planning";
import { readTimelineCollapsed, writeTimelineCollapsed } from "../services/uiPreferences";
import { Modal } from "./Common";
import { OverviewHint } from "./OverviewHint";

export function OverviewTimeline({ today, navigate }: { today: string; navigate: Navigate }) {
  const { data, notify } = useData();
  const model = useMemo(() => recentTimeline(data!, today), [data, today]);
  const [collapsed, setCollapsed] = useState(false), [ready, setReady] = useState(false), [saving, setSaving] = useState(false);
  const [chooser, setChooser] = useState<{ projectId: string; nodes: TimelineNode[] }>();
  const [periodsProject, setPeriodsProject] = useState<string>(), [legend, setLegend] = useState(false);
  const [shortWindow, setShortWindow] = useState(() => matchMedia("(max-height: 600px)").matches), [width, setWidth] = useState(360);
  const axis = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => previewTimeline(model, data!, today, shortWindow ? 2 : 3), [model, data, today, shortWindow]);
  const detail = model.rows.find(r => r.project.id === periodsProject);
  useEffect(() => {
    const query = matchMedia("(max-height: 600px)"), update = () => setShortWindow(query.matches);
    query.addEventListener("change", update); return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    let live = true;
    void readTimelineCollapsed().then(value => { if (live) setCollapsed(value); }).catch(() => {
      if (live) notify("时间轴显示偏好读取失败，已暂时展开。可重新选择收起或展开。");
    }).finally(() => { if (live) setReady(true); });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (!axis.current) return;
    const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
    observer.observe(axis.current); return () => observer.disconnect();
  }, [collapsed, model.rows.length]);
  async function toggle() {
    const next = !collapsed; setSaving(true);
    try { await writeTimelineCollapsed(next); setCollapsed(next); }
    catch (e) { notify(`显示偏好未保存：${String(e)}`); }
    finally { setSaving(false); }
  }
  function openNode(projectId: string, node: TimelineNode) {
    setChooser(undefined); navigate({ page: "projects", projectId, milestoneId: node.milestoneId });
  }
  const plan = (date = model.start) => navigate({ page: "plan", planningDate: date, planningView: "timeline" });
  const at = (date: string) => (dayNumber(date) - dayNumber(model.start)) / model.days * 100;
  const ticks = Array.from({ length: 5 }, (_, i) => addDays(model.start, i * 7));
  const monthBoundaries = Array.from({ length: model.days }, (_, i) => addDays(model.start, i)).filter(d => d.endsWith("-01"));
  const short = (date: string) => `${Number(date.slice(5,7))}/${Number(date.slice(8))}`;
  return <section className={`overview-timeline ${collapsed ? "is-collapsed" : ""}`} aria-label="近期科研时间轴">
    <div className="recent-heading"><div><h3>近期安排</h3><small>{collapsed ? `${model.rows.length} 个项目` : `${short(model.start)}–${short(model.end)}`}</small></div>
      <div className="row"><button className="icon" aria-label="完整规划" title="完整规划" onClick={() => plan()}><ArrowUpRight aria-hidden="true" size={15} /></button>
        <button className="icon" aria-label={collapsed ? "展开近期时间轴" : "收起近期时间轴"} aria-expanded={!collapsed} aria-controls="recent-lanes" disabled={!ready || saving} onClick={() => void toggle()}>{collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}</button></div></div>
    {!collapsed && <div id="recent-lanes">
      {rows.length ? <>
        <div className="recent-scale-row"><span>项目</span><div className="recent-scale" ref={axis}>
          {ticks.map(date => <span key={date} style={{ left: `${at(date)}%` }}>{short(date)}</span>)}
          <b className="recent-today-label" style={{ left: `${at(today)+50/model.days}%` }}>今天</b>
        </div></div>
        <div className="recent-rows" aria-label={`预览 ${rows.length} 个项目，共 ${model.rows.length} 个近期项目`}>
          {rows.map(row => {
            const hidden = row.lanes.filter(l => l.lane > 0).length;
            const named = row.lanes.filter(l => l.lane === 0 && l.length/model.days*width >= 72).sort((a,b) =>
              Number(b.item.startDate <= today && b.item.endDate >= today)-Number(a.item.startDate <= today && a.item.endDate >= today) || b.length-a.length || a.start-b.start)[0]?.item.id;
            return <div className={`recent-row ${row.project.track} ${row.project.status === "paused" ? "paused" : ""}`} key={row.project.id}>
              <div className="recent-project-cell"><OverviewHint className="recent-name" hint={row.project.name} onClick={() => navigate(`projects:${row.project.id}`)}><strong>{row.project.name}</strong></OverviewHint>
                <div className="recent-project-meta"><small title={`${TRACK[row.project.track]}${row.focused ? ' · 重点' : ''}${row.project.status === 'paused' ? ' · 已暂停' : ''}`} aria-label={`${TRACK[row.project.track]}${row.focused ? ' · 重点' : ''}${row.project.status === 'paused' ? ' · 已暂停' : ''}`}>{row.focused && <Star size={11} aria-hidden="true"/>}{row.project.status === 'paused' && <Pause size={11} aria-hidden="true"/>}</small>
                  {!!hidden && <button className="text-button recent-extra" aria-label={`${row.project.name}，另 ${hidden} 段重叠安排`} onClick={() => setPeriodsProject(row.project.id)}>另 {hidden} 段</button>}</div>
              </div>
              <div className="recent-lane">
                {ticks.map(date => <i className="recent-guide" key={date} style={{ left: `${at(date)}%` }} />)}
                {monthBoundaries.map(date => <i className="recent-month" key={date} title={`${Number(date.slice(5,7))}月`} style={{ left: `${at(date)}%` }} />)}
                <i className="recent-today" style={{ left: `${at(today)+50/model.days}%` }} />
                {row.lanes.filter(l => l.lane === 0).map(({item, start, length}) => {
                  const name = item.projectDates ? "项目日期（未细分投入时段）" : item.name || "推进时段";
                  const hint = `${name}\n${item.startDate} 至 ${item.endDate}${item.startDate < model.start || item.endDate > model.end ? "（仅显示近期区间内部分）" : ""}`;
                  return <OverviewHint key={item.id} className={`recent-bar ${item.projectDates ? "project-dates" : ""}`} style={{ left: `${start/model.days*100}%`, width: `${length/model.days*100}%` }} hint={hint} aria-label={`${row.project.name} · ${name} · ${item.startDate} 至 ${item.endDate}`} onClick={() => navigate(`projects:${row.project.id}`)}>
                    <span>{item.startDate < model.start && "‹ "}{item.id === named && (item.projectDates ? "项目日期" : item.name || "推进时段")}{item.endDate > model.end && " ›"}</span>
                  </OverviewHint>;
                })}
                {groupTimelineNodes(row.nodes,model.start,model.days,width).map(group => {
                  const node = group.nodes[0], multiple = group.nodes.length > 1;
                  const hint = group.nodes.map(n => `${n.date} ${n.name}${n.status ? ` · ${MILESTONE_STATUS[n.status]}` : ""}`).join("\n");
                  return <OverviewHint key={node.id} className={`recent-node ${multiple ? "node-group" : node.kind} ${node.status || ""}`} style={{ left: `${group.position*100}%` }} hint={hint}
                    aria-label={multiple ? `${row.project.name} · ${group.nodes.length} 个节点 · ${group.nodes[0].date} 至 ${group.nodes.at(-1)!.date}` : `${row.project.name} · ${node.date} ${node.name}${node.status ? ` · ${MILESTONE_STATUS[node.status]}` : ""}`}
                    onClick={() => multiple ? setChooser({projectId:row.project.id,nodes:group.nodes}) : openNode(row.project.id,node)}>
                    {multiple ? group.nodes.length : node.kind === "target" ? <Flag aria-hidden="true" size={12} /> : node.kind === "start" ? "○" : "◇"}
                  </OverviewHint>;
                })}
                {!row.lanes.length && !row.nodes.length && <button className="recent-range-only text-button" onClick={() => setPeriodsProject(row.project.id)}>查看阶段安排</button>}
              </div>
            </div>;
          })}
        </div>
        <div className="recent-summary"><span>{rows.length < model.rows.length ? `显示 ${rows.length} / ${model.rows.length} 个近期项目` : `${rows.length} 个项目`}</span><button className="icon" aria-label="图例" title="图例" onClick={() => setLegend(true)}><CircleHelp size={14}/></button></div>
      </> : <div className="recent-empty"><p>{model.empty === "inactive" ? "暂无项目" : model.empty === "undated" ? "尚未安排日期" : "近期暂无安排"}</p>
        {model.nextPlan ? <button className="text-button" onClick={() => plan(model.nextPlan!.date)}>下一项计划：{model.nextPlan.date} · {model.nextPlan.project.name}</button> : <button className="text-button" onClick={() => navigate("plan")}>安排研究时段</button>}
      </div>}
      {(model.unscheduled.length > 0 || model.overdue > 0) && <div className="recent-notes">
        {!!model.unscheduled.length && <button className="text-button" onClick={() => navigate(`projects:${model.unscheduled[0].id}`)}>{model.unscheduled.length} 项待安排</button>}
        {!!model.overdue && <button className="text-button" title="阶段计划日期已过，完成状态仍由实际记录决定" onClick={() => plan()}>{model.overdue} 阶段待跟进</button>}
      </div>}
    </div>}
    {chooser && <Modal title="阶段与项目日期" trackChanges={false} onClose={() => setChooser(undefined)}><p className="modal-note">相近节点在预览中聚合；各自的实际日期如下。</p>
      <div className="recent-node-list">{chooser.nodes.map(node => <button key={node.id} onClick={() => openNode(chooser.projectId,node)}><span>{node.date}</span><strong>{node.name}</strong>{node.status && <small>{MILESTONE_STATUS[node.status]}{node.status !== "done" && node.date < today ? " · 计划日期已过" : ""}</small>}</button>)}</div></Modal>}
    {detail && <Modal title="项目近期安排" trackChanges={false} onClose={() => setPeriodsProject(undefined)}><p className="modal-note">{detail.project.name}</p>
      <div className="recent-node-list">{detail.lanes.map(l => <button key={l.item.id} onClick={() => navigate(`projects:${detail.project.id}`)}><strong>{l.item.name || "推进时段"}</strong><span>{l.item.startDate} 至 {l.item.endDate}{l.lane > 0 ? " · 预览中折叠" : ""}</span>{l.item.note && <small>{l.item.note}</small>}</button>)}
        {detail.rangeOnly.map(m => <button key={m.id} onClick={() => navigate({page:"projects",projectId:detail.project.id,milestoneId:m.id})}><strong>{m.name}</strong><span>{m.startDate} 至 {m.endDate} · 节点在预览区间之外</span></button>)}</div>
      <button onClick={() => plan()}>打开完整规划</button></Modal>}
    {legend && <Modal title="时间轴图例" trackChanges={false} onClose={() => setLegend(false)}><div className="recent-legend-detail"><p>填色条：实际安排的推进时段，断开的部分表示独立时段。</p><p>空心虚线条：项目起止日期，尚未细分投入时段。</p><p>◇ 阶段节点；⚑ 项目目标；○ 项目开始。</p><p>数字：相近节点的数量，点击可查看每个实际日期。</p><p>时间范围表示计划，不表示完成进度。手动主线优先预览，其次未结束专注与近期重要安排。</p></div></Modal>}
  </section>;
}
