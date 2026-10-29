import { AlertOctagon, ArrowRight, CalendarClock, ClipboardList, FlaskConical, Gauge, ShieldAlert, Siren, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { DISCIPLINE_LABEL } from '../../../shared/rules.ts';
import { BarList, Columns } from '../components/charts.tsx';
import { DueChip, EquipmentLink, EquipmentState, LcoClock, PriorityBadge, Tag, TypeBadge, WoLink, WoStatus } from '../components/domain.tsx';
import { Button, Card, EmptyState, ErrorNote, Spinner, Stat, useToast } from '../components/ui.tsx';
import { api, useApi } from '../lib/api.ts';
import { useApp } from '../lib/app-context.ts';
import { shortDate, timeAgo } from '../lib/format.ts';
import { navigate } from '../lib/router.ts';
import type { OverviewData, WorkOrderRow } from '../lib/types.ts';

const SCENARIOS = [
  {
    title: 'Protected train',
    text: 'EDG 1B is in a 72-hour LCO. Try to release the EDG 1A overhaul as the Shift Manager: the system refuses, because both diesels would be out (LCO 3.0.3).',
    as: 'sam',
    search: '18-month inspection',
  },
  {
    title: 'Failed surveillance',
    text: 'The RHR Pump 1A quarterly test is in the field. As the mechanical tech, record 0.41 in/s on the outboard bearing: the pump goes inoperable, the LCO clock starts and corrective work is raised.',
    as: 'tom',
    search: 'RHR Pump 1A quarterly',
  },
  {
    title: 'Work package gates',
    text: 'The CCW Pump 1B bearing job is in planning. As the planner, try Mark ready: it is missing a post-maintenance test. Add one and it passes.',
    as: 'dana',
    search: 'Out of tolerance: Motor outboard',
  },
  {
    title: 'Return to service',
    text: 'Breaker 1A01-03 is waiting on its post-maintenance test. Sign it as the electrical tech, then switch to the Shift Manager to close it and return the breaker to service.',
    as: 'elena',
    search: 'Breaker 1A01-03 overhaul',
  },
];

export function OverviewPage() {
  const { data, error } = useApi<OverviewData>('/overview', { pollMs: 60_000 });
  const [asOf] = useState(Date.now());
  if (error) return <ErrorNote error={error} />;
  if (!data) return <Spinner />;

  const soonest = data.lcos[0];
  return (
    <div className="space-y-6">
      {data.ts303.map((a) => (
        <div key={a.techSpec.id} className="flex items-start gap-3 rounded-2xl border border-red-300 bg-red-50 px-5 py-4 text-red-800">
          <AlertOctagon size={20} className="mt-0.5 shrink-0 text-critical" />
          <div>
            <div className="font-semibold">LCO 3.0.3: every train of TS {a.techSpec.code} is inoperable</div>
            <div className="text-sm">
              {a.equipment.map((e) => e.tag).join(', ')}. Action to place the unit in MODE 3 within 7 hours unless a train is restored.
            </div>
          </div>
        </div>
      ))}

      <Scenarios />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
        <Stat label="Open work orders" value={data.openTotal} note={`${data.byStatus.ready} ready · ${data.byStatus.in_progress + data.byStatus.testing} in the field`} icon={ClipboardList} />
        <Stat label="Emergent and urgent" value={data.emergent.length} note="P1 and P2, open" icon={Siren} tone={data.emergent.some((e) => e.priority === 1) ? 'red' : 'amber'} />
        <Stat label="Active LCOs" value={data.lcos.length} note={soonest ? `${soonest.equipment.tag} has the least time` : 'All Tech Spec equipment operable'} icon={ShieldAlert} tone={data.lcos.length ? 'red' : 'green'} />
        <Stat label="PM compliance, 90 days" value={data.compliance.pct === null ? '–' : `${data.compliance.pct}%`} note={`${data.compliance.onTime} of ${data.compliance.done} done by the late date`} icon={CalendarClock} tone="blue" />
        <Stat label="Overdue or in grace" value={data.overdueCount + data.inGraceCount} note={`${data.overdueCount} overdue · ${data.inGraceCount} in grace`} icon={FlaskConical} tone={data.overdueCount ? 'red' : 'amber'} />
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <Card title="Tech Spec LCOs in effect" subtitle="Completion-time clocks for inoperable equipment" icon={ShieldAlert} className="xl:col-span-3" bodyClassName="divide-y divide-line/70" action={<Button size="sm" variant="ghost" onClick={() => navigate('/lcos')}>All LCOs</Button>}>
          {data.lcos.length === 0 && <EmptyState icon={ShieldAlert} title="No LCOs in effect" text="All Tech Spec equipment is operable." />}
          {data.lcos.map((l) => (
            <div key={l.oos.id} className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_auto] md:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <EquipmentLink id={l.equipment.id} tag={l.equipment.tag} />
                  <span className="text-sm text-muted">{l.equipment.name}</span>
                </div>
                <div className="mt-1 text-sm">
                  <span className="font-semibold">TS {l.techSpec.code}</span> <span className="text-muted">· {l.techSpec.condition}</span>
                </div>
                {l.workOrder && (
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                    <WoLink id={l.workOrder.id} number={l.workOrder.number} /> {l.workOrder.title}
                  </div>
                )}
              </div>
              <LcoClock hoursRemaining={l.hoursRemaining} completionHours={l.techSpec.completionHours} asOf={asOf} />
            </div>
          ))}
        </Card>

        <Card title="Equipment not fully available" icon={Gauge} className="xl:col-span-2" bodyClassName="divide-y divide-line/70">
          {data.equipmentDown.map((e) => (
            <div key={e.id} className="flex items-start justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <EquipmentLink id={e.id} tag={e.tag} />
                <div className="truncate text-xs text-muted">{e.statusNote ?? e.name}</div>
              </div>
              <EquipmentState status={e.status} techSpec={Boolean(e.techSpecId)} />
            </div>
          ))}
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Emergent and urgent work" icon={Siren} bodyClassName="divide-y divide-line/70">
          {data.emergent.map((w) => (
            <button key={w.id} onClick={() => navigate(`/work-orders/${w.id}`)} className="flex w-full items-start justify-between gap-3 px-5 py-3 text-left hover:bg-soft/50">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Tag className="text-brand">{w.number}</Tag>
                  <Tag className="text-muted">{w.tag}</Tag>
                </div>
                <div className="mt-0.5 truncate text-sm">{w.title}</div>
                <div className="mt-1 text-xs text-faint">Raised {timeAgo(w.createdAt)}</div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <PriorityBadge priority={w.priority} short />
                <WoStatus status={w.status} />
              </div>
            </button>
          ))}
        </Card>

        <Card title="PM and surveillance needing attention" subtitle="Inside the lead window, in grace, or overdue" icon={CalendarClock} bodyClassName="divide-y divide-line/70" action={<Button size="sm" variant="ghost" onClick={() => navigate('/schedule')}>Schedule</Button>}>
          {data.attention.map((a) => (
            <div key={a.planId} className="flex items-start justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <TypeBadge type={a.type} />
                  <Tag className="text-muted">{a.tag}</Tag>
                </div>
                <div className="mt-0.5 truncate text-sm">{a.title}</div>
                {a.openWorkOrder && (
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                    <WoLink id={a.openWorkOrder.id} number={a.openWorkOrder.number} /> <WoStatus status={a.openWorkOrder.status} />
                  </div>
                )}
              </div>
              <DueChip due={a.due} st={a.type === 'ST'} />
            </div>
          ))}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Open work by discipline" subtitle="Work orders and estimated hours">
          <BarList rows={data.backlog.map((b) => ({ label: DISCIPLINE_LABEL[b.discipline], value: b.total, note: `${b.corrective} corrective · ${b.hours} est. hours` }))} />
        </Card>
        <Card title="Corrective backlog age" subtitle="Open CM work orders by days since raised">
          <BarList rows={data.ageBuckets.map((b) => ({ label: b.label, value: b.count }))} />
        </Card>
        <Card title="Work orders closed per week" subtitle="Last 12 weeks">
          <Columns valueLabel="closed" points={data.throughput.map((t) => ({ label: shortDate(t.week), value: t.closed, detail: `${t.corrective} corrective` }))} />
        </Card>
      </div>
    </div>
  );
}

function Scenarios() {
  const { setActor, people } = useApp();
  const toast = useToast();
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem('cmms_hide_scenarios') === '1';
    } catch {
      return false;
    }
  });
  const go = async (s: (typeof SCENARIOS)[number]) => {
    try {
      const found = await api<{ rows: WorkOrderRow[] }>(`/work-orders?status=all&q=${encodeURIComponent(s.search)}`);
      const wo = found.rows.find((w) => w.status !== 'closed' && w.status !== 'cancelled');
      if (!wo) return toast('That scenario has already been played out. Reset the demo data from About this demo.', 'info');
      setActor(s.as);
      navigate(`/work-orders/${wo.id}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };
  if (hidden)
    return (
      <button onClick={() => setHidden(false)} className="inline-flex items-center gap-2 text-sm font-medium text-brand hover:underline">
        <Sparkles size={15} /> Show the guided scenarios
      </button>
    );
  return (
    <Card
      title="Try the rules"
      subtitle="Four scenarios that show what a nuclear CMMS enforces. Each one switches who you're acting as."
      icon={Sparkles}
      action={
        <button
          className="text-sm text-muted hover:text-ink"
          onClick={() => {
            setHidden(true);
            try {
              localStorage.setItem('cmms_hide_scenarios', '1');
            } catch {
              // fine: hidden for this view only
            }
          }}
        >
          Hide
        </button>
      }
    >
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {SCENARIOS.map((s) => (
          <button key={s.title} onClick={() => go(s)} className="group flex flex-col rounded-xl border border-line p-4 text-left transition hover:border-brand/40 hover:bg-brand/4">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">{s.title}</span>
              <ArrowRight size={15} className="text-faint transition group-hover:translate-x-0.5 group-hover:text-brand" />
            </div>
            <p className="mt-1.5 flex-1 text-sm leading-6 text-muted">{s.text}</p>
            <span className="mt-3 text-xs font-medium text-brand">Act as {people.find((p) => p.id === s.as)?.name}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}
