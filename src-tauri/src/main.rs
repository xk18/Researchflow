#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod storage;
use serde_json::{json, Value};
use std::{fs, path::PathBuf, sync::Mutex};
use storage::{Database, MAX_BYTES};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_store::StoreExt;
use tauri_plugin_window_state::{AppHandleExt, StateFlags};
struct FocusClock {
    token: String,
}
#[cfg(windows)]
#[link(name = "kernel32")]
extern "system" {
    fn QueryUnbiasedInterruptTime(unbiased_time: *mut u64) -> i32;
}
fn focus_tick() -> f64 {
    #[cfg(windows)]
    {
        let mut tick = 0u64;
        unsafe {
            QueryUnbiasedInterruptTime(&mut tick);
        }
        tick as f64 / 10000.0
    }
    #[cfg(not(windows))]
    {
        use std::sync::OnceLock;
        use std::time::Instant;
        static START: OnceLock<Instant> = OnceLock::new();
        START.get_or_init(Instant::now).elapsed().as_secs_f64() * 1000.0
    }
}
#[tauri::command]
fn focus_clock(clock: State<FocusClock>) -> Value {
    json!({"token":clock.token,"tick":focus_tick()})
}

#[tauri::command]
fn load_data(db: State<Database>) -> Result<Option<Value>, String> {
    let _lock = db.gate.lock().map_err(|_| "存储锁不可用")?;
    storage::prepare_upgrade(&db.path, env!("CARGO_PKG_VERSION"))?;
    storage::read(&db.path)
}
#[tauri::command]
fn save_data(
    app: tauri::AppHandle,
    db: State<Database>,
    data: Value,
    expected: u64,
    backup_before_write: Option<bool>,
) -> Result<Value, String> {
    let next = if backup_before_write.unwrap_or(false) {
        storage::commit_with_import_backup(&db, data, expected)?
    } else {
        storage::commit(&db, data, expected)?
    };
    let _ = app.emit("data-changed", next["revision"].clone());
    Ok(next)
}
#[tauri::command]
fn data_path(db: State<Database>) -> String {
    db.path.to_string_lossy().into_owned()
}
#[tauri::command]
fn desktop_state(app: tauri::AppHandle) -> Result<Value, String> {
    let mut result = json!({"trayExists":app.tray_by_id("researchflow-tray").is_some()});
    for label in ["widget", "manager"] {
        let Some(w) = app.get_webview_window(label) else {
            result[label] = json!({"created":false,"visible":false});
            continue;
        };
        let pos = w.outer_position().map_err(|e| e.to_string())?;
        let size = w.inner_size().map_err(|e| e.to_string())?;
        result[label] = json!({"visible":w.is_visible().map_err(|e|e.to_string())?,"alwaysOnTop":w.is_always_on_top().map_err(|e|e.to_string())?,"x":pos.x,"y":pos.y,"width":size.width,"height":size.height,"scaleFactor":w.scale_factor().map_err(|e|e.to_string())?});
    }
    Ok(result)
}
#[tauri::command]
fn safety_backup(db: State<Database>) -> Result<(), String> {
    let _lock = db.gate.lock().map_err(|_| "存储锁不可用")?;
    if let Some(data) = storage::read(&db.path)? {
        storage::atomic_write(
            &db.path.with_extension("before-import.json"),
            &serde_json::to_vec_pretty(&data).map_err(|e| e.to_string())?,
        )?;
    }
    Ok(())
}
#[tauri::command]
fn load_import_backup(db: State<Database>) -> Result<Option<String>, String> {
    let _lock = db.gate.lock().map_err(|_| "存储锁不可用")?;
    let path = db.path.with_extension("before-import.json");
    if !path.exists() {
        return Ok(None);
    }
    let data = storage::read(&path)?.ok_or("导入前副本不存在")?;
    serde_json::to_string(&data)
        .map(Some)
        .map_err(|e| e.to_string())
}
#[tauri::command]
fn load_upgrade_backup(db: State<Database>) -> Result<Option<String>, String> {
    let _lock = db.gate.lock().map_err(|_| "存储锁不可用")?;
    let path = storage::upgrade_backup_path(&db.path, env!("CARGO_PKG_VERSION"));
    let Some(data) = storage::read(&path)? else { return Ok(None); };
    serde_json::to_string(&data).map(Some).map_err(|e| e.to_string())
}
#[tauri::command]
async fn export_file(app: tauri::AppHandle, name: String, content: String) -> Result<bool, String> {
    if content.len() > MAX_BYTES {
        return Err("导出内容超过20 MB".into());
    }
    let extension = if name.ends_with(".json") {
        "json"
    } else {
        "md"
    };
    let path = app
        .dialog()
        .file()
        .set_file_name(name)
        .add_filter("ResearchFlow", &[extension])
        .blocking_save_file();
    if let Some(p) = path {
        let target = p.into_path().map_err(|e| e.to_string())?;
        storage::atomic_write(&target, content.as_bytes())?;
        Ok(true)
    } else {
        Ok(false)
    }
}
#[tauri::command]
async fn import_file(app: tauri::AppHandle) -> Result<Option<String>, String> {
    if let Some(p) = app
        .dialog()
        .file()
        .add_filter("JSON 备份", &["json"])
        .blocking_pick_file()
    {
        let path = p.into_path().map_err(|e| e.to_string())?;
        if fs::metadata(&path).map_err(|e| e.to_string())?.len() > MAX_BYTES as u64 {
            return Err("备份超过20 MB".into());
        }
        Ok(Some(fs::read_to_string(path).map_err(|e| e.to_string())?))
    } else {
        Ok(None)
    }
}
#[tauri::command]
async fn pick_plan_file(app: tauri::AppHandle) -> Result<Option<String>, String> {
    if let Some(p) = app
        .dialog()
        .file()
        .add_filter("ResearchFlow 导入计划", &["json"])
        .blocking_pick_file()
    {
        let path = p.into_path().map_err(|e| e.to_string())?;
        if fs::metadata(&path).map_err(|e| e.to_string())?.len() > 1_000_000 {
            return Err("计划文件超过 1 MB。请删去无关内容后重试。".into());
        }
        Ok(Some(fs::read_to_string(path).map_err(|e| e.to_string())?))
    } else {
        Ok(None)
    }
}
#[tauri::command]
async fn pick_file(app: tauri::AppHandle, directory: bool) -> Result<Option<String>, String> {
    let dialog = app.dialog().file();
    let choice = if directory {
        dialog.blocking_pick_folder()
    } else {
        dialog.blocking_pick_file()
    };
    choice
        .map(|p| {
            p.into_path()
                .map(|p| p.to_string_lossy().into_owned())
                .map_err(|e| e.to_string())
        })
        .transpose()
}
#[tauri::command]
fn open_research_path(db: State<Database>, path: String) -> Result<(), String> {
    let _lock = db.gate.lock().map_err(|_| "存储锁不可用")?;
    let data = storage::read(&db.path)?.ok_or("尚无文件记录")?;
    let recorded = data["projects"]
        .as_array()
        .ok_or("项目格式错误")?
        .iter()
        .any(|p| {
            p["snapshot"]["files"]
                .as_array()
                .is_some_and(|files| files.iter().any(|f| f.as_str() == Some(&path)))
        });
    if !recorded {
        return Err("只允许打开你在项目快照中明确保存的路径".into());
    }
    let target = PathBuf::from(&path);
    if !target.is_absolute() || !target.exists() {
        return Err("本地路径不存在或不是绝对路径".into());
    }
    // Explorer reveals a file rather than executing it. Arguments never pass through a shell.
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let mut c = std::process::Command::new("explorer.exe");
        if target.is_dir() {
            c.arg(&target);
        } else {
            c.arg(format!("/select,{}", target.display()));
        }
        c.creation_flags(0x08000000)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
#[tauri::command]
fn copy_text(text: String) -> Result<(), String> {
    arboard::Clipboard::new()
        .map_err(|e| e.to_string())?
        .set_text(text)
        .map_err(|e| e.to_string())
}

fn constrain(w: &WebviewWindow) -> Result<(), String> {
    let pos = w.outer_position().map_err(|e| e.to_string())?;
    let size = w.outer_size().map_err(|e| e.to_string())?;
    let monitors = w.available_monitors().map_err(|e| e.to_string())?;
    let fits = monitors.iter().any(|m| {
        let p = m.position();
        let s = m.size();
        pos.x >= p.x
            && pos.y >= p.y
            && pos.x as i64 + size.width as i64 <= p.x as i64 + s.width as i64
            && pos.y as i64 + size.height as i64 <= p.y as i64 + s.height as i64
    });
    if !fits {
        let monitor = w
            .current_monitor()
            .ok()
            .flatten()
            .or_else(|| w.primary_monitor().ok().flatten());
        if let Some(m) = monitor {
            let p = m.position();
            let s = m.size();
            let x = pos
                .x
                .clamp(p.x, p.x + (s.width.saturating_sub(size.width)) as i32);
            let y = pos
                .y
                .clamp(p.y, p.y + (s.height.saturating_sub(size.height)) as i32);
            w.set_position(tauri::PhysicalPosition::new(x, y))
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
fn show_widget(app: &tauri::AppHandle) -> Result<(), String> {
    let w = app.get_webview_window("widget").ok_or("组件窗口不存在")?;
    constrain(&w)?;
    w.unminimize().map_err(|e| e.to_string())?;
    w.show().map_err(|e| e.to_string())?;
    w.set_focus().map_err(|e| e.to_string())
}
#[tauri::command]
fn widget_show(app: tauri::AppHandle) -> Result<(), String> {
    show_widget(&app)
}
fn show_manager(app: &tauri::AppHandle, page: Option<String>) -> Result<(), String> {
    let allowed = [
        "overview", "plan", "focus", "projects", "tracks", "deliver", "restart", "results",
        "ideas", "review", "settings",
    ];
    let page = page.filter(|p| allowed.contains(&p.as_str()));
    let w = if let Some(w) = app.get_webview_window("manager") {
        if let Some(page) = page {
            app.emit_to("manager", "navigate", page)
                .map_err(|e| e.to_string())?;
        }
        w
    } else {
        let mut config = app
            .config()
            .app
            .windows
            .iter()
            .find(|w| w.label == "manager")
            .ok_or("管理窗口配置不存在")?
            .clone();
        config.url = tauri::WebviewUrl::App(PathBuf::from(format!(
            "index.html?page={}",
            page.unwrap_or_else(|| "focus".into())
        )));
        tauri::WebviewWindowBuilder::from_config(app, &config)
            .map_err(|e| e.to_string())?
            .build()
            .map_err(|e| e.to_string())?
    };
    constrain(&w)?;
    w.unminimize().map_err(|e| e.to_string())?;
    w.show().map_err(|e| e.to_string())?;
    w.set_focus().map_err(|e| e.to_string())
}
#[tauri::command]
async fn manager_show(app: tauri::AppHandle, page: Option<String>) -> Result<(), String> {
    show_manager(&app, page)
}
#[tauri::command]
fn widget_is_mini(app: tauri::AppHandle) -> Result<bool, String> {
    Ok(app
        .store("desktop.json")
        .map_err(|e| e.to_string())?
        .get("mini")
        .and_then(|v| v.as_bool())
        .unwrap_or(false))
}
#[tauri::command]
fn overview_timeline_collapsed(app: tauri::AppHandle) -> Result<bool, String> {
    Ok(app.store("desktop.json").map_err(|e| e.to_string())?
        .get("overviewTimelineCollapsed").and_then(|v| v.as_bool()).unwrap_or(false))
}
#[tauri::command]
fn set_overview_timeline_collapsed(app: tauri::AppHandle, value: bool) -> Result<(), String> {
    let store = app.store("desktop.json").map_err(|e| e.to_string())?;
    let previous = store.get("overviewTimelineCollapsed");
    store.set("overviewTimelineCollapsed", json!(value));
    if let Err(error) = store.save() {
        if let Some(old) = previous { store.set("overviewTimelineCollapsed", old); }
        else { store.delete("overviewTimelineCollapsed"); }
        return Err(error.to_string());
    }
    Ok(())
}
#[tauri::command]
fn widget_mode(app: tauri::AppHandle, mini: bool) -> Result<(), String> {
    let w = app.get_webview_window("widget").ok_or("组件窗口不存在")?;
    w.set_size(tauri::LogicalSize::new(
        if mini { 120.0 } else { 320.0 },
        if mini { 44.0 } else { 400.0 },
    ))
    .map_err(|e| e.to_string())?;
    let store = app.store("desktop.json").map_err(|e| e.to_string())?;
    store.set("mini", json!(mini));
    store.save().map_err(|e| e.to_string())?;
    constrain(&w)
}
#[tauri::command]
fn set_top(app: tauri::AppHandle, value: bool) -> Result<(), String> {
    app.get_webview_window("widget")
        .ok_or("组件窗口不存在")?
        .set_always_on_top(value)
        .map_err(|e| e.to_string())
}
#[tauri::command]
fn drag_window(window: WebviewWindow) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())
}
#[tauri::command]
fn minimize_window(window: WebviewWindow) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}
#[tauri::command]
fn hide_widget(app: tauri::AppHandle) -> Result<(), String> {
    app.get_webview_window("widget")
        .ok_or("组件窗口不存在")?
        .hide()
        .map_err(|e| e.to_string())
}
#[tauri::command]
fn hide_manager(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("manager") {
        w.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}
#[tauri::command]
fn hide_all(app: tauri::AppHandle) -> Result<(), String> {
    hide_widget(app.clone())?;
    hide_manager(app)
}
#[tauri::command]
fn quit_app(app: tauri::AppHandle) -> Result<(), String> {
    let db = app.state::<Database>();
    storage::pause_on_exit(&db, &app.state::<FocusClock>().token, focus_tick())?;
    app.save_window_state(StateFlags::POSITION)
        .map_err(|e| e.to_string())?;
    app.exit(0);
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            let _ = show_widget(app);
        }))
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::POSITION)
                .build(),
        )
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            app.manage(FocusClock {
                token: format!(
                    "{}-{}",
                    std::process::id(),
                    std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)?
                        .as_nanos()
                ),
            });
            let dir = app.path().app_data_dir()?;
            fs::create_dir_all(&dir)?;
            app.manage(Database {
                path: dir.join("researchflow.json"),
                gate: Mutex::new(()),
            });
            // The WebViews must not request managed data before Database is registered.
            for config in app
                .config()
                .app
                .windows
                .iter()
                .filter(|w| w.label == "widget")
            {
                tauri::WebviewWindowBuilder::from_config(app.handle(), config)?.build()?;
            }
            let store = app.store("desktop.json")?;
            let mini = store.get("mini").and_then(|v| v.as_bool()).unwrap_or(false);
            if mini {
                let w = app.get_webview_window("widget").unwrap();
                w.set_size(tauri::LogicalSize::new(120.0, 44.0))?;
            }
            if let Ok(Some(data)) = storage::read(&dir.join("researchflow.json")) {
                if data["settings"]["alwaysOnTop"] == true {
                    app.get_webview_window("widget")
                        .unwrap()
                        .set_always_on_top(true)?;
                }
            }
            let show = MenuItem::with_id(app, "show", "显示科研卡片", true, None::<&str>)?;
            let manage = MenuItem::with_id(app, "manager", "打开管理面板", true, None::<&str>)?;
            let hide = MenuItem::with_id(app, "hide", "隐藏全部窗口", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "完全退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &manage, &hide, &quit])?;
            TrayIconBuilder::with_id("researchflow-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("ResearchFlow · 科研续航")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        let _ = show_widget(app);
                    }
                    "manager" => {
                        let _ = show_manager(app, None);
                    }
                    "hide" => {
                        let _ = hide_all(app.clone());
                    }
                    "quit" => {
                        if let Err(e) = quit_app(app.clone()) {
                            let _ = app.emit("exit-failed", e);
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let _ = show_widget(tray.app_handle());
                    }
                })
                .build(app)?;
            let _ = show_widget(app.handle());
            Ok(())
        })
        .on_window_event(|w, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                let _ = w.app_handle().save_window_state(StateFlags::POSITION);
                let _ = w.hide();
            }
            tauri::WindowEvent::ScaleFactorChanged { .. } => {
                if let Some(webview) = w.app_handle().get_webview_window(w.label()) {
                    let _ = constrain(&webview);
                }
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            load_data,
            focus_clock,
            save_data,
            data_path,
            desktop_state,
            safety_backup,
            load_import_backup,
            load_upgrade_backup,
            export_file,
            import_file,
            pick_plan_file,
            pick_file,
            open_research_path,
            copy_text,
            widget_show,
            manager_show,
            widget_is_mini,
            overview_timeline_collapsed,
            set_overview_timeline_collapsed,
            widget_mode,
            set_top,
            drag_window,
            minimize_window,
            hide_widget,
            hide_manager,
            hide_all,
            quit_app
        ])
        .run(tauri::generate_context!())
        .expect("ResearchFlow 启动失败");
}
