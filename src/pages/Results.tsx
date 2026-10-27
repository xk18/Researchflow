import { useState } from "react";
import { Copy, FileDown, Pencil, Plus, Trash2 } from "lucide-react";
import { ResultCard } from "../types";
import { useData } from "../state";
import { Confirm, Empty, Modal } from "../components/Common";
import { ResultEditor } from "../components/Editors";
import { resultMarkdown } from "../domain";
import { desktop, download, native } from "../services/native";
export function Results() {
  const { data, mutate, notify } = useData();
  const [edit, setEdit] = useState<ResultCard | null | undefined>(),
    [remove, setRemove] = useState<ResultCard | null>(null),
    [outline, setOutline] = useState<ResultCard | null>(null),
    [query, setQuery] = useState(""),
    [pid, setPid] = useState(""),
    [selected, setSelected] = useState("");
  const cards = data!.results.filter(
    (r) =>
      (!pid || r.projectId === pid) &&
      Object.values(r).some(
        (v) =>
          typeof v === "string" &&
          v.toLowerCase().includes(query.toLowerCase()),
      ),
  );
  const current = cards.find(r => r.id === selected) || cards[0];
  const md = (r: ResultCard, o = false) =>
    resultMarkdown(
      r,
      data!.projects.find((p) => p.id === r.projectId)?.name || "未分类",
      o,
    );
  async function copy(r: ResultCard, o = false) {
    try {
      if (native) await desktop("copy_text", { text: md(r, o) });
      else await navigator.clipboard.writeText(md(r, o));
      notify("已复制 Markdown");
    } catch (e) {
      notify(`复制失败，可使用导出：${String(e)}`);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>成果卡</h1>
          
        </div>
        <button
          className="primary"
          disabled={!data!.projects.length}
          onClick={() => setEdit(null)}
        >
          <Plus aria-hidden="true" size={16} />
          记录成果
        </button>
      </div>
      <div className="toolbar">
        <input
          aria-label="搜索成果卡"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索观察、假设或关键词…"
        />
        <select
          aria-label="按项目筛选成果卡"
          value={pid}
          onChange={(e) => setPid(e.target.value)}
        >
          <option value="">全部项目</option>
          {data!.projects.map((p) => (
            <option value={p.id} key={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      {cards.length ? (
        <div className="results-workspace">
          <aside className="result-index" aria-label="成果卡列表">
            <span className="index-caption">{cards.length} 张研究记录</span>
            {cards.map(r => <button key={r.id} className={r.id === current.id ? "selected" : ""} aria-pressed={r.id === current.id} onClick={() => setSelected(r.id)}>
              <strong>{r.observation}</strong>
              <span>{data!.projects.find(p => p.id === r.projectId)?.name}</span>
            </button>)}
          </aside>
          {[current].map((r) => (
            <article key={r.id} className="result-note">
              <div className="result-meta">
                <span>
                  {data!.projects.find((p) => p.id === r.projectId)?.name}
                </span>
                {r.demo && <span className="demo-label">演示</span>}
                <time>
                  {new Intl.DateTimeFormat("zh-CN", {
                    month: "short",
                    day: "numeric",
                  }).format(new Date(r.createdAt))}
                </time>
              </div>
              <h2>{r.observation}</h2>
              <dl className="result-fields">
                {([
                  ["科学假设", r.hypothesis],
                  ["证据位置", r.evidence],
                  ["对假设的支持", r.support],
                  ["结果解释", r.interpretation],
                  ["研究局限", r.limitations],
                  ["科学意义", r.significance],
                ] as const).filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
              </dl>
              {r.validation && (
                <div className="validation">
                  <span>下一步验证</span>
                  {r.validation}
                </div>
              )}
              <div className="result-actions">
                <button onClick={() => setEdit(r)}>
                  <Pencil aria-hidden="true" size={14} />
                  编辑
                </button>
                <button onClick={() => setOutline(r)}>整理为论文素材</button>
                <button
                  className="icon"
                  title="复制成果卡"
                  aria-label="复制成果卡"
                  onClick={() => void copy(r)}
                >
                  <Copy aria-hidden="true" size={15} />
                </button>
                <button
                  className="icon"
                  title="导出 Markdown"
                  aria-label="导出成果卡 Markdown"
                  onClick={async () => {
                    if (await download("科研成果卡.md", md(r)))
                      notify("成果卡已导出");
                  }}
                >
                  <FileDown aria-hidden="true" size={15} />
                </button>
                <button
                  className="icon danger-text"
                  aria-label="删除成果卡"
                  onClick={() => setRemove(r)}
                >
                  <Trash2 aria-hidden="true" size={15} />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title={query ? "没有匹配的成果卡" : "暂无成果卡"}
          detail={
            data!.projects.length
              ? ""
              : "请先创建项目"
          }
          action={data!.projects.length ? () => setEdit(null) : undefined}
          label="记录第一张成果卡"
        />
      )}
      {edit !== undefined && (
        <ResultEditor
          card={edit || undefined}
          onClose={() => setEdit(undefined)}
        />
      )}
      {remove && (
        <Confirm
          title="删除这张成果卡？"
          detail="删除后无法撤销。可以先导出 Markdown 或完整备份。"
          onClose={() => setRemove(null)}
          onConfirm={async () => {
            if (
              await mutate((d) => {
                d.results = d.results.filter((r) => r.id !== remove.id);
              })
            ) {
              setRemove(null);
              notify("成果卡已删除");
            }
          }}
        />
      )}{" "}
      {outline && (
        <Modal title="整理为论文素材" wide onClose={() => setOutline(null)}>
          <p className="modal-note">
            仅整理你已经记录的内容。缺失信息以【待补充】标记。
          </p>
          <pre className="markdown-preview">{md(outline, true)}</pre>
          <footer>
            <button onClick={() => void copy(outline, true)}>
              <Copy aria-hidden="true" size={14} />
              复制提纲
            </button>
            <button
              className="primary"
              onClick={async () => {
                if (await download("论文素材提纲.md", md(outline, true)))
                  notify("论文素材已导出");
              }}
            >
              <FileDown aria-hidden="true" size={14} />
              导出 Markdown
            </button>
          </footer>
        </Modal>
      )}
    </>
  );
}
