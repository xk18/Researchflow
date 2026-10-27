import { useEffect, useState } from "react";
import { ArrowUpRight, Check, Clock3, MoreHorizontal, Pause, Play, Square } from "lucide-react";
import { Task } from "../types";
import { useData } from "../state";
import {
  Clock,
  checkpoint,
  completeTask,
  elapsed,
  endFocus,
  focusClock,
  pauseFocus,
  resumeFocus,
  startFocus,
  timeText,
} from "../focus";
import { dueLabel, useToday } from "../dates";
import { Field, Modal } from "./Common";
import { TaskEditor } from "./Editors";
import { projectPath } from '../projectRelations';
import { FocusDial } from './FocusDial';
export function ActionCard({
  task,
  compact = false,
  overview = false,
  hideContext = false,
  onAdd,
}: {
  task?: Task;
  compact?: boolean;
  overview?: boolean;
  hideContext?: boolean;
  onAdd: () => void;
}) {
  const { data, mutate, notify, busy } = useData();
  const today = useToday();
  const [clock, setClock] = useState<Clock>({ token: "", tick: 0 }),
    [configure, setConfigure] = useState(false),
    [options, setOptions] = useState(false),
    [editing, setEditing] = useState<Task>(),
    [mode, setMode] = useState<"countdown" | "countup">("countdown"),
    [minutes, setMinutes] = useState(
      String(data?.settings.lastCustomMinutes || task?.minutes || 10),
    );
  const timer = data?.timer?.taskId === task?.id ? data?.timer : null;
  useEffect(() => { setOptions(false); }, [task?.id]);
  useEffect(() => {
    if (!timer) return;
    let live = true;
    const update = () =>
      void focusClock().then((c) => {
        if (live) setClock(c);
      });
    update();
    const id = timer.running ? setInterval(update, 1000) : undefined;
    return () => {
      live = false;
      if (id) clearInterval(id);
    };
  }, [timer?.sessionId, timer?.running]);
  const ms = timer ? elapsed(timer, clock) : 0;
  const limit = (timer?.plannedMinutes || 0) * 60000;
  useEffect(() => {
    if (
      timer?.running &&
      timer.mode === "countdown" &&
      !timer.overtime &&
      ms >= limit
    ) {
      void mutate((d) => {
        if (d.timer?.sessionId === timer.sessionId) checkpoint(d, clock);
      });
    }
  }, [timer?.running, timer?.sessionId, ms >= limit, mutate]);
  if (!data) return null;
  const project = data.projects.find((p) => p.id === task?.projectId),
    stage = data.milestones.find((m) => m.id === task?.milestoneId);
  async function start(custom = false) {
    const c = await focusClock();
    const m = custom ? Number(minutes) : task!.minutes;
    if (
      await mutate((d) => {
        startFocus(d, task!, custom ? mode : "countdown", m, c);
        if (custom && mode === "countdown") d.settings.lastCustomMinutes = m;
      })
    ) {
      setConfigure(false);
      notify("专注已开始");
    }
  }
  async function change(action: "pause" | "resume" | "end" | "complete") {
    const c = await focusClock();
    if (
      await mutate((d) => {
        if (action === "pause") pauseFocus(d, c);
        if (action === "resume") resumeFocus(d, c);
        if (action === "end") endFocus(d, c);
        if (action === "complete") completeTask(d, task!.id, c);
      })
    ) {
      if (action === "end") notify("专注记录已保存");
      if (action === "complete")
        notify("行动已完成并保存。");
    }
  }
  const shown =
    timer?.mode === "countup" || timer?.overtime ? ms : Math.max(0, limit - ms);
  async function defer() {
    const c = await focusClock();
    if (await mutate(d => {
      if (d.timer?.taskId === task!.id) pauseFocus(d, c);
      const t = d.tasks.find(t => t.id === task!.id)!;
      t.deferredUntil = new Date(Date.now() + 1800000).toISOString();
      t.status = "paused";
    })) { setOptions(false); notify("已放到稍后，30分钟后重新进入推荐。"); }
  }
  const duration = task && <button className="duration text-button" onClick={() => setConfigure(true)} title="选择本次专注时长">
    <Clock3 aria-hidden="true" size={13} />{timer?.mode === "countup" ? "正计时" : `${timer?.plannedMinutes || task.minutes}分钟`}
  </button>;
  return (
    <section className={`action-card ${compact ? "compact" : ""} ${overview ? "overview-task" : ""}`}>
      {!overview && !compact && <div className="action-top">
        <span>{task ? "下一步行动" : "暂无行动"}</span>
        {duration}
      </div>}
      <div className="action-body">
        {!overview && !compact && !hideContext && <p className="project-label" title={project ? projectPath(data,project) : undefined}>
          {project ? projectPath(data,project) : "新建科研项目"}
        </p>}
        {!overview && !compact && !hideContext && (stage || project?.targetDate) && (
          <p className="action-context">
            {stage && <span>{stage.name}</span>}
            {project?.targetDate && (
              <small>{dueLabel(project.targetDate, today)}</small>
            )}
          </p>
        )}
        <h2 title={task?.name}>{task?.name || "添加一个行动"}</h2>
        {task?.note && !compact && !overview && <p className="action-note" title={task.note}>{task.note}</p>}
        {compact && timer && <FocusDial elapsed={ms} duration={limit} running={timer.running} countup={timer.mode === "countup"} overtime={timer.overtime} recovery={timer.needsRecovery} due={timer.awaitingDecision}/>}
        {timer && !compact && (
          <div
            className="timer"
            role="timer"
            aria-label={
              `${timer.mode === "countup" || timer.overtime ? "已专注" : "剩余专注时间"} ${timeText(shown)}`
            }
          >
            {timeText(shown)}
            <small>
              {timer.needsRecovery
                ? "待确认恢复"
                : timer.awaitingDecision
                  ? "时间到"
                  : timer.running
                    ? timer.overtime
                      ? "继续工作中"
                      : "正在专注"
                    : "已暂停"}
            </small>
          </div>
        )}
        {timer?.needsRecovery && (
          <p className="recovery-note">
            已保留计时，可继续或结束。
          </p>
        )}
      </div>
      <div className="action-buttons">
        {task ? (
          <>
            {timer?.running ? (
              <button aria-label="暂停" title="暂停" disabled={busy} onClick={() => void change("pause")}>
                <Pause size={15} />
                {!compact && "暂停"}
              </button>
            ) : (
              <button
                className="primary"
                aria-label={timer ? "继续专注" : "开始专注"}
                title={timer ? "继续专注" : "开始专注"}
                disabled={busy}
                onClick={() => (timer ? void change("resume") : void start())}
              >
                <Play size={15} />
                {!compact && (timer ? "继续" : "开始")}
              </button>
            )}
            {timer && (
              <button aria-label="结束专注" title="结束专注" disabled={busy} onClick={() => void change("end")}>
                <Square size={14}/>{!compact && "结束"}
              </button>
            )}
            <button
              className="finish"
              aria-label="完成行动"
              title="完成行动"
              disabled={busy}
              onClick={() => void change("complete")}
            >
              <Check size={15} />
              {!compact && "完成"}
            </button>
          </>
        ) : (
          <button className="primary" onClick={onAdd}>
            添加行动
            <ArrowUpRight size={16} />
          </button>
        )}
        {(overview || compact) && task && <div className="overview-action-tools">{duration}<button className="icon" aria-label="行动详情与选项" title="行动详情与选项" aria-haspopup="dialog" onClick={() => setOptions(true)}><MoreHorizontal size={17}/></button></div>}
      </div>
      {task && !compact && !overview && (
        <div className="action-foot">
          <button
            className="text-button"
            onClick={() => void defer()}
          >
            稍后继续
          </button>
        </div>
      )}
      {(overview || compact) && options && task && <Modal title="行动详情与选项" trackChanges={false} onClose={() => setOptions(false)}>
        <div className="overview-action-detail"><h3>{task.name}</h3>{task.note && <p>{task.note}</p>}</div>
        <div className="row"><button onClick={() => { setOptions(false); setEditing(task); }}>编辑行动</button><button disabled={busy} onClick={() => void defer()}>30分钟后再推荐</button></div>
        <p className="modal-note">结束专注保存计时；完成行动标记任务完成。</p>
      </Modal>}
      {(overview || compact) && editing && <TaskEditor task={editing} onClose={() => setEditing(undefined)} />}
      {configure && task && (
        <Modal title="本次专注" onClose={() => setConfigure(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void start(true);
            }}
          >
            <p className="modal-note">
              {task.name}
              {task.estimatedMinutes
                ? ` · 预计总工作量 ${task.estimatedMinutes} 分钟`
                : ""}
            </p>
            <div className="timer-mode" role="group" aria-label="计时模式">
              <button
                type="button"
                className={mode === "countdown" ? "selected" : ""}
                onClick={() => setMode("countdown")}
              >
                倒计时
              </button>
              <button
                type="button"
                className={mode === "countup" ? "selected" : ""}
                onClick={() => setMode("countup")}
              >
                正计时
              </button>
            </div>
            {mode === "countdown" ? (
              <>
                <div className="timer-presets">
                  {[5, 10, 20, 45, 60, 90].map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={minutes === String(m) ? "selected" : ""}
                      onClick={() => setMinutes(String(m))}
                    >
                      {m} 分钟
                    </button>
                  ))}
                </div>
                <Field label="自定义分钟（1–240）">
                  <input
                    type="number"
                    min={1}
                    max={240}
                    step={1}
                    required
                    value={minutes}
                    onChange={(e) => setMinutes(e.target.value)}
                  />
                </Field>
              </>
            ) : (
              <p className="modal-note">从 00:00 开始，工作结束时主动停止。</p>
            )}
            {data.timer && (
              <p className="inline-error">
                已有专注，请先结束当前会话。暂停的会话可以在行动视角继续。
              </p>
            )}
            <footer>
              <button
                data-dismiss
                type="button"
                onClick={() => setConfigure(false)}
              >
                取消
              </button>
              <button className="primary" disabled={busy || !!data.timer}>
                开始专注
              </button>
            </footer>
          </form>
        </Modal>
      )}
    </section>
  );
}
