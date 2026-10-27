import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Upload, Moon, Sun, Monitor, ALargeSmall } from "lucide-react";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { AppData } from "../types";
import { useData } from "../state";
import { Modal } from "../components/Common";
import { SampleManager } from "../components/Samples";
import { desktop, download, loadImportBackup, loadUpgradeBackup, native } from "../services/native";
import { mergeBackup, parseBackup } from "../domain";
import { focusClock, pauseFocus } from "../focus";
import { PrivacyInfo } from "../components/PrivacyInfo";
import { NavigationTarget } from "../navigation";
import { MessageEditor } from '../components/Message';
import { APP_VERSION } from '../version';
export function Settings({ initialSection }: { initialSection?: NavigationTarget["settingsSection"] }) {
  const { data, mutate, notify } = useData();
  const [autostart, setAutostart] = useState(false),
    [autoBusy, setAutoBusy] = useState(false),
    [imported, setImported] = useState<AppData | null>(null),
    [importError, setImportError] = useState(""),
    [importBackupAvailable, setImportBackupAvailable] = useState(false),
    [upgradeBackupAvailable, setUpgradeBackupAvailable] = useState(false),
    [dataPath, setDataPath] = useState(native ? "" : "浏览器预览数据（localStorage）"),
    [pathError, setPathError] = useState(""),
    [pathBusy, setPathBusy] = useState(native),
    [privacy, setPrivacy] = useState(false),
    [sectionRequest, setSectionRequest] = useState({ section: initialSection, sequence: 0 });
  const input = useRef<HTMLInputElement>(null);
  const readDataPath = useCallback(async () => {
    setPathBusy(true); setPathError("");
    try {
      const path = await desktop("data_path");
      if (typeof path !== "string" || !path) throw Error("数据位置未返回");
      setDataPath(path);
    } catch (e) { setPathError(`无法读取数据位置，请重试。此操作不会修改科研记录。${String(e)}`); }
    finally { setPathBusy(false); }
  }, []);
  useEffect(() => {
    if (privacy || !sectionRequest.section) return;
    const frame = requestAnimationFrame(() => {
      const element = document.getElementById(sectionRequest.section!);
      element?.scrollIntoView({ block: "center" });
      element?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [sectionRequest, privacy]);
  useEffect(() => {
    void loadImportBackup().then((saved) => setImportBackupAvailable(!!saved)).catch(() => setImportBackupAvailable(false));
    void loadUpgradeBackup().then(saved => setUpgradeBackupAvailable(!!saved)).catch(e => setImportError(`升级前副本读取失败：${String(e)}`));
    if (native) {
      void isEnabled()
        .then(setAutostart)
        .catch((e) => notify(`无法读取自启动设置：${String(e)}`));
      void readDataPath();
    }
  }, [notify, readDataPath]);
  async function backup() {
    try {
      if (
        await download(
          `ResearchFlow-备份-${new Date().toISOString().slice(0, 10)}.json`,
          JSON.stringify(data, null, 2),
        )
      )
        notify("JSON 备份已导出");
    } catch (e) {
      notify(`导出失败：${String(e)}`);
    }
  }
  function validate(text: string) {
    try {
      setImported(parseBackup(text));
      setImportError("");
    } catch (e) {
      setImportError(String(e));
    }
  }
  async function importBackup() {
    try {
      if (native) {
        const text = await desktop("import_file");
        if (typeof text === "string") validate(text);
      } else input.current?.click();
    } catch (e) {
      setImportError(String(e));
    }
  }
  async function restore(merge: boolean) {
    if (!imported) return;
    try {
      const checked = parseBackup(JSON.stringify(imported));
      const clock = await focusClock();
      if (
        await mutate((d) => {
          if (merge && d.timer) pauseFocus(d, clock);
          const next = merge
            ? mergeBackup(d, checked)
            : structuredClone(checked);
          next.revision = d.revision;
          next.settings = d.settings;
          next.settings.onboarding = "completed";
          if (
            next.settings.focusProjectId &&
            !next.projects.some((p) => p.id === next.settings.focusProjectId)
          )
            delete next.settings.focusProjectId;
          next.timer = null;
          next.focusSessions.forEach((s) => {
            if (s.status === "running") s.status = "interrupted";
          });
          next.tasks.forEach((t) => {
            if (t.status === "running") t.status = "paused";
          });
          Object.assign(d, next);
        }, { backupBeforeWrite: true })
      ) {
        setImported(null);
        notify("数据已恢复。窗口偏好保持当前设置。");
      }
    } catch (e) {
      setImportError(String(e));
    }
  }
  async function restoreImportBackup() {
    try {
      const saved = await loadImportBackup();
      if (!saved) { setImportError("未找到导入前副本。"); setImportBackupAvailable(false); return; }
      setImported(saved);
      setImportError("");
    } catch (cause) { setImportError(`导入前副本无法读取：${String(cause)}`); }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>设置</h1>
        </div>
      </div>
      <section className="settings-section">
        <h3>外观</h3>
        <div className="theme-options" role="group" aria-label="应用主题">
          {(
            [
              ["light", "浅色", Sun],
              ["dark", "深色", Moon],
              ["system", "跟随系统", Monitor],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              aria-pressed={data!.settings.theme === key}
              className={data!.settings.theme === key ? "selected" : ""}
              onClick={() =>
                void mutate((d) => {
                  d.settings.theme = key;
                })
              }
            >
              <Icon aria-hidden="true" size={19} />
              {label}
            </button>
          ))}
        </div>
        <div className="font-size-setting">
          <label htmlFor="app-font-size"><ALargeSmall size={19} aria-hidden="true"/>字号 <span className="font-size-value">{data!.settings.fontSize || 14}</span></label>
          <input id="app-font-size" aria-label="全局字号" type="range" min={12} max={18} step={1} value={data!.settings.fontSize || 14}
            onChange={e => { const value = Number(e.currentTarget.value); void mutate(d => { d.settings.fontSize = value; }); }}/>
          <button className="text-button" onClick={() => void mutate(d => { delete d.settings.fontSize; })}>默认</button>
        </div>
      </section>
      <MessageEditor/>
      <SampleManager />
      <section className="settings-section privacy-settings">
        <h3>隐私与数据安全</h3>
        
        <button onClick={() => setPrivacy(true)}>隐私详情</button>
      </section>
      <section className="settings-section">
        <h3>桌面习惯</h3>
        <label className="setting-row">
          <span>
            <strong>悬浮组件始终置顶</strong>
            <small></small>
          </span>
          <input
            type="checkbox"
            checked={data!.settings.alwaysOnTop}
            onChange={async (e) => {
              const value = e.target.checked;
              try {
                await desktop("set_top", { value });
                if (
                  !(await mutate((d) => {
                    d.settings.alwaysOnTop = value;
                  }))
                )
                  await desktop("set_top", { value: !value });
              } catch (err) {
                notify(`置顶设置失败：${String(err)}`);
              }
            }}
          />
        </label>
        <label className="setting-row">
          <span>
            <strong>开机启动</strong>
            <small>
              {native
                ? "登录 Windows 后显示悬浮组件。"
                : "请在桌面应用中设置。"}
            </small>
          </span>
          <input
            type="checkbox"
            checked={autostart}
            disabled={!native || autoBusy}
            onChange={async (e) => {
              setAutoBusy(true);
              try {
                if (e.target.checked) await enable();
                else await disable();
                setAutostart(await isEnabled());
                notify("开机启动设置已更新");
              } catch (err) {
                notify(`设置失败：${String(err)}`);
              } finally {
                setAutoBusy(false);
              }
            }}
          />
        </label>
        <div className="row">
          <button
            disabled={!native}
            onClick={() => void desktop("widget_show")}
          >
            显示悬浮组件
          </button>
          <button disabled={!native} onClick={() => void desktop("hide_all")}>
            隐藏到托盘
          </button>
          <button disabled={!native} onClick={() => void desktop("quit_app")}>
            完全退出
          </button>
        </div>
      </section>
      <section className="settings-section" id="backup-settings" tabIndex={-1} aria-label="备份与恢复">
        <h3>备份与恢复</h3>
        
        <div className="row">
          <button onClick={() => void backup()}>
            <Download aria-hidden="true" size={16} />
            导出 JSON
          </button>
          <button onClick={() => void importBackup()}>
            <Upload aria-hidden="true" size={16} />从 JSON 恢复
          </button>
          <button disabled={!importBackupAvailable} onClick={() => void restoreImportBackup()}>
            恢复导入前副本
          </button>
        </div>
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) {
              if (f.size > 20_000_000) setImportError("备份超过20 MB。");
              else validate(await f.text());
            }
            e.target.value = "";
          }}
        />
        {importError && (
          <p className="inline-error" role="alert">
            {importError}
          </p>
        )}
        <div className="data-location" id="data-location" tabIndex={-1} aria-label="本地数据位置">
          <span>本地数据位置</span>
          {pathBusy ? <p>正在读取本地数据位置…</p> : pathError ? <>
            <p className="inline-error" role="alert">{pathError}</p>
            <button onClick={() => void readDataPath()}>重新读取</button>
          </> : <code>{dataPath}</code>}
        </div>
        <details className="settings-help"><summary>恢复说明</summary><p className="muted">恢复或移除示例前保留本地副本。合并按ID去重，保留较新记录；覆盖恢复替换当前科研记录，并再次备份当前状态。</p></details>
      </section>
      <section className="settings-section">
        <h3>升级数据保护</h3>
        <p className="muted">沿用原有记录，升级前自动保存副本。</p>
        <button disabled={!upgradeBackupAvailable} onClick={async () => {
          try { const saved = await loadUpgradeBackup(); if (saved) { setImported(saved); setImportError(''); } else setImportError('未找到当前版本的升级前副本。'); }
          catch (e) { setImportError(`升级前副本读取失败：${String(e)}`); }
        }}>查看升级前副本</button>
        <small className="muted">{upgradeBackupAvailable ? '副本在本机 backups 目录，可预览后合并或恢复。' : '全新安装不需要旧版副本。'}</small>
      </section>
      <section className="settings-section about">
        <h3>
          ResearchFlow <span>科研续航</span>
        </h3>
        
        <small>版本 {APP_VERSION} · 由雪冠制作</small>
      </section>
      {privacy && <PrivacyInfo onClose={() => setPrivacy(false)} onSettings={section => {
        setPrivacy(false); setSectionRequest(previous => ({section,sequence:previous.sequence + 1}));
      }} />}
      {imported && (
        <Modal title="恢复这份备份" onClose={() => setImported(null)}>
          <p className="modal-note">
            包含 {imported.projects.length} 个项目、{imported.tasks.length}{" "}
            个行动、{imported.results.length} 张成果卡、{imported.ideas.length}{" "}
            条灵感。
          </p>
          <p>
            合并会按ID去重；覆盖会替换当前全部科研记录。当前外观与窗口设置保持不变。
          </p>
          <footer>
            <button onClick={() => setImported(null)}>取消</button>
            <button className="danger" onClick={() => void restore(false)}>
              覆盖恢复
            </button>
            <button className="primary" onClick={() => void restore(true)}>
              合并恢复
            </button>
          </footer>
        </Modal>
      )}

    </>
  );
}

