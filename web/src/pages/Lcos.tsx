import { AlertOctagon, History, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { EquipmentLink, EquipmentState, LcoClock, WoLink, WoStatus } from '../components/domain.tsx';
import { Badge, Card, EmptyState, ErrorNote, PageHeader, Spinner } from '../components/ui.tsx';
import { useApi } from '../lib/api.ts';
import { dateTime, num } from '../lib/format.ts';
import type { LcoData } from '../lib/types.ts';

export function LcoPage() {
  const { data, error } = useApi<LcoData>('/lcos', { pollMs: 60_000 });
  const [asOf] = useState(Date.now());
  if (error) return <ErrorNote error={error} />;
  if (!data) return <Spinner />;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Tech Spec LCOs"
        subtitle="When Tech Spec equipment is inoperable, the Limiting Condition for Operation's completion time starts. Work that would take out the opposite train is blocked while one train is down."
      />
      {data.ts303.map((a) => (
        <div key={a.techSpec.id} className="flex items-start gap-3 rounded-2xl border border-red-300 bg-red-50 px-5 py-4 text-red-800">
          <AlertOctagon size={20} className="mt-0.5 shrink-0 text-critical" />
          <div>
            <div className="font-semibold">LCO 3.0.3 entered: no operable train of TS {a.techSpec.code}</div>
            <div className="text-sm">{a.equipment.map((e) => e.tag).join(', ')} inoperable. Begin shutdown within 1 hour; MODE 3 within 7 hours.</div>
          </div>
        </div>
      ))}

      <Card title="In effect now" icon={ShieldAlert} bodyClassName="divide-y divide-line/70">
        {!data.active.length && <EmptyState icon={ShieldCheck} title="No LCOs in effect" text="All Tech Spec equipment is operable." />}
        {data.active.map((l) => (
          <div key={l.oos.id} className="grid gap-4 px-5 py-4 md:grid-cols-[1fr_auto] md:items-center">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="red">LCO {l.techSpec.code}</Badge>
                <EquipmentLink id={l.equipment.id} tag={l.equipment.tag} />
                <span className="text-sm text-muted">{l.equipment.name}</span>
              </div>
              <div className="text-sm">
                <span className="font-medium">{l.techSpec.condition}.</span> <span className="text-muted">Required action: {l.techSpec.requiredAction}.</span>
              </div>
              <div className="text-xs text-muted">
                Entered {dateTime(l.oos.startedAt)} by {l.oos.enteredBy} · due {dateTime(l.oos.lcoDueAt!)}
              </div>
              {l.workOrder && (
                <div className="flex items-center gap-2 text-xs">
                  <WoLink id={l.workOrder.id} number={l.workOrder.number} /> <WoStatus status={l.workOrder.status} /> <span className="truncate text-muted">{l.workOrder.title}</span>
                </div>
              )}
            </div>
            <LcoClock hoursRemaining={l.hoursRemaining} completionHours={l.techSpec.completionHours} asOf={asOf} />
          </div>
        ))}
      </Card>

      <div>
        <h3 className="mb-3 font-semibold">Train status by LCO</h3>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.trains.map(({ techSpec, equipment }) => {
            const down = equipment.filter((e) => e.status === 'inoperable');
            return (
              <Card key={techSpec.id} className={down.length ? 'border-red-200' : undefined} bodyClassName="p-4">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">LCO {techSpec.code}</div>
                    <div className="text-xs text-muted">{techSpec.title}</div>
                  </div>
                  <span className="shrink-0 text-xs text-faint">{techSpec.completionHours} h</span>
                </div>
                <div className="divide-y divide-line/60">
                  {equipment.map((e) => (
                    <div key={e.id} className="flex items-center justify-between gap-2 py-1.5">
                      <span className="min-w-0 truncate">
                        <EquipmentLink id={e.id} tag={e.tag} /> {e.train && <span className="text-xs text-muted">· {/^[IVX]+$/.test(e.train) ? `Ch ${e.train}` : `Train ${e.train}`}</span>}
                      </span>
                      <EquipmentState status={e.status} techSpec />
                    </div>
                  ))}
                </div>
                {down.length > 0 && <div className="mt-2 text-xs font-medium text-amber-800">Opposite-train work is protected until {down.map((d) => d.tag).join(', ')} is restored.</div>}
              </Card>
            );
          })}
        </div>
      </div>

      <Card title="Exited in the last 90 days" icon={History} bodyClassName="overflow-x-auto">
        {!data.history.length ? (
          <EmptyState icon={History} title="No LCO entries in the last 90 days" />
        ) : (
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-faint">
                <th className="px-5 py-3">LCO</th>
                <th className="px-3 py-3">Equipment</th>
                <th className="px-3 py-3">Entered</th>
                <th className="px-3 py-3">Duration</th>
                <th className="px-5 py-3">Work order</th>
              </tr>
            </thead>
            <tbody>
              {data.history.map((h) => (
                <tr key={h.id} className="border-b border-line/60 last:border-0">
                  <td className="px-5 py-2.5 font-semibold">{h.code}</td>
                  <td className="px-3 py-2.5">
                    <EquipmentLink id={h.equipmentId} tag={h.tag} />
                  </td>
                  <td className="px-3 py-2.5 text-muted">{dateTime(h.startedAt)}</td>
                  <td className="px-3 py-2.5 tabular">
                    {num(h.hours, 1)} h <span className="text-xs text-faint">of {h.completionHours} h ({Math.round((h.hours / h.completionHours) * 100)}%)</span>
                  </td>
                  <td className="px-5 py-2.5 font-mono text-xs">{h.woNumber}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
