import { useState } from "react";
import { Check, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { base, MOTIVATION, Motivation } from "../types";
import { useData } from "../state";
import { Field, Modal } from "../components/Common";
import { ProgressReport } from "../components/ProgressReport";
export const localDate = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export function CheckinEditor({ onClose }: { onClose: () => void }) {
  const { data, mutate, busy, notify } = useData();
  const date = localDate();
  const prior = data!.checkins.find((c) => c.date === date);
  const [energy, setEnergy] = useState(prior?.energy || 3),
    [stress, setStress] = useState(prior?.stress || 3),
    [sleep, setSleep] = useState(prior?.sleep?.toString() || ""),
    [motivation, setMotivation] = useState<Motivation>(
      prior?.motivation || data!.settings.motivation,
    ),
    [note, setNote] = useState(prior?.note || "");
  return (
    <Modal title="今日状态" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await mutate((d) => {
              const record = {
                ...(prior || base()),
                date,
                energy,
                stress,
                motivation,
                note,
                updatedAt: new Date().toISOString(),
                sleep: sleep !== "" ? Number(sleep) : undefined,
              };
              d.checkins = d.checkins.filter((c) => c.date !== date);
              d.checkins.push(record);
              d.settings.motivation = motivation;
            })
          ) {
            notify("今天的状态已保存");
            onClose();
          }
        }}
      >
        {[
          ["精力", energy, setEnergy],
          ["压力", stress, setStress],
        ].map(([label, value, setter]) => (
          <Field key={label as string} label={`${label}（1—5）`}>
            <div className="rating" role="group" aria-label={label as string}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  type="button"
                  key={n}
                  className={value === n ? "selected" : ""}
                  aria-pressed={value === n}
                  onClick={() => (setter as (n: number) => void)(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </Field>
        ))}
        <div className="form-grid">
          <Field label="昨晚睡眠（小时，可选）">
            <input
              type="number"
              min="0"
              max="24"
              step="0.5"
              value={sleep}
              onChange={(e) => setSleep(e.target.value)}
            />
          </Field>
          <Field label="今日科研动力">
            <select
              value={motivation}
              onChange={(e) => setMotivation(e.target.value as Motivation)}
            >
              {Object.entries(MOTIVATION).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="一句话备注（可选）">
          <textarea
            rows={2}
            value={note}
            maxLength={10000}
            onChange={(e) => setNote(e.target.value)}
            placeholder="今天有什么想留下的…"
          />
        </Field>
        <footer>
          <button type="button" onClick={onClose}>
            跳过
          </button>
          <button className="primary" disabled={busy}>
            保存状态
          </button>
        </footer>
      </form>
    </Modal>
  );
}
export function Review() {
  const { data } = useData();
  const [adding, setAdding] = useState(false),
    [offset, setOffset] = useState(0),
    [report, setReport] = useState(false);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7) + offset * 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
  const tasks = data!.tasks.filter(
    (t) =>
      t.status === "done" &&
      t.completedAt &&
      Date.parse(t.completedAt) >= +start &&
      Date.parse(t.completedAt) < +end,
  );
  const explore = tasks.filter(
    (t) =>
      (t.completedTrack ||
        data!.projects.find((p) => p.id === t.projectId)?.track) === "explore",
  ).length;
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
  });
  const last = new Date(end);
  last.setDate(last.getDate() - 1);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>状态回顾</h1>
          
        </div>
        <div className="row">
        <button onClick={() => setReport(true)}>导出科研进度</button>
        <button onClick={() => setAdding(true)}>
          <Plus aria-hidden="true" size={16} />
          记录今日状态
        </button></div>
      </div>
      <div className="week-selector">
        <button
          className="icon"
          aria-label="上一周"
          onClick={() => setOffset(offset - 1)}
        >
          <ChevronLeft aria-hidden="true" size={18} />
        </button>
        <h2>
          {formatter.format(start)} — {formatter.format(last)}
        </h2>
        <button
          className="icon"
          disabled={offset === 0}
          aria-label="下一周"
          onClick={() => setOffset(offset + 1)}
        >
          <ChevronRight aria-hidden="true" size={18} />
        </button>
      </div>
      <div className="review-summary">
        <div>
          <strong>{tasks.length}</strong>
          <span>已完成行动</span>
        </div>
        <div>
          <strong>{explore}</strong>
          <span>问题探索行动</span>
        </div>
        <div>
          <strong>{tasks.length - explore}</strong>
          <span>成果产出行动</span>
        </div>
      </div>
      <section className="week-grid">
        {days.map((date) => {
          const c = data!.checkins.find((c) => c.date === localDate(date));
          return (
            <div
              key={localDate(date)}
              className={localDate(date) === localDate() ? "today-column" : ""}
            >
              <span>
                {new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(
                  date,
                )}
              </span>
              <strong>{date.getDate()}</strong>
              {c ? (
                <>
                  <span className={`state-mark ${c.motivation}`} />
                  <small>{MOTIVATION[c.motivation]}</small>
                  <small>
                    精力 {c.energy} / 压力 {c.stress}
                  </small>
                  {c.sleep !== undefined && <small>睡眠 {c.sleep}小时</small>}
                </>
              ) : (
                <small className="unrecorded">未记录</small>
              )}
            </div>
          );
        })}
      </section>
      
      <section className="review-list">
        <h3>这一周留下的推进</h3>
        {tasks.length ? (
          tasks.map((t) => (
            <div className="review-task" key={t.id}>
              <Check aria-hidden="true" size={15} />
              <div>
                <p>{t.name}</p>
                <small>
                  {data!.projects.find((p) => p.id === t.projectId)?.name}
                </small>
              </div>
              <time>{formatter.format(new Date(t.completedAt!))}</time>
            </div>
          ))
        ) : (
          <p className="muted">暂无已完成行动</p>
        )}
        {data!.checkins
          .filter(
            (c) =>
              c.date >= localDate(start) && c.date < localDate(end) && c.note,
          )
          .map((c) => (
            <div className="state-note" key={c.id}>
              <time>{c.date}</time>
              <p>{c.note}</p>
            </div>
          ))}
      </section>
      {adding && <CheckinEditor onClose={() => setAdding(false)} />}
      {report && <ProgressReport onClose={() => setReport(false)} />}
    </>
  );
}
