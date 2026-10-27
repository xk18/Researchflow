import { useState } from "react";
import { Archive, Lightbulb, Plus, Trash2 } from "lucide-react";
import { base, Idea } from "../types";
import { useData } from "../state";
import { Confirm, Empty } from "../components/Common";
import { IdeaEditor } from "../components/Editors";
export function Ideas() {
  const { data, mutate, notify } = useData();
  const [adding, setAdding] = useState(false),
    [remove, setRemove] = useState<Idea | null>(null),
    [archived, setArchived] = useState(false),
    [query, setQuery] = useState("");
  const ideas = data!.ideas.filter(
    (i) =>
      i.archived === archived &&
      i.text.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>灵感池</h1>
          
        </div>
        <button className="primary" onClick={() => setAdding(true)}>
          <Plus aria-hidden="true" size={16} />
          记录灵感
        </button>
      </div>
      <div className="toolbar">
        <input
          aria-label="搜索灵感"
          placeholder="搜索灵感…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="check">
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
          />
          查看归档
        </label>
      </div>
      {ideas.length ? (
        <div className="ideas-list">
          {ideas.map((i) => (
            <article className="idea-note" key={i.id}>
              <Lightbulb aria-hidden="true" size={19} strokeWidth={1.4} />
              <div>
                <p className="idea-text">{i.text}</p>
                <div className="idea-meta">
                  <time>
                    {new Intl.DateTimeFormat("zh-CN", {
                      month: "long",
                      day: "numeric",
                    }).format(new Date(i.createdAt))}
                  </time>
                  {i.demo && <span className="demo-label">演示</span>}
                  {i.projectId && (
                    <span>
                      {data!.projects.find((p) => p.id === i.projectId)?.name}
                    </span>
                  )}
                </div>
                <div className="idea-actions">
                  {!i.projectId && !i.archived && (
                    <button
                      onClick={async () => {
                        if (
                          await mutate((d) => {
                            const idea = d.ideas.find((x) => x.id === i.id)!;
                            const p = {
                              ...base(),
                              name: i.text.slice(0, 80),
                              background: i.text,
                              track: "explore" as const,
                              status: "active" as const,
                              priority: !d.projects.some(
                                (p) => p.track === "explore" && p.priority,
                              ),
                              demo: i.demo,
                            };
                            d.projects.push(p);
                            idea.projectId = p.id;
                            idea.updatedAt = new Date().toISOString();
                          })
                        ) {
                          notify("已转为项目，灵感原文已保留。");
                        }
                      }}
                    >
                      转为项目
                    </button>
                  )}
                  <select
                    aria-label="关联灵感到项目"
                    value={i.projectId || ""}
                    onChange={(e) => {
                      const id = e.currentTarget.value;
                      void mutate((d) => {
                        const x = d.ideas.find((x) => x.id === i.id)!;
                        if (id) x.projectId = id;
                        else delete x.projectId;
                        x.updatedAt = new Date().toISOString();
                      });
                    }}
                  >
                    <option value="">关联项目（可选）</option>
                    {data!.projects.map((p) => (
                      <option value={p.id} key={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="icon"
                    aria-label={i.archived ? "恢复灵感" : "归档灵感"}
                    onClick={() =>
                      void mutate((d) => {
                        const x = d.ideas.find((x) => x.id === i.id)!;
                        x.archived = !x.archived;
                        x.updatedAt = new Date().toISOString();
                      })
                    }
                  >
                    <Archive aria-hidden="true" size={15} />
                  </button>
                  <button
                    className="icon danger-text"
                    aria-label="删除灵感"
                    onClick={() => setRemove(i)}
                  >
                    <Trash2 aria-hidden="true" size={15} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title={archived ? "没有归档的灵感" : "一个新问题，可以先停在这里"}
          detail=""
          action={() => setAdding(true)}
          label="记录灵感"
        />
      )}
      {adding && <IdeaEditor onClose={() => setAdding(false)} />}
      {remove && (
        <Confirm
          title="删除这条灵感？"
          detail="删除后无法撤销。关联项目不会被删除。"
          onClose={() => setRemove(null)}
          onConfirm={async () => {
            if (
              await mutate((d) => {
                d.ideas = d.ideas.filter((i) => i.id !== remove.id);
              })
            ) {
              setRemove(null);
              notify("灵感已删除");
            }
          }}
        />
      )}
    </>
  );
}
