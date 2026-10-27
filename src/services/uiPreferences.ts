import { invoke } from "@tauri-apps/api/core";
import { native } from "./native";

const key = "researchflow-ui-overview-timeline-collapsed";
export async function readTimelineCollapsed(): Promise<boolean> {
  return native ? invoke<boolean>("overview_timeline_collapsed") : localStorage.getItem(key) === "true";
}
export async function writeTimelineCollapsed(value: boolean): Promise<void> {
  if (native) await invoke("set_overview_timeline_collapsed", { value });
  else localStorage.setItem(key, String(value));
}
