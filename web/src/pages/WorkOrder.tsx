import {
  ArrowLeft,
  Boxes,
  Check,
  CheckCircle2,
  CircleDashed,
  ClipboardCheck,
  Clock,
  GitBranch,
  HardHat,
  History,
  Lock,
  OctagonX,
  Plus,
  Radiation,
  ShieldAlert,
  Trash2,
  TrendingUp,
  UserRound,
  XCircle,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { DISCIPLINE_LABEL, PRIORITY_LABEL, ROLE_LABEL, STATUS_FLOW, STATUS_LABEL, STEP_KIND_LABEL, TYPE_LABEL, criteriaText, needsValue, stepPhase, stepRoles } from '../../../shared/rules.ts';
import type { ActionOption, Priority, Role, StepKind, WorkStep } from '../../../shared/types.ts';
import { AppLink, DueChip, EquipmentLink, EquipmentState, LcoClock, PriorityBadge, SafetyBadge, Tag, TypeBadge, WoLink, WoStatus } from '../components/domain.tsx';
import { Badge, Button, Card, ErrorNote, Field, Modal, Spinner, Toggle, cx, inputClass, useToast } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { useApp } from '../lib/app-context.ts';
import { dateTime, money, num, shortDate } from '../lib/format.ts';
import { navigate } from '../lib/router.ts';
import type { PartRow, WorkOrderDetail } from '../lib/types.ts';

type Mutate = (path: string, init?: { method?: string; body?: unknown }, success?: string) => Promise<boolean>;

export function WorkOrderPage({ id }: { id: string }) {
  const toast = useToast();
  const [detail, setDetail] = useState<WorkOrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asOf, setAsOf] = useState(Date.now());

  useEffect(() => {
    api<WorkOrderDetail>(`/work-orders/${encodeURIComponent(id)}`)
      .then((d) => {
        setDetail(d);
        setAsOf(Date.now());
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [id]);

  const mutate: Mutate = async (path, init = {}, success) => {
    try {
      const d = await api<WorkOrderDetail>(`/work-orders/${detail!.workOrder.id}${path}`, init);
      setDetail(d);
      setAsOf(Date.now());
      const sr = d.signResult;
      if (sr?.result === 'fail') {
        toast(sr.enteredLco ? `Out of tolerance. ${d.equipment.tag} declared inoperable and the LCO clock started. Corrective work ${sr.followUp?.number ?? ''} raised.` : `Out of tolerance. ${sr.followUp ? `Corrective work ${sr.followUp.number} raised.` : 'Re-perform after rework.'}`, 'error');
      } else if (success) toast(success);
      return true;
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
      return false;
    }
  };

  if (error) return <ErrorNote error={error} />;
  if (!detail) return <Spinner />;
  const { workOrder: wo, equipment, techSpec } = detail;

  return (
    <div className="space-y-6">
      <AppLink to="/work-orders" className="inline-flex items-center gap-1.5 text-sm text-ink-2 no-underline">
        <ArrowLeft size={15} aria-hidden /> Work orders
      </AppLink>

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Tag className="text-lg">{wo.number}</Tag>
          <TypeBadge type={wo.type} />
          <PriorityBadge priority={wo.priority} />
          <WoStatus status={wo.status} />
        </div>
        <h2 className="text-2xl font-medium md:text-[28px]">{wo.title}</h2>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span className="flex items-center gap-2">
            <EquipmentLink id={equipment.id} tag={equipment.tag} /> <span className="text-muted">{equipment.name}</span>
          </span>
          <SafetyBadge cls={equipment.safetyClass} />
          <EquipmentState status={equipment.status} techSpec={Boolean(techSpec)} />
          {techSpec && <Badge tone="gray">TS {techSpec.code}{equipment.train ? ` · Train ${equipment.train}` : ''}</Badge>}
          {wo.requiresOos && <Badge tone="red"><Lock size={11} /> Removes from service</Badge>}
          {wo.radArea && <Badge tone="amber"><Radiation size={11} /> Rad area</Badge>}
          {wo.fme && <Badge tone="blue"><ShieldAlert size={11} /> FME area</Badge>}
          {wo.confinedSpace && <Badge tone="amber"><HardHat size={11} /> Confined space</Badge>}
        </div>
      </header>

      <Stepper status={wo.status} />

      {detail.equipmentOos.map((o) =>
        o.lcoDueAt && techSpec ? (
          <div key={o.id} className="grid gap-4 rounded-card border border-bad bg-bad-soft px-5 py-4 md:grid-cols-[1fr_auto] md:items-center">
            <div className="flex items-start gap-3">
              <ShieldAlert size={18} className="mt-0.5 shrink-0 text-bad" />
              <div>
                <div className="font-medium text-bad">
                  {o.heldByThis ? `This work holds ${equipment.tag} inoperable` : `${equipment.tag} is inoperable`}: LCO {techSpec.code}
                </div>
                {o.holder && (
                  <div className="text-sm text-bad">
                    Restored through <WoLink id={o.holder.id} number={o.holder.number} />. {o.reason}
                  </div>
                )}
                <div className="text-sm text-bad">
                  {techSpec.requiredAction} within {techSpec.completionHours} h. Entered {dateTime(o.startedAt)} by {o.enteredBy}.
                </div>
              </div>
            </div>
            <LcoClock hoursRemaining={(Date.parse(o.lcoDueAt) - asOf) / 3_600_000} completionHours={techSpec.completionHours} asOf={asOf} />
          </div>
        ) : (
          <div key={o.id} className="flex items-center gap-3 rounded-card border border-accent bg-accent-soft px-5 py-3 text-sm text-accent">
            <Lock size={16} /> {o.heldByThis ? 'This work holds' : o.holder ? <>Work order <WoLink id={o.holder.id} number={o.holder.number} /> holds</> : 'Operations holds'} {equipment.tag} out of service since {dateTime(o.startedAt)}. No Tech Spec LCO applies.
          </div>
        ),
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {wo.description && (
            <Card title="Description" bodyClassName="px-5 py-4">
              <p className="whitespace-pre-line text-sm leading-6">{wo.description}</p>
            </Card>
          )}
          <StepsCard detail={detail} mutate={mutate} />
          <PartsCard detail={detail} mutate={mutate} />
          {(wo.requiresOos || wo.clearancePoints.length > 0) && <ClearanceCard detail={detail} mutate={mutate} />}
          <LaborCard detail={detail} mutate={mutate} />
          <HistoryCard detail={detail} />
        </div>
        <div className="space-y-6">
          <ActionsCard detail={detail} mutate={mutate} />
          <PlanningCard detail={detail} mutate={mutate} />
          {wo.type === 'CM' && <MaintenanceRuleCard detail={detail} mutate={mutate} />}
          <RelatedCard detail={detail} />
        </div>
      </div>
    </div>
  );
}

function Stepper({ status }: { status: WorkOrderDetail['workOrder']['status'] }) {
  if (status === 'cancelled') return <div className="rounded-card border border-rule bg-paper-2 px-4 py-3 text-sm text-muted">Cancelled</div>;
  const at = STATUS_FLOW.indexOf(status);
  return (
    <ol aria-label="Work order status" className="grid grid-cols-3 gap-px overflow-hidden rounded-card border border-rule bg-rule md:grid-cols-6">
      {STATUS_FLOW.map((s, i) => {
        const done = i < at || status === 'closed';
        const current = i === at && status !== 'closed';
        return (
          <li key={s} aria-current={current ? 'step' : undefined} className={cx('flex items-center gap-2 px-3 py-2.5 text-sm', current ? 'bg-accent-soft font-medium text-accent' : 'bg-paper-2', done ? 'text-ink-2' : !current && 'text-muted')}>
            {done ? <CheckCircle2 size={15} className="shrink-0 text-ok" aria-hidden /> : current ? <CircleDashed size={15} className="shrink-0" aria-hidden /> : <span className="measured w-[15px] shrink-0 text-center text-sm">{i + 1}</span>}
            {STATUS_LABEL[s]}
          </li>
        );
      })}
    </ol>
  );
}

// ── Steps ──────────────────────────────────────────────────────────────────

// A reading and a test are instruments (cool); a QC hold is a person's signature (amber).
const KIND_TONE: Record<StepKind, 'gray' | 'blue' | 'purple' | 'amber'> = { step: 'gray', reading: 'blue', qc_hold: 'amber', pmt: 'blue' };

function StepsCard({ detail, mutate }: { detail: WorkOrderDetail; mutate: Mutate }) {
  const { actor } = useApp();
  const wo = detail.workOrder;
  const canEdit = actor.role === 'planner' && wo.status === 'planning';
  const done = detail.steps.filter((s) => s.completedAt && s.result !== 'fail').length;
  return (
    <Card title="Work instructions" subtitle={`${done} of ${detail.steps.length} signed`} icon={ClipboardCheck} bodyClassName="divide-y divide-rule">
      {!detail.steps.length && <div className="px-5 py-6 text-sm text-muted">No steps yet. The planner writes the work instructions during planning.</div>}
      {detail.steps.map((s) => (
        <StepRow key={s.id} step={s} detail={detail} mutate={mutate} canEdit={canEdit} />
      ))}
      {canEdit && <AddStep mutate={mutate} />}
    </Card>
  );
}

function StepRow({ step, detail, mutate, canEdit }: { step: WorkStep; detail: WorkOrderDetail; mutate: Mutate; canEdit: boolean }) {
  const { actor } = useApp();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const wo = detail.workOrder;
  const phase = stepPhase(step.kind);
  const signable = wo.status === phase && (!step.completedAt || step.result === 'fail');
  const allowed = stepRoles(step.kind).includes(actor.role);
  const criteria = criteriaText(step);
  const sign = async () => {
    setBusy(true);
    const ok = await mutate(`/steps/${step.id}/sign`, { body: { value: needsValue(step) ? value : null } }, step.kind === 'qc_hold' ? 'QC hold point signed' : 'Step signed');
    if (ok) setValue('');
    setBusy(false);
  };
  return (
    <div className={cx('grid gap-3 px-5 py-3.5 md:grid-cols-[2rem_1fr_auto] md:items-start', step.result === 'fail' && 'bg-bad-soft')}>
      <span className="measured text-sm text-muted">{String(step.seq).padStart(2, '0')}</span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={KIND_TONE[step.kind]}>{STEP_KIND_LABEL[step.kind]}</Badge>
          {criteria && (
            <span className="text-sm text-muted">
              Acceptance <span className="measured text-ink-2">{criteria}</span>
            </span>
          )}
        </div>
        <p className="mt-1.5 leading-6">{step.text}</p>
        {step.completedAt && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {step.result === 'fail' ? <XCircle size={15} className="text-bad" aria-hidden /> : <Check size={15} className="text-ok" aria-hidden />}
            {step.value !== null && (
              <span className={step.result === 'fail' ? 'text-bad' : 'text-ink-2'}>
                <span className="measured text-ink">
                  {step.value}
                  {step.unit ? `\u00a0${step.unit}` : ''}
                </span>{' '}
                {step.result === 'fail' ? 'out of tolerance, re-perform after rework' : 'sat'}
              </span>
            )}
            <span className="text-accent">{step.completedBy}</span>
            <span className="measured text-cool">{dateTime(step.completedAt)}</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 md:justify-end">
        {signable &&
          (allowed ? (
            <>
              {needsValue(step) && (
                <input inputMode="decimal" className={cx(inputClass, 'h-8 w-28! text-right tabular')} placeholder={step.unit ?? 'value'} value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && value && sign()} aria-label={`Value for step ${step.seq}`} />
              )}
              <Button size="sm" onClick={sign} loading={busy} disabled={needsValue(step) && !value}>
                {step.result === 'fail' ? 'Re-perform' : 'Sign'}
              </Button>
            </>
          ) : (
            <span className="text-sm text-muted">{stepRoles(step.kind).map((r) => ROLE_LABEL[r]).join(' or ')} signs</span>
          ))}
        {!signable && !step.completedAt && wo.status !== 'closed' && wo.status !== 'cancelled' && <span className="text-sm text-muted">{phase === 'testing' ? 'After work complete' : 'When released'}</span>}
        {canEdit && (
          <button onClick={() => mutate(`/steps/${step.id}`, { method: 'DELETE' }, 'Step removed')} className="rounded-pill p-1.5 text-muted hover:bg-bad-soft hover:text-bad" aria-label="Remove step">
            <Trash2 size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

function AddStep({ mutate }: { mutate: Mutate }) {
  const [kind, setKind] = useState<StepKind>('step');
  const [text, setText] = useState('');
  const [unit, setUnit] = useState('');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const measured = kind === 'reading' || kind === 'pmt';
  const add = async () => {
    const ok = await mutate('/steps', { body: { kind, text, unit: measured ? unit : '', min: measured ? min : '', max: measured ? max : '' } }, 'Step added');
    if (ok) {
      setText('');
      setUnit('');
      setMin('');
      setMax('');
    }
  };
  return (
    <div className="space-y-3 bg-paper-3 px-5 py-4">
      <div className="flex flex-wrap gap-2">
        <select className={cx(inputClass, 'w-auto!')} value={kind} onChange={(e) => setKind(e.target.value as StepKind)} aria-label="Step type">
          {(Object.keys(STEP_KIND_LABEL) as StepKind[]).map((k) => (
            <option key={k} value={k}>
              {STEP_KIND_LABEL[k]}
            </option>
          ))}
        </select>
        <input className={cx(inputClass, 'min-w-64 flex-1')} placeholder={kind === 'pmt' ? 'e.g. Run pump 1 h; outboard bearing vibration' : kind === 'qc_hold' ? 'e.g. QC verify torque and FME closeout' : 'Describe the step'} value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      {measured && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Acceptance</span>
          <input className={cx(inputClass, 'h-9 w-24!')} placeholder="min" value={min} onChange={(e) => setMin(e.target.value)} aria-label="Minimum" />
          <span className="text-muted">to</span>
          <input className={cx(inputClass, 'h-9 w-24!')} placeholder="max" value={max} onChange={(e) => setMax(e.target.value)} aria-label="Maximum" />
          <input className={cx(inputClass, 'h-9 w-24!')} placeholder="unit" value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Unit" />
          <span className="text-xs text-muted">{kind === 'reading' ? 'A reading needs a min, a max, or both.' : 'Optional for a PMT.'}</span>
        </div>
      )}
      <Button size="sm" icon={Plus} onClick={add} disabled={text.trim().length < 4}>
        Add {STEP_KIND_LABEL[kind].toLowerCase()}
      </Button>
    </div>
  );
}

// ── Parts ──────────────────────────────────────────────────────────────────

function PartsCard({ detail, mutate }: { detail: WorkOrderDetail; mutate: Mutate }) {
  const { actor } = useApp();
  const wo = detail.workOrder;
  const [adding, setAdding] = useState(false);
  const canPlan = actor.role === 'planner' && (wo.status === 'planning' || wo.status === 'ready');
  const canIssue = (actor.role === 'technician' || actor.role === 'supervisor') && (wo.status === 'in_progress' || wo.status === 'testing');
  if (!detail.parts.length && !canPlan) return null;
  return (
    <Card title="Parts" subtitle={detail.equipment.safetyClass === 'SR' ? 'Safety-related equipment: Q-level parts only' : undefined} icon={Boxes} bodyClassName="divide-y divide-rule" action={canPlan && <Button size="sm" icon={Plus} onClick={() => setAdding(true)}>Reserve part</Button>}>
      {!detail.parts.length && <div className="px-5 py-5 text-sm text-muted">No parts reserved.</div>}
      {detail.parts.map((l) => {
        const outstanding = l.qtyReserved - l.qtyIssued;
        return (
          <div key={l.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Tag>{l.part.stockCode}</Tag>
                <Badge tone={l.part.quality === 'Q' ? 'purple' : 'gray'}>{l.part.quality === 'Q' ? 'Q-level' : 'Commercial'}</Badge>
              </div>
              <div className="truncate text-sm">{l.part.description}</div>
              <div className="text-xs text-muted">
                <span className="measured">{l.part.bin}</span>
                <span className="ml-3">{l.part.onHand} on hand</span>
                <span className="ml-3">{money(l.part.unitCostCents)} each</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm tabular">
                {l.qtyIssued}/{l.qtyReserved} issued
              </span>
              {canIssue && outstanding > 0 && (
                <Button size="sm" onClick={() => mutate(`/parts/${l.id}/issue`, { body: {} }, `Issued ${outstanding} × ${l.part.stockCode}`)}>
                  Draw {outstanding}
                </Button>
              )}
              {canPlan && l.qtyIssued === 0 && (
                <button onClick={() => mutate(`/parts/${l.id}`, { method: 'DELETE' }, 'Reservation released')} className="rounded-pill p-1.5 text-muted hover:bg-bad-soft hover:text-bad" aria-label="Remove reservation">
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          </div>
        );
      })}
      <ReservePartModal open={adding} onClose={() => setAdding(false)} detail={detail} mutate={mutate} />
    </Card>
  );
}

function ReservePartModal({ open, onClose, detail, mutate }: { open: boolean; onClose: () => void; detail: WorkOrderDetail; mutate: Mutate }) {
  const [parts, setParts] = useState<PartRow[] | null>(null);
  const [partId, setPartId] = useState('');
  const [qty, setQty] = useState('1');
  const sr = detail.equipment.safetyClass === 'SR';
  useEffect(() => {
    if (open && !parts) void api<PartRow[]>('/parts').then(setParts);
  }, [open, parts]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Reserve a part"
      subtitle={sr ? `${detail.equipment.tag} is safety-related. Commercial-grade parts are listed but the server will refuse them without a dedication.` : undefined}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!partId} onClick={async () => (await mutate('/parts', { body: { partId, qty: Number(qty) } }, 'Part reserved')) && onClose()}>
            Reserve
          </Button>
        </>
      }
    >
      {!parts ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          <Field label="Part">
            <select className={inputClass} value={partId} onChange={(e) => setPartId(e.target.value)}>
              <option value="">Choose a stock item</option>
              {parts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.stockCode} · {p.description} ({p.quality === 'Q' ? 'Q' : 'commercial'}, {p.onHand - p.reserved} available)
                </option>
              ))}
            </select>
          </Field>
          <Field label="Quantity">
            <input className={cx(inputClass, 'w-28!')} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
        </div>
      )}
    </Modal>
  );
}

// ── Clearance & labor ──────────────────────────────────────────────────────

function ClearanceCard({ detail, mutate }: { detail: WorkOrderDetail; mutate: Mutate }) {
  const { actor } = useApp();
  const wo = detail.workOrder;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const canEdit = actor.role === 'planner' && wo.status === 'planning';
  const status = wo.clearanceStatus === 'hung' ? <Badge tone="red"><Lock size={11} /> Tags hung</Badge> : wo.clearanceStatus === 'released' ? <Badge tone="green">Released</Badge> : <Badge tone="gray">Not hung</Badge>;
  return (
    <Card
      title="Clearance (tagout) boundary"
      subtitle="Hung when the SRO releases the work; released at work complete, before the PMT"
      icon={Lock}
      action={
        <div className="flex items-center gap-2">
          {status}
          {canEdit && !editing && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setText(wo.clearancePoints.map((c) => `${c.point} | ${c.position}`).join('\n'));
                setEditing(true);
              }}
            >
              Edit
            </Button>
          )}
        </div>
      }
      bodyClassName={editing ? 'p-5' : 'divide-y divide-rule'}
    >
      {editing ? (
        <div className="space-y-3">
          <textarea className={cx(inputClass, 'h-40 py-2 font-mono text-xs')} value={text} onChange={(e) => setText(e.target.value)} />
          <p className="text-xs text-muted">One isolation point per line: component | required position</p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="primary"
              onClick={async () => {
                const clearancePoints = text
                  .split('\n')
                  .map((line) => line.split('|'))
                  .filter(([p]) => p?.trim())
                  .map(([point, position]) => ({ point: point.trim(), position: (position ?? '').trim() || 'Danger tag' }));
                if (await mutate('', { method: 'PATCH', body: { clearancePoints } }, 'Clearance boundary saved')) setEditing(false);
              }}
            >
              Save boundary
            </Button>
            <Button size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          {!wo.clearancePoints.length && <div className="px-5 py-5 text-sm text-muted">No isolation points defined yet.</div>}
          {wo.clearancePoints.map((c, i) => (
            <div key={i} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
              <span className="font-mono text-xs">{c.point}</span>
              <span className="text-right text-xs text-muted">{c.position}</span>
            </div>
          ))}
        </>
      )}
    </Card>
  );
}

function LaborCard({ detail, mutate }: { detail: WorkOrderDetail; mutate: Mutate }) {
  const { actor } = useApp();
  const wo = detail.workOrder;
  const [hours, setHours] = useState('');
  const [note, setNote] = useState('');
  const canLog = (actor.role === 'technician' || actor.role === 'supervisor') && (wo.status === 'in_progress' || wo.status === 'testing');
  const total = detail.labor.reduce((s, l) => s + l.hours, 0);
  return (
    <Card title="Labor" subtitle={`${num(total, 2)} h charged of ${num(wo.estHours, 1)} h estimated${wo.estDoseMrem ? ` · ALARA estimate ${wo.estDoseMrem} mrem` : ''}`} icon={UserRound} bodyClassName="divide-y divide-rule">
      {detail.labor.map((l) => (
        <div key={l.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
          <span>
            {l.personName} <span className="text-muted">{l.note && `· ${l.note}`}</span>
          </span>
          <span className="text-muted tabular">
            {shortDate(l.workedOn)} · <span className="font-medium text-ink">{l.hours} h</span>
          </span>
        </div>
      ))}
      {!detail.labor.length && !canLog && <div className="px-5 py-5 text-sm text-muted">No labor charged yet.</div>}
      {canLog && (
        <div className="flex flex-wrap items-center gap-2 bg-paper-3 px-5 py-3">
          <input className={cx(inputClass, 'h-9 w-24!')} inputMode="decimal" placeholder="Hours" value={hours} onChange={(e) => setHours(e.target.value)} aria-label="Hours" />
          <input className={cx(inputClass, 'h-9 min-w-48 flex-1')} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <Button
            size="sm"
            icon={Clock}
            disabled={!hours}
            onClick={async () => {
              if (await mutate('/labor', { body: { hours, note } }, `${hours} h charged`)) {
                setHours('');
                setNote('');
              }
            }}
          >
            Charge time
          </Button>
        </div>
      )}
    </Card>
  );
}

function HistoryCard({ detail }: { detail: WorkOrderDetail }) {
  const strip = (text: string) => text.replace(`${detail.workOrder.number}: `, '').replace(`${detail.workOrder.number} `, '');
  return (
    <Card title="History" subtitle="Every change, who made it and when" icon={History} bodyClassName="px-5 py-4">
      <ol className="border-l border-rule-2">
        {detail.history.map((h) => (
          <li key={h.id} className="relative grid gap-x-4 gap-y-0.5 py-2.5 pl-5 sm:grid-cols-[minmax(0,1fr)_auto]">
            <span className={cx('min-w-0 text-sm', h.action === 'wo.step_fail' ? 'text-bad' : 'text-ink')}>
              <span className="font-medium text-accent">{h.actorName}</span> {strip(h.summary)}
            </span>
            <time dateTime={h.at} className="measured whitespace-nowrap text-sm text-cool">
              {dateTime(h.at)}
            </time>
          </li>
        ))}
      </ol>
    </Card>
  );
}

// ── Side panel ─────────────────────────────────────────────────────────────

function ActionsCard({ detail, mutate }: { detail: WorkOrderDetail; mutate: Mutate }) {
  const { actor, people, setActor } = useApp();
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const forward = detail.actions.filter((a) => a.action !== 'cancel' && a.action !== 'return_to_planning');
  const secondary = detail.actions.filter((a) => a.action === 'return_to_planning');
  const cancel = detail.actions.find((a) => a.action === 'cancel');
  const wo = detail.workOrder;

  const run = async (a: ActionOption, body: Record<string, unknown> = {}) => {
    setBusy(a.action);
    await mutate('/actions', { body: { action: a.action, ...body } }, `${a.label}: done`);
    setBusy(null);
  };

  const switchTo = (roles: Role[]) => {
    const p = people.find((x) => roles.includes(x.role) && (x.role !== 'technician' || x.discipline === detail.workOrder.discipline)) ?? people.find((x) => roles.includes(x.role));
    return p ? (
      <Button size="sm" variant="ghost" className="mt-1 -ml-2" onClick={() => setActor(p.id)}>
        Act as {p.name}
      </Button>
    ) : null;
  };

  return (
    <Card title={wo.status === 'closed' ? 'Closed' : wo.status === 'cancelled' ? 'Cancelled' : 'Next step'} icon={GitBranch}>
      {wo.status === 'closed' && (
        <p className="text-sm text-muted">
          Closed by {wo.closedBy} on {dateTime(wo.closedAt!)}.
        </p>
      )}
      {wo.status === 'cancelled' && <p className="text-sm text-muted">Cancelled: {wo.cancelReason}</p>}
      <div className="space-y-5">
        {forward.map((a) => {
          const blocked = a.gates.some((g) => !g.ok);
          return (
            <div key={a.action}>
              <div className="mb-2 text-sm font-medium">{a.label}</div>
              {a.gates.length > 0 && (
                <ul className="mb-3 space-y-1.5">
                  {a.gates.map((g, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      {g.ok ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-ok" /> : <OctagonX size={15} className="mt-0.5 shrink-0 text-bad" />}
                      <span>
                        <span className={g.ok ? '' : 'font-medium text-bad'}>{g.label}</span>
                        {g.detail && <span className="block text-xs text-muted">{g.detail}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <Button variant="primary" className="w-full" onClick={() => run(a)} loading={busy === a.action} disabled={!a.allowedForActor || blocked}>
                {a.label}
              </Button>
              {!a.allowedForActor && (
                <p className="mt-2 text-xs text-muted">
                  Needs a {a.roles.map((r) => ROLE_LABEL[r]).join(' or ')}. {switchTo(a.roles)}
                </p>
              )}
            </div>
          );
        })}
        {secondary.map((a) => (
          <Button key={a.action} size="sm" variant="ghost" onClick={() => run(a)} disabled={!a.allowedForActor} loading={busy === a.action}>
            {a.label}
          </Button>
        ))}
        {cancel && (
          <div className="border-t border-rule pt-4">
            {!cancelling ? (
              <Button size="sm" variant="danger" onClick={() => setCancelling(true)} disabled={!cancel.allowedForActor || cancel.gates.some((g) => !g.ok)}>
                Cancel work order
              </Button>
            ) : (
              <div className="space-y-2">
                <input className={inputClass} placeholder="Reason for cancelling" value={reason} onChange={(e) => setReason(e.target.value)} />
                <div className="flex gap-2">
                  <Button size="sm" variant="danger" onClick={() => run(cancel, { reason })} disabled={reason.trim().length < 5}>
                    Confirm cancel
                  </Button>
                  <Button size="sm" onClick={() => setCancelling(false)}>
                    Keep it
                  </Button>
                </div>
              </div>
            )}
            {!cancel.allowedForActor && <p className="mt-2 text-xs text-muted">Cancelling needs a {cancel.roles.map((r) => ROLE_LABEL[r]).join(' or ')}.</p>}
            {cancel.gates.filter((g) => !g.ok).map((g) => (
              <p key={g.label} className="mt-2 text-xs text-muted">
                {g.label}: {g.detail}
              </p>
            ))}
          </div>
        )}
        {!detail.actions.length && wo.status !== 'closed' && wo.status !== 'cancelled' && <p className="text-sm text-muted">Nothing to do from {actor.title}.</p>}
      </div>
    </Card>
  );
}

function PlanningCard({ detail, mutate }: { detail: WorkOrderDetail; mutate: Mutate }) {
  const { actor } = useApp();
  const wo = detail.workOrder;
  const planner = actor.role === 'planner' && wo.status === 'planning';
  const scheduler = (actor.role === 'planner' || actor.role === 'supervisor') && ['requested', 'planning', 'ready'].includes(wo.status);
  const [est, setEst] = useState(String(wo.estHours));
  const [dose, setDose] = useState(String(wo.estDoseMrem));
  useEffect(() => {
    setEst(String(wo.estHours));
    setDose(String(wo.estDoseMrem));
  }, [wo.estHours, wo.estDoseMrem]);
  const patch = (body: Record<string, unknown>, msg = 'Saved') => mutate('', { method: 'PATCH', body }, msg);
  const row = (label: string, value: ReactNode) => (
    <div className="flex items-center justify-between gap-3 py-2 text-sm">
      <span className="text-muted">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
  const flag = (key: 'requiresOos' | 'radArea' | 'fme' | 'confinedSpace', label: string) =>
    row(label, planner ? <Toggle small checked={wo[key]} onChange={(v) => patch({ [key]: v })} label={label} /> : wo[key] ? 'Yes' : 'No');
  return (
    <Card title="Planning" bodyClassName="divide-y divide-rule px-5 py-2">
      {row('Discipline', DISCIPLINE_LABEL[wo.discipline])}
      {row('Type', TYPE_LABEL[wo.type])}
      {row(
        'Priority',
        scheduler ? (
          <select className={cx(inputClass, 'h-8 w-auto! py-0 text-xs')} value={wo.priority} onChange={(e) => patch({ priority: Number(e.target.value) as Priority }, 'Priority changed')}>
            {([1, 2, 3, 4] as Priority[]).map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        ) : (
          PRIORITY_LABEL[wo.priority]
        ),
      )}
      {row('Scheduled', scheduler ? <input type="date" className={cx(inputClass, 'h-8 w-auto! py-0 text-xs')} value={wo.scheduledDate ?? ''} onChange={(e) => patch({ scheduledDate: e.target.value || null }, 'Rescheduled')} /> : wo.scheduledDate ? shortDate(wo.scheduledDate) : '–')}
      {wo.dueDate && row('Due / late date', `${shortDate(wo.dueDate)} / ${shortDate(wo.lateDate!)}`)}
      {row(
        'Estimated hours',
        planner ? <input className={cx(inputClass, 'h-8 w-20! py-0 text-right text-xs')} value={est} onChange={(e) => setEst(e.target.value)} onBlur={() => est !== String(wo.estHours) && patch({ estHours: est })} /> : `${num(wo.estHours, 1)} h`,
      )}
      {flag('requiresOos', 'Removes from service')}
      {flag('radArea', 'Radiologically controlled area')}
      {(wo.radArea || wo.estDoseMrem > 0) &&
        row('ALARA dose estimate', planner ? <input className={cx(inputClass, 'h-8 w-20! py-0 text-right text-xs')} value={dose} onChange={(e) => setDose(e.target.value)} onBlur={() => dose !== String(wo.estDoseMrem) && patch({ estDoseMrem: dose })} /> : `${wo.estDoseMrem} mrem`)}
      {flag('fme', 'Foreign material exclusion')}
      {flag('confinedSpace', 'Confined space')}
      {row('Requested by', wo.requestedBy)}
      {wo.releasedBy && row('Released by', `${wo.releasedBy}, ${dateTime(wo.releasedAt!)}`)}
    </Card>
  );
}

function MaintenanceRuleCard({ detail, mutate }: { detail: WorkOrderDetail; mutate: Mutate }) {
  const { actor } = useApp();
  const wo = detail.workOrder;
  const [open, setOpen] = useState(false);
  const [ff, setFf] = useState<boolean | null>(null);
  const [note, setNote] = useState('');
  if (detail.equipment.safetyClass === 'NSR' && wo.functionalFailure === null && actor.role !== 'engineer') return null;
  const canEval = actor.role === 'engineer' && wo.status !== 'cancelled';
  return (
    <Card title="Maintenance Rule" subtitle={`10 CFR 50.65 · ${detail.system.name}`} icon={TrendingUp}>
      {wo.functionalFailure === null ? (
        <p className="text-sm text-muted">Not evaluated. {detail.equipment.safetyClass !== 'NSR' ? 'Required before close.' : ''}</p>
      ) : (
        <div className="space-y-1 text-sm">
          <div className="flex items-center gap-2 font-medium">
            {wo.functionalFailure ? <OctagonX size={15} className="text-bad" /> : <CheckCircle2 size={15} className="text-ok" />}
            {wo.functionalFailure ? 'Functional failure' : 'Not a functional failure'}
          </div>
          <p className="text-muted">{wo.mrNote}</p>
        </div>
      )}
      {canEval && (
        <Button size="sm" className="mt-3" onClick={() => setOpen(true)}>
          {wo.functionalFailure === null ? 'Evaluate' : 'Re-evaluate'}
        </Button>
      )}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Maintenance Rule evaluation"
        subtitle={`${detail.equipment.tag} · ${detail.system.name} allows ${detail.system.mrFunctionalFailureLimit} functional failures in 24 months.`}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" disabled={ff === null || note.trim().length < 10} onClick={async () => (await mutate('/mr', { body: { functionalFailure: ff, note } }, 'Evaluation recorded')) && setOpen(false)}>
              Record evaluation
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { v: true, title: 'Functional failure', text: 'The component could not perform its Maintenance Rule function.' },
              { v: false, title: 'Not a functional failure', text: 'Degraded, but the function was never lost.' },
            ].map((o) => (
              <button key={String(o.v)} onClick={() => setFf(o.v)} className={cx('rounded-card border p-3 text-left', ff === o.v ? 'border-accent bg-paper-3' : 'border-rule hover:bg-paper-3')}>
                <div className="text-sm font-medium">{o.title}</div>
                <div className="text-xs text-muted">{o.text}</div>
              </button>
            ))}
          </div>
          <Field label="Basis">
            <textarea className={cx(inputClass, 'h-24 py-2')} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </Card>
  );
}

function RelatedCard({ detail }: { detail: WorkOrderDetail }) {
  const { equipment, techSpec, plan, parent, children } = detail;
  return (
    <Card title="Related" bodyClassName="space-y-4 p-5 text-sm">
      <div>
        <div className="text-xs font-medium text-muted">Equipment</div>
        <div className="mt-1">
          <EquipmentLink id={equipment.id} tag={equipment.tag} />
        </div>
        <div className="text-muted">{equipment.location}</div>
        {techSpec && (
          <div className="mt-1 text-muted">
            TS {techSpec.code} {techSpec.title}: {techSpec.completionHours} h
          </div>
        )}
      </div>
      {plan && (
        <div>
          <div className="text-xs font-medium text-muted">{plan.type === 'ST' ? 'Surveillance' : 'PM'} plan</div>
          <div className="mt-1">{plan.title}</div>
          {plan.srRef && <div className="text-muted">{plan.srRef}</div>}
          <div className="mt-1">
            <DueChip due={plan.due} st={plan.type === 'ST'} />
          </div>
        </div>
      )}
      {parent && (
        <div>
          <div className="text-xs font-medium text-muted">Raised from</div>
          <div className="mt-1 flex items-center gap-2">
            <WoLink id={parent.id} number={parent.number} /> <WoStatus status={parent.status} />
          </div>
          <div className="text-muted">{parent.title}</div>
        </div>
      )}
      {children.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted">Follow-up work</div>
          {children.map((c) => (
            <div key={c.id} className="mt-1">
              <div className="flex items-center gap-2">
                <WoLink id={c.id} number={c.number} /> <WoStatus status={c.status} />
              </div>
              <div className="text-muted">{c.title}</div>
            </div>
          ))}
        </div>
      )}
      {!plan && !parent && !children.length && <EquipmentState status={equipment.status} techSpec={Boolean(techSpec)} />}
    </Card>
  );
}
