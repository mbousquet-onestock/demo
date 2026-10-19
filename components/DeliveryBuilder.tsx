import React, { useMemo, useState } from 'react';
import { DeliveryScript, DeliveryScriptOperation } from '../types';
import { deliveryScriptsStore } from '../services/appStores';
import { listProjects, getLastProject, setLastProject, savedPayloadsStore } from '../services/payloadStore';
import { useApiTarget, isProductionTarget, missingTargetFields } from '../services/onestockClient';
import { DeliveryConfig } from '../services/deliveryRouteService';
import {
  OPERATION_KINDS, OperationKind, PROMPT_EXAMPLES, generateOperations, newOperation, operationIssues, runOperation, operationSummary,
} from '../services/deliveryScriptService';

const KIND_STYLE: Record<OperationKind, string> = {
  timetable: 'bg-purple-50 text-purple-700',
  zone: 'bg-blue-50 text-blue-700',
  delivery_route: 'bg-emerald-50 text-emerald-700',
};

// Delivery Promise configuration from a prompt: OpenAI writes the operations (timetables, zones, routes), they are
// reviewed / edited, run with the OneStock APIs (POST /timetables, /zones, /delivery_routes) and saved per project.
const DeliveryBuilder: React.FC<{ config: DeliveryConfig | null; onDone?: () => void }> = ({ config, onDone }) => {
  const scripts = deliveryScriptsStore.use();
  const payloads = savedPayloadsStore.use();
  const projects = useMemo(() => listProjects([...scripts, ...payloads]), [scripts, payloads]);
  const target = useApiTarget();
  const missing = missingTargetFields(target);

  const [scriptId, setScriptId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [project, setProject] = useState(getLastProject());
  const [prompt, setPrompt] = useState('');
  const [ops, setOps] = useState<DeliveryScriptOperation[]>([]);
  const [generating, setGenerating] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string; error?: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const generate = async () => {
    if (!prompt.trim()) return;
    if (ops.length && !window.confirm('Replace the current operations with the generated ones?')) return;
    setGenerating(true);
    setError(null);
    try {
      const generated = await generateOperations(prompt.trim(), config);
      if (generated.length === 0) throw new Error('OpenAI returned no operation: make the request more precise.');
      setOps(generated);
      if (!name) setName(prompt.trim().slice(0, 60));
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setGenerating(false);
    }
  };

  const persist = (operations = ops, silent = false) => {
    const now = new Date().toISOString();
    const id = scriptId || Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const script: DeliveryScript = {
      id, name: name.trim() || `Delivery config ${new Date().toLocaleString()}`, project: project.trim() || undefined,
      prompt, operations, createdAt: scripts.find(s => s.id === id)?.createdAt || now, updatedAt: now,
    };
    deliveryScriptsStore.set(prev => [script, ...prev.filter(s => s.id !== id)]);
    setScriptId(id);
    if (project.trim()) setLastProject(project.trim());
    if (!silent) setNotice(`Saved "${script.name}"${script.project ? ` in ${script.project}` : ''}.`);
  };

  const open = (s: DeliveryScript) => {
    setScriptId(s.id); setName(s.name); setProject(s.project || ''); setPrompt(s.prompt); setOps(s.operations); setNotice(null); setError(null);
  };
  const reset = () => { setScriptId(null); setName(''); setPrompt(''); setOps([]); setNotice(null); setError(null); };

  const confirmProd = () => !isProductionTarget(target)
    || window.confirm(`Create this configuration on ${target.baseUrl} (site ${target.siteId})? This is not a qualification URL.`);

  // Runs the operations in order (timetables, zones, routes); already created ones are skipped.
  const runAll = async (only?: string) => {
    if (missing || !confirmProd()) return;
    let current = [...ops].sort((a, b) => OPERATION_KINDS[a.kind].order - OPERATION_KINDS[b.kind].order);
    const todo = current.filter(o => (only ? o.id === only : !o.result?.ok));
    for (const op of todo) {
      setRunning(op.id);
      // A route whose zone / timetable of this script failed is not sent.
      const refs = op.kind === 'delivery_route'
        ? ['origin_zone_id', 'destination_zone_id', 'pickup_timetable_id', 'delivery_timetable_id', 'opening_timetable_id'].map(k => op.body?.[k]).filter(Boolean)
        : [];
      const failedRef = refs.find(id => current.some(o => o.kind !== 'delivery_route' && o.body?.id === id && o.result && !o.result.ok));
      const result = failedRef
        ? { ok: false, status: null, message: `Skipped: ${failedRef} was not created.`, at: new Date().toISOString() }
        : await runOperation(op);
      current = current.map(o => (o.id === op.id ? { ...o, result } : o));
      setOps(current);
    }
    setRunning(null);
    persist(current, true);
    const failed = current.filter(o => o.result && !o.result.ok).length;
    setNotice(`${todo.length} operation(s) run · ${failed} failed · results saved with the script. Reload the configuration to see them.`);
    onDone?.();
  };

  const saveEdit = () => {
    if (!editing) return;
    try {
      const body = JSON.parse(editing.text);
      setOps(prev => prev.map(o => (o.id === editing.id ? { ...o, body, result: undefined } : o)));
      setEditing(null);
    } catch (err: any) {
      setEditing({ ...editing, error: `Invalid JSON: ${err?.message || err}` });
    }
  };

  const issuesCount = ops.reduce((n, o) => n + operationIssues(o, ops, config).length, 0);
  const done = ops.filter(o => o.result?.ok).length;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_280px] gap-4 items-start">
      <div className="space-y-4 min-w-0">
        {/* Prompt */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-3">
          <div className="flex items-center gap-3">
            <h3 className="flex-1 text-sm font-bold text-[#002D72]">Describe the configuration to create</h3>
            {scriptId && <button onClick={reset} className="text-[11px] font-bold text-gray-500 underline">New script</button>}
          </div>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Zones (origin / destination), carriers and their schedules, delivery routes with transit times and costs…"
            className="w-full h-28 px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-[#002D72]"
          />
          <div className="flex flex-wrap gap-2">
            {PROMPT_EXAMPLES.map((ex, i) => (
              <button key={i} onClick={() => setPrompt(ex)} title={ex} className="px-2 py-1 text-[11px] text-gray-600 bg-gray-100 rounded-md hover:bg-blue-50 text-left max-w-[300px] truncate">Example {i + 1}: {ex}</button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={generate} disabled={!prompt.trim() || generating} className="px-4 py-2 text-xs font-bold text-white bg-[#002D72] rounded-lg disabled:opacity-40">{generating ? 'Generating…' : 'Generate the operations (ChatGPT)'}</button>
            <span className="text-[11px] text-gray-400">The OpenAI key of API Settings is used; existing zones, routes, timetables and stock points are given as context.</span>
          </div>
          {error && <p className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg break-words">{error}</p>}
        </div>

        {/* Operations */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="flex-1 text-sm font-bold text-[#002D72]">Operations ({ops.length}){done ? ` · ${done} created` : ''}{issuesCount ? <span className="ml-2 text-amber-600">· {issuesCount} warning(s)</span> : null}</h3>
            {(Object.keys(OPERATION_KINDS) as OperationKind[]).map(k => (
              <button key={k} onClick={() => setOps(prev => [...prev, newOperation(k)].sort((a, b) => OPERATION_KINDS[a.kind].order - OPERATION_KINDS[b.kind].order))} className="px-2 py-1 text-[11px] font-bold text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">+ {OPERATION_KINDS[k].label}</button>
            ))}
          </div>
          {ops.length === 0 && <p className="text-xs text-gray-400">Generate the operations from a request, or add them by hand.</p>}
          <ul className="space-y-2">
            {[...ops].sort((a, b) => OPERATION_KINDS[a.kind].order - OPERATION_KINDS[b.kind].order).map(op => {
              const issues = operationIssues(op, ops, config);
              const isEditing = editing?.id === op.id;
              return (
                <li key={op.id} className="border border-gray-200 rounded-xl p-3 text-xs space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${KIND_STYLE[op.kind]}`}>{OPERATION_KINDS[op.kind].label}</span>
                    <span className="font-mono font-bold text-gray-800">{op.body?.id || '—'}</span>
                    <span className="flex-1 text-gray-600 truncate">{op.label}</span>
                    {op.result && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${op.result.ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{op.result.status ?? 'ERR'}</span>}
                    <button onClick={() => setEditing(isEditing ? null : { id: op.id, text: JSON.stringify(op.body, null, 2) })} className="px-2 py-1 text-[11px] font-bold text-gray-600 border border-gray-300 rounded">{isEditing ? 'Close' : 'Edit'}</button>
                    <button onClick={() => runAll(op.id)} disabled={!!running || !!missing} className="px-2 py-1 text-[11px] font-bold text-white bg-emerald-600 rounded disabled:opacity-40">{running === op.id ? '…' : 'Run'}</button>
                    <button onClick={() => setOps(prev => prev.filter(o => o.id !== op.id))} className="px-1.5 text-gray-400 hover:text-red-600" title="Remove">✕</button>
                  </div>
                  <p className="text-gray-500 font-mono text-[11px]">POST {OPERATION_KINDS[op.kind].path} · {operationSummary(op)}</p>
                  {issues.map(i => <p key={i} className="text-amber-700">⚠ {i}</p>)}
                  {op.result && !op.result.ok && <p className="text-red-600 break-words">{op.result.message}{op.result.requestId ? ` · Request-Id ${op.result.requestId}` : ''}</p>}
                  {isEditing && (
                    <div className="space-y-1">
                      <textarea value={editing.text} onChange={e => setEditing({ ...editing, text: e.target.value, error: undefined })} spellCheck={false} className="w-full h-56 font-mono text-[11px] p-3 bg-gray-900 text-gray-100 rounded-lg" />
                      {editing.error && <p className="text-red-600">{editing.error}</p>}
                      <button onClick={saveEdit} className="px-3 py-1.5 text-[11px] font-bold text-white bg-[#002D72] rounded-lg">Apply</button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {ops.length > 0 && (
            <div className="pt-3 border-t border-gray-100 space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Script name" className="px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg" />
                <input value={project} onChange={e => setProject(e.target.value)} list="dr-script-projects" placeholder="Project (e.g. Client/Phase 1)" className="px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg" />
                <datalist id="dr-script-projects">{projects.map(p => <option key={p} value={p} />)}</datalist>
                <button onClick={() => persist()} className="px-4 py-2 text-xs font-bold text-[#002D72] border border-[#002D72]/30 rounded-lg hover:bg-blue-50">Save</button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button onClick={() => runAll()} disabled={!!running || !!missing || done === ops.length} className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 rounded-lg disabled:opacity-40">
                  {running ? 'Running…' : done ? `Run the ${ops.length - done} remaining operation(s)` : `Run the ${ops.length} operation(s) on ${target.siteId || '?'}`}
                </button>
                {missing && <span className="text-xs text-amber-700">Missing in API Settings: {missing}</span>}
                <span className="text-[11px] text-gray-400">Order: timetables, zones, routes · already created operations are skipped.</span>
              </div>
              {notice && <p className="text-xs text-emerald-700">{notice}</p>}
            </div>
          )}
        </div>
      </div>

      {/* Saved scripts */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-2 xl:sticky xl:top-4">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Saved scripts ({scripts.length})</p>
        {scripts.length === 0 && <p className="text-xs text-gray-400">Saved scripts are stored in the database, per project (also in the Projects tab).</p>}
        <ul className="space-y-1 max-h-[60vh] overflow-y-auto">
          {scripts.map(s => (
            <li key={s.id} className={`p-2 rounded-lg border text-xs ${s.id === scriptId ? 'border-[#002D72] bg-blue-50/50' : 'border-gray-100'}`}>
              <button onClick={() => open(s)} className="text-left w-full">
                <p className="font-bold text-gray-800 truncate">{s.name}</p>
                <p className="text-[10px] text-gray-400">{s.project || 'No project'} · {s.operations.length} op. · {s.operations.filter(o => o.result?.ok).length} created</p>
              </button>
              <button onClick={() => window.confirm(`Delete the script "${s.name}"? (nothing is deleted in OneStock)`) && deliveryScriptsStore.set(prev => prev.filter(x => x.id !== s.id))} className="text-[10px] text-gray-400 hover:text-red-600">Delete</button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default DeliveryBuilder;
