import {
  Activity as ActivityIcon,
  Boxes,
  CalendarClock,
  ChevronDown,
  ClipboardList,
  Cog,
  Gauge,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  ShieldAlert,
  TrendingUp,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ROLE_LABEL } from '../../shared/rules.ts';
import type { Person, Role } from '../../shared/types.ts';
import { Avatar } from './components/domain.tsx';
import { NewRequestModal } from './components/NewRequest.tsx';
import { Button, ToastProvider, cx } from './components/ui.tsx';
import { api, useApi } from './lib/api.ts';
import { AppContext } from './lib/app-context.ts';
import { navigate, useLocation } from './lib/router.ts';
import type { Bootstrap } from './lib/types.ts';
import { ActivityPage } from './pages/Activity.tsx';
import { EquipmentDetailPage, EquipmentPage } from './pages/Equipment.tsx';
import { LcoPage } from './pages/Lcos.tsx';
import { LoginPage } from './pages/Login.tsx';
import { OverviewPage } from './pages/Overview.tsx';
import { PartsPage } from './pages/Parts.tsx';
import { ReliabilityPage } from './pages/Reliability.tsx';
import { SchedulePage } from './pages/Schedule.tsx';
import { SettingsPage } from './pages/Settings.tsx';
import { WorkOrderPage } from './pages/WorkOrder.tsx';
import { WorkOrdersPage } from './pages/WorkOrders.tsx';

interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
}

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: 'Work management',
    items: [
      { path: '/', label: 'Overview', icon: LayoutDashboard },
      { path: '/work-orders', label: 'Work orders', icon: ClipboardList },
      { path: '/schedule', label: 'PM & surveillance', icon: CalendarClock },
      { path: '/lcos', label: 'Tech Spec LCOs', icon: ShieldAlert },
    ],
  },
  {
    section: 'Assets',
    items: [
      { path: '/equipment', label: 'Equipment', icon: Gauge },
      { path: '/parts', label: 'Storeroom', icon: Boxes },
    ],
  },
  {
    section: 'Performance',
    items: [
      { path: '/reliability', label: 'Maintenance Rule', icon: TrendingUp },
      { path: '/activity', label: 'Activity log', icon: ActivityIcon },
      { path: '/settings', label: 'About this demo', icon: Cog },
    ],
  },
];

const ALL = NAV.flatMap((s) => s.items);

function route(path: string): { item: NavItem; page: React.JSX.Element; title: string } {
  const [, first, id] = path.split('/');
  const item = ALL.find((i) => i.path === `/${first ?? ''}`) ?? ALL[0];
  if (first === 'work-orders' && id) return { item, page: <WorkOrderPage id={decodeURIComponent(id)} />, title: 'Work order' };
  if (first === 'equipment' && id) return { item, page: <EquipmentDetailPage id={decodeURIComponent(id)} />, title: 'Equipment' };
  const pages: Record<string, () => React.JSX.Element> = {
    '/': OverviewPage,
    '/work-orders': WorkOrdersPage,
    '/schedule': SchedulePage,
    '/lcos': LcoPage,
    '/equipment': EquipmentPage,
    '/parts': PartsPage,
    '/reliability': ReliabilityPage,
    '/activity': ActivityPage,
    '/settings': SettingsPage,
  };
  const Page = pages[item.path];
  return { item, page: <Page />, title: item.label };
}

export function App() {
  return (
    <ToastProvider>
      <Gate />
    </ToastProvider>
  );
}

function Gate() {
  const session = useApi<{ authenticated: boolean; required: boolean }>('/session');
  const [authed, setAuthed] = useState<boolean | null>(null);
  useEffect(() => {
    if (session.data) setAuthed(session.data.authenticated);
  }, [session.data]);
  useEffect(() => {
    const onUnauthorized = () => setAuthed(false);
    window.addEventListener('cmms:unauthorized', onUnauthorized);
    return () => window.removeEventListener('cmms:unauthorized', onUnauthorized);
  }, []);
  if (authed === null) return <Splash />;
  if (!authed) return <LoginPage onSuccess={() => setAuthed(true)} />;
  return <Shell />;
}

function Splash() {
  return <div className="grid min-h-screen place-items-center text-sm text-muted">Loading…</div>;
}

function storedUser(): string | null {
  try {
    return localStorage.getItem('cmms_user');
  } catch {
    return null;
  }
}

function Shell() {
  const boot = useApi<Bootstrap>('/bootstrap');
  const { path } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [actorId, setActorId] = useState<string>(storedUser() ?? 'dana');
  const [version, setVersion] = useState(0);

  useEffect(() => setMenuOpen(false), [path]);

  if (boot.error) return <div className="grid min-h-screen place-items-center p-6 text-center text-sm text-red-700">{boot.error}</div>;
  if (!boot.data) return <Splash />;

  const actor = boot.data.people.find((p) => p.id === actorId) ?? boot.data.people[0];
  const setActor = (id: string) => {
    try {
      localStorage.setItem('cmms_user', id);
    } catch {
      // storage unavailable; the choice lasts for this page view
    }
    setActorId(id);
  };
  const { item, page, title } = route(path);

  const sidebar = (
    <div className="flex h-full flex-col px-4 py-6 text-white">
      <button onClick={() => navigate('/')} className="mb-8 flex items-center gap-3 px-2 text-left">
        <img src="/favicon.svg" alt="" className="h-10 w-10 rounded-xl ring-1 ring-white/10" />
        <div>
          <div className="font-bold leading-tight tracking-tight">{boot.data.plant.shortName}</div>
          <div className="text-xs text-white/55">CMMS · Maintenance & work control</div>
        </div>
      </button>
      <nav className="scrollbar-thin -mx-1 flex-1 space-y-6 overflow-y-auto px-1">
        {NAV.map((section) => (
          <div key={section.section}>
            <div className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[.16em] text-white/40">{section.section}</div>
            <div className="space-y-0.5">
              {section.items.map((nav) => (
                <button
                  key={nav.path}
                  onClick={() => navigate(nav.path)}
                  className={cx(
                    'relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition',
                    nav.path === item.path
                      ? 'bg-white/12 font-medium text-white shadow-sm before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-full before:bg-accent'
                      : 'text-white/70 hover:bg-white/8 hover:text-white',
                  )}
                >
                  <nav.icon size={17} className={nav.path === item.path ? 'text-accent' : undefined} />
                  {nav.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="mt-4 rounded-2xl border border-white/10 bg-white/6 p-4 text-xs leading-5 text-white/60">
        <div className="mb-1 font-medium text-white">{boot.data.plant.reactorType}</div>
        Fictional plant. Every tag, part, person and number in this demo is invented.
      </div>
    </div>
  );

  return (
    <AppContext.Provider value={{ ...boot.data, actor, setActor, version, changed: () => setVersion((v) => v + 1) }}>
      <div className="min-h-screen">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-68 bg-brand-dark lg:block">{sidebar}</aside>
        {menuOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-black/30" onClick={() => setMenuOpen(false)} />
            <aside className="animate-slide-in absolute inset-y-0 left-0 w-72 bg-brand-dark">{sidebar}</aside>
          </div>
        )}
        <div className="lg:pl-68">
          <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-line border-t-[3px] border-t-accent bg-white/90 px-4 backdrop-blur md:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button className="rounded-lg p-2 hover:bg-soft lg:hidden" onClick={() => setMenuOpen((v) => !v)} aria-label="Menu">
                {menuOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
              <div className="min-w-0">
                <p className="truncate text-[11px] font-semibold uppercase tracking-[.15em] text-faint">{boot.data.plant.name}</p>
                <h1 className="truncate text-base font-bold tracking-tight">{title}</h1>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <Button size="sm" variant="primary" icon={Plus} onClick={() => setRequestOpen(true)}>
                <span className="hidden sm:inline">Work request</span>
              </Button>
              <ActorSwitcher people={boot.data.people} actor={actor} onChange={setActor} />
              {boot.data.authRequired && (
                <button
                  title="Sign out"
                  onClick={async () => {
                    await api('/auth/logout', { body: {} });
                    window.location.reload();
                  }}
                  className="rounded-lg p-2 text-muted hover:bg-soft"
                >
                  <LogOut size={18} />
                </button>
              )}
            </div>
          </header>
          <main className="mx-auto max-w-[1400px] px-4 py-6 md:px-8 md:py-8">
            <div key={`${actor.id}:${path}:${version}`}>{page}</div>
          </main>
        </div>
        <NewRequestModal open={requestOpen} onClose={() => setRequestOpen(false)} />
      </div>
    </AppContext.Provider>
  );
}

const ROLE_CAN: Record<Role, string> = {
  planner: 'Builds work packages, reserves parts, marks work ready',
  supervisor: 'Screens requests, signs work, closes non-OOS work',
  technician: 'Signs steps, records readings, draws parts, charges labor',
  qc: 'Signs QC hold points',
  sro: 'Releases work, declares equipment (in)operable',
  engineer: 'Makes Maintenance Rule functional-failure calls',
};

function ActorSwitcher({ people, actor, onChange }: { people: Person[]; actor: Person; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 rounded-xl border border-line bg-white py-1 pl-1 pr-2.5 text-left hover:bg-soft" aria-haspopup="menu" aria-expanded={open}>
        <Avatar initials={actor.initials} />
        <span className="hidden min-w-0 md:block">
          <span className="block text-[11px] leading-tight text-faint">Acting as</span>
          <span className="block truncate text-sm font-semibold leading-tight">{actor.name}</span>
        </span>
        <ChevronDown size={14} className="text-muted" />
      </button>
      {open && (
        <div role="menu" className="animate-rise absolute right-0 top-12 z-40 w-[min(92vw,360px)] rounded-2xl border border-line bg-white p-2 shadow-2xl">
          <p className="px-3 pb-2 pt-1 text-xs leading-5 text-muted">Every action is role-gated, as at a real plant. Switch people to see what each role can and can't do.</p>
          {people.map((p) => (
            <button
              key={p.id}
              role="menuitem"
              onClick={() => {
                onChange(p.id);
                setOpen(false);
              }}
              className={cx('flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left hover:bg-soft', p.id === actor.id && 'bg-brand/6')}
            >
              <Avatar initials={p.initials} className="mt-0.5" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">
                  {p.name} <span className="font-normal text-muted">· {p.role === 'technician' ? p.title : ROLE_LABEL[p.role]}</span>
                </span>
                <span className="block text-xs text-faint">{ROLE_CAN[p.role]}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
