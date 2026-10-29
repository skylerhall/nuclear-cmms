import { ArrowLeft, Gauge, LineChart, Plus, Search, ShieldAlert, Siren, Wrench } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DISCIPLINE_LABEL, intervalText, isOpen } from '../../../shared/rules.ts';
import type { WorkOrder } from '../../../shared/types.ts';
import { TrendChart } from '../components/charts.tsx';
import { AppLink, DueChip, EquipmentLink, EquipmentState, PriorityBadge, SafetyBadge, Tag, TypeBadge, WoLink, WoStatus } from '../components/domain.tsx';
import { NewRequestModal } from '../components/NewRequest.tsx';
import { Badge, Button, Card, EmptyState, ErrorNote, Field, Modal, PageHeader, Spinner, cx, inputClass, useToast } from '../components/ui.tsx';
import { api, useApi } from '../lib/api.ts';
import { useApp } from '../lib/app-context.ts';
import { dateTime, duration, isoDate, longDate, num, shortDate } from '../lib/format.ts';
import { navigate } from '../lib/router.ts';
import type { EquipmentDetail, EquipmentRow } from '../lib/types.ts';

export function EquipmentPage() {
  const { systems, techSpecs } = useApp();
  const { data, error } = useApi<EquipmentRow[]>('/equipment');
  const tsCode = (id: string | null) => techSpecs.find((t) => t.id === id)?.code;
  const [system, setSystem] = useState('');
  const [search, setSearch] = useState('');
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((e) => (!system || e.systemCode === system) && (!q || e.tag.toLowerCase().includes(q) || e.name.toLowerCase().includes(q)));
  }, [data, system, search]);
  const grouped = systems.map((s) => ({ system: s, rows: rows.filter((e) => e.systemCode === s.code) })).filter((g) => g.rows.length);

  return (
    <div>
      <PageHeader title="Equipment" subtitle="The component registry: tag, safety classification, Tech Spec coverage, train, and live operability." />
      <div className="mb-4 flex flex-wrap gap-2">
        <select className={cx(inputClass, 'w-auto!')} value={system} onChange={(e) => setSystem(e.target.value)} aria-label="System">
          <option value="">All systems</option>
          {systems.map((s) => (
            <option key={s.code} value={s.code}>
              {s.code} · {s.name}
            </option>
          ))}
        </select>
        <div className="relative min-w-56 flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input className={cx(inputClass, 'pl-9')} placeholder="Search tag or name" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>
      <ErrorNote error={error} />
      {!data ? (
        <Spinner />
      ) : (
        <div className="space-y-6">
          {grouped.map((g) => (
            <Card key={g.system.code} title={`${g.system.code} · ${g.system.name}`} subtitle={g.system.riskSignificant ? 'Risk-significant system (Maintenance Rule)' : undefined} bodyClassName="overflow-x-auto">
              <table className="table-pin w-full min-w-[880px] text-sm">
                <tbody>
                  {g.rows.map((e) => (
                    <tr key={e.id} onClick={() => navigate(`/equipment/${e.id}`)} className="cursor-pointer border-b border-rule last:border-0 hover:bg-paper-3">
                      <td className="w-56 px-5 py-3">
                        <EquipmentLink id={e.id} tag={e.tag} />
                        <div className="truncate text-xs text-muted">{e.name}</div>
                      </td>
                      <td className="px-3 py-3">
                        <SafetyBadge cls={e.safetyClass} />
                      </td>
                      <td className="px-3 py-3 text-xs text-muted">
                        {[e.techSpecId && `TS ${tsCode(e.techSpecId)}`, e.train && `Train ${e.train}`].filter(Boolean).join(' · ')}
                      </td>
                      <td className="px-3 py-3">
                        <EquipmentState status={e.status} techSpec={Boolean(e.techSpecId)} />
                        {e.lco && <div className="mt-0.5 text-xs font-medium text-bad tabular">LCO {e.lco.code}: {e.lco.hoursRemaining > 0 ? `${duration(e.lco.hoursRemaining)} left` : 'exceeded'}</div>}
                      </td>
                      <td className="px-3 py-3 text-xs text-muted">{e.openWork ? `${e.openWork} open work order${e.openWork === 1 ? '' : 's'}` : 'No open work'}</td>
                      <td className="px-5 py-3 text-right">{e.nextDue && <DueChip due={e.nextDue.due} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export function EquipmentDetailPage({ id }: { id: string }) {
  const { actor, changed } = useApp();
  const toast = useToast();
  const { data, error, reload } = useApi<EquipmentDetail>(`/equipment/${encodeURIComponent(id)}`);
  const [requesting, setRequesting] = useState(false);
  const [declaring, setDeclaring] = useState(false);
  const [reason, setReason] = useState('');
  const [meter, setMeter] = useState('');
  if (error) return <ErrorNote error={error} />;
  if (!data) return <Spinner />;
  const { equipment: e, techSpec, system } = data;
  const openWork = data.workOrders.filter((w) => isOpen(w.status));
  const closedWork = data.workOrders.filter((w) => !isOpen(w.status));
  const cms = closedWork.filter((w) => w.type === 'CM');

  const declare = async () => {
    try {
      const wo = await api<WorkOrder>(`/equipment/${e.id}/inoperable`, { body: { reason } });
      toast(`${e.tag} declared ${techSpec ? 'inoperable' : 'out of service'}. ${wo.number} raised.`, 'error');
      setDeclaring(false);
      changed();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };
  const logMeter = async () => {
    try {
      await api(`/equipment/${e.id}/meter`, { body: { hours: meter } });
      toast('Meter reading recorded');
      setMeter('');
      void reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  return (
    <div className="space-y-6">
      <AppLink to="/equipment" className="inline-flex items-center gap-1.5 text-sm text-ink-2 no-underline">
        <ArrowLeft size={15} aria-hidden /> Equipment
      </AppLink>
      <PageHeader
        title={e.name}
        subtitle={
          <>
            <span className="flex flex-wrap items-center gap-2">
              <Tag className="text-md">{e.tag}</Tag> <SafetyBadge cls={e.safetyClass} /> <EquipmentState status={e.status} techSpec={Boolean(techSpec)} />
            </span>
            {e.statusNote && <span className="mt-1.5 block text-ink-2">{e.statusNote}</span>}
          </>
        }
        actions={
          <>
            <Button icon={Plus} onClick={() => setRequesting(true)}>
              Work request
            </Button>
            {e.status !== 'inoperable' && (
              <Button variant="danger" icon={Siren} onClick={() => setDeclaring(true)} disabled={actor.role !== 'sro'} title={actor.role !== 'sro' ? 'Only the Shift Manager (SRO) declares operability' : undefined}>
                Declare {techSpec ? 'inoperable' : 'out of service'}
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Nameplate" icon={Wrench} bodyClassName="divide-y divide-rule px-5 py-1 text-sm">
          {[
            ['System', `${system.code} · ${system.name}`],
            ['Type', e.equipmentType],
            ['Discipline', DISCIPLINE_LABEL[e.discipline]],
            ['Criticality', ['', '1 · Critical', '2 · Important', '3 · Run to failure'][e.criticality]],
            ['Train / channel', e.train ?? '–'],
            ['Location', e.location],
            ['Manufacturer', e.manufacturer],
            ['Model', e.model],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 py-2">
              <span className="text-muted">{k}</span>
              <span className="text-right">{v}</span>
            </div>
          ))}
        </Card>

        <Card title="Tech Spec coverage" icon={ShieldAlert}>
          {techSpec ? (
            <div className="space-y-3 text-sm">
              <div>
                <div className="font-medium">
                  LCO {techSpec.code} · {techSpec.title}
                </div>
                <div className="mt-1 text-muted">
                  {techSpec.condition}. {techSpec.requiredAction} within <span className="font-medium text-ink">{techSpec.completionHours} h</span>.
                </div>
              </div>
              <div>
                <div className="mb-1.5 text-xs font-medium text-muted">Other components under this LCO</div>
                {data.sameSpec.map((x) => (
                  <div key={x.id} className="flex items-center justify-between gap-3 py-1">
                    <span>
                      <EquipmentLink id={x.id} tag={x.tag} /> <span className="text-xs text-muted">{x.train ? `Train ${x.train}` : ''}</span>
                    </span>
                    <EquipmentState status={x.status} techSpec />
                  </div>
                ))}
              </div>
              {data.protectedConflicts.length > 0 && (
                <div className="rounded-card border border-accent bg-accent-soft px-3 py-2 text-xs text-accent">
                  Protected train: {data.protectedConflicts.map((c) => c.tag).join(', ')} is inoperable, so planned work can’t take {e.tag} out of service.
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted">No Tech Spec LCO applies. Out-of-service time still counts toward Maintenance Rule unavailability.</p>
          )}
        </Card>

        <Card title="Reliability, 24 months" icon={Gauge} bodyClassName="divide-y divide-rule px-5 py-1 text-sm">
          {[
            ['Corrective work orders', String(cms.length)],
            ['Functional failures', String(cms.filter((w) => w.functionalFailure).length)],
            ['Out-of-service events', String(data.oos.length)],
            ['Out-of-service hours', num(data.oos.reduce((s, o) => s + o.hours, 0), 1)],
            ...(e.runHours !== null ? [['Run hours', num(e.runHours)]] : []),
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 py-2">
              <span className="text-muted">{k}</span>
              <span className="font-medium tabular">{v}</span>
            </div>
          ))}
          {e.runHours !== null && (
            <div className="flex items-center gap-2 py-3">
              <input className={cx(inputClass, 'h-9 flex-1')} inputMode="numeric" placeholder={`New meter reading (now ${num(e.runHours)} h)`} value={meter} onChange={(ev) => setMeter(ev.target.value)} />
              <Button size="sm" onClick={logMeter} disabled={!meter}>
                Record
              </Button>
            </div>
          )}
        </Card>
      </div>

      {data.trends.length > 0 && (
        <Card title="Condition trends" subtitle="Readings recorded on past work orders, against their acceptance limits" icon={LineChart}>
          <div className="grid gap-8 lg:grid-cols-2">
            {data.trends.slice(0, 4).map((t) => (
              <div key={t.text}>
                <div className="mb-1 text-sm font-medium">{t.text}</div>
                <div className="mb-2 text-xs text-muted">
                  {t.points.length} readings{t.unit ? `, ${t.unit}` : ''}
                </div>
                <TrendChart points={t.points.map((p) => ({ value: p.value, at: p.at, label: longDate(isoDate(p.at)).replace(/^\w+, /, ''), sub: p.number }))} unit={t.unit} min={t.minValue} max={t.maxValue} />
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="PM and surveillance plans" bodyClassName="divide-y divide-rule">
          {!data.plans.length && <EmptyState icon={Gauge} title="No PM plans" />}
          {data.plans.map((p) => (
            <div key={p.id} className="flex items-start justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <TypeBadge type={p.type} />
                  {p.srRef && <span className="text-xs text-muted">{p.srRef}</span>}
                </div>
                <div className="mt-0.5 text-sm">{p.title}</div>
                <div className="text-xs text-muted">
                  {intervalText(p)} · last done {p.lastDoneDate ? shortDate(p.lastDoneDate) : 'never'}
                </div>
              </div>
              <DueChip due={p.due} st={p.type === 'ST'} />
            </div>
          ))}
        </Card>
        <Card title="Open work" bodyClassName="divide-y divide-rule">
          {!openWork.length && <EmptyState icon={Wrench} title="No open work" />}
          {openWork.map((w) => (
            <WorkLine key={w.id} w={w} />
          ))}
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Work history" subtitle={`${closedWork.length} closed or cancelled`} bodyClassName="max-h-[480px] divide-y divide-rule overflow-y-auto">
          {closedWork.map((w) => (
            <WorkLine key={w.id} w={w} />
          ))}
        </Card>
        <Card title="Out-of-service history" bodyClassName="max-h-[480px] divide-y divide-rule overflow-y-auto">
          {!data.oos.length && <EmptyState icon={ShieldAlert} title="Never out of service in this record" />}
          {data.oos.map((o) => (
            <div key={o.id} className="flex items-start justify-between gap-3 px-5 py-3 text-sm">
              <div className="min-w-0">
                <div className="truncate">{o.reason}</div>
                <div className="text-xs text-muted">
                  {dateTime(o.startedAt)} → {o.endedAt ? dateTime(o.endedAt) : 'now'}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-medium tabular">{num(o.hours, 1)} h</div>
                {o.techSpecId && <Badge tone={o.endedAt ? 'gray' : 'red'}>LCO</Badge>}
              </div>
            </div>
          ))}
        </Card>
      </div>

      <NewRequestModal open={requesting} onClose={() => setRequesting(false)} equipmentId={e.id} />
      <Modal
        open={declaring}
        onClose={() => setDeclaring(false)}
        title={`Declare ${e.tag} ${techSpec ? 'inoperable' : 'out of service'}`}
        subtitle={techSpec ? `Enters LCO ${techSpec.code} now: ${techSpec.completionHours} h to restore. A P1 corrective work order is raised.` : 'Raises corrective work and records the out-of-service time.'}
        footer={
          <>
            <Button onClick={() => setDeclaring(false)}>Cancel</Button>
            <Button variant="danger" onClick={declare} disabled={reason.trim().length < 5}>
              Declare
            </Button>
          </>
        }
      >
        <Field label="What was found">
          <textarea className={cx(inputClass, 'h-24 py-2')} value={reason} onChange={(ev) => setReason(ev.target.value)} placeholder="e.g. Fuel oil leak at injection pump 3L; engine secured" />
        </Field>
      </Modal>
    </div>
  );
}

function WorkLine({ w }: { w: WorkOrder }) {
  return (
    <div className="flex w-full items-start justify-between gap-3 px-5 py-3">
      <div className="min-w-0">
        <div className="flex items-baseline gap-3">
          <WoLink id={w.id} number={w.number} />
          <TypeBadge type={w.type} />
          {w.functionalFailure && <Badge tone="red">Functional failure</Badge>}
        </div>
        <div className="mt-0.5 truncate">{w.title}</div>
        <div className="measured text-sm text-cool">{w.closedAt ? `Closed ${dateTime(w.closedAt)}` : `Raised ${dateTime(w.createdAt)}`}</div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <PriorityBadge priority={w.priority} short />
        <WoStatus status={w.status} />
      </div>
    </div>
  );
}
