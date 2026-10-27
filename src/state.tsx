import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from "react";
import { listen } from "@tauri-apps/api/event";
import { AppData } from "./types";
import { loadData, native, saveData } from "./services/native";
type Mutator = (draft: AppData) => void;
interface State {
  data: AppData | null;
  error: string;
  busy: boolean;
  mutate: (fn: Mutator, options?: { backupBeforeWrite?: boolean }) => Promise<boolean>;
  notify: (text: string) => void;
  toast: string;
  reload: () => Promise<void>;
}
const Context = createContext<State | null>(null);
export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState("");
  const ref = useRef<AppData | null>(null),
    queue = useRef(Promise.resolve()),
    toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((text: string) => {
    setToast(text);
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    toastTimeout.current = setTimeout(() => setToast(""), 4500);
  }, []);
  const reload = useCallback(async () => {
    try {
      const next = await loadData();
      if (!ref.current || next.revision >= ref.current.revision) {
        ref.current = next;
        setData(next);
      }
      setError("");
    } catch (e) {
      setError(`无法读取数据：${String(e)}。请保留原文件并从备份恢复。`);
    }
  }, []);
  useEffect(() => {
    void reload();
    let clean: undefined | (() => void);
    let exitClean: undefined | (() => void);
    if (native)
      void listen<string>("exit-failed", (e) =>
        setError(`退出前保存失败：${e.payload}。应用仍在运行，请重试。`),
      ).then((u) => (exitClean = u));
    if (native)
      void listen("data-changed", () => void reload()).then((u) => (clean = u));
    else {
      window.addEventListener("storage", reload);
      window.addEventListener("researchflow-changed", reload);
    }
    return () => {
      clean?.();
      exitClean?.();
      window.removeEventListener("storage", reload);
      window.removeEventListener("researchflow-changed", reload);
      if (toastTimeout.current) clearTimeout(toastTimeout.current);
    };
  }, [reload]);
  const mutate = useCallback((fn: Mutator, options?: { backupBeforeWrite?: boolean }): Promise<boolean> => {
    let success = false;
    const job = queue.current.then(async () => {
      setBusy(true);
      try {
        let next: AppData | undefined;
        for (let attempt = 0; attempt < 2; attempt++) {
          const current = await loadData();
          const draft = structuredClone(current);
          fn(draft);
          try {
            next = await saveData(draft, current.revision, options?.backupBeforeWrite);
            break;
          } catch (e) {
            if (attempt === 0 && String(e).includes("另一窗口")) continue;
            throw e;
          }
        }
        if (next) {
          ref.current = next;
          setData(next);
          setError("");
          success = true;
        }
      } catch (e) {
        setError(`保存失败：${String(e)}。输入已保留，请重试。`);
      } finally {
        setBusy(false);
      }
    });
    queue.current = job;
    return job.then(() => success);
  }, []);
  return (
    <Context.Provider
      value={{ data, error, busy, mutate, notify, toast, reload }}
    >
      {children}
    </Context.Provider>
  );
}
export function useData() {
  const state = useContext(Context);
  if (!state) throw new Error("Missing provider");
  return state;
}
