import { useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, ListTodo, Pencil, Plus, Trash2 } from 'lucide-react';
import { base, Todo } from '../types';
import { addDays, useToday, validDate } from '../dates';
import { useData } from '../state';
import { Confirm, Field, Modal } from '../components/Common';

function TodoEditor({ todo, onClose }: { todo: Todo; onClose: () => void }) {
  const { mutate, busy } = useData();
  const [text, setText] = useState(todo.text), [date, setDate] = useState(todo.date);
  return <Modal title="编辑待办" onClose={onClose}>
    <form onSubmit={async e => {
      e.preventDefault();
      if (!text.trim() || !validDate(date)) return;
      if (await mutate(d => {
        const item = d.todos?.find(t => t.id === todo.id);
        if (!item || item.updatedAt !== todo.updatedAt) throw Error('待办已更新，请关闭后重新编辑。');
        Object.assign(item, { text: text.trim(), date, updatedAt: new Date().toISOString() });
      })) onClose();
    }}>
      <Field label="待办内容"><textarea autoFocus required maxLength={500} rows={3} value={text} onChange={e => setText(e.target.value)}/></Field>
      <Field label="待办日期"><input type="date" required min="1900-01-01" max="2199-12-31" value={date} onChange={e => setDate(e.target.value)}/></Field>
      <footer><button type="button" data-dismiss onClick={onClose}>取消</button><button className="primary" disabled={busy || !text.trim()}>保存待办</button></footer>
    </form>
  </Modal>;
}

export function Todos() {
  const { data, mutate, busy } = useData(), today = useToday();
  const [selected, setSelected] = useState<string>(), [text, setText] = useState(''),
    [pending, setPending] = useState(false), [editing, setEditing] = useState<Todo>(), [remove, setRemove] = useState<Todo>();
  const input = useRef<HTMLInputElement>(null), adding = useRef(false), date = selected || today;
  const records = (data!.todos || []).filter(t => pending ? !t.done : t.date === date)
    .sort((a, b) => Number(a.done) - Number(b.done) || a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  return <>
    <div className="page-heading"><h1>待办</h1></div>
    <div className="todo-toolbar">
      <div className="todo-date-nav">
        <button className="icon" title="前一天" aria-label="前一天" disabled={date <= '1900-01-01'} onClick={() => { setSelected(addDays(date, -1)); setPending(false); }}><ChevronLeft size={17}/></button>
        <input type="date" aria-label="查看待办日期" value={date} min="1900-01-01" max="2199-12-31" onChange={e => { if (validDate(e.target.value)) { setSelected(e.target.value); setPending(false); } }}/>
        <button className="icon" title="后一天" aria-label="后一天" disabled={date >= '2199-12-31'} onClick={() => { setSelected(addDays(date, 1)); setPending(false); }}><ChevronRight size={17}/></button>
        <button onClick={() => { setSelected(undefined); setPending(false); }} aria-pressed={!pending && date === today}>今天</button>
      </div>
      <button className={`text-button ${pending ? 'selected' : ''}`} aria-pressed={pending} onClick={() => setPending(!pending)}><ListTodo size={15}/>全部未完成</button>
    </div>
    <form className="todo-quick-add" onSubmit={async e => {
      e.preventDefault();
      if (busy || adding.current || !text.trim()) return;
      adding.current = true;
      const item: Todo = { ...base(), text: text.trim(), date, done: false };
      try {
        if (await mutate(d => { (d.todos ??= []).push(item); })) {
          setText(current => current.trim() === item.text ? '' : current);
          input.current?.focus();
        }
      } finally { adding.current = false; }
    }}>
      <input ref={input} aria-label="新增待办" placeholder={date === today ? '记下今日待办…' : '记下这一天的待办…'} maxLength={500} required value={text} onChange={e => setText(e.target.value)}/>
      <button className="primary" aria-label="添加待办" title="添加待办" disabled={busy || !text.trim()}><Plus size={18}/></button>
    </form>
    <div className="todo-list">
      {records.map(t => <div className={`todo-row ${t.done ? 'done' : ''}`} key={t.id}>
        <button className="todo-check" aria-label={`${t.done ? '重新打开待办' : '完成待办'} ${t.text}`} title={t.done ? '重新打开' : '完成'} disabled={busy} onClick={() => {
          const done = !t.done;
          void mutate(d => {
            const item = d.todos?.find(x => x.id === t.id);
            if (!item) throw Error('待办已不存在。');
            item.done = done; item.updatedAt = new Date().toISOString();
            if (done) item.completedAt = item.updatedAt;
            else delete item.completedAt;
          });
        }}>{t.done && <Check size={13}/>}</button>
        <div className="todo-content"><span>{t.text}</span>{pending && <time>{t.date}</time>}</div>
        <button className="icon" aria-label={`编辑待办 ${t.text}`} title="编辑待办" disabled={busy} onClick={() => setEditing(t)}><Pencil size={14}/></button>
        <button className="icon danger-text" aria-label={`删除待办 ${t.text}`} title="删除待办" disabled={busy} onClick={() => setRemove(t)}><Trash2 size={14}/></button>
      </div>)}
      {!records.length && <p className="todo-empty">{pending ? '暂无未完成待办' : date === today ? '今日暂无待办' : '这一天暂无待办'}</p>}
    </div>
    {editing && <TodoEditor todo={editing} onClose={() => setEditing(undefined)}/>}
    {remove && <Confirm title="删除这条待办？" detail={remove.text} onClose={() => setRemove(undefined)} onConfirm={async () => {
      if (await mutate(d => {
        const item = d.todos?.find(t => t.id === remove.id);
        if (item && item.updatedAt !== remove.updatedAt) throw Error('待办已更新，请重新确认删除。');
        d.todos = (d.todos || []).filter(t => t.id !== remove.id);
      })) setRemove(undefined);
    }}/>}
  </>;
}
