import { AlertTriangle, CheckCircle2, OctagonX, TrendingUp } from 'lucide-react';
import { LimitMeter } from '../components/charts.tsx';
import { Badge, Card, ErrorNote, PageHeader, Spinner, Stat, StatGrid } from '../components/ui.tsx';
import { useApi } from '../lib/api.ts';
import { num } from '../lib/format.ts';
import type { SystemReliability } from '../lib/types.ts';

const STATUS = {
  a1: { label: '(a)(1) · goal setting', icon: OctagonX, cls: 'text-bad', iconCls: 'text-bad' },
  watch: { label: 'Approaching criteria', icon: AlertTriangle, cls: 'text-accent', iconCls: 'text-accent' },
  a2: { label: '(a)(2) · meeting criteria', icon: CheckCircle2, cls: 'text-ok', iconCls: 'text-ok' },
} as const;

export function ReliabilityPage() {
  const { data, error } = useApi<{ windowDays: number; systems: SystemReliability[] }>('/reliability');
  if (error) return <ErrorNote error={error} />;
  if (!data) return <Spinner />;
  const order = { a1: 0, watch: 1, a2: 2 };
  const systems = [...data.systems].sort((a, b) => order[a.status] - order[b.status] || Number(b.system.riskSignificant) - Number(a.system.riskSignificant) || a.system.code.localeCompare(b.system.code));
  return (
    <div>
      <PageHeader
        title="Maintenance Rule (10 CFR 50.65)"
        subtitle="Each system is held to performance criteria over a rolling 24 months: how many functional failures the system engineer has counted, and how long its components were unavailable. A system over its criteria moves to (a)(1): goal setting and closer monitoring until it recovers."
      />
      <StatGrid className="mb-8 grid-cols-2 lg:grid-cols-4">
        <Stat label="Systems monitored" value={data.systems.length} note={`${data.systems.filter((s) => s.system.riskSignificant).length} risk-significant`} />
        <Stat label="In (a)(1)" value={data.systems.filter((s) => s.status === 'a1').length} tone="bad" />
        <Stat label="Approaching criteria" value={data.systems.filter((s) => s.status === 'watch').length} note="At 75% or more of a limit" tone="accent" />
        <Stat label="Functional failures, 24 months" value={data.systems.reduce((s, r) => s + r.functionalFailures, 0)} />
      </StatGrid>
      <Card bodyClassName="overflow-x-auto">
        <table className="table-pin w-full min-w-[1000px] text-sm">
          <thead>
            <tr className="border-b border-rule text-left text-xs font-medium text-muted">
              <th className="px-5 py-3">System</th>
              <th className="px-3 py-3">Status</th>
              <th className="w-48 px-3 py-3">Functional failures</th>
              <th className="w-56 px-3 py-3">Unavailability (h)</th>
              <th className="px-3 py-3 text-right">Corrective WOs</th>
              <th className="px-3 py-3 text-right">MTBF</th>
              <th className="px-5 py-3 text-right">MTTR</th>
            </tr>
          </thead>
          <tbody>
            {systems.map((r) => {
              const s = STATUS[r.status];
              return (
                <tr key={r.system.code} className="border-b border-rule last:border-0">
                  <td className="px-5 py-3.5">
                    <div className="font-medium">
                      {r.system.code} <span className="font-normal">· {r.system.name}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                      {r.equipmentCount} components {r.system.riskSignificant && <Badge tone="purple">Risk-significant</Badge>}
                    </div>
                  </td>
                  <td className="px-3 py-3.5">
                    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium ${s.cls}`}>
                      <s.icon size={14} className={s.iconCls} /> {s.label}
                    </span>
                  </td>
                  <td className="px-3 py-3.5">
                    <LimitMeter value={r.functionalFailures} limit={r.system.mrFunctionalFailureLimit} label="Counted / allowed" />
                  </td>
                  <td className="px-3 py-3.5">
                    <LimitMeter value={Math.round(r.unavailabilityHours)} limit={r.system.mrUnavailabilityLimitHours} label="Hours / allowed" />
                  </td>
                  <td className="px-3 py-3.5 text-right tabular">{r.correctiveCount}</td>
                  <td className="whitespace-nowrap px-3 py-3.5 text-right tabular" title="Component-hours per functional failure">
                    {r.mtbfHours === null ? <span className="text-muted">No failures</span> : `${num(r.mtbfHours / 8760, 1)} yr`}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3.5 text-right tabular" title="Mean hours out of service for corrective work">
                    {r.mttrHours === null ? <span className="text-muted">None</span> : `${num(r.mttrHours, 1)} h`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <p className="mt-3 text-xs text-muted">MTBF counts component-years per functional failure. MTTR is the mean out-of-service time for corrective work. Window: {data.windowDays} days.</p>
    </div>
  );
}
