import { AlertTriangle, Boxes, PackagePlus, Search, Star } from 'lucide-react';
import { useMemo, useState } from 'react';
import { WoLink } from '../components/domain.tsx';
import { Badge, Button, Card, ErrorNote, Field, Modal, PageHeader, Segmented, Spinner, Stat, StatGrid, cx, inputClass, useToast } from '../components/ui.tsx';
import { api, useApi } from '../lib/api.ts';
import { useApp } from '../lib/app-context.ts';
import { money } from '../lib/format.ts';
import type { PartRow } from '../lib/types.ts';

export function PartsPage() {
  const { actor } = useApp();
  const toast = useToast();
  const { data, error, reload } = useApi<PartRow[]>('/parts');
  const [filter, setFilter] = useState<'all' | 'reorder' | 'Q'>('all');
  const [search, setSearch] = useState('');
  const [receiving, setReceiving] = useState<PartRow | null>(null);
  const [qty, setQty] = useState('');
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((p) => (filter === 'all' || (filter === 'reorder' ? p.belowReorder : p.quality === 'Q')) && (!q || p.stockCode.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)));
  }, [data, filter, search]);
  const canReceive = actor.role === 'planner' || actor.role === 'supervisor';

  const receive = async () => {
    try {
      await api(`/parts/${receiving!.id}/receive`, { body: { qty: Number(qty) } });
      toast(`Received ${qty} × ${receiving!.stockCode}`);
      setReceiving(null);
      setQty('');
      await reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  return (
    <div>
      <PageHeader title="Storeroom" subtitle="Stock on hand, open reservations against work orders, and reorder points. Safety-related work can only draw Q-level (10 CFR 50 Appendix B) stock." />
      <ErrorNote error={error} />
      {!data ? (
        <Spinner />
      ) : (
        <>
          <StatGrid className="mb-8 grid-cols-2 lg:grid-cols-4">
            <Stat label="Stock items" value={data.length} note={`${data.filter((p) => p.quality === 'Q').length} Q-level`} />
            <Stat label="Below reorder point" value={data.filter((p) => p.belowReorder).length} note="Available = on hand − reserved" tone="accent" />
            <Stat label="Critical spares low" value={data.filter((p) => p.belowReorder && p.criticalSpare).length} note="Long-lead parts for risk-significant equipment" tone="bad" />
            <Stat label="Inventory value" value={money(data.reduce((s, p) => s + p.onHand * p.unitCostCents, 0))} />
          </StatGrid>
          <div className="mb-4 flex flex-wrap gap-2">
            <Segmented value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All stock' }, { value: 'reorder', label: 'Below reorder point' }, { value: 'Q', label: 'Q-level only' }]} />
            <div className="relative min-w-56 flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input className={cx(inputClass, 'pl-9')} placeholder="Search stock code or description" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <Card bodyClassName="overflow-x-auto">
            <table className="table-pin w-full min-w-[1000px] text-sm">
              <thead>
                <tr className="border-b border-rule text-left text-xs font-medium text-muted">
                  <th className="px-5 py-3">Item</th>
                  <th className="px-3 py-3">Quality</th>
                  <th className="px-3 py-3">Bin</th>
                  <th className="px-3 py-3 text-right">On hand</th>
                  <th className="px-3 py-3 text-right">Reserved</th>
                  <th className="px-3 py-3 text-right">Available</th>
                  <th className="px-3 py-3 text-right">Reorder at</th>
                  <th className="px-3 py-3 text-right">Lead time</th>
                  <th className="px-3 py-3">Reserved for</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className={cx('border-b border-rule last:border-0', p.belowReorder && 'bg-accent-soft')}>
                    <td className="max-w-xs px-5 py-3">
                      <div className="flex items-center gap-2 font-mono text-xs font-medium">
                        {p.stockCode}
                        {p.criticalSpare && <Badge tone="red"><Star size={10} /> Critical spare</Badge>}
                      </div>
                      <div className="truncate">{p.description}</div>
                      <div className="text-xs text-muted">{p.mfrPart} · {money(p.unitCostCents)}</div>
                    </td>
                    <td className="px-3 py-3">
                      <Badge tone={p.quality === 'Q' ? 'purple' : 'gray'}>{p.quality === 'Q' ? 'Q-level' : 'Commercial'}</Badge>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-muted">{p.bin}</td>
                    <td className="px-3 py-3 text-right tabular">{p.onHand}</td>
                    <td className="px-3 py-3 text-right tabular text-muted">{p.reserved}</td>
                    <td className="px-3 py-3 text-right tabular font-medium">
                      <span className="inline-flex items-center gap-1">
                        {p.belowReorder && <AlertTriangle size={13} className="text-accent" aria-label="Below reorder point" />}
                        {p.onHand - p.reserved}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right tabular text-muted">{p.reorderPoint}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right tabular text-muted">{p.leadDays} d</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-x-2">
                        {p.reservations.map((r) => (
                          <span key={r.id} className="text-xs">
                            <WoLink id={r.id} number={r.number} /> ×{r.qty}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {canReceive && (
                        <Button size="sm" variant="ghost" icon={PackagePlus} onClick={() => setReceiving(p)}>
                          Receive
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
      <Modal
        open={Boolean(receiving)}
        onClose={() => setReceiving(null)}
        title={`Receive ${receiving?.stockCode ?? ''}`}
        subtitle={receiving?.quality === 'Q' ? 'Q-level stock is only received after receipt inspection against the purchase order and supplier certification.' : receiving?.description}
        footer={
          <>
            <Button onClick={() => setReceiving(null)}>Cancel</Button>
            <Button variant="primary" onClick={receive} disabled={!qty}>
              Receive into stock
            </Button>
          </>
        }
      >
        <Field label="Quantity received">
          <input className={cx(inputClass, 'w-32!')} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />
        </Field>
      </Modal>
    </div>
  );
}
