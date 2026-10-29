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

  if (boot.error) return <div className="grid min-h-screen place-items-center p-6 text-center text-sm text-bad">{boot.error}</div>;
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

  const go = (to: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(to);
  };

  const sidebar = (
    <div className="flex h-full flex-col px-3 py-5 text-ink">
      <a href="/" onClick={go('/')} aria-label={`${boot.data.plant.shortName} CMMS, overview`} className="mb-7 flex items-center gap-3 rounded-pill px-2 py-1">
        <img src="/favicon.svg" alt="" width={36} height={36} className="h-9 w-9 rounded-pill" />
        <span className="min-w-0">
          <span className="block text-lg leading-tight">{boot.data.plant.shortName}</span>
          <span className="block text-sm text-muted">Maintenance and work control</span>
        </span>
      </a>
      <nav aria-label="Main" className="scrollbar-thin -mx-1 flex-1 space-y-6 overflow-y-auto px-1">
        {NAV.map((section) => (
          <div key={section.section}>
            <div className="mb-1.5 px-3 text-sm text-muted">{section.section}</div>
            <div className="space-y-px">
              {section.items.map((nav) => {
                const current = nav.path === item.path;
                return (
                  <a
                    key={nav.path}
                    href={nav.path}
                    onClick={go(nav.path)}
                    aria-current={current ? 'page' : undefined}
                    className={cx(
                      'relative flex h-10 items-center gap-3 rounded-pill px-3 text-sm transition-colors duration-150',
                      current ? 'bg-paper-2 font-medium text-ink before:absolute before:inset-y-2.5 before:left-0 before:w-0.5 before:rounded-full before:bg-accent' : 'text-ink-2 hover:bg-paper-2 hover:text-ink',
                    )}
                  >
                    <nav.icon size={16} className={current ? 'text-accent' : 'text-muted'} aria-hidden />
                    {nav.label}
                  </a>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <p className="mt-4 border-t border-rule px-3 pt-4 text-sm leading-6 text-muted">
        <span className="block text-ink-2">{boot.data.plant.reactorType}</span>
        Fictional plant. Every tag, part, person and number here is invented.
      </p>
    </div>
  );

  return (
    <AppContext.Provider value={{ ...boot.data, actor, setActor, version, changed: () => setVersion((v) => v + 1) }}>
      <div className="min-h-screen">
        <aside className="fixed inset-y-0 left-0 z-[200] hidden w-68 border-r border-rule bg-paper-3 lg:block">{sidebar}</aside>
        {menuOpen && (
          <div className="fixed inset-0 z-[400] lg:hidden">
            <div className="absolute inset-0 bg-scrim" onClick={() => setMenuOpen(false)} />
            <aside className="animate-slide-in absolute inset-y-0 left-0 w-72 border-r border-rule-2 bg-paper-3">{sidebar}</aside>
          </div>
        )}
        <div className="lg:pl-68">
          <header className="sticky top-0 z-[300] flex h-16 items-center justify-between gap-3 border-b border-rule bg-paper px-4 md:px-8">
            <div className="flex min-w-0 items-center gap-2">
              <button type="button" className="grid h-10 w-10 place-items-center rounded-pill text-ink-2 hover:bg-paper-2 lg:hidden" onClick={() => setMenuOpen((v) => !v)} aria-label="Menu" aria-expanded={menuOpen}>
                {menuOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
              <h1 className="max-w-none truncate text-lg">{title}</h1>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <Button size="md" icon={Plus} onClick={() => setRequestOpen(true)} aria-label="New work request">
                <span className="hidden sm:inline">Work request</span>
              </Button>
              <ActorSwitcher people={boot.data.people} actor={actor} onChange={setActor} />
              {boot.data.authRequired && (
                <button
                  type="button"
                  title="Sign out"
                  aria-label="Sign out"
                  onClick={async () => {
                    await api('/auth/logout', { body: {} });
                    window.location.reload();
                  }}
                  className="grid h-10 w-10 place-items-center rounded-pill text-muted hover:bg-paper-2 hover:text-ink"
                >
                  <LogOut size={18} />
                </button>
              )}
            </div>
          </header>
          <main className="mx-auto max-w-[1400px] px-4 py-6 md:px-8 md:py-10">
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
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex h-10 items-center gap-2 rounded-pill border border-rule-2 bg-paper-2 pl-1 pr-2.5 text-left transition-colors duration-150 hover:bg-paper-3" aria-haspopup="menu" aria-expanded={open}>
        <Avatar initials={actor.initials} />
        <span className="hidden min-w-0 items-baseline gap-1.5 text-sm md:flex">
          <span className="text-muted">Acting as</span>
          <span className="truncate font-medium text-accent">{actor.name}</span>
        </span>
        <ChevronDown size={14} className="text-muted" />
      </button>
      {open && (
        <div role="menu" className="animate-rise absolute right-0 top-12 z-[100] w-[min(92vw,380px)] rounded-card border border-rule-2 bg-paper-2 p-2">
          <p className="px-3 pb-2 pt-1 text-sm leading-6 text-muted">Every action is role-gated, as at a real plant. Switch people to see what each role can and can’t do.</p>
          {people.map((p) => (
            <button
              key={p.id}
              role="menuitem"
              onClick={() => {
                onChange(p.id);
                setOpen(false);
              }}
              type="button"
              aria-current={p.id === actor.id || undefined}
              className={cx('flex w-full items-start gap-3 rounded-pill px-3 py-2 text-left transition-colors duration-150 hover:bg-paper-3', p.id === actor.id && 'bg-paper-3')}
            >
              <Avatar initials={p.initials} className="mt-0.5" />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-accent">{p.name}</span>
                <span className="block text-sm text-ink-2">{p.role === 'technician' ? p.title : ROLE_LABEL[p.role]}</span>
                <span className="block text-sm text-muted">{ROLE_CAN[p.role]}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
