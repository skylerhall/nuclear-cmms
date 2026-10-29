import { AlertOctagon, CalendarClock, Gauge, ShieldAlert, ShieldCheck, Siren } from 'lucide-react';
import { useState } from 'react';
import { DISCIPLINE_LABEL } from '../../../shared/rules.ts';
import { BarList, Columns } from '../components/charts.tsx';
import { AppLink, DueChip, EquipmentLink, EquipmentState, LcoClock, PriorityBadge, TypeBadge, WoLink, WoStatus } from '../components/domain.tsx';
import { Button, Card, EmptyState, ErrorNote, Spinner, Stat, StatGrid, useToast } from '../components/ui.tsx';
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
  if (!data) return <Spinner rows={6} />;

  const soonest = data.lcos[0];
  return (
    <div className="space-y-10">
      {data.ts303.map((a) => (
        <div key={a.techSpec.id} role="alert" className="flex items-start gap-3 rounded-card border border-bad bg-bad-soft px-5 py-4">
          <AlertOctagon size={20} className="mt-0.5 shrink-0 text-bad" aria-hidden />
          <div>
            <div className="font-medium text-bad">LCO 3.0.3: every train of TS {a.techSpec.code} is inoperable</div>
            <div className="text-sm text-ink-2">
              {a.equipment.map((e) => e.tag).join(', ')}. Action to place the unit in MODE 3 within 7 hours unless a train is restored.
            </div>
          </div>
        </div>
      ))}

      {/* The signature: the Tech Spec clock board, each completion time a reading. */}
      <section aria-labelledby="clocks" className="grid gap-px overflow-hidden rounded-card border border-rule bg-rule xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 bg-paper-2">
          <div className="flex items-start justify-between gap-4 border-b border-rule px-6 py-5">
            <div>
              <h2 id="clocks" className="text-2xl">Tech Spec LCOs in effect</h2>
              <p className="mt-1 text-sm text-muted">Time left to restore each inoperable component before its required action.</p>
            </div>
            <AppLink to="/lcos" className="shrink-0 text-sm text-ink-2">
              All LCOs
            </AppLink>
          </div>
          {data.lcos.length === 0 && <EmptyState icon={ShieldCheck} title="No LCOs in effect" text="All Tech Spec equipment is operable." />}
          <div className="divide-y divide-rule">
            {data.lcos.map((l) => (
              <div key={l.oos.id} className="grid gap-5 px-6 py-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <EquipmentLink id={l.equipment.id} tag={l.equipment.tag} />
                    <span className="text-ink-2">{l.equipment.name}</span>
                  </div>
                  <div className="text-sm text-muted">
                    <span className="font-medium text-ink">TS {l.techSpec.code}:</span> {l.techSpec.condition}
                  </div>
                  {l.workOrder && (
                    <div className="flex min-w-0 items-baseline gap-2 text-sm text-muted">
                      <WoLink id={l.workOrder.id} number={l.workOrder.number} />
                      <span className="min-w-0 truncate">{l.workOrder.title}</span>
                    </div>
                  )}
                </div>
                <LcoClock hoursRemaining={l.hoursRemaining} completionHours={l.techSpec.completionHours} asOf={asOf} />
              </div>
            ))}
          </div>
        </div>

        <div className="min-w-0 bg-paper-2">
          <div className="border-b border-rule px-6 py-5">
            <h2 className="text-xl">Equipment not fully available</h2>
            <p className="mt-1 text-sm text-muted">{data.equipmentDown.length} components inoperable, out of service or degraded.</p>
          </div>
          <ul className="divide-y divide-rule">
            {data.equipmentDown.map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-3 px-6 py-3">
                <div className="min-w-0">
                  <EquipmentLink id={e.id} tag={e.tag} />
                  <div className="truncate text-sm text-muted">{e.statusNote ?? e.name}</div>
                </div>
                <EquipmentState status={e.status} techSpec={Boolean(e.techSpecId)} />
              </li>
            ))}
          </ul>
        </div>
      </section>

      <StatGrid className="grid-cols-2 xl:grid-cols-5">
        <Stat label="Open work orders" value={data.openTotal} note={`${data.byStatus.ready} ready, ${data.byStatus.in_progress + data.byStatus.testing} in the field`} />
        <Stat label="Emergent and urgent" value={data.emergent.length} note="P1 and P2, open" tone={data.emergent.some((e) => e.priority === 1) ? 'bad' : undefined} />
        <Stat label="Active LCOs" value={data.lcos.length} note={soonest ? `${soonest.equipment.tag} has the least time` : 'All Tech Spec equipment operable'} tone={data.lcos.length ? 'bad' : 'ok'} />
        <Stat label="PM compliance, 90 days" value={data.compliance.pct === null ? 'None' : `${data.compliance.pct}%`} note={`${data.compliance.onTime} of ${data.compliance.done} done by the late date`} />
        <Stat label="Overdue or in grace" value={data.overdueCount + data.inGraceCount} note={`${data.overdueCount} overdue, ${data.inGraceCount} in grace`} tone={data.overdueCount ? 'bad' : data.inGraceCount ? 'accent' : undefined} />
      </StatGrid>

      <Scenarios />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Emergent and urgent work" icon={Siren} bodyClassName="divide-y divide-rule">
          {data.emergent.length === 0 && <EmptyState icon={Siren} title="No P1 or P2 work open" />}
          {data.emergent.map((w) => (
            <div key={w.id} className="flex items-start justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <div className="flex items-baseline gap-3">
                  <WoLink id={w.id} number={w.number} />
                  <span className="measured text-sm text-muted">{w.tag}</span>
                </div>
                <div className="mt-0.5 truncate">{w.title}</div>
                <div className="mt-0.5 text-sm text-muted">Raised {timeAgo(w.createdAt)}</div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <PriorityBadge priority={w.priority} short />
                <WoStatus status={w.status} />
              </div>
            </div>
          ))}
        </Card>

        <Card title="PM and surveillance due" subtitle="Inside the lead window, in grace, or overdue" icon={CalendarClock} bodyClassName="divide-y divide-rule" action={<AppLink to="/schedule" className="shrink-0 text-sm text-ink-2">Schedule</AppLink>}>
          {data.attention.length === 0 && <EmptyState icon={CalendarClock} title="Nothing due inside its lead window" />}
          {data.attention.map((a) => (
            <div key={a.planId} className="flex items-start justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <div className="flex items-baseline gap-3">
                  <TypeBadge type={a.type} />
                  <span className="measured text-sm text-muted">{a.tag}</span>
                </div>
                <div className="mt-0.5 truncate">{a.title}</div>
                {a.openWorkOrder && (
                  <div className="mt-1 flex items-center gap-2 text-sm">
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
        <Card title="Open work by discipline" subtitle="Work orders, with estimated hours" icon={Gauge}>
          <BarList rows={data.backlog.map((b) => ({ label: DISCIPLINE_LABEL[b.discipline], value: b.total, note: `${b.corrective} corrective, ${b.hours} estimated hours` }))} />
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
  const setHide = (v: boolean) => {
    setHidden(v);
    try {
      localStorage.setItem('cmms_hide_scenarios', v ? '1' : '0');
    } catch {
      // fine: remembered for this view only
    }
  };
  if (hidden)
    return (
      <Button variant="ghost" size="sm" onClick={() => setHide(false)}>
        Show the scenarios
      </Button>
    );
  return (
    <section aria-labelledby="scenarios">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 id="scenarios" className="text-2xl">Try the rules</h2>
          <p className="mt-1 text-sm text-muted">Four scenarios that show what a nuclear CMMS enforces. Each one switches who you’re acting as.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setHide(true)}>
          Hide
        </Button>
      </div>
      <div className="grid gap-px overflow-hidden rounded-card border border-rule bg-rule md:grid-cols-2 xl:grid-cols-4">
        {SCENARIOS.map((s) => (
          <div key={s.title} className="flex min-w-0 flex-col bg-paper-2 p-5">
            <h3 className="text-lg">{s.title}</h3>
            <p className="mt-2 flex-1 text-sm leading-6 text-muted">{s.text}</p>
            <Button size="sm" className="mt-4 self-start" onClick={() => go(s)}>
              Open as {people.find((p) => p.id === s.as)?.name}
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
