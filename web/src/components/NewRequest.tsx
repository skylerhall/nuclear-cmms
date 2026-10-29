import { Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { PRIORITY_LABEL } from '../../../shared/rules.ts';
import type { Priority, WorkOrder } from '../../../shared/types.ts';
import { api, useApi } from '../lib/api.ts';
import { useApp } from '../lib/app-context.ts';
import { navigate } from '../lib/router.ts';
import type { EquipmentRow } from '../lib/types.ts';
import { EquipmentState, SafetyBadge, Tag } from './domain.tsx';
import { Button, ErrorNote, Field, Modal, Segmented, cx, inputClass, useToast } from './ui.tsx';

/** Anyone at the plant can raise a work request; the supervisor screens it. */
export function NewRequestModal({ open, onClose, equipmentId }: { open: boolean; onClose: () => void; equipmentId?: string }) {
  const { actor } = useApp();
  const toast = useToast();
  const equipment = useApi<EquipmentRow[]>(open ? '/equipment' : null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(equipmentId ?? null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>(3);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelected(equipmentId ?? null);
    setQuery('');
    setTitle('');
    setDescription('');
    setPriority(3);
    setError(null);
  }, [open, equipmentId]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (equipment.data ?? []).filter((e) => !q || e.tag.toLowerCase().includes(q) || e.name.toLowerCase().includes(q) || e.systemCode.toLowerCase() === q).slice(0, 8);
  }, [equipment.data, query]);
  const chosen = equipment.data?.find((e) => e.id === selected) ?? null;

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const wo = await api<WorkOrder>('/work-orders', { body: { equipmentId: selected, title, description, priority } });
      toast(`${wo.number} raised. A supervisor screens it next.`);
      onClose();
      navigate(`/work-orders/${wo.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New work request"
      subtitle={`Raised by ${actor.name}. Describe the condition, not the fix.`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={saving} disabled={!selected || title.trim().length < 4}>
            Submit request
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Equipment">
          {chosen ? (
            <div className="flex items-center justify-between gap-3 rounded-card border border-rule bg-paper-3 px-3 py-2.5">
              <div className="min-w-0">
                <Tag>{chosen.tag}</Tag>
                <div className="truncate text-sm text-muted">{chosen.name}</div>
              </div>
              {!equipmentId && (
                <button type="button" className="text-sm font-medium text-ink hover:underline" onClick={() => setSelected(null)}>
                  Change
                </button>
              )}
            </div>
          ) : (
            <div>
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input autoFocus className={cx(inputClass, 'pl-9')} placeholder="Search tag or name, e.g. CCW-P or diesel" value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              <div className="mt-2 max-h-64 overflow-y-auto rounded-card border border-rule">
                {matches.map((e) => (
                  <button key={e.id} type="button" onClick={() => setSelected(e.id)} className="flex w-full items-center justify-between gap-3 border-b border-rule px-3 py-2 text-left last:border-0 hover:bg-paper-3">
                    <span className="min-w-0">
                      <Tag>{e.tag}</Tag>
                      <span className="block truncate text-xs text-muted">{e.name}</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <SafetyBadge cls={e.safetyClass} />
                      <EquipmentState status={e.status} techSpec={Boolean(e.techSpecId)} />
                    </span>
                  </button>
                ))}
                {equipment.data && !matches.length && <div className="px-3 py-4 text-sm text-muted">No equipment matches.</div>}
              </div>
            </div>
          )}
        </Field>
        <Field label="What’s wrong">
          <input className={inputClass} placeholder="e.g. Oil weeping at outboard bearing housing" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
        </Field>
        <Field label="Details" hint="Where, how much, and anything operations already did.">
          <textarea className={cx(inputClass, 'h-24 py-2')} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Suggested priority">
          <Segmented value={String(priority)} onChange={(v) => setPriority(Number(v) as Priority)} options={([1, 2, 3, 4] as Priority[]).map((p) => ({ value: String(p), label: PRIORITY_LABEL[p].split(' · ')[1] }))} />
        </Field>
        <ErrorNote error={error} />
      </div>
    </Modal>
  );
}
