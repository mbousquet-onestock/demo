import React, { useState } from 'react';
import { InformationField, OrderInformation } from '../types';
import { informationValue } from '../services/orderService';

interface Props {
  value: OrderInformation;
  onChange: (value: OrderInformation) => void;
  // Configurations saved per project.
  saved: Record<string, OrderInformation>;
  onSaveSaved: (saved: Record<string, OrderInformation>) => void;
  projects: string[];
  defaultProject?: string;
}

const LEVELS: { key: keyof OrderInformation; label: string; path: string }[] = [
  { key: 'header', label: 'Order header', path: 'order.information' },
  { key: 'lines', label: 'Order lines', path: 'order.order_items[].information' },
];

const typeOf = (v: string) => {
  const x = informationValue(v);
  return x === null ? 'null' : Array.isArray(x) ? 'array' : typeof x;
};

// One field: key and possible values (chips, Enter to add).
const FieldRow: React.FC<{ field: InformationField; onChange: (f: InformationField) => void; onRemove: () => void }> = ({ field, onChange, onRemove }) => {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (v && !field.values.includes(v)) onChange({ ...field, values: [...field.values, v] });
    setDraft('');
  };
  return (
    <div className="flex flex-wrap items-start gap-2 p-2 bg-gray-50 rounded-lg border border-gray-100">
      <input value={field.key} onChange={e => onChange({ ...field, key: e.target.value })} placeholder="key" className="w-40 px-2 py-1.5 text-xs font-mono bg-white border border-gray-200 rounded-lg outline-none" />
      <div className="flex-1 min-w-[220px] flex flex-wrap items-center gap-1.5">
        {field.values.map(v => (
          <span key={v} className="flex items-center gap-1 pl-2 pr-1 py-0.5 bg-white border border-gray-200 rounded text-[11px] font-mono">
            {v}<span className="text-[9px] text-gray-400">{typeOf(v)}</span>
            <button onClick={() => onChange({ ...field, values: field.values.filter(x => x !== v) })} className="text-gray-300 hover:text-red-500">✕</button>
          </span>
        ))}
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          onBlur={add}
          placeholder={field.values.length ? 'other value…' : 'possible value, Enter'}
          className="w-36 px-2 py-1 text-xs bg-white border border-gray-200 rounded-lg outline-none"
        />
      </div>
      {!field.values.length && field.key.trim() && <span className="text-[10px] text-amber-700 self-center">no value: not sent</span>}
      <button onClick={onRemove} className="px-1.5 py-1 text-gray-300 hover:text-red-500" title="Remove the field">✕</button>
    </div>
  );
};

// "information" fields of the generated orders (header) and lines: key + possible values, one drawn per order / line.
const OrderInformationEditor: React.FC<Props> = ({ value, onChange, saved, onSaveSaved, projects, defaultProject }) => {
  const [project, setProject] = useState(defaultProject || '');
  const [notice, setNotice] = useState<string | null>(null);
  const names = Object.keys(saved).sort((a, b) => a.localeCompare(b));
  const count = value.header.length + value.lines.length;

  const setLevel = (key: keyof OrderInformation, fields: InformationField[]) => onChange({ ...value, [key]: fields });
  const saveProject = () => {
    const name = project.trim();
    if (!name) return;
    if (saved[name] && !window.confirm(`Replace the information fields saved for ${name}?`)) return;
    onSaveSaved({ ...saved, [name]: value });
    setNotice(`Saved for ${name}`);
  };
  const load = (name: string) => {
    if (!saved[name]) return;
    onChange(saved[name]);
    setProject(name);
    setNotice(`Loaded from ${name}`);
  };
  const remove = (name: string) => {
    if (!window.confirm(`Delete the information fields saved for ${name}?`)) return;
    const { [name]: _, ...rest } = saved;
    onSaveSaved(rest);
    setNotice(`Deleted: ${name}`);
  };

  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="flex-1 text-sm font-bold text-[#002D72]">Information fields <span className="font-normal text-xs text-gray-400">· one possible value drawn per order / line</span></h3>
        {count > 0 && <button onClick={() => onChange({ header: [], lines: [] })} className="text-[10px] font-bold text-red-600 hover:underline">Clear</button>}
      </div>

      {/* Per project */}
      <div className="flex flex-wrap items-center gap-2 p-3 bg-blue-50/50 border border-blue-100 rounded-lg">
        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Project</span>
        <input value={project} onChange={e => setProject(e.target.value)} list="order-information-projects" placeholder="Client / Phase 1" className="w-44 px-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg outline-none" />
        <datalist id="order-information-projects">{[...new Set([...names, ...projects])].map(p => <option key={p} value={p} />)}</datalist>
        <button onClick={saveProject} disabled={!project.trim()} className="px-3 py-1.5 text-xs font-bold text-white bg-[#002D72] rounded-lg hover:bg-[#001F4D] disabled:opacity-40">Save for this project</button>
        {names.length > 0 && (
          <select value="" onChange={e => load(e.target.value)} className="px-2 py-1.5 text-xs bg-white border border-gray-200 rounded-lg">
            <option value="">Load a project…</option>
            {names.map(n => <option key={n} value={n}>{n} ({saved[n].header.length} header · {saved[n].lines.length} line field(s))</option>)}
          </select>
        )}
        {project.trim() && saved[project.trim()] && <button onClick={() => remove(project.trim())} className="text-[10px] font-bold text-red-600 hover:underline">Delete saved</button>}
        {notice && <span className="text-[11px] text-emerald-700">{notice}</span>}
      </div>

      {LEVELS.map(level => (
        <div key={level.key} className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">{level.label} <span className="font-mono normal-case tracking-normal">{level.path}</span></label>
            <button onClick={() => setLevel(level.key, [...value[level.key], { key: '', values: [] }])} className="text-[10px] font-bold text-onestock-blue hover:underline">+ Add a field</button>
          </div>
          {value[level.key].length === 0 && <p className="text-xs text-gray-400">No field.</p>}
          {value[level.key].map((f, i) => (
            <FieldRow
              key={i}
              field={f}
              onChange={next => setLevel(level.key, value[level.key].map((x, k) => (k === i ? next : x)))}
              onRemove={() => setLevel(level.key, value[level.key].filter((_, k) => k !== i))}
            />
          ))}
        </div>
      ))}
      <p className="text-[10px] text-gray-400">Numbers, true / false, null and JSON ({'{…}'} / […]) are sent typed, the rest as text.</p>
    </section>
  );
};

export default OrderInformationEditor;
