import { Activity } from 'lucide-react';
import { useState } from 'react';
import type { AuditEntry } from '../../../shared/types.ts';
import { Button, Card, ErrorNote, PageHeader, Segmented, Spinner, cx } from '../components/ui.tsx';
import { useApi } from '../lib/api.ts';
import { dateTime } from '../lib/format.ts';
import { navigate } from '../lib/router.ts';

const PAGE = 50;

export function ActivityPage() {
  const [offset, setOffset] = useState(0);
  const [type, setType] = useState('');
  const { data, error } = useApi<{ rows: AuditEntry[]; total: number }>(`/audit?limit=${PAGE}&offset=${offset}${type ? `&entityType=${type}` : ''}`);
  return (
    <div>
      <PageHeader title="Activity log" subtitle="The audit trail: every sign-off, release, LCO entry and exit, part issue and evaluation, with who and when. Nothing is edited in place." />
      <div className="mb-4">
        <Segmented
          value={type}
          onChange={(v) => {
            setType(v);
            setOffset(0);
          }}
          options={[
            { value: '', label: 'Everything' },
            { value: 'work_order', label: 'Work orders' },
            { value: 'equipment', label: 'Operability' },
            { value: 'part', label: 'Storeroom' },
            { value: 'system', label: 'System' },
          ]}
        />
      </div>
      <ErrorNote error={error} />
      {!data ? (
        <Spinner />
      ) : (
        <Card bodyClassName="divide-y divide-rule">
          {data.rows.map((a) => (
            <div key={a.id} className="grid gap-1 px-5 py-3 text-sm md:grid-cols-[10rem_1fr_auto] md:items-start md:gap-4">
              <span className="text-xs text-muted tabular">{dateTime(a.at)}</span>
              <span className={cx(a.action.startsWith('lco.') && 'font-medium', a.action === 'wo.step_fail' && 'text-bad')}>
                <span className="font-medium">{a.actorName}</span> · {a.summary}
              </span>
              {a.entityType === 'work_order' && a.entityId ? (
                <button className="text-xs font-medium text-ink hover:underline" onClick={() => navigate(`/work-orders/${a.entityId}`)}>
                  Open
                </button>
              ) : a.entityType === 'equipment' && a.entityId ? (
                <button className="text-xs font-medium text-ink hover:underline" onClick={() => navigate(`/equipment/${a.entityId}`)}>
                  Open
                </button>
              ) : (
                <span />
              )}
            </div>
          ))}
          {!data.rows.length && (
            <div className="flex items-center gap-2 px-5 py-8 text-sm text-muted">
              <Activity size={16} /> Nothing recorded.
            </div>
          )}
          <div className="flex items-center justify-between px-5 py-3 text-xs text-muted">
            <span>
              {data.total ? offset + 1 : 0} to {Math.min(offset + PAGE, data.total)} of {data.total}
            </span>
            <span className="flex gap-2">
              <Button size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
                Newer
              </Button>
              <Button size="sm" disabled={offset + PAGE >= data.total} onClick={() => setOffset(offset + PAGE)}>
                Older
              </Button>
            </span>
          </div>
        </Card>
      )}
    </div>
  );
}
