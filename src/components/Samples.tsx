import { useRef, useState } from "react";
import { BookOpen, Trash2 } from "lucide-react";
import { useData } from "../state";
import { createSampleData, loadSamples, removeSamples, retainSample, sampleInventory } from "../samples";
import { Navigate } from "../navigation";
import { Modal } from "./Common";
import { PrivacyInfo } from "./PrivacyInfo";

function useSampleLoader(navigate?: Navigate) {
  const { data, mutate, notify } = useData();
  const lock = useRef(false);
  const [loading, setLoading] = useState(false);
  async function load() {
    if (lock.current) return;
    lock.current = true; setLoading(true);
    try {
      const prepared = createSampleData();
      let count = 0;
      const wasEmpty = !data!.projects.length;
      if (await mutate(d => { count = loadSamples(d, prepared); })) {
        notify(count ? `已加载 ${count} 个演示项目，可打开项目查看完整工作阶段和具体行动。` : "示例已存在，保留了你的编辑内容。无需重复加载。");
        // Keep the overview visible: the current stage and next action now explain themselves.
        if (wasEmpty && navigate) navigate("overview");
      }
    } catch (e) { notify(`无法加载示例：${String(e)}。现有项目已保留。`); }
    finally { lock.current = false; setLoading(false); }
  }
  return { loading, load };
}
export function Welcome({ navigate, onCreate }: { navigate: Navigate; onCreate: () => void }) {
  const { busy, mutate, notify } = useData();
  const { loading, load } = useSampleLoader(navigate);
  const [privacy, setPrivacy] = useState(false);
  const skipLock = useRef(false);
  async function skip() {
    if (skipLock.current) return;
    skipLock.current = true;
    try {
      if (await mutate(d => { d.settings.onboarding = "skipped"; }))
        notify("已从空白开始。以后可在设置中体验示例项目。");
    } finally { skipLock.current = false; }
  }
  return <section className="welcome-start" aria-label="首次使用">
    <div className="welcome-intro">
      <BookOpen size={26} strokeWidth={1.4} aria-hidden="true" />
      <h1>欢迎使用 ResearchFlow</h1>
      <p className="welcome-description">科研项目 → 工作阶段 → 具体行动</p>
      <div className="welcome-actions">
        <button className="primary" disabled={busy || loading} onClick={() => void load()}>{loading ? "正在保存示例…" : "体验示例科研项目"}</button>
        <button disabled={busy || loading} onClick={onCreate}>创建我的第一个科研项目</button>
      </div>
      <div className="welcome-secondary"><small>示例仅用于体验，可在设置中管理或移除。</small><button className="text-button" disabled={busy || loading} onClick={() => void skip()}>暂时跳过</button></div>
    </div>
    <div className="welcome-trust" aria-label="本地使用方式">
      <div><strong>本地保存</strong></div>
      <div><strong>离线可用</strong></div>
      <div><strong>无需登录</strong></div>
    </div>
    <button className="text-button welcome-privacy" onClick={() => setPrivacy(true)}>隐私详情</button>
    {privacy && <PrivacyInfo onClose={() => setPrivacy(false)} onSettings={section => navigate({page:"settings",settingsSection:section})} />}
  </section>;
}

function RemoveSamples({ onClose }: { onClose: () => void }) {
  const { data, mutate, busy, notify } = useData();
  const [preview] = useState(() => sampleInventory(data!));
  const rows = preview.filter(x => data!.projects.some(p => p.id === x.project.id && p.demo));
  const [selected, setSelected] = useState<string[]>(() => preview.filter(x => !x.modified).map(x => x.project.id));
  const [acknowledged, setAcknowledged] = useState(false);
  const targets = rows.filter(x => selected.includes(x.project.id));
  const modified = targets.some(x => x.modified);
  return <Modal title="移除示例项目" onClose={onClose} trackChanges={false}>
    <p className="modal-note">只移除下面勾选的演示项目及其阶段、行动、计划、成果、重启卡和专注记录。未勾选的子项目会保留并解除所属关系；其他项目与外观设置保持原样，以后可重新加载已移除的示例。</p>
    <div className="sample-removal-list">
      {rows.map(x => <div className="sample-removal-row" key={x.project.id}>
        <label className="sample-choice"><input type="checkbox" checked={selected.includes(x.project.id)} disabled={busy}
          onChange={e => { const value = e.target.checked; setAcknowledged(false); setSelected(s => value ? [...s,x.project.id] : s.filter(id => id !== x.project.id)); }} />
          <span><strong>{x.project.name}</strong><small>{x.stages} 个阶段，{x.tasks} 项行动，{x.results} 张成果卡，{x.sessions} 次专注{x.children ? `，${x.children} 个子项目将保留并解除关系` : ""}</small>
            <span className={x.modified ? "sample-modified" : "muted"}>{x.modified ? "已编辑或含新增内容，默认保留" : "尚未修改"}</span></span>
        </label>
        <button className="text-button" disabled={busy} onClick={async () => {
          if (await mutate(d => retainSample(d,x.project.id))) { setSelected(s => s.filter(id => id !== x.project.id)); notify("已保留为普通项目，全部内容原样保留。"); }
        }}>保留为普通项目</button>
      </div>)}
      {!rows.length && <p>所有示例已保留为普通项目。</p>}
    </div>
    {modified && <label className="sample-ack"><input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} />我已了解：勾选项目中自己修改或新增的内容也会删除。</label>}
    <p className="muted">保留为普通项目会解除演示标记并保留全部关联内容；相同来源的示例不会再次生成。移除前会保存本地安全副本。</p>
    <footer><button onClick={onClose}>取消</button><button className="danger" disabled={busy || !targets.length || (modified && !acknowledged)} onClick={async () => {
      if (await mutate(d => removeSamples(d,targets.map(x => ({id:x.project.id,fingerprint:x.fingerprint}))), {backupBeforeWrite:true})) {
        notify(`已移除 ${targets.length} 个示例项目，其余项目已保留。`); onClose();
      }
    }}>确认移除 {targets.length} 个项目</button></footer>
  </Modal>;
}
export function SampleManager() {
  const { data, busy } = useData();
  const { loading, load } = useSampleLoader();
  const [remove, setRemove] = useState(false);
  const samples = sampleInventory(data!);
  const keys = new Set(data!.projects.map(p => p.sampleKey).filter(Boolean));
  const missing = 3 - keys.size;
  return <section className="settings-section sample-manager">
    <h3>示例科研项目</h3>
    <p>论文研究 · 早期探索 · 大纲修订</p>
    <div className="row">
      <button disabled={busy || loading || missing === 0} onClick={() => void load()}><BookOpen size={16} aria-hidden="true" />{loading ? "正在保存示例…" : keys.size ? "补齐缺失示例" : "加载示例项目"}</button>
      <button className="danger-text" disabled={busy || !samples.length} onClick={() => setRemove(true)}><Trash2 size={15} aria-hidden="true" />移除示例项目</button>
    </div>
    <small className="muted">{samples.length ? `当前有 ${samples.length} 个演示项目；已修改的示例不会被重新加载覆盖。` : "尚无演示项目，可随时主动加载。"}{keys.size > samples.length && " 已保留为普通项目的示例不会重复生成。"}</small>
    {remove && <RemoveSamples onClose={() => setRemove(false)} />}
  </section>;
}
