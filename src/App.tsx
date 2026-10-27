import { useEffect, useLayoutEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  BookOpen,
  LayoutGrid,
  Lightbulb,
  LineChart,
  Settings as SettingsIcon,
  SquareArrowOutUpRight,
  Layers3,
  CalendarDays,
  Zap,
  Minus,
  X,
  HardDrive,
  ListTodo,
} from "lucide-react";
import { useData } from "./state";
import { desktop, native } from "./services/native";
import { Feedback, Mark } from "./components/Common";
import { Widget } from "./components/Widget";
import { Overview } from "./pages/Overview";
import { Projects } from "./pages/Projects";
import { Results } from "./pages/Results";
import { Ideas } from "./pages/Ideas";
import { Todos } from "./pages/Todos";
import { Review } from "./pages/Review";
import { Settings } from "./pages/Settings";
import { Planning } from "./pages/Planning";
import { Focus } from "./pages/Focus";
import { NavigationTarget } from "./navigation";
import { needsWelcome } from "./samples";
export function App() {
  const { data, error, reload } = useData();
  const [page, setPage] = useState(
    new URLSearchParams(location.search).get("page") || "overview",
  );
  const [projectTarget, setProjectTarget] = useState(
    new URLSearchParams(location.search).get("projectId") || "",
  );
  const widget = new URLSearchParams(location.search).get("view") === "widget";
  useLayoutEffect(() => {
    document.documentElement.style.fontSize = `${data?.settings.fontSize || 14}px`;
  }, [data?.settings.fontSize]);
  const [target, setTarget] = useState<NavigationTarget>(() => ({page,
    milestoneId: new URLSearchParams(location.search).get("milestoneId") || undefined,
    planningDate: new URLSearchParams(location.search).get("planningDate") || undefined,
    planningView: new URLSearchParams(location.search).get("planningView") === "timeline" ? "timeline" : undefined,
    projectStatus: ["active","paused","completed","archived","terminated","all"].includes(new URLSearchParams(location.search).get("projectStatus") || "") ? new URLSearchParams(location.search).get("projectStatus") as NavigationTarget["projectStatus"] : undefined,
    settingsSection: ["data-location", "backup-settings"].includes(new URLSearchParams(location.search).get("settingsSection") || "")
      ? new URLSearchParams(location.search).get("settingsSection") as NavigationTarget["settingsSection"] : undefined,
  }));
  function navigate(next: string | NavigationTarget) {
    const context: NavigationTarget = typeof next === "string" ? {page:next.split(":")[0], projectId:next.split(":")[1]} : next;
    const id = context.page, pid = context.projectId;
    setTarget(context);
    setPage(id);
    setProjectTarget(pid || "");
    const url = new URL(location.href);
    url.searchParams.set("page", id);
    if (pid) url.searchParams.set("projectId", pid);
    else url.searchParams.delete("projectId");
    for (const key of ["milestoneId", "planningDate", "planningView", "settingsSection", "projectStatus"] as const) {
      if (context[key]) url.searchParams.set(key, context[key]);
      else url.searchParams.delete(key);
    }
    history.replaceState(null, "", url);
  }
  useEffect(() => {
    document.getElementById("main")?.scrollTo(0, 0);
  }, [page]);
  useEffect(() => {
    if (data && !widget && page === "focus" && needsWelcome(data)) navigate("overview");
    // Run only at the first successful load, so later navigation remains freely selectable.
  }, [!!data]);
  useEffect(() => {
    if (!native || widget) return;
    let clean: undefined | (() => void);
    void listen<string>("navigate", (event) => navigate(event.payload)).then(
      (u) => (clean = u),
    );
    return () => clean?.();
  }, []);
  useEffect(() => {
    if (!data) return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      const dark =
        data?.settings.theme === "dark" ||
        (data?.settings.theme === "system" && mq.matches);
      document.documentElement.dataset.theme = dark ? "dark" : "light";
      document
        .querySelector("meta[name=theme-color]")
        ?.setAttribute("content", dark ? "#1d2322" : "#faf9f6");
    };
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [data?.settings.theme]);
  if (!data)
    return (
      <div className="startup">
        <Mark />
        <h1>ResearchFlow</h1>
        <p>{error || "正在打开你的科研记录…"}</p>
        {error && <button onClick={() => void reload()}>重新读取</button>}
      </div>
    );
  if (widget)
    return (
      <>
        <Widget />
        <Feedback />
      </>
    );
  const primaryNavigation = [
    ["overview", "概览", LayoutGrid],
    ["plan", "科研规划", CalendarDays],
    ["focus", "行动视角", Zap],
    ["projects", "科研项目", BookOpen],
  ] as const;
  const recordNavigation = [["todos","待办",ListTodo],["results","成果卡",Layers3],["ideas","灵感池",Lightbulb],["review","状态回顾",LineChart]] as const;
  const pageNames: Record<string,string> = {tracks:"科研项目 · 问题探索",deliver:"科研项目 · 成果产出",restart:"科研项目 · 已暂停",results:"成果卡",ideas:"灵感池",review:"状态回顾",settings:"设置"};
  const projectPage = ["projects","tracks","deliver","restart"].includes(page);
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        跳到主要内容
      </a>
      <aside className="sidebar">
        <div className="brand">
          <Mark />
          <div>
            <strong>ResearchFlow</strong>
            <span>科研续航</span>
          </div>
        </div>
        <nav aria-label="主导航">
          {primaryNavigation.map(([id, label, Icon]) => (
            <div key={id} className="nav-item">
              <button
                title={label}
                className={(id === "projects" ? projectPage : page === id) ? "active" : ""}
                aria-current={(id === "projects" ? projectPage : page === id) ? "page" : undefined}
                onClick={() => navigate(id)}
              >
                <Icon aria-hidden="true" size={18} strokeWidth={1.5} />
                {label}
              </button>
            </div>
          ))}
          <details className="nav-records" open={["todos","results","ideas","review"].includes(page)}>
            <summary className="nav-group">研究记录</summary>
            {recordNavigation.map(([id,label,Icon]) => <button key={id} title={label} className={page === id ? "active" : ""} aria-current={page === id ? "page" : undefined} onClick={() => navigate(id)}><Icon aria-hidden="true" size={16} strokeWidth={1.5}/>{label}</button>)}
          </details>
          <div className="nav-settings">
            <button title="设置" className={page === "settings" ? "active" : ""} aria-current={page === "settings" ? "page" : undefined} onClick={() => navigate("settings")}><SettingsIcon aria-hidden="true" size={16} strokeWidth={1.5}/>设置</button>
          </div>
        </nav>
        <div className="sidebar-bottom">
          <button
            onClick={() =>
              native
                ? void desktop("widget_show")
                : location.assign("/?view=widget")
            }
          >
            <SquareArrowOutUpRight aria-hidden="true" size={14} />
            悬浮组件
          </button>
          <small title="数据保存在本机">
            <HardDrive size={13} aria-hidden="true"/> 本地
          </small>
        </div>
      </aside>
      <div className="main-shell">
        <div
          className="titlebar"
          data-tauri-drag-region
          onPointerDown={(e) => {
            if (native && e.button === 0 && e.target === e.currentTarget)
              void desktop("drag_window");
          }}
        >
          <span className="titlebar-label">
            工作台 <span>/</span>{" "}
            {primaryNavigation.find(([id]) => id === page)?.[1] || recordNavigation.find(([id]) => id === page)?.[1] || pageNames[page] || "科研项目"}
          </span>
          {native && (
            <div>
              <button
                className="icon"
                aria-label="最小化管理窗口"
                onClick={() => void desktop("minimize_window")}
              >
                <Minus aria-hidden="true" size={15} />
              </button>
              <button
                className="icon"
                aria-label="关闭并隐藏管理面板"
                onClick={() => void desktop("hide_manager")}
              >
                <X aria-hidden="true" size={15} />
              </button>
            </div>
          )}
        </div>
        <main id="main" tabIndex={-1} className={page === "overview" ? "overview-main" : page === "plan" ? "planning-main" : undefined}>
          {page === "overview" ? (
            <Overview navigate={navigate} />
          ) : page === "plan" ? (
            <Planning key={target.planningDate} navigate={navigate} initialDate={target.planningDate} initialView={target.planningView} />
          ) : page === "focus" ? (
            <Focus navigate={navigate} />
          ) : page === "projects" ? (
            <Projects
              key={`${projectTarget}:${target.milestoneId || ""}:${target.projectStatus || ""}`}
              initialProjectId={projectTarget || undefined}
              initialMilestoneId={target.milestoneId}
              initialStatus={target.projectStatus}
            />
          ) : page === "restart" ? (
            <Projects restartOnly initialStatus="paused" />
          ) : page === "tracks" ? (
            <Projects trackFilter="explore" />
          ) : page === "deliver" ? (
            <Projects trackFilter="deliver" />
          ) : page === "results" ? (
            <Results />
          ) : page === "ideas" ? (
            <Ideas />
          ) : page === "todos" ? (
            <Todos />
          ) : page === "review" ? (
            <Review />
          ) : (
            <Settings key={target.settingsSection} initialSection={target.settingsSection} />
          )}
        </main>
        <div className="main-footer">
          <span>科研续航</span>
          <span className="footer-credit">本地科研工作台<span>由雪冠制作</span></span>
        </div>
      </div>
      <Feedback />
    </div>
  );
}
