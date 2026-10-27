import { useEffect } from "react";
import { useData } from "../state";
import { native } from "../services/native";
import { checkpoint, focusClock } from "../focus";
// Exactly one native owner (widget). Manager only reads the shared persisted state.
export function FocusRuntime() {
  const { data, mutate } = useData();
  const owner = native
    ? new URLSearchParams(location.search).get("view") === "widget"
    : true;
  useEffect(() => {
    if (!owner || !data?.timer) return;
    let disposed = false;
    const sync = async () => {
      const clock = await focusClock();
      if (disposed) return;
      await mutate((d) => {
        if (d.timer?.running || d.timer?.clockToken !== clock.token)
          checkpoint(d, clock);
      });
    };
    if (data.timer.clockToken)
      void focusClock().then((clock) => {
        if (!disposed && data.timer?.clockToken !== clock.token) void sync();
      });
    const id = data.timer.running
      ? setInterval(() => void sync(), 30000)
      : undefined;
    const onVisible = () => {
      if (document.visibilityState === "visible" && data.timer?.running)
        void sync();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      if (id) clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [owner, data?.timer?.sessionId, data?.timer?.running, mutate]);
  return null;
}
