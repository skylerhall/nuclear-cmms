import { CalendarClock, Play } from 'lucide-react';
import { useMemo, useState } from 'react';
import { TYPE_LABEL, intervalText } from '../../../shared/rules.ts';
import { DueChip, EquipmentLink, TypeBadge, WoLink, WoStatus } from '../components/domain.tsx';
import { Button, Card, EmptyState, ErrorNote, PageHeader, Segmented, Spinner, Stat, useToast } from '../components/ui.tsx';
import { api, useApi } from '../lib/api.ts';
import { useApp } from '../lib/app-context.ts';
import { num, shortDate } from '../lib/format.ts';
import type { PlanRow } from '../lib/types.ts';

export function SchedulePage() {
  const { actor } = useApp();
  const toast = useToast();
  const { data, error, reload } = useApi<PlanRow[]>('/schedule');
  const [type, setType] = useState<'all' | 'ST' | 'PM' | 'PDM'>('all');
  const [scope, setScope] = useState<'attention' | 'all'>('attention');
  const [running, setRunning] = useState(false);
  const rows = useMemo(() => (data ?? []).filter((r) => (type === 'all' || r.plan.type === type) && (scope === 'all' || r.due.state !== 'ok')), [data, type, scope]);

  const run = async () => {
    setRunning(true);
    try {
      const res = await api<{ created: { number: string }[] }>('/schedule/generate', { body: {} });
      toast(res.created.length ? `Generated ${res.created.map((c) => c.number).join(', ')}` : 'Nothing new is due. Every plan inside its window already has open work.', res.created.length ? 'success' : 'info');
      await reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setRunning(false);
    }
  };

  const st = (data ?? []).filter((r) => r.plan.type === 'ST');
  return (
    <div>
      <PageHeader
        title="PM and surveillance schedule"
        subtitle="Calendar and run-hour plans. Surveillances follow SR 3.0.2: done within 1.25× the interval, measured from the last performance. Past the late date the surveillance is missed (SR 3.0.3)."
        actions={
          <Button variant="primary" icon={Play} onClick={run} loading={running} disabled={actor.role !== 'planner' && actor.role !== 'supervisor'} title="The generator also runs every hour on its own">
            Run PM generator
          </Button>
        }
      />
      <ErrorNote error={error} />
      {!data ? (
        <Spinner />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Active plans" value={data.length} note={`${st.length} Tech Spec surveillances`} icon={CalendarClock} />
            <Stat label="Due within lead time" value={data.filter((r) => r.due.state === 'due_soon').length} tone="blue" />
            <Stat label="In grace period" value={data.filter((r) => r.due.state === 'in_grace').length} note="Past due, before the late date" tone="amber" />
            <Stat label="Overdue" value={data.filter((r) => r.due.state === 'overdue').length} note={`${st.filter((r) => r.due.state === 'overdue').length} missed surveillances`} tone="red" />
          </div>
          <div className="mb-4 flex flex-wrap gap-2">
            <Segmented value={scope} onChange={setScope} options={[{ value: 'attention', label: 'Needs attention' }, { value: 'all', label: 'All plans' }]} />
            <Segmented value={type} onChange={setType} options={[{ value: 'all', label: 'All' }, ...(['ST', 'PM', 'PDM'] as const).map((t) => ({ value: t, label: TYPE_LABEL[t] }))]} />
          </div>
          <Card bodyClassName="overflow-x-auto">
            {!rows.length ? (
              <EmptyState icon={CalendarClock} title="Nothing needs attention" text="Every plan is outside its lead window." />
            ) : (
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-faint">
                    <th className="px-5 py-3">Plan</th>
                    <th className="px-3 py-3">Equipment</th>
                    <th className="px-3 py-3">Interval</th>
                    <th className="px-3 py-3">Last done</th>
                    <th className="px-3 py-3">Due / late</th>
                    <th className="px-3 py-3">State</th>
                    <th className="px-5 py-3">Work order</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.plan.id} className="border-b border-line/60 last:border-0">
                      <td className="max-w-sm px-5 py-3">
                        <div className="flex items-center gap-2">
                          <TypeBadge type={r.plan.type} />
                          {r.plan.srRef && <span className="text-xs text-muted">{r.plan.srRef}</span>}
                        </div>
                        <div className="mt-0.5 truncate">{r.plan.title}</div>
                      </td>
                      <td className="px-3 py-3">
                        <EquipmentLink id={r.equipment.id} tag={r.equipment.tag} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-muted">{intervalText(r.plan)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-muted tabular">{r.plan.intervalHours !== null ? `${num(r.plan.lastDoneHours ?? 0)} h` : r.plan.lastDoneDate ? shortDate(r.plan.lastDoneDate) : 'Never'}</td>
                      <td className="whitespace-nowrap px-3 py-3 tabular">{r.due.basis === 'meter' ? `${num(r.due.dueHours ?? 0)} / ${num(r.due.lateHours ?? 0)} h` : `${shortDate(r.due.dueDate!)} / ${shortDate(r.due.lateDate!)}`}</td>
                      <td className="px-3 py-3">
                        <DueChip due={r.due} st={r.plan.type === 'ST'} />
                      </td>
                      <td className="px-5 py-3">
                        {r.openWorkOrder ? (
                          <span className="flex items-center gap-2">
                            <WoLink id={r.openWorkOrder.id} number={r.openWorkOrder.number} /> <WoStatus status={r.openWorkOrder.status} />
                          </span>
                        ) : (
                          <span className="text-xs text-faint">{r.due.state === 'ok' ? 'Not yet generated' : 'Run the generator'}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
