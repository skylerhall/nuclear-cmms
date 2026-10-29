import { ClipboardList, Columns3, List, Search, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DISCIPLINE_LABEL, OPEN_STATUSES, STATUS_LABEL, TYPE_LABEL } from '../../../shared/rules.ts';
import type { Discipline, WorkType } from '../../../shared/types.ts';
import { PriorityBadge, Tag, TypeBadge, WoLink, WoStatus } from '../components/domain.tsx';
import { Card, EmptyState, ErrorNote, PageHeader, Segmented, Spinner, cx, inputClass } from '../components/ui.tsx';
import { useApi } from '../lib/api.ts';
import { shortDate, timeAgo } from '../lib/format.ts';
import { navigate, useLocation } from '../lib/router.ts';
import type { WorkOrderRow } from '../lib/types.ts';

type View = 'list' | 'board';

function readView(): View {
  try {
    return localStorage.getItem('cmms_wo_view') === 'board' ? 'board' : 'list';
  } catch {
    return 'list';
  }
}

export function WorkOrdersPage() {
  const { query } = useLocation();
  const [status, setStatus] = useState(query.get('status') ?? 'open');
  const [type, setType] = useState<WorkType | ''>('');
  const [discipline, setDiscipline] = useState<Discipline | ''>('');
  const [search, setSearch] = useState(query.get('q') ?? '');
  const [view, setViewState] = useState<View>(readView);
  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem('cmms_wo_view', v);
    } catch {
      // remembered for this view only
    }
  };

  const path = `/work-orders?status=${status}&limit=300${type ? `&type=${type}` : ''}${discipline ? `&discipline=${discipline}` : ''}`;
  const { data, error } = useApi<{ total: number; rows: WorkOrderRow[] }>(path);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.rows ?? []).filter((w) => !q || [w.number, w.title, w.tag, w.equipmentName].some((v) => v.toLowerCase().includes(q)));
  }, [data, search]);

  return (
    <div>
      <PageHeader
        title="Work orders"
        subtitle="Requested → planning → ready → in progress → post-maintenance testing → closed. Each step has gates the server enforces."
        actions={<Segmented value={view} onChange={setView} options={[{ value: 'list', label: <span className="inline-flex items-center gap-1.5"><List size={14} /> List</span> }, { value: 'board', label: <span className="inline-flex items-center gap-1.5"><Columns3 size={14} /> Board</span> }]} />}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented value={status} onChange={setStatus} options={[{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }, { value: 'all', label: 'All' }]} />
        <select className={cx(inputClass, 'w-auto!')} value={type} onChange={(e) => setType(e.target.value as WorkType | '')} aria-label="Type">
          <option value="">All types</option>
          {(Object.keys(TYPE_LABEL) as WorkType[]).map((t) => (
            <option key={t} value={t}>
              {t} · {TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <select className={cx(inputClass, 'w-auto!')} value={discipline} onChange={(e) => setDiscipline(e.target.value as Discipline | '')} aria-label="Discipline">
          <option value="">All disciplines</option>
          {(Object.keys(DISCIPLINE_LABEL) as Discipline[]).map((d) => (
            <option key={d} value={d}>
              {DISCIPLINE_LABEL[d]}
            </option>
          ))}
        </select>
        <div className="relative min-w-56 flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input className={cx(inputClass, 'pl-9')} placeholder="Search number, title or tag" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>
      <ErrorNote error={error} />
      {!data ? <Spinner /> : view === 'board' && status === 'open' ? <Board rows={rows} /> : <Table rows={rows} total={data.total} />}
      {view === 'board' && status !== 'open' && <p className="mt-3 text-sm text-muted">The board shows open work. Switch the filter to Open.</p>}
    </div>
  );
}

function Table({ rows, total }: { rows: WorkOrderRow[]; total: number }) {
  if (!rows.length) return <Card><EmptyState icon={ClipboardList} title="No work orders match" /></Card>;
  return (
    <Card bodyClassName="overflow-x-auto">
      <table className="table-pin w-full min-w-[920px] text-sm">
        <thead>
          <tr className="border-b border-rule text-left text-xs font-medium text-muted">
            <th className="px-5 py-3">Work order</th>
            <th className="px-3 py-3">Equipment</th>
            <th className="px-3 py-3">Type</th>
            <th className="px-3 py-3">Priority</th>
            <th className="px-3 py-3">Status</th>
            <th className="px-3 py-3">Discipline</th>
            <th className="px-5 py-3 text-right">Due / raised</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((w) => (
            <tr key={w.id} onClick={() => navigate(`/work-orders/${w.id}`)} className="cursor-pointer border-b border-rule last:border-0 hover:bg-paper-3">
              <td className="max-w-xs px-5 py-3">
                <WoLink id={w.id} number={w.number} />
                <div className="truncate">{w.title}</div>
              </td>
              <td className="px-3 py-3">
                <div className="flex items-center gap-1.5">
                  <Tag>{w.tag}</Tag>
                  {w.safetyClass === 'SR' && <ShieldCheck size={13} className="text-muted" aria-label="Safety-related" />}
                </div>
                <div className="truncate text-xs text-muted">{w.equipmentName}</div>
              </td>
              <td className="px-3 py-3">
                <TypeBadge type={w.type} />
              </td>
              <td className="px-3 py-3">
                <PriorityBadge priority={w.priority} short />
              </td>
              <td className="px-3 py-3">
                <WoStatus status={w.status} />
              </td>
              <td className="px-3 py-3 text-muted">{DISCIPLINE_LABEL[w.discipline]}</td>
              <td className="whitespace-nowrap px-5 py-3 text-right text-xs text-muted tabular">
                {w.closedAt ? `Closed ${shortDate(w.closedAt.slice(0, 10))}` : w.dueDate ? `Due ${shortDate(w.dueDate)}` : timeAgo(w.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {total > rows.length && <div className="border-t border-rule px-5 py-3 text-xs text-muted">Showing {rows.length} of {total}. Narrow the filters to see more.</div>}
    </Card>
  );
}

function Board({ rows }: { rows: WorkOrderRow[] }) {
  return (
    <div className="scrollbar-thin -mx-4 flex gap-4 overflow-x-auto px-4 pb-4 md:mx-0 md:px-0">
      {OPEN_STATUSES.map((s) => {
        const col = rows.filter((w) => w.status === s);
        return (
          <div key={s} className="w-72 shrink-0">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-sm font-medium">{STATUS_LABEL[s]}</span>
              <span className="rounded-full bg-paper-2 px-2 text-xs font-medium text-muted ring-1 ring-rule">{col.length}</span>
            </div>
            <div className="space-y-2">
              {col.map((w) => (
                <article key={w.id} className="rounded-card border border-rule bg-paper-2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <WoLink id={w.id} number={w.number} />
                    <PriorityBadge priority={w.priority} short />
                  </div>
                  <div className="mt-1 line-clamp-2 text-sm">{w.title}</div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <Tag className="text-muted">{w.tag}</Tag>
                    <TypeBadge type={w.type} />
                  </div>
                </article>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
