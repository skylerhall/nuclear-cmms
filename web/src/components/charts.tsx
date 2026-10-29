// Small, dependency-free charts. One series color, thin marks, recessive axes,
// and a hover tooltip on every mark.
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { cx } from './ui.tsx';

/** Charts draw at their real pixel width so text stays at its intended size. */
function useWidth(ref: RefObject<HTMLDivElement | null>, fallback: number): number {
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(200, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

function Tip({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs shadow-lg" style={{ left: x, top: y - 8 }}>
      {children}
    </div>
  );
}

/** Horizontal bars for a single series. Values sit at the bar tips. */
export function BarList({ rows, unit, max: maxIn }: { rows: { label: ReactNode; value: number; note?: string }[]; unit?: string; max?: number }) {
  const max = maxIn ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={i} className="group" title={r.note}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="text-ink">{r.label}</span>
            <span className="tabular font-semibold">
              {r.value}
              {unit && <span className="ml-1 text-xs font-normal text-muted">{unit}</span>}
            </span>
          </div>
          <div className="h-3 rounded-r bg-soft/60">
            <div className="h-3 rounded-r-[4px] bg-series transition group-hover:brightness-110" style={{ width: `${(r.value / max) * 100}%`, minWidth: r.value ? 4 : 0 }} />
          </div>
          {r.note && <div className="mt-1 text-xs text-faint">{r.note}</div>}
        </div>
      ))}
    </div>
  );
}

function niceMax(v: number): number {
  if (v <= 5) return 5;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

/** Columns over time for a single series (e.g. work orders closed per week). */
export function Columns({ points, height = 160, valueLabel }: { points: { label: string; value: number; detail?: string }[]; height?: number; valueLabel: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const top = niceMax(Math.max(...points.map((p) => p.value)));
  const ticks = [0, top / 2, top];
  const ref = useRef<HTMLDivElement>(null);
  const W = useWidth(ref, 360);
  const padL = 28;
  const padB = 22;
  const H = height;
  const plotH = H - padB - 8;
  const band = (W - padL) / points.length;
  const barW = Math.min(24, band * 0.55);
  const y = (v: number) => 8 + plotH - (v / top) * plotH;
  return (
    <div ref={ref} className="relative">
      <svg width={W} height={H} className="block" role="img" aria-label={`${valueLabel} by week`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke="var(--color-grid)" strokeWidth={1} />
            <text x={padL - 6} y={y(t) + 4} textAnchor="end" className="fill-faint text-[11px] tabular">
              {t}
            </text>
          </g>
        ))}
        {points.map((p, i) => {
          const cx0 = padL + band * i + band / 2;
          const h = (p.value / top) * plotH;
          const r = Math.min(4, h);
          const x0 = cx0 - barW / 2;
          const yTop = y(p.value);
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={padL + band * i} y={0} width={band} height={H - padB} fill="transparent" />
              {h > 0 && (
                <path
                  d={`M${x0},${y(0)} V${yTop + r} Q${x0},${yTop} ${x0 + r},${yTop} H${x0 + barW - r} Q${x0 + barW},${yTop} ${x0 + barW},${yTop + r} V${y(0)} Z`}
                  fill="var(--color-series)"
                  opacity={hover === null || hover === i ? 1 : 0.55}
                />
              )}
              {(i % 3 === 2 || i === points.length - 1) && (
                <text x={i === points.length - 1 ? cx0 + band / 2 : cx0} y={H - 6} textAnchor={i === points.length - 1 ? 'end' : 'middle'} className="fill-faint text-[11px]">
                  {p.label}
                </text>
              )}
            </g>
          );
        })}
        <line x1={padL} x2={W} y1={y(0)} y2={y(0)} stroke="var(--color-axis)" strokeWidth={1} />
        {/* Direct label on the latest week only. */}
        <text x={padL + band * (points.length - 0.5)} y={y(points.at(-1)!.value) - 6} textAnchor="middle" className="fill-ink text-[11px] font-semibold">
          {points.at(-1)!.value}
        </text>
      </svg>
      {hover !== null && (
        <Tip x={padL + band * hover + band / 2} y={y(points[hover].value)}>
          <div className="font-semibold">Week of {points[hover].label}</div>
          <div className="text-muted">
            {points[hover].value} {valueLabel}
            {points[hover].detail ? ` · ${points[hover].detail}` : ''}
          </div>
        </Tip>
      )}
    </div>
  );
}

/** A reading's history against its acceptance limit, with a crosshair tooltip. */
export function TrendChart({ points, unit, min, max, height = 180 }: { points: { value: number; at: string; label: string; sub?: string }[]; unit: string | null; min: number | null; max: number | null; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const W = useWidth(ref, 480);
  const H = height;
  const padL = 44;
  const padR = 76;
  const padT = 12;
  const padB = 22;
  const values = points.map((p) => p.value);
  const lo = Math.min(...values, ...(min !== null ? [min] : []));
  const hi = Math.max(...values, ...(max !== null ? [max] : []));
  const span = hi - lo || Math.abs(hi) || 1;
  const yMin = lo - span * 0.15;
  const yMax = hi + span * 0.15;
  const x = (i: number) => padL + (points.length === 1 ? 0 : (i / (points.length - 1)) * (W - padL - padR));
  const y = (v: number) => padT + (1 - (v - yMin) / (yMax - yMin)) * (H - padT - padB);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const digits = span < 0.5 ? 3 : span < 5 ? 2 : span < 50 ? 1 : 0;
  const fmt = (v: number) => v.toFixed(digits);
  const ticks = [yMin + (yMax - yMin) * 0.1, (yMin + yMax) / 2, yMax - (yMax - yMin) * 0.1];
  const last = points.length - 1;
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    let best = 0;
    points.forEach((_, i) => {
      if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    });
    setHover(best);
  };
  const limitLine = (v: number, label: string) => (
    <g>
      <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="var(--color-critical)" strokeWidth={1.5} />
      <text x={W - padR + 6} y={y(v) + 4} className="fill-red-700 text-[11px] font-semibold">
        {label} {fmt(v)}
      </text>
    </g>
  );
  return (
    <div ref={ref} className="relative">
      <svg width={W} height={H} className="block" onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label="Reading trend">
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--color-grid)" strokeWidth={1} />
            <text x={padL - 6} y={y(t) + 4} textAnchor="end" className="fill-faint text-[11px] tabular">
              {fmt(t)}
            </text>
          </g>
        ))}
        {max !== null && limitLine(max, 'Max')}
        {min !== null && limitLine(min, 'Min')}
        <path d={d} fill="none" stroke="var(--color-series)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={padT} y2={H - padB} stroke="var(--color-axis)" strokeWidth={1} />}
        {points.map((p, i) => {
          const out = (max !== null && p.value > max) || (min !== null && p.value < min);
          return (i === last || hover === i || out) && <circle key={i} cx={x(i)} cy={y(p.value)} r={out ? 5 : 4} fill={out ? 'var(--color-critical)' : 'var(--color-series)'} stroke="white" strokeWidth={2} />;
        })}
        <text x={x(last) + 8} y={y(points[last].value) - 8} className="fill-ink text-[11px] font-semibold">
          {fmt(points[last].value)}
        </text>
        <text x={padL} y={H - 6} className="fill-faint text-[11px]">
          {points[0].label}
        </text>
        <text x={W - padR} y={H - 6} textAnchor="end" className="fill-faint text-[11px]">
          {points[last].label}
        </text>
      </svg>
      {hover !== null && (
        <Tip x={x(hover)} y={y(points[hover].value)}>
          <div className="font-semibold tabular">
            {fmt(points[hover].value)} {unit}
          </div>
          <div className="text-muted">
            {points[hover].label}
            {points[hover].sub ? ` · ${points[hover].sub}` : ''}
          </div>
        </Tip>
      )}
    </div>
  );
}

/** Used-versus-limit meter. The fill carries severity; the label says it in words. */
export function LimitMeter({ value, limit, label }: { value: number; limit: number; label: string }) {
  const ratio = value / limit;
  const fill = ratio > 1 ? 'bg-critical' : ratio >= 0.75 ? 'bg-warning' : 'bg-series';
  const track = ratio > 1 ? 'bg-red-100' : ratio >= 0.75 ? 'bg-amber-100' : 'bg-series-soft';
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted">{label}</span>
        <span className={cx('tabular font-semibold', ratio > 1 ? 'text-red-700' : 'text-ink')}>
          {value} / {limit}
        </span>
      </div>
      <div className={cx('h-2 overflow-hidden rounded-full', track)}>
        <div className={cx('h-full rounded-full', fill)} style={{ width: `${Math.min(1, ratio) * 100}%` }} />
      </div>
    </div>
  );
}
