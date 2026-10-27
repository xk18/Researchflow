import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Expand, Lightbulb, Minus, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { useData } from "../state";
import { recommend } from "../domain";
import { desktop, native } from "../services/native";
import { Mark } from "./Common";
import { MotivationPicker } from "../pages/Overview";
import { ActionCard } from "./ActionCard";
import { IdeaEditor, ProjectEditor, TaskEditor } from "./Editors";
import { Restart } from "../pages/Projects";
import { cycleFocusProject, focusProjectOptions, focusedProject } from "../planning";
import { needsWelcome } from "../samples";
import { projectPath } from '../projectRelations';
import { useToday } from '../dates';
import { Message } from './Message';
export function Widget() {
  const { data, mutate, notify } = useData();
  const [mini, setMini] = useState(
      new URLSearchParams(location.search).get("mini") === "1",
    ),
    [editor, setEditor] = useState<"idea" | "task" | "project" | null>(null),
    [restart, setRestart] = useState(false);
  const paused = data!.projects.find((p) => p.status === "paused");
  const task = recommend(data!);
  const today = useToday();
  const focusOptions = focusProjectOptions(data!,today);
  const selectedProjectId = focusedProject(data!,today)?.id || "";
  const sessionProject = data!.timer ? data!.projects.find(p => p.id === data!.tasks.find(t => t.id === data!.timer?.taskId)?.projectId) : undefined;
  const welcome = needsWelcome(data!);
  const openedWelcome = useRef(false);
  useEffect(() => {
    if (!native || !welcome || openedWelcome.current) return;
    openedWelcome.current = true;
    void desktop("manager_show", {page:"overview"})
      .catch(e => notify(`无法打开欢迎页：${String(e)}。可点击“开始使用”重试。`));
  }, [welcome, notify]);
  useEffect(() => {
    let mounted = true;
    if (native)
      void desktop("widget_is_mini")
        .then(async (v) => {
          if (!mounted) return;
          const value = Boolean(v);
          setMini(value);
          // Apply once the WebView is ready: Windows may constrain an early startup resize.
          await desktop("widget_mode", { mini: value });
        })
        .catch((e) => notify(`无法恢复组件尺寸：${String(e)}`));
    document.body.classList.add("widget-body");
    // Windows supplies the rounded frame when native shadows are enabled.
    // Painting a second CSS outline produces mismatched corners on the desktop.
    const windowsFrame = native && navigator.userAgent.includes("Windows");
    if (windowsFrame) document.body.classList.add("widget-native-frame");
    return () => {
      mounted = false;
      document.body.classList.remove("widget-body");
      document.body.classList.remove("widget-native-frame");
    };
  }, []);
  async function resize(value: boolean) {
    try {
      await desktop("widget_mode", { mini: value });
      setMini(value);
    } catch (e) {
      notify(`无法调整组件尺寸：${String(e)}`);
    }
  }
  function manage(page = "focus") {
    if (native) void desktop("manager_show", { page }).catch(e => notify(`无法打开管理面板：${String(e)}`));
    else location.href = `/?page=${page}`;
  }
  return mini ? (
    <div className="capsule">
      <button
        className="capsule-expand"
        aria-label="展开科研卡片"
        onClick={() => void resize(false)}
      >
        <Mark />
        <span>科研续航</span>
      </button>
      <button
        className="capsule-drag"
        aria-label="拖动组件"
        onPointerDown={(e) => {
          if (e.button === 0) void desktop("drag_window");
        }}
        title="拖动"
      >
        <span>⠿</span>
      </button>
    </div>
  ) : (
    <div className="widget">
      <header className="widget-header">
        <div
          className="widget-brand"
          data-tauri-drag-region
          onPointerDown={(e) => {
            if (e.button === 0 && e.target === e.currentTarget)
              void desktop("drag_window");
          }}
        >
          <Mark />
          <span>ResearchFlow</span>
        </div>
        <button
          className="icon"
          aria-label="收起为胶囊"
          onClick={() => void resize(true)}
        >
          <Minus aria-hidden="true" size={15} />
        </button>
        <button
          className="icon"
          aria-label="隐藏到托盘"
          onClick={() => void desktop("hide_widget")}
        >
          <X aria-hidden="true" size={15} />
        </button>
      </header>
      <div className="widget-content">
        {focusOptions.length > 0 && (
          <div className="widget-project-switcher">
          <button className="icon" disabled={focusOptions.length < 2} aria-label="上一个科研项目" title="上一个项目" onClick={() => { const p = cycleFocusProject(data!,-1); if (p) void mutate(d => { d.settings.focusProjectId = p.id; }); }}><ChevronLeft size={16}/></button>
          <select
            className="widget-focus-select"
            aria-label="切换当前科研项目"
            title={focusOptions.find(p => p.id === selectedProjectId) ? projectPath(data!,focusOptions.find(p => p.id === selectedProjectId)!) : undefined}
            value={selectedProjectId}
            onChange={(e) => {
              const id = e.target.value;
              void mutate((d) => {
                d.settings.focusProjectId = id;
              });
            }}
          >
            {focusOptions.map((p) => (
                <option value={p.id} key={p.id}>
                  {projectPath(data!,p)}
                </option>
              ))}
          </select>
          <button className="icon" disabled={focusOptions.length < 2} aria-label="下一个科研项目" title="下一个项目" onClick={() => { const p = cycleFocusProject(data!,1); if (p) void mutate(d => { d.settings.focusProjectId = p.id; }); }}><ChevronRight size={16}/></button>
          </div>
        )}
        {sessionProject && sessionProject.id !== selectedProjectId && <p className="widget-session-project" title={sessionProject.name}>{data!.timer?.needsRecovery ? "待恢复" : data!.timer?.running ? "专注中" : "已暂停"} · {sessionProject.name}</p>}
        {welcome ? <div className="widget-welcome">
          <h2>ResearchFlow</h2>
          <button className="primary" onClick={() => manage("overview")}>开始使用</button>
        </div> : <ActionCard
          task={task}
          compact
          onAdd={() =>
            setEditor(
              data!.projects.some((p) => p.status === "active")
                ? "task"
                : "project",
            )
          }
        />}
      </div>
      <Message place="widget"/>
      <footer className="widget-footer">
        <details className="widget-state">
          <summary title="调整当前科研动力" aria-label="调整当前科研动力">
            <SlidersHorizontal size={16} aria-hidden="true"/>
          </summary>
          <div className="state-popover">
            <MotivationPicker />
          </div>
        </details>
        <div className="widget-utilities">
          <button
            className="icon"
            aria-label="项目重启"
            title="项目重启"
            onClick={() => (paused ? setRestart(true) : manage("restart"))}
          >
            <RotateCcw size={14} aria-hidden="true" />
          </button>
          <button
            className="icon"
            aria-label="记录灵感"
            title="记录灵感"
            onClick={() => setEditor("idea")}
          >
            <Lightbulb size={14} aria-hidden="true" />
          </button>
          <button className="icon" aria-label="管理面板" title="管理面板" onClick={() => manage()}>
            <Expand aria-hidden="true" size={13} />
          </button>
        </div>
      </footer>
      {editor === "idea" && <IdeaEditor onClose={() => setEditor(null)} />}
      {editor === "project" && (
        <ProjectEditor onClose={() => setEditor(null)} />
      )}
      {editor === "task" && <TaskEditor onClose={() => setEditor(null)} />}
      {restart && paused && (
        <Restart project={paused} onClose={() => setRestart(false)} />
      )}
    </div>
  );
}
