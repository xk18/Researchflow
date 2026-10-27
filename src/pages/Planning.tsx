import { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  CalendarDays,
  Rows3,
  Pencil,
  Trash2,
  Flag,
  ArrowUpRight,
} from "lucide-react";
import { ProjectPlanPeriod, base } from "../types";
import { useData } from "../state";
import {
  addDays,
  dayNumber,
  includesDay,
  localDate,
  overlaps,
  shiftMonth,
  validDate,
  dueLabel,
  useToday,
} from "../dates";
import { currentProjects, rangeLanes, planningPeriods, PlanningPeriod, schedulingProjects, withinProjectDates } from "../planning";
import { ProjectEditor } from "../components/Editors";
import { Confirm, Field, Modal } from "../components/Common";
import { timelineIndex } from "../overviewTimeline";
import { MonthCalendar } from "../components/MonthCalendar";
import { CalendarEntry, projectTone } from "../calendar";
import { projectPath } from "../projectRelations";
import { workflowBranches } from "../workflowMap";

function PeriodEditor({
  period,
  initialDate,
  initialProjectId,
  onClose,
  onDelete,
  onProject,
}: {
  period?: ProjectPlanPeriod;
  initialDate: string;
  initialProjectId?: string;
  onClose: () => void;
  onDelete: (p: ProjectPlanPeriod) => void;
  onProject: (id: string) => void;
}) {
  const { data, mutate, notify, busy } = useData();
  const [start, setStart] = useState(period?.startDate || initialDate),
    [end, setEnd] = useState(period?.endDate || initialDate);
  const projects = schedulingProjects(data!, start, period?.projectId);
  const [pid, setPid] = useState(period?.projectId || projects.find(p => p.id === initialProjectId)?.id || projects[0]?.id || ""),
    [milestoneId, setMilestoneId] = useState(period?.milestoneId || ""),
    [name, setName] = useState(period?.name || ""),
    [note, setNote] = useState(period?.note || ""),
    [priority, setPriority] = useState(period?.priority ?? false),
    [error, setError] = useState("");
  const selectedProject = data!.projects.find(p => p.id === pid);
  const stageOptions = selectedProject ? workflowBranches(data!, selectedProject).filter(b => b.milestone) : [];
  const suggested = projects.filter(p => withinProjectDates(p, start));
  const other = projects.filter(p => !withinProjectDates(p, start));
  const conflicts = data!.planPeriods.filter(
    (p) =>
      p.id !== period?.id &&
      p.projectId !== pid &&
      p.priority &&
      priority &&
      overlaps(p, { startDate: start, endDate: end }) &&
      data!.projects.find((x) => x.id === p.projectId)?.track ===
        data!.projects.find((x) => x.id === pid)?.track,
  );
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!validDate(start) || !validDate(end) || start > end) {
      setError("请输入真实日期，并确保开始日期不晚于结束日期。");
      return;
    }
    const ok = await mutate((d) => {
      if (!d.projects.some(p => p.id === pid && (p.status === 'active' || period?.projectId === pid))) throw Error('项目已更新，请重新选择。');
      if (milestoneId && !d.milestones.some(m => m.id === milestoneId && m.projectId === pid)) throw Error('研究阶段已更新，请重新选择。');
      const item = period
        ? d.planPeriods.find((x) => x.id === period.id)
        : {
            ...base(),
            projectId: pid,
            name,
            note,
            startDate: start,
            endDate: end,
            priority,
          };
      if (!item) throw Error("计划时段已不存在，请重新打开。");
      Object.assign(item, {
        projectId: pid,
        name: name.trim(),
        note,
        startDate: start,
        endDate: end,
        priority,
        updatedAt: new Date().toISOString(),
      });
      if (milestoneId) item.milestoneId = milestoneId;
      else delete item.milestoneId;
      if (!period) d.planPeriods.push(item);
    });
    if (ok) {
      notify("计划时段已保存");
      onClose();
    }
  }
  return (
    <Modal title={period ? "编辑计划时段" : "安排研究"} onClose={onClose}>
      <form onSubmit={(e) => void save(e)}>
        <Field label="科研项目">
          <select aria-label="科研项目" required value={pid} onChange={(e) => { setPid(e.target.value); setMilestoneId(''); }}>
            {!!suggested.length && <optgroup label="所选日期范围内">{suggested.map(p => <option key={p.id} value={p.id}>{projectPath(data!,p)}</option>)}</optgroup>}
            {!!other.length && <optgroup label={suggested.length ? '其他项目' : '科研项目'}>{other.map(p => <option key={p.id} value={p.id}>{projectPath(data!,p)}</option>)}</optgroup>}
          </select>
        </Field>
        <Field label="研究阶段（可选）">
          <select value={milestoneId} onChange={e => setMilestoneId(e.target.value)}>
            <option value="">不指定阶段</option>
            {stageOptions.map(b => <option key={b.id} value={b.id}>{'　'.repeat(Math.min(b.depth || 0, 6))}{b.milestone!.name}</option>)}
          </select>
        </Field>
        <Field label="计划名称（可选）">
          <input
            maxLength={200}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：统计分析"
          />
        </Field>
        <div className="form-grid">
          <Field label="开始日期">
            <input
              type="date"
              min="1900-01-01"
              max="2199-12-31"
              required
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </Field>
          <Field label="结束日期（含当天）">
            <input
              type="date"
              min="1900-01-01"
              max="2199-12-31"
              required
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </Field>
        </div>
        <Field label="备注（可选）">
          <textarea
            rows={2}
            maxLength={3000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        <label className="check">
          <input
            type="checkbox"
            checked={priority}
            onChange={(e) => setPriority(e.target.checked)}
          />
          作为这段时间的重点计划
        </label>
        {conflicts.length > 0 && (
          <p className="planning-warning" role="status">
            这个时段已有 {conflicts.length}{" "}
            个同方向重点项目，可以调整重点，也可以继续并行。
          </p>
        )}
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <footer>
          {period && (
            <>
              <button
                type="button"
                className="danger-text"
                onClick={() => onDelete(period)}
              >
                <Trash2 size={14} />
                删除时段
              </button>
              <button type="button" onClick={() => onProject(pid)}>
                进入项目
              </button>
            </>
          )}
          <button type="button" data-dismiss onClick={onClose}>
            取消
          </button>
          <button className="primary" disabled={busy || !pid}>
            保存计划
          </button>
        </footer>
      </form>
    </Modal>
  );
}

function Timeline({
  month,
  count,
  onEdit,
  onProject,
  overviewStart,
}: {
  month: string;
  count: number;
  onEdit: (p: PlanningPeriod) => void;
  onProject: (id: string) => void;
  overviewStart?: string;
}) {
  const { data } = useData();
  const today = useToday();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const indexed = useMemo(() => {
    const index = timelineIndex(data!);
    const periods = new Map<string, PlanningPeriod[]>();
    for (const period of planningPeriods(data!)) {
      if (!periods.has(period.projectId)) periods.set(period.projectId, []);
      periods.get(period.projectId)!.push(period);
    }
    return { periods, stages: index.stages };
  }, [data]);
  const visibleCount = Math.min(
    count,
    (2199 - Number(month.slice(0, 4))) * 12 + 13 - Number(month.slice(5, 7)),
  );
  const months = Array.from({ length: visibleCount }, (_, i) =>
      shiftMonth(month, i),
    ),
    start = months[0],
    end = shiftMonth(months.at(-1)!, 1),
    first = dayNumber(start),
    total = dayNumber(end) - first;
  const projects = data!.projects.filter(
      (p) => p.status !== "terminated" && p.status !== "archived",
    ),
    ticks = Array.from({ length: total }, (_, i) => addDays(start, i)).filter(
      (d) => [1, 8, 15, 22].includes(Number(d.slice(-2))),
    );
  const guides = (
    <>
      {overviewStart && <span className="timeline-overview-range" style={{left:`${Math.max(0,(dayNumber(overviewStart)-first)/total)*100}%`,width:`${Math.max(0,(Math.min(dayNumber(addDays(overviewStart,35)),dayNumber(end))-Math.max(dayNumber(overviewStart),first))/total)*100}%`}} title="概览中的近期日期范围" />}
      <div
        className="timeline-months"
        style={{
          gridTemplateColumns: months
            .map((m) => `${dayNumber(shiftMonth(m, 1)) - dayNumber(m)}fr`)
            .join(" "),
        }}
      >
        {months.map((m) => (
          <span key={m} />
        ))}
      </div>
      {today >= start && today < end && (
        <span
          className="timeline-today"
          style={{
            left: `${((dayNumber(today) - first + 0.5) / total) * 100}%`,
          }}
        />
      )}
    </>
  );
  return (
    <div className="timeline-scroll">
      <div
        className="timeline-grid"
        style={{ "--timeline-months": visibleCount } as React.CSSProperties}
      >
        <div
          className="timeline-head"
          style={{
            gridTemplateColumns: `var(--timeline-label) ${months.map((m) => `${dayNumber(shiftMonth(m, 1)) - dayNumber(m)}fr`).join(" ")}`,
          }}
        >
          <span>科研项目 / 阶段</span>
          {months.map((m) => (
            <strong key={m}>
              {new Intl.DateTimeFormat("zh-CN", {
                year: "numeric",
                month: "long",
              }).format(new Date(`${m}T12:00:00`))}
            </strong>
          ))}
        </div>
        <div className="timeline-scale">
          {ticks.map((d) => (
            <span
              key={d}
              style={{ left: `${((dayNumber(d) - first) / total) * 100}%` }}
            >
              {Number(d.slice(-2))}
            </span>
          ))}
        </div>
        {projects.map((project) => {
          const lanes = rangeLanes(
              indexed.periods.get(project.id) || [],
              start,
              addDays(end, -1),
            ),
            stages = (indexed.stages.get(project.id) || []).slice().sort((a,b) => a.order-b.order || a.id.localeCompare(b.id));
          return (
            <div className="timeline-project" key={project.id}>
              <div className="timeline-name">
                <button
                  className="icon"
                  aria-label={`展开阶段 ${project.name}`}
                  aria-expanded={expanded.has(project.id)}
                  onClick={() =>
                    setExpanded((s) => {
                      const next = new Set(s);
                      if (next.has(project.id)) next.delete(project.id);
                      else next.add(project.id);
                      return next;
                    })
                  }
                >
                  <ChevronRight
                    size={13}
                    className={expanded.has(project.id) ? "rotated" : ""}
                  />
                </button>
                <span className={`track-stroke ${project.track}`} />
                <button
                  className="text-button"
                  title={project.name}
                  onClick={() => onProject(project.id)}
                >
                  {project.name}
                </button>
                {project.targetDate && (
                  <small>{dueLabel(project.targetDate, today)}</small>
                )}
              </div>
              <div
                className="timeline-lanes"
                style={{
                  height: Math.max(1, ...lanes.map((l) => l.lane + 1)) * 24 + 4,
                }}
              >
                {guides}
                {lanes.map(({ item: p, lane, start: a, length }) => (
                  <button
                    type="button"
                    key={p.id}
                    title={`${p.projectDates ? "项目总体日期（未代表持续投入）" : p.name || project.name}${p.milestoneId ? ` · ${data!.milestones.find(m => m.id === p.milestoneId)?.name || ""}` : ""} · ${p.startDate} 至 ${p.endDate}`}
                    className={`timeline-bar ${project.track} ${p.projectDates ? "project-dates" : ""} ${p.priority ? "priority" : ""}`}
                    style={{
                      top: lane * 24 + 3,
                      left: `${(a / total) * 100}%`,
                      width: `${(length / total) * 100}%`,
                    }}
                    onClick={() => onEdit(p)}
                  >
                    {p.projectDates ? "项目总体日期" : p.name || data!.milestones.find(m => m.id === p.milestoneId)?.name || project.name}
                  </button>
                ))}
                {!lanes.length && (
                  <span className="timeline-unscheduled">本区间未安排时段</span>
                )}
                {project.targetDate &&
                  project.targetDate >= start &&
                  project.targetDate < end && (
                    <button
                      className="timeline-due"
                      style={{
                        left: `${((dayNumber(project.targetDate) - first + 0.5) / total) * 100}%`,
                      }}
                      title={`目标日期 ${project.targetDate}`}
                      onClick={() => onProject(project.id)}
                    >
                      ◆
                    </button>
                  )}
              </div>
              {expanded.has(project.id) &&
                stages.map((m) => {
                  const ranged = m.startDate && m.endDate,
                    date = m.targetDate || m.endDate,
                    visible = ranged
                      ? m.endDate! >= start && m.startDate! < end
                      : !!date && date >= start && date < end,
                    a = ranged
                      ? Math.max(0, dayNumber(m.startDate!) - first)
                      : date
                        ? dayNumber(date) - first
                        : 0,
                    b = ranged
                      ? Math.min(total, dayNumber(m.endDate!) - first + 1)
                      : a + 1;
                  return (
                    <div className="timeline-stage" key={m.id}>
                      <button
                        className="text-button"
                        title={m.name}
                        onClick={() => onProject(project.id)}
                      >
                        {m.name}
                      </button>
                      <div className="timeline-lanes">
                        {guides}
                        {visible ? (
                          <span
                            className={`timeline-stage-bar ${m.status}`}
                            style={{
                              left: `${(a / total) * 100}%`,
                              width: `${Math.max(0.5, ((b - a) / total) * 100)}%`,
                            }}
                            title={`${m.name} · ${m.startDate || date} 至 ${m.endDate || date}`}
                          />
                        ) : (
                          <span className="timeline-unscheduled">
                            {date || ranged ? "日期在本区间之外" : "未设置日期"}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          );
        })}
        {!projects.length && (
          <p className="planning-empty">还没有可显示的科研项目。</p>
        )}
      </div>
    </div>
  );
}

export function Planning({ navigate, initialDate, initialView }: { navigate: (page: string) => void; initialDate?: string; initialView?: "calendar" | "timeline" }) {
  const { data, mutate, notify } = useData();
  const today = useToday();
  const [month, setMonth] = useState((initialDate && validDate(initialDate) ? initialDate : localDate()).slice(0, 7) + "-01"),
    [selected, setSelected] = useState(initialDate && validDate(initialDate) ? initialDate : localDate()),
    [view, setView] = useState<"calendar" | "timeline">(initialView || "calendar"),
    [range, setRange] = useState(3),
    [editor, setEditor] = useState<ProjectPlanPeriod | null | undefined>(),
    [editProject, setEditProject] = useState<string>(),
    [remove, setRemove] = useState<ProjectPlanPeriod | null>(null),
    [showDay, setShowDay] = useState(false),
    [dayProject, setDayProject] = useState<string>();
  const dayPeriods = data!.planPeriods.filter((p) =>
      includesDay(p.startDate, p.endDate, selected) && (!dayProject || p.projectId === dayProject),
    ),
    due = data!.projects.filter((p) => p.targetDate === selected && (!dayProject || p.id === dayProject)),
    starts = data!.projects.filter((p) => p.startDate === selected && (!dayProject || p.id === dayProject)),
    stages = data!.milestones.filter(
      (m) => (m.targetDate || m.endDate) === selected && (!dayProject || m.projectId === dayProject),
    ),
    leads = currentProjects(data!, today),
    upcoming = data!.projects
      .filter((p) => p.status === "active" && p.targetDate)
      .sort((a, b) => a.targetDate!.localeCompare(b.targetDate!))
      .slice(0, 4);
  const openProject = (id: string) => navigate(`projects:${id}`);
  const editPeriod = (p: PlanningPeriod | null) => {
    if (p?.projectDates) setEditProject(p.projectId);
    else setEditor(p);
  };
  const selectDay = (date: string, projectId?: string) => { setSelected(date); setDayProject(projectId); setShowDay(true); };
  const selectEntry = (date: string, entry: CalendarEntry) => {
    setSelected(date);
    if (entry.periods.length === 1 && !entry.nodes.length) editPeriod(entry.periods[0]);
    else selectDay(date, entry.project.id);
  };
  return (
    <>
      {view === "timeline" && <div className="page-heading plan-heading">
        <div>
          <h1>科研规划</h1>
          
        </div>
        <button
          className="primary"
          disabled={!data!.projects.some((p) => p.status === "active")}
          onClick={() => { setDayProject(undefined); setEditor(null); }}
        >
          <Plus size={15} />
          添加计划
        </button>
      </div>}
      {view === "timeline" && <div className="plan-leads">
        <span>当前研究主线</span>
        {leads.length ? (
          leads.slice(0, 4).map((p) => (
            <button
              key={p.id}
              onClick={async () => {
                if (
                  await mutate((d) => {
                    d.settings.focusProjectId = p.id;
                  })
                )
                  navigate("focus");
              }}
            >
              <span className={`track-stroke ${p.track}`} />
              {p.name}
            </button>
          ))
        ) : (
          <span>尚未安排主线，现有行动仍可直接推进。</span>
        )}
      </div>}
      <section className={`planner ${view === "calendar" ? "calendar-planner" : ""}`}>
        <div className="planner-toolbar">
          <div className="month-control">
            <button
              className="icon"
              aria-label="上一个月"
              disabled={month <= "1900-01-01"}
              onClick={() => setMonth(shiftMonth(month, -1))}
            >
              <ChevronLeft size={17} />
            </button>
            <h2>
              {new Intl.DateTimeFormat("zh-CN", {
                year: "numeric",
                month: "long",
              }).format(new Date(`${month}T12:00:00`))}
            </h2>
            <button
              className="icon"
              aria-label="下一个月"
              disabled={month >= "2199-12-01"}
              onClick={() => setMonth(shiftMonth(month, 1))}
            >
              <ChevronRight size={17} />
            </button>
            <button
              onClick={() => {
                setMonth(today.slice(0, 7) + "-01");
                setSelected(today);
              }}
            >
              今天
            </button>
          </div>
          <div className="planner-actions">
          {view === "calendar" && <button className="primary" disabled={!data!.projects.some(p => p.status === "active")} onClick={() => { setDayProject(undefined); setEditor(null); }}><Plus size={14} />添加计划</button>}
          <div className="view-control" role="group" aria-label="计划视图">
            <button
              className={view === "calendar" ? "selected" : ""}
              onClick={() => setView("calendar")}
            >
              <CalendarDays size={15} />
              月历
            </button>
            <button
              className={view === "timeline" ? "selected" : ""}
              onClick={() => setView("timeline")}
            >
              <Rows3 size={15} />
              时间轴
            </button>
          </div>
          </div>
        </div>
        {view === "calendar" ? (
          <MonthCalendar
            month={month}
            selected={selected}
            onEntry={selectEntry}
            onSelect={selectDay}
          />
        ) : (
          <>
            <div className="timeline-range">
              <button
                className={range === 1 ? "selected" : ""}
                onClick={() => setRange(1)}
              >
                单月
              </button>
              <button
                className={range === 3 ? "selected" : ""}
                onClick={() => setRange(3)}
              >
                三个月
              </button>
            </div>
            <Timeline
              overviewStart={initialDate && validDate(initialDate) ? initialDate : undefined}
              month={month}
              count={range}
              onEdit={editPeriod}
              onProject={openProject}
            />
          </>
        )}
      </section>
      <details className="planning-context"><summary>研究主线与目标日期</summary>
      {view === "calendar" && <div className="plan-leads"><span>当前研究主线</span>{leads.length ? leads.map(p => <button key={p.id} onClick={async () => { if (await mutate(d => { d.settings.focusProjectId = p.id; })) navigate("focus"); }}>{p.name}</button>) : <span>尚未安排主线，现有行动仍可推进。</span>}</div>}
      {upcoming.length > 0 && (
        <section className="plan-upcoming">
          <h3>项目目标日期</h3>
          {upcoming.map((p) => (
            <button
              className="text-button"
              key={p.id}
              onClick={() => openProject(p.id)}
            >
              <span>{p.name}</span>
              <time>{p.targetDate}</time>
              <small>{dueLabel(p.targetDate, today)}</small>
            </button>
          ))}
        </section>
      )}
      <section className="plan-notes">
        <p>
          ○ 项目日期
        </p>
      </section>
        </details>
      {view === "calendar" && showDay && (
          <Modal title={`${selected} 的安排`} onClose={() => setShowDay(false)}>
          <div className="selected-day">
            {dayProject && <p className="day-project-heading" data-tone={projectTone(dayProject)}>{data!.projects.find(p => p.id === dayProject)?.name}<button className="text-button" onClick={() => setDayProject(undefined)}>查看当天全部项目</button></p>}
            {dayPeriods.map((p) => {
              const project = data!.projects.find((x) => x.id === p.projectId);
              return (
                <div className="day-plan" key={p.id}>
                  <button className="text-button" onClick={() => { setShowDay(false); editPeriod(p); }}>
                    <Pencil size={13} />
                    {p.name || data!.milestones.find(m => m.id === p.milestoneId)?.name || project?.name}
                  </button>
                  <button
                    className="text-button day-project"
                    onClick={() => openProject(p.projectId)}
                  >
                    {project?.name}
                    <ArrowUpRight size={12} />
                  </button>
                  <small>
                    {data!.milestones.find(m => m.id === p.milestoneId && m.projectId === p.projectId)?.name}{p.milestoneId ? ' · ' : ''}{p.startDate} 至 {p.endDate}
                  </small>
                  <button
                    className="icon danger-text"
                    aria-label={`删除计划 ${p.name || project?.name}`}
                    onClick={() => { setShowDay(false); setRemove(p); }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
            {starts.map((p) => (
              <button className="day-plan text-button" key={`start:${p.id}`}
                onClick={() => openProject(p.id)}>
                <CalendarDays size={14} />{p.name} · 项目启动日期
              </button>
            ))}
            {due.map((p) => (
              <button
                className="day-plan text-button"
                key={p.id}
                onClick={() => openProject(p.id)}
              >
                <Flag size={14} />
                {p.name} · 目标完成日期
              </button>
            ))}
            {stages.map((m) => (
              <button
                className="day-plan text-button"
                key={m.id}
                onClick={() => openProject(m.projectId)}
              >
                阶段 · {m.name} ·{" "}
                {m.status === "done"
                  ? "已完成"
                  : m.status === "doing"
                    ? "进行中"
                    : "未开始"}
              </button>
            ))}
            {!dayPeriods.length && !due.length && !starts.length && !stages.length && (
              <p className="muted">
                这一天暂无安排
              </p>
            )}
            <button
              className="text-button"
              disabled={!data!.projects.some((p) => p.status === "active")}
              onClick={() => { setShowDay(false); setEditor(null); }}
            >
              <Plus size={14} />
              在这一天安排研究
            </button>
          </div>
          </Modal>
        )}
      {editProject && <ProjectEditor project={data!.projects.find((p) => p.id === editProject)!} onClose={() => setEditProject(undefined)} />}
      {editor !== undefined && (
        <PeriodEditor
          period={editor || undefined}
          initialDate={selected}
          initialProjectId={dayProject}
          onClose={() => setEditor(undefined)}
          onProject={openProject}
          onDelete={(p) => {
            setEditor(undefined);
            setRemove(p);
          }}
        />
      )}
      {remove && (
        <Confirm
          title="删除这个计划时段？"
          detail="只删除这一个时段。项目、其他计划、阶段和行动都会保留。"
          onClose={() => setRemove(null)}
          onConfirm={async () => {
            if (
              await mutate((d) => {
                d.planPeriods = d.planPeriods.filter((p) => p.id !== remove.id);
              })
            ) {
              setRemove(null);
              notify("计划时段已删除，其他内容均保留。");
            }
          }}
        />
      )}
    </>
  );
}
