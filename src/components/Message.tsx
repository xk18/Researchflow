import { useEffect, useState } from "react";
import { MessageSettings } from "../types";
import { useData } from "../state";
import { Field, Modal } from "./Common";

const initial: MessageSettings = { text: "", font: "system", size: 14, spacing: 0, overview: true, widget: true };
function messageStyle(m: MessageSettings) {
  return { fontFamily: m.font === "serif" ? '"SimSun", "Songti SC", serif' : 'inherit', fontSize: `${m.size / 14}rem`, letterSpacing: `${m.spacing}px` };
}
export function Message({ place }: { place: "overview" | "widget" }) {
  const { data } = useData();
  const m = data?.settings.message;
  if (!m?.text.trim() || !m[place]) return null;
  return <p className={`personal-message ${place}-message`} style={messageStyle(m)} title={m.text}>{m.text}</p>;
}
export function MessageEditor() {
  const { data, mutate, notify, busy } = useData();
  const saved = data!.settings.message;
  const [draft, setDraft] = useState<MessageSettings>({ ...(saved || initial) });
  const [dirty, setDirty] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => { if (!dirty) setDraft({ ...(saved || initial) }); }, [saved, dirty]);
  function edit(patch: Partial<MessageSettings>) { setDraft(d => ({ ...d, ...patch })); setDirty(true); }
  return <section className="settings-section message-settings">
    <h3>寄语</h3>
    {saved?.text.trim() && <div className="message-preview"><p style={messageStyle(saved)}>{saved.text}</p></div>}
    <button onClick={() => { setDraft({ ...(saved || initial) }); setDirty(false); setOpen(true); }}>编辑寄语</button>
    {open && <Modal title="编辑寄语" onClose={() => setOpen(false)}>
    <form onSubmit={async e => {
      e.preventDefault();
      const next = { ...draft, text: draft.text.trim() };
      if (await mutate(d => { d.settings.message = next; })) { setDirty(false); setOpen(false); notify("寄语已保存"); }
    }}>
      <Field label="寄语内容"><textarea aria-label="寄语内容" rows={3} maxLength={500} placeholder="写给自己的一句话（可留空）" value={draft.text} onChange={e => edit({ text: e.target.value })}/></Field>
      <div className="form-grid">
        <Field label="字体"><select aria-label="字体" value={draft.font} onChange={e => edit({ font: e.target.value as MessageSettings["font"] })}><option value="system">系统字体</option><option value="serif">宋体</option></select></Field>
        <Field label="字号"><select aria-label="字号" value={draft.size} onChange={e => edit({ size: Number(e.target.value) })}>{[12, 13, 14, 16, 18, 20, 22].map(n => <option key={n} value={n}>{n} px</option>)}</select></Field>
      </div>
      <Field label="字间距"><input type="range" min={0} max={4} step={0.5} value={draft.spacing} onChange={e => edit({ spacing: Number(e.target.value) })}/></Field>
      <div className="row message-toggles"><label className="check"><input type="checkbox" checked={draft.overview} onChange={e => edit({ overview: e.target.checked })}/>概览显示</label><label className="check"><input type="checkbox" checked={draft.widget} onChange={e => edit({ widget: e.target.checked })}/>悬浮窗显示</label></div>
      {draft.text.trim() && <div className="message-preview" aria-label="寄语预览"><p style={messageStyle(draft)}>{draft.text}</p></div>}
      <small className="muted">长寄语在悬浮窗显示一行，悬停可查看全文。</small>
      <footer><button type="button" data-dismiss onClick={() => setOpen(false)}>取消</button><button className="primary" disabled={busy || !dirty}>保存寄语</button></footer>
    </form>
    </Modal>}
  </section>;
}
