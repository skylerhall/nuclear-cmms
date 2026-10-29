import { Atom, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Button, Card, Modal, PageHeader, useToast } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { useApp } from '../lib/app-context.ts';

const RULES: [string, string][] = [
  ['Work order lifecycle', 'Requested → planning → ready → in progress → post-maintenance testing → closed, with role-gated transitions and a gate checklist the server enforces.'],
  ['Tech Spec LCO clocks', 'Taking Tech Spec equipment out of service enters its LCO and starts the completion-time clock. Returning it to service exits the LCO.'],
  ['Protected trains', "Planned work can't remove a train while the opposite train of the same LCO is inoperable. If every train goes down anyway, LCO 3.0.3 is flagged."],
  ['SR 3.0.2 grace', 'Surveillances are due at their interval and late at 1.25×, measured from the last performance. Past the late date they are missed (SR 3.0.3).'],
  ['Acceptance criteria', 'Readings are checked against limits as they are signed. A failed surveillance on Tech Spec equipment declares it inoperable on the spot and raises corrective work.'],
  ['QC hold points and PMT', 'Safety-related maintenance needs a QC hold point (signed only by QC) and a post-maintenance test before it can close.'],
  ['Q-level parts', 'Safety-related work can only reserve Q-level stock. Commercial-grade parts need a dedication first.'],
  ['Maintenance Rule', 'The system engineer decides whether corrective work was a functional failure. Failures and unavailability roll up against each system’s 24-month criteria.'],
  ['Clearances, ALARA and FME', 'Tagout boundaries hang at release and clear at work complete; rad-area work needs a dose estimate; FME and confined-space flags carry through.'],
  ['Audit trail', 'Every action is recorded with who and when.'],
];

export function SettingsPage() {
  const { plant, changed } = useApp();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const reset = async () => {
    setBusy(true);
    try {
      await api('/demo/reset', { body: {} });
      toast('Demo data reset to the original plant state');
      setConfirm(false);
      changed();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-6">
      <PageHeader
        title="About this demo"
        subtitle={`A computerized maintenance management system (CMMS) built for a nuclear plant's maintenance and work-control organization. ${plant.name} (${plant.reactorType}) is fictional, and so is every tag, part, person and number.`}
        actions={
          <Button variant="danger" icon={RotateCcw} onClick={() => setConfirm(true)}>
            Reset demo data
          </Button>
        }
      />
      <Card title="What the system enforces" icon={Atom} bodyClassName="divide-y divide-line/70">
        {RULES.map(([title, text]) => (
          <div key={title} className="grid gap-1 px-5 py-3 text-sm md:grid-cols-[14rem_1fr] md:gap-6">
            <span className="font-semibold">{title}</span>
            <span className="text-muted">{text}</span>
          </div>
        ))}
      </Card>
      <Card title="How it's built" bodyClassName="px-5 py-4 text-sm leading-6 text-muted">
        <p>
          Node.js and Express with SQLite (<code className="font-mono text-xs">node:sqlite</code>) on the server, and React with Tailwind on the dashboard. Workflow rules, due-date math and labels live in one shared module, so the
          gate checklist on screen is the same code that accepts or refuses the request. The seed data is generated relative to today, so the LCO clocks and due dates always look current.
        </p>
        <p className="mt-3">
          Switching people with <span className="font-medium text-ink">Acting as</span> stands in for real sign-in: production would bind roles to accounts and add electronic signatures, procedure references and integration with the plant's
          operations log.
        </p>
      </Card>
      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Reset demo data?"
        subtitle="Everything goes back to the original fictional plant: open work, LCO clocks, stock and history. Changes made in this demo are lost."
        footer={
          <>
            <Button onClick={() => setConfirm(false)}>Keep my changes</Button>
            <Button variant="danger" onClick={reset} loading={busy}>
              Reset
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">Use this before showing the scenarios to someone new.</p>
      </Modal>
    </div>
  );
}
