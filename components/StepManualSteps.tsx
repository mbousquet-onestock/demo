import React, { useMemo, useState } from 'react';
import { ManualStep } from '../types';
import { manualStepsStore, stockPointSetsStore, orderBatchesStore } from '../services/appStores';
import { savedPayloadsStore, listProjects, getLastProject, setLastProject } from '../services/payloadStore';

type StatusFilter = 'all' | ManualStep['status'] | 'open';

const STATUS_LABELS: Record<ManualStep['status'], string> = {
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
};

const STATUS_STYLES: Record<ManualStep['status'], string> = {
  todo: 'bg-gray-100 text-gray-600 border-gray-200',
  in_progress: 'bg-amber-50 text-amber-700 border-amber-200',
  done: 'bg-green-50 text-green-700 border-green-200',
};

const inputClass = 'w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-onestock-blue';
const newId = () => Date.now().toString(36) + Math.random().toString(36).substring(2, 6);

// Checklist of the steps to perform by hand (outside the app), per project, synced to the database.
const StepManualSteps: React.FC = () => {
  const steps = manualStepsStore.use();
  const payloads = savedPayloadsStore.use();
  const sets = stockPointSetsStore.use();
  const batches = orderBatchesStore.use();
  const projects = useMemo(() => listProjects([...steps, ...payloads, ...sets, ...batches]), [steps, payloads, sets, batches]);

  const [project, setProject] = useState(getLastProject());
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<{ id: string; title: string; description: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const update = (id: string, patch: Partial<ManualStep>) =>
    manualStepsStore.set(prev => prev.map(s => (s.id === id ? { ...s, ...patch, updatedAt: new Date().toISOString() } : s)));

  const setStatus = (step: ManualStep, status: ManualStep['status']) =>
    update(step.id, { status, doneAt: status === 'done' ? new Date().toISOString() : undefined });

  const addStep = () => {
    if (!title.trim()) return;
    const key = project.trim();
    const sameProject = steps.filter(s => (s.project || '') === key);
    const now = new Date().toISOString();
    manualStepsStore.set(prev => [...prev, {
      id: newId(),
      project: key || undefined,
      title: title.trim(),
      description: description.trim() || undefined,
      status: 'todo',
      order: sameProject.length ? Math.max(...sameProject.map(s => s.order)) + 1 : 0,
      createdAt: now,
      updatedAt: now,
    }]);
    if (key) setLastProject(key);
    setTitle('');
    setDescription('');
  };

  // Swaps the step with its neighbour within the same project.
  const move = (step: ManualStep, direction: -1 | 1) => {
    const siblings = steps.filter(s => (s.project || '') === (step.project || '')).sort((a, b) => a.order - b.order);
    const index = siblings.findIndex(s => s.id === step.id);
    const other = siblings[index + direction];
    if (!other) return;
    manualStepsStore.set(prev => prev.map(s =>
      s.id === step.id ? { ...s, order: other.order, updatedAt: new Date().toISOString() }
        : s.id === other.id ? { ...s, order: step.order, updatedAt: new Date().toISOString() }
        : s));
  };

  const remove = (step: ManualStep) => {
    if (!window.confirm(`Delete the step "${step.title}"?`)) return;
    manualStepsStore.set(prev => prev.filter(s => s.id !== step.id));
  };

  const saveEdit = () => {
    if (!editing || !editing.title.trim()) return;
    update(editing.id, { title: editing.title.trim(), description: editing.description.trim() || undefined });
    setEditing(null);
  };

  const q = search.trim().toLowerCase();
  const groups = useMemo(() => {
    const map = new Map<string, ManualStep[]>();
    steps.forEach(s => {
      const key = (s.project || '').trim();
      if (projectFilter !== null && key !== projectFilter) return;
      map.set(key, [...(map.get(key) || []), s]);
    });
    return [...map.entries()]
      .map(([key, list]) => [key, list.sort((a, b) => a.order - b.order)] as const)
      .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));
  }, [steps, projectFilter]);

  const matches = (s: ManualStep) =>
    (statusFilter === 'all' || (statusFilter === 'open' ? s.status !== 'done' : s.status === statusFilter))
    && (!q || s.title.toLowerCase().includes(q) || (s.description || '').toLowerCase().includes(q));

  const copyChecklist = (key: string, list: ManualStep[]) => {
    const text = [`# ${key || 'No project'}`, '', ...list.map(s =>
      `- [${s.status === 'done' ? 'x' : ' '}] ${s.title}${s.status === 'in_progress' ? ' (in progress)' : ''}${s.description ? `\n  ${s.description.replace(/\n/g, '\n  ')}` : ''}`)].join('\n');
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  const total = steps.length;
  const done = steps.filter(s => s.status === 'done').length;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <datalist id="manual-step-projects">{projects.map(p => <option key={p} value={p} />)}</datalist>

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-[#002D72]">Manual Steps</h2>
          <p className="text-sm text-gray-500 mt-1">Steps to perform by hand (OMC configuration, checks, external tools…), per project.</p>
        </div>
        {total > 0 && (
          <div className="text-right">
            <p className="text-xs font-bold text-gray-600">{done} / {total} done</p>
            <div className="w-48 h-2 bg-gray-100 rounded-full overflow-hidden mt-1">
              <div className="h-full bg-emerald-500" style={{ width: `${Math.round((done / total) * 100)}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* New step */}
      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-3">
        <h3 className="text-sm font-bold text-[#002D72]">New step</h3>
        <div className="grid grid-cols-1 md:grid-cols-[200px_1fr_auto] gap-3">
          <input value={project} onChange={e => setProject(e.target.value)} list="manual-step-projects" placeholder="Project" className={inputClass} />
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addStep()}
            placeholder="What has to be done? (e.g. Create the sales channel web_fr in the OMC)"
            className={inputClass}
          />
          <button onClick={addStep} disabled={!title.trim()} className="px-5 py-2 bg-onestock-blue text-white font-bold text-sm rounded-lg hover:bg-[#001F4D] disabled:opacity-40">Add</button>
        </div>
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Details, values to type, links… (optional)" className={inputClass + ' resize-y'} />
      </section>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search steps…" className="flex-1 min-w-[200px] px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg outline-none" />
        <select
          value={projectFilter === null ? '__all__' : projectFilter}
          onChange={e => setProjectFilter(e.target.value === '__all__' ? null : e.target.value)}
          className="px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg outline-none"
        >
          <option value="__all__">All projects</option>
          {listProjects(steps).map(p => <option key={p} value={p}>{p}</option>)}
          <option value="">No project</option>
        </select>
        <div className="flex bg-gray-100 p-1 rounded-lg text-xs font-bold">
          {([['all', 'All'], ['open', 'Open'], ['todo', 'To do'], ['in_progress', 'In progress'], ['done', 'Done']] as [StatusFilter, string][]).map(([key, label]) => (
            <button key={key} onClick={() => setStatusFilter(key)} className={`px-3 py-1.5 rounded-md ${statusFilter === key ? 'bg-white text-[#002D72] shadow-sm' : 'text-gray-500'}`}>{label}</button>
          ))}
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="p-12 text-center text-sm text-gray-400 bg-white rounded-2xl border border-dashed border-gray-200">No manual step yet.</p>
      ) : groups.map(([key, list]) => {
        const visible = list.filter(matches);
        const doneCount = list.filter(s => s.status === 'done').length;
        return (
          <section key={key || '__none__'} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center gap-3">
              <span className="text-xs font-bold text-[#002D72] uppercase tracking-widest">{key || 'No project'}</span>
              <span className="text-[11px] text-gray-500">{doneCount} / {list.length} done</span>
              <div className="w-32 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500" style={{ width: `${list.length ? Math.round((doneCount / list.length) * 100) : 0}%` }} />
              </div>
              <button onClick={() => copyChecklist(key, list)} className="ml-auto text-[11px] font-bold text-onestock-blue hover:underline">
                {copied === key ? 'Copied!' : 'Copy as checklist'}
              </button>
            </div>
            {visible.length === 0 ? (
              <p className="px-5 py-4 text-xs text-gray-400">No step matches the filters.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {visible.map(step => {
                  const index = list.indexOf(step);
                  const isEditing = editing?.id === step.id;
                  return (
                    <li key={step.id} className="px-5 py-3 flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={step.status === 'done'}
                        onChange={e => setStatus(step, e.target.checked ? 'done' : 'todo')}
                        className="w-4 h-4 mt-1 shrink-0"
                        title="Done"
                      />
                      <span className="text-[11px] font-mono text-gray-400 mt-0.5 w-6 shrink-0">{index + 1}.</span>
                      <div className="flex-1 min-w-0">
                        {isEditing ? (
                          <div className="space-y-2">
                            <input value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} onKeyDown={e => e.key === 'Enter' && saveEdit()} className={inputClass} autoFocus />
                            <textarea value={editing.description} onChange={e => setEditing({ ...editing, description: e.target.value })} rows={3} placeholder="Details (optional)" className={inputClass + ' resize-y'} />
                            <div className="flex gap-2">
                              <button onClick={saveEdit} disabled={!editing.title.trim()} className="px-3 py-1 text-xs font-bold text-white bg-onestock-blue rounded disabled:opacity-40">Save</button>
                              <button onClick={() => setEditing(null)} className="px-3 py-1 text-xs font-bold text-gray-500">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => setEditing({ id: step.id, title: step.title, description: step.description || '' })} className="text-left w-full" title="Click to edit">
                            <p className={`text-sm font-bold ${step.status === 'done' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{step.title}</p>
                            {step.description && <p className={`text-xs mt-0.5 whitespace-pre-line ${step.status === 'done' ? 'text-gray-300' : 'text-gray-500'}`}>{step.description}</p>}
                            {step.doneAt && <p className="text-[10px] text-gray-400 mt-0.5">Done {new Date(step.doneAt).toLocaleString()}</p>}
                          </button>
                        )}
                      </div>
                      <select
                        value={step.status}
                        onChange={e => setStatus(step, e.target.value as ManualStep['status'])}
                        className={`text-[11px] font-bold px-2 py-1 rounded-lg border outline-none shrink-0 ${STATUS_STYLES[step.status]}`}
                      >
                        {(Object.keys(STATUS_LABELS) as ManualStep['status'][]).map(st => <option key={st} value={st}>{STATUS_LABELS[st]}</option>)}
                      </select>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => move(step, -1)} disabled={index === 0} className="px-1.5 py-1 text-xs text-gray-400 hover:text-gray-700 disabled:opacity-20" title="Move up">▲</button>
                        <button onClick={() => move(step, 1)} disabled={index === list.length - 1} className="px-1.5 py-1 text-xs text-gray-400 hover:text-gray-700 disabled:opacity-20" title="Move down">▼</button>
                        <button onClick={() => remove(step)} className="px-1.5 py-1 text-xs text-gray-300 hover:text-red-500" title="Delete">✕</button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
};

export default StepManualSteps;
