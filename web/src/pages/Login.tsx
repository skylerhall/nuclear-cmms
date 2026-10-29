import { Lock } from 'lucide-react';
import { useState } from 'react';
import { Button, inputClass } from '../components/ui.tsx';
import { api } from '../lib/api.ts';

export function LoginPage({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api('/auth/login', { body: { password } });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-paper-3 px-4">
      <form onSubmit={submit} className="animate-rise w-full max-w-sm rounded-card bg-paper-2 p-7">
        <div className="mb-6 flex items-center gap-3">
          <Lock size={20} className="shrink-0 text-accent" aria-hidden />
          <div>
            <h1 className="text-lg font-medium">Halcyon Point CMMS</h1>
            <p className="text-sm text-muted">Private demo. Enter the access password.</p>
          </div>
        </div>
        <input type="password" autoFocus className={inputClass} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="mt-2 text-sm text-bad">{error}</p>}
        <Button type="submit" variant="primary" className="mt-4 w-full" loading={loading} disabled={!password}>
          Sign in
        </Button>
      </form>
    </div>
  );
}
