import { invoke, isTauri } from "@tauri-apps/api/core";
import { AppData, emptyData } from "../types";
import { parseBackup } from "../domain";
import { APP_VERSION } from '../version';
export const native = isTauri();
const upgradeKey = `researchflow-before-upgrade-${APP_VERSION}`;
function prepareBrowserUpgrade() {
  if (localStorage.getItem('researchflow-app-version') === APP_VERSION) return;
  const previous = localStorage.getItem('researchflow-v1');
  if (previous) {
    parseBackup(previous);
    const snapshot = localStorage.getItem(upgradeKey);
    if (snapshot) parseBackup(snapshot);
    else localStorage.setItem(upgradeKey, previous);
  }
  localStorage.setItem('researchflow-app-version', APP_VERSION);
}
export async function loadData(): Promise<AppData> {
  if (native) {
    const raw = await invoke<AppData | null>("load_data");
    if (!raw) return emptyData();
    const upgraded = parseBackup(JSON.stringify(raw));
    upgraded.settings.onboarding ??= "completed";
    if ((raw.schemaVersion as number) === 1) {
      try {
        return await invoke("save_data", {
          data: upgraded,
          expected: raw.revision,
        });
      } catch (e) {
        if (!String(e).includes("另一窗口")) throw e;
        return loadData();
      }
    }
    return upgraded;
  }
  prepareBrowserUpgrade();
  const raw = localStorage.getItem("researchflow-v1");
  if (!raw) return emptyData();
  const upgraded = parseBackup(raw);
  upgraded.settings.onboarding ??= "completed";
  if (JSON.parse(raw).schemaVersion === 1) {
    if (!localStorage.getItem("researchflow-before-migration-v1"))
      localStorage.setItem("researchflow-before-migration-v1", raw);
    localStorage.setItem("researchflow-v1", JSON.stringify(upgraded));
  }
  return upgraded;
}
export async function saveData(
  data: AppData,
  expected: number,
  backupBeforeWrite = false,
): Promise<AppData> {
  const checked = parseBackup(JSON.stringify(data));
  if (native) return invoke("save_data", { data: checked, expected, backupBeforeWrite });
  prepareBrowserUpgrade();
  const stored = localStorage.getItem("researchflow-v1");
  const rev = stored ? parseBackup(stored).revision : 0;
  if (rev !== expected)
    throw new Error("数据已经在另一窗口更新，请重试本次操作。");
  if (backupBeforeWrite && stored)
    localStorage.setItem("researchflow-before-import", stored);
  const next = { ...checked, revision: expected + 1 };
  localStorage.setItem("researchflow-v1", JSON.stringify(next));
  window.dispatchEvent(new Event("researchflow-changed"));
  return next;
}
export async function loadImportBackup(): Promise<AppData | null> {
  if (native) {
    const raw = await invoke<string | null>("load_import_backup");
    return raw ? parseBackup(raw) : null;
  }
  const raw = localStorage.getItem("researchflow-before-import");
  return raw ? parseBackup(raw) : null;
}
export async function loadUpgradeBackup(): Promise<AppData | null> {
  const raw = native ? await invoke<string | null>('load_upgrade_backup') : localStorage.getItem(upgradeKey);
  return raw ? parseBackup(raw) : null;
}
export async function pickPlanFile(): Promise<string | null> {
  return native ? invoke<string | null>("pick_plan_file") : null;
}
export async function desktop(command: string, args?: Record<string, unknown>) {
  if (native) return invoke(command, args);
}
export async function download(name: string, content: string) {
  if (native) return invoke<boolean>("export_file", { name, content });
  const blob = new Blob([content], {
    type: name.endsWith(".json")
      ? "application/json"
      : "text/markdown;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
export async function pickFile(directory = false): Promise<string | null> {
  return native ? invoke("pick_file", { directory }) : null;
}
