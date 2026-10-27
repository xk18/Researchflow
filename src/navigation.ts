export interface NavigationTarget {
  page: string;
  projectId?: string;
  milestoneId?: string;
  planningDate?: string;
  planningView?: "timeline" | "calendar";
  projectStatus?: "active" | "paused" | "completed" | "archived" | "terminated" | "all";
  settingsSection?: "data-location" | "backup-settings";
}
export type Navigate = (target: string | NavigationTarget) => void;
