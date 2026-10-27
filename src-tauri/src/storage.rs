use serde_json::Value;
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
};
pub const MAX_BYTES: usize = 20_000_000;
pub struct Database {
    pub path: PathBuf,
    pub gate: Mutex<()>,
}

pub fn upgrade_backup_path(path: &Path, version: &str) -> PathBuf {
    path.parent().unwrap().join("backups").join(format!("before-{version}")).join("researchflow.json")
}
/// Called under the database lock before loading/migrating/writing. Never replace a release snapshot.
pub fn prepare_upgrade(path: &Path, version: &str) -> Result<(), String> {
    if version.is_empty() || !version.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'.' || b == b'-') {
        return Err("升级版本号无效".into());
    }
    let marker = path.with_extension("version.json");
    if marker.exists() {
        let saved: Value = serde_json::from_slice(&fs::read(&marker).map_err(|e| e.to_string())?)
            .map_err(|e| format!("版本记录无法读取，原数据保留：{e}"))?;
        if saved["version"] == version { return Ok(()); }
    }
    // Validate first. A broken or future-version file must never be replaced with empty data.
    if read(path)?.is_some() {
        let backup = upgrade_backup_path(path, version);
        if !backup.exists() {
            atomic_write(&backup, &fs::read(path).map_err(|e| e.to_string())?)
                .map_err(|e| format!("无法保存升级前副本，原数据未改动：{e}"))?;
        } else {
            read(&backup)?.ok_or("升级副本无效，原数据未改动")?;
        }
        let desktop = path.parent().unwrap().join("desktop.json");
        let desktop_backup = backup.parent().unwrap().join("desktop.json");
        if desktop.exists() && !desktop_backup.exists() {
            atomic_write(&desktop_backup, &fs::read(desktop).map_err(|e| e.to_string())?)?;
        }
    }
    atomic_write(&marker, &serde_json::to_vec(&serde_json::json!({"version":version})).map_err(|e| e.to_string())?)
}

pub fn read(path: &Path) -> Result<Option<Value>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    if bytes.len() > MAX_BYTES {
        return Err("数据文件超过20 MB".into());
    }
    let value: Value =
        serde_json::from_slice(&bytes).map_err(|e| format!("原数据保留，请勿覆盖损坏文件：{e}"))?;
    validate(&value)?;
    Ok(Some(value))
}
pub fn validate(data: &Value) -> Result<(), String> {
    if !matches!(data["schemaVersion"].as_u64(), Some(1 | 2)) || data["revision"].as_u64().is_none()
    {
        return Err("数据版本不受支持".into());
    }
    for key in ["projects", "tasks", "results", "ideas", "checkins"] {
        if !data[key].is_array() {
            return Err(format!("缺少数据列表 {key}"));
        }
    }
    if !data["settings"].is_object() {
        return Err("缺少设置".into());
    }
    if data["schemaVersion"] == 2 {
        for key in ["planPeriods", "milestones", "focusSessions"] {
            if !data[key].is_array() {
                return Err(format!("缺少数据列表 {key}"));
            }
        }
    }
    Ok(())
}
/// Same-directory temporary file + flush + atomic replace. Never truncate the current data file.
pub fn atomic_write(path: &Path, content: &[u8]) -> Result<(), String> {
    if content.len() > MAX_BYTES {
        return Err("记录超过20 MB，请先导出整理".into());
    }
    let parent = path.parent().ok_or("无效的数据目录")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    temp.write_all(content).map_err(|e| e.to_string())?;
    temp.as_file().sync_all().map_err(|e| e.to_string())?;
    temp.persist(path).map_err(|e| e.to_string())?;
    Ok(())
}
pub fn commit(db: &Database, data: Value, expected: u64) -> Result<Value, String> {
    let _lock = db.gate.lock().map_err(|_| "存储锁不可用")?;
    commit_locked(db, data, expected, false)
}
pub fn commit_with_import_backup(
    db: &Database,
    data: Value,
    expected: u64,
) -> Result<Value, String> {
    let _lock = db.gate.lock().map_err(|_| "存储锁不可用")?;
    commit_locked(db, data, expected, true)
}
fn commit_locked(
    db: &Database,
    mut data: Value,
    expected: u64,
    backup_import: bool,
) -> Result<Value, String> {
    prepare_upgrade(&db.path, env!("CARGO_PKG_VERSION"))?;
    validate(&data)?;
    let previous = read(&db.path)?;
    let current = previous
        .as_ref()
        .map(|d| d["revision"].as_u64().unwrap_or(0))
        .unwrap_or(0);
    if expected != current {
        return Err("数据已在另一窗口更新，请重试本次操作".into());
    }
    if backup_import {
        if let Some(old) = previous.as_ref() {
            atomic_write(
                &db.path.with_extension("before-import.json"),
                &serde_json::to_vec_pretty(old).map_err(|e| e.to_string())?,
            )?;
        }
    }
    data["revision"] = Value::from(current + 1);
    let bytes = serde_json::to_vec_pretty(&data).map_err(|e| e.to_string())?;
    if bytes.len() > MAX_BYTES {
        return Err("记录超过20 MB，请先导出整理".into());
    }
    if let Some(old) = previous {
        if old["schemaVersion"] == 1 && data["schemaVersion"] == 2 {
            let backup = db.path.with_extension("before-migration-v1.json");
            if !backup.exists() {
                atomic_write(
                    &backup,
                    &serde_json::to_vec_pretty(&old).map_err(|e| e.to_string())?,
                )?;
            }
        }
        atomic_write(
            &db.path.with_extension("previous.json"),
            &serde_json::to_vec_pretty(&old).map_err(|e| e.to_string())?,
        )?;
    }
    atomic_write(&db.path, &bytes)?;
    Ok(data)
}
/// Save and exit share the database lock; a window cannot slip in a stale timer save.
pub fn pause_on_exit(db: &Database, token: &str, tick: f64) -> Result<(), String> {
    let _lock = db.gate.lock().map_err(|_| "存储锁不可用")?;
    let Some(mut data) = read(&db.path)? else {
        return Ok(());
    };
    if data["timer"]["running"] != true || data["timer"]["sessionId"].as_str().is_none() {
        return Ok(());
    }
    let t = &data["timer"];
    let mut ms = t["elapsedMs"].as_f64().unwrap_or(0.0);
    if t["clockToken"] == token {
        ms += (tick - t["startedTick"].as_f64().unwrap_or(tick)).max(0.0);
    }
    let planned = t["plannedMinutes"].as_f64().unwrap_or(0.0) * 60000.0;
    let due = t["mode"] == "countdown" && t["overtime"] != true && ms >= planned;
    if due {
        ms = planned;
    }
    let session = t["sessionId"].as_str().unwrap().to_owned();
    let task = t["taskId"].as_str().unwrap_or("").to_owned();
    let now = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    data["timer"]["elapsedMs"] = Value::from(ms);
    data["timer"]["running"] = Value::from(false);
    data["timer"]["needsRecovery"] = Value::from(true);
    data["timer"]["remaining"] = Value::from((planned - ms).max(0.0));
    data["timer"]["startedTick"] = Value::from(tick);
    if due {
        data["timer"]["awaitingDecision"] = Value::from(true);
    }
    if let Some(list) = data["focusSessions"].as_array_mut() {
        for s in list {
            if s["id"] == session {
                s["elapsedMs"] = Value::from(ms);
                s["status"] = Value::from("paused");
                s["updatedAt"] = Value::from(now.clone());
            }
        }
    }
    if let Some(list) = data["tasks"].as_array_mut() {
        for t in list {
            if t["id"] == task && t["status"] != "done" {
                t["status"] = Value::from("paused");
                t["updatedAt"] = Value::from(now.clone());
            }
        }
    }
    let revision = data["revision"].as_u64().unwrap_or(0);
    commit_locked(db, data, revision, false)?;
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn state() -> Value {
        json!({"schemaVersion":1,"revision":0,"projects":[],"tasks":[],"results":[],"ideas":[],"checkins":[],"settings":{}})
    }
    #[test]
    fn upgrade_preserves_exact_old_bytes_and_desktop_preferences() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("researchflow.json");
        let mut old = state();
        old["projects"] = json!([{"id":"old","name":"原有课题"}]);
        old["settings"] = json!({"theme":"dark","focusProjectId":"old"});
        let bytes = serde_json::to_vec_pretty(&old).unwrap();
        fs::write(&path, &bytes).unwrap();
        fs::write(dir.path().join("desktop.json"), b"{\"mini\":true}").unwrap();
        prepare_upgrade(&path, "1.6.0").unwrap();
        let backup = upgrade_backup_path(&path, "1.6.0");
        assert_eq!(fs::read(&backup).unwrap(), bytes);
        assert_eq!(fs::read(&path).unwrap(), bytes);
        assert_eq!(fs::read(backup.parent().unwrap().join("desktop.json")).unwrap(), b"{\"mini\":true}");
        old["projects"][0]["name"] = json!("新版中的修改");
        fs::write(&path, serde_json::to_vec(&old).unwrap()).unwrap();
        prepare_upgrade(&path, "1.6.0").unwrap();
        assert_eq!(fs::read(&backup).unwrap(), bytes);
        prepare_upgrade(&path, "1.7.0").unwrap();
        assert_eq!(read(&upgrade_backup_path(&path, "1.7.0")).unwrap().unwrap(), old);
    }
    #[test]
    fn failed_upgrade_snapshot_prevents_commit_and_preserves_old_data() {
        let dir = tempfile::tempdir().unwrap();
        let db = Database { path:dir.path().join("researchflow.json"), gate:Mutex::new(()) };
        let bytes = serde_json::to_vec(&state()).unwrap();
        fs::write(&db.path, &bytes).unwrap();
        // A file where the backup directory should be simulates an unavailable destination.
        fs::write(dir.path().join("backups"), b"blocked").unwrap();
        assert!(commit(&db, state(), 0).is_err());
        assert_eq!(fs::read(&db.path).unwrap(), bytes);
        assert!(!db.path.with_extension("version.json").exists());
    }
    #[test]
    fn fresh_install_does_not_generate_fake_research_or_upgrade_snapshot() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("researchflow.json");
        prepare_upgrade(&path, "1.6.0").unwrap();
        assert!(!path.exists());
        assert!(!upgrade_backup_path(&path, "1.6.0").exists());
    }
    #[test]
    fn upgrade_rejects_future_data_and_invalid_snapshot_without_overwriting() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("researchflow.json");
        let mut future = state(); future["schemaVersion"]=json!(99);
        fs::write(&path, serde_json::to_vec(&future).unwrap()).unwrap();
        assert!(prepare_upgrade(&path,"1.6.0").is_err());
        assert_eq!(serde_json::from_slice::<Value>(&fs::read(&path).unwrap()).unwrap(),future);
        fs::write(&path, serde_json::to_vec(&state()).unwrap()).unwrap();
        let backup=upgrade_backup_path(&path,"1.6.0");
        fs::create_dir_all(backup.parent().unwrap()).unwrap(); fs::write(&backup,b"broken").unwrap();
        assert!(prepare_upgrade(&path,"1.6.0").is_err());
        assert_eq!(fs::read(&backup).unwrap(),b"broken");
        assert!(!path.with_extension("version.json").exists());
    }
    #[test]
    fn save_reload_and_conflict() {
        let dir = tempfile::tempdir().unwrap();
        let db = Database {
            path: dir.path().join("data.json"),
            gate: Mutex::new(()),
        };
        let mut data = state();
        data["projects"] = json!([{"id":"a","name":"中文研究"}]);
        let first = commit(&db, data, 0).unwrap();
        assert_eq!(
            read(&db.path).unwrap().unwrap()["projects"][0]["name"],
            "中文研究"
        );
        assert!(commit(&db, state(), 0).is_err());
        commit(&db, first, 1).unwrap();
        assert_eq!(
            read(&db.path.with_extension("previous.json"))
                .unwrap()
                .unwrap()["revision"],
            1
        );
    }
    #[test]
    fn corrupt_file_never_overwritten() {
        let dir = tempfile::tempdir().unwrap();
        let db = Database {
            path: dir.path().join("data.json"),
            gate: Mutex::new(()),
        };
        fs::write(&db.path, b"broken").unwrap();
        assert!(commit(&db, state(), 0).is_err());
        assert_eq!(fs::read(&db.path).unwrap(), b"broken");
    }
    #[test]
    fn oversize_preserves_last_good() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("data.json");
        atomic_write(&path, b"valid").unwrap();
        assert!(atomic_write(&path, &vec![0; MAX_BYTES + 1]).is_err());
        assert_eq!(fs::read(path).unwrap(), b"valid");
    }
    #[test]
    fn migration_backup_is_preserved() {
        let dir = tempfile::tempdir().unwrap();
        let db = Database {
            path: dir.path().join("data.json"),
            gate: Mutex::new(()),
        };
        let old = commit(&db, state(), 0).unwrap();
        let mut next = old.clone();
        next["schemaVersion"] = Value::from(2);
        for key in ["planPeriods", "milestones", "focusSessions"] {
            next[key] = json!([]);
        }
        let v2 = commit(&db, next, 1).unwrap();
        let backup = db.path.with_extension("before-migration-v1.json");
        assert_eq!(read(&backup).unwrap().unwrap(), old);
        commit(&db, v2, 2).unwrap();
        assert_eq!(read(&backup).unwrap().unwrap(), old);
    }
    #[test]
    fn import_backup_is_the_exact_revision_committed_atomically() {
        let dir = tempfile::tempdir().unwrap();
        let db = Database {
            path: dir.path().join("data.json"),
            gate: Mutex::new(()),
        };
        let original = commit(&db, state(), 0).unwrap();
        let mut changed = original.clone();
        changed["projects"] = json!([{"id":"new"}]);
        assert!(commit_with_import_backup(&db, changed.clone(), 0).is_err());
        assert!(!db.path.with_extension("before-import.json").exists());
        commit_with_import_backup(&db, changed, 1).unwrap();
        assert_eq!(
            read(&db.path.with_extension("before-import.json"))
                .unwrap()
                .unwrap(),
            original
        );
    }
    #[test]
    fn exit_saves_effective_time_once() {
        let dir = tempfile::tempdir().unwrap();
        let db = Database {
            path: dir.path().join("data.json"),
            gate: Mutex::new(()),
        };
        let mut d = state();
        d["schemaVersion"] = Value::from(2);
        d["planPeriods"] = json!([]);
        d["milestones"] = json!([]);
        let old_time = "2025-01-01T00:00:00.000Z";
        d["tasks"] = json!([{"id":"t","status":"running","updatedAt":old_time}]);
        d["focusSessions"] =
            json!([{"id":"s","elapsedMs":5000,"status":"running","updatedAt":old_time}]);
        d["timer"] = json!({"sessionId":"s","taskId":"t","running":true,"mode":"countup","elapsedMs":5000,"startedTick":100,"clockToken":"process"});
        commit(&db, d, 0).unwrap();
        pause_on_exit(&db, "process", 1100.0).unwrap();
        let first = read(&db.path).unwrap().unwrap();
        let exit_time = first["focusSessions"][0]["updatedAt"].as_str().unwrap();
        assert!(
            chrono::DateTime::parse_from_rfc3339(exit_time).unwrap()
                > chrono::DateTime::parse_from_rfc3339(old_time).unwrap()
        );
        assert_eq!(first["tasks"][0]["updatedAt"], exit_time);
        pause_on_exit(&db, "process", 9100.0).unwrap();
        let saved = read(&db.path).unwrap().unwrap();
        assert_eq!(saved, first);
        assert_eq!(saved["timer"]["elapsedMs"], 6000.0);
        assert_eq!(saved["focusSessions"][0]["elapsedMs"], 6000.0);
        assert_eq!(saved["tasks"][0]["status"], "paused");
    }
}
