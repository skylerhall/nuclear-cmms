import type { AppContext } from './context.ts';
import { generatePmWork } from './pm.ts';

/** Runs the PM/surveillance generator now and then every hour. It's idempotent, so overlapping runs never duplicate work. */
export function startScheduler(ctx: AppContext): () => void {
  const tick = () => {
    try {
      const created = generatePmWork(ctx);
      if (created.length) console.log(`[pm] Generated ${created.length} work order(s)`);
    } catch (err) {
      console.error('[pm] Generator failed:', err);
    }
  };
  tick();
  const id = setInterval(tick, 60 * 60 * 1000);
  id.unref();
  return () => clearInterval(id);
}
