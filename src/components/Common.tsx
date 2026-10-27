import {
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  useState,
  ReactNode,
  ReactElement,
} from "react";
import { X, Plus, Leaf } from "lucide-react";
import { useData } from "../state";
export function Mark() {
  return (
    <span className="mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M6 20V4.5h6a4.5 4.5 0 0 1 0 9H6m6 0 6 6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
export function Empty({
  title,
  detail,
  action,
  label = "新建项目",
}: {
  title: string;
  detail: string;
  action?: () => void;
  label?: string;
}) {
  return (
    <div className="empty">
      <span className="empty-symbol">
        <Leaf aria-hidden="true" size={30} strokeWidth={1.2} />
      </span>
      <h2>{title}</h2>
      {detail && <p>{detail}</p>}
      {action && (
        <button className="primary" onClick={action}>
          <Plus aria-hidden="true" size={16} />
          {label}
        </button>
      )}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
  trackChanges = true,
  className = "",
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  trackChanges?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [dirty, setDirty] = useState(false),
    [discard, setDiscard] = useState(false);
  const requestClose = () => (dirty ? setDiscard(true) : onClose());
  useEffect(() => {
    const d = ref.current!;
    if (!returnFocus.current && document.activeElement instanceof HTMLElement && !d.contains(document.activeElement)) {
      returnFocus.current = document.activeElement;
    }
    d.showModal();
    return () => {
      d.close();
      if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal${wide ? " wide" : ""}${className ? ` ${className}` : ""}`}
      onChangeCapture={() => { if (trackChanges) setDirty(true); }}
      onClickCapture={(e) => {
        if (dirty && (e.target as HTMLElement).closest("[data-dismiss]")) {
          e.preventDefault();
          e.stopPropagation();
          requestClose();
        }
      }}
      onCancel={(e) => {
        e.preventDefault();
        requestClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button className="icon" aria-label="关闭对话框" onClick={requestClose}>
          <X aria-hidden="true" size={18} />
        </button>
      </header>
      {discard && (
        <div className="discard-note" role="alert">
          <p>输入还没有保存。要放弃这次编辑吗？</p>
          <button onClick={() => setDiscard(false)}>继续编辑</button>
          <button className="danger" onClick={onClose}>
            放弃编辑
          </button>
        </div>
      )}
      {children}
    </dialog>
  );
}
export function Feedback() {
  const { error, toast, reload } = useData();
  return (
    <>
      {error && (
        <div className="error-banner" role="alert">
          {error}
          <button onClick={() => void reload()}>重新读取</button>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const control =
    isValidElement(children) &&
    ["input", "textarea", "select"].includes(String(children.type))
      ? cloneElement(
          children as ReactElement<{ name?: string; autoComplete?: string }>,
          {
            name: (children.props as { name?: string }).name || label,
            autoComplete:
              (children.props as { autoComplete?: string }).autoComplete ||
              "off",
          },
        )
      : children;
  return (
    <label className="field">
      <span>{label}</span>
      {control}
    </label>
  );
}
export function Confirm({
  title,
  detail,
  onConfirm,
  onClose,
}: {
  title: string;
  detail: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { busy } = useData();
  return (
    <Modal title={title} onClose={onClose}>
      <p className="modal-note">{detail}</p>
      <footer>
        <button onClick={onClose}>保留</button>
        <button className="danger" disabled={busy} onClick={onConfirm}>
          确认删除
        </button>
      </footer>
    </Modal>
  );
}
