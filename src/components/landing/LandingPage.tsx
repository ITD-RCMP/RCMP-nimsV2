import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bell,
  Boxes,
  Loader2,
  Menu,
  PackageSearch,
  ScanBarcode,
  Shield,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { NimsLogo } from '@/components/brand/NimsLogo';
import uniklOfficialLogo from '@/assets/unikl-official.png';
import { MICROSOFT_OAUTH_STATE_KEY } from '@/auth/microsoft-callback-page';
import type { LandingStatusLevel, LandingSystemStatus } from '@shared/lib/landing-status-types';
import { getLandingSystemStatusFn } from '@backend/server/operations/landing-status.functions';
import { getMicrosoftLoginUrlFn } from '@backend/server/auth/auth.functions';
import { REQUEST_IT_EMAIL } from '@shared/lib/request-email-types';
import { cn } from '@/lib/utils';

const STATUS_DOT: Record<LandingStatusLevel, string> = {
  ok: 'bg-emerald-500 shadow-[0_0_0_3px] shadow-emerald-500/25',
  warn: 'bg-amber-500 shadow-[0_0_0_3px] shadow-amber-500/25',
  error: 'bg-rose-500 shadow-[0_0_0_3px] shadow-rose-500/25',
  neutral: 'bg-muted-foreground/40',
};

function MicrosoftIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect x="1" y="1" width="10.5" height="10.5" rx="1" fill="#f35325" />
      <rect x="12.5" y="1" width="10.5" height="10.5" rx="1" fill="#81bc06" />
      <rect x="1" y="12.5" width="10.5" height="10.5" rx="1" fill="#00a4ef" />
      <rect x="12.5" y="12.5" width="10.5" height="10.5" rx="1" fill="#ffba08" />
    </svg>
  );
}

function StatusRow({ label, value, level }: { label: string; value: string; level: LandingStatusLevel }) {
  return (
    <div className="flex items-start gap-3 rounded-[10px] border border-border/50 bg-white/80 px-3 py-2.5">
      <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', STATUS_DOT[level])} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-[12px] font-medium leading-snug text-foreground">{value}</p>
      </div>
    </div>
  );
}

function SystemOverviewPanel() {
  const [data, setData] = useState<LandingSystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async (initial: boolean) => {
      try {
        const status = await getLandingSystemStatusFn();
        if (!cancelled) {
          setData(status);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not load system status');
          if (initial) setData(null);
        }
      } finally {
        if (!cancelled && initial) setLoading(false);
      }
    };

    void load(true);
    const interval = window.setInterval(() => void load(false), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <div className="relative w-full">
      <div className="overflow-hidden rounded-[16px] border border-border/50 bg-background/95 shadow-[0_20px_60px_-12px_rgba(0,0,0,0.12)] backdrop-blur-sm">
        <div className="border-b border-border/50 bg-gradient-to-r from-lavender/10 to-transparent px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div>
                <p className="text-[13px] font-semibold text-foreground">IT Department · Live status</p>
                <p className="text-[10px] text-muted-foreground"> System &amp; database status overview</p>
              </div>
            </div>
            {data && (
              <p className="text-[9px] tabular-nums text-muted-foreground">Updated {data.fetchedAt}</p>
            )}
          </div>
        </div>

        <div className="space-y-3 p-4">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking system…
            </div>
          )}

          {!loading && error && (
            <div className="rounded-[10px] border border-destructive/30 bg-destructive/5 px-3 py-3 text-xs text-destructive">
              <p className="font-semibold">Status unavailable</p>
              <p className="mt-1 text-destructive/90">{error}</p>
            </div>
          )}

          {!loading && data && (
            <>
              <div className="space-y-2">
                {data.rows.map((row) => (
                  <StatusRow key={row.key} label={row.label} value={row.value} level={row.level} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const features = [
  { icon: PackageSearch, title: 'Real-time stock levels', description: 'Always know what you have, where it is, and when it needs reordering.' },
  { icon: Bell, title: 'Low-stock alerts', description: 'Items automatically flag as low or out of stock based on your thresholds.' },
  { icon: BarChart3, title: 'Search and filter', description: 'Find items by name, SKU, category, or location in seconds.' },
  { icon: Shield, title: 'Role-based control', description: 'Admins manage inventory; team members view and report. Everyone stays aligned.' },
];

const steps = [
  { num: '01', icon: ScanBarcode, title: 'Add your items', description: 'Enter products details to add to the inventory system.' },
  { num: '02', icon: Activity, title: 'Track movement', description: 'Update quantities as stock comes in or goes out.' },
  { num: '03', icon: Bell, title: 'Stay ahead', description: 'Get a clear view of low and out-of-stock items to reorder on time.' },
];

export function LandingPage() {
  const navigate = useNavigate();
  const [showNav, setShowNav] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowNav(window.scrollY > 80);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollToHowItWorks = () => {
    setMobileNavOpen(false);
    document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSignIn = async () => {
    if (import.meta.env.DEV) {
      void navigate({ to: '/login' });
      return;
    }

    setSigningIn(true);
    try {
      const { url, state } = await getMicrosoftLoginUrlFn();
      sessionStorage.setItem(MICROSOFT_OAUTH_STATE_KEY, state);
      window.location.href = url;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign-in unavailable';
      toast.error(message);
      setSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky nav */}
      <nav className={`fixed top-0 left-0 right-0 z-40 border-b border-border/50 bg-background/80 backdrop-blur-xl px-6 py-4 sm:px-8 md:px-12 transition-all duration-300 ${showNav ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none'} sm:translate-y-0 sm:opacity-100 sm:pointer-events-auto`}>
        <div className="mx-auto flex max-w-6xl h-8 items-center justify-between">
          <NimsLogo size="md" variant="light" />
          <div className="hidden items-center gap-8 sm:flex">
            <a href="https://itd.rcmp.edu.my/feedback" className="rounded-[10px] bg-foreground px-5 py-1.5 text-sm font-semibold text-background hover:opacity-90 transition-all">
              Submit Feedback
            </a>
          </div>
          <button onClick={() => setMobileNavOpen(!mobileNavOpen)} className="flex h-10 w-10 items-center justify-center rounded-[8px] text-muted-foreground hover:text-foreground sm:hidden">
            {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {mobileNavOpen && (
          <div className="mx-auto max-w-6xl space-y-3 px-1 pt-4 sm:hidden">
            <a href="https://itd.rcmp.edu.my/feedback" className="block w-full rounded-[10px] bg-foreground px-4 py-2 text-center text-sm font-semibold text-background">
              Submit Feedback
            </a>
          </div>
        )}
      </nav>

      <div className="relative">
        {/* Gradient mesh */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-[200px] right-[10%] h-[600px] w-[600px] rounded-full bg-lavender/[0.12] blur-[100px]" />
          <div className="absolute -top-[100px] -left-[200px] h-[500px] w-[500px] rounded-full bg-[oklch(0.65_0.20_350)]/[0.08] blur-[80px]" />
        </div>
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: `radial-gradient(circle, var(--foreground) 1px, transparent 1px)`, backgroundSize: '24px 24px' }}
        />

        {/* Hero */}
        <section className="relative">
          <div className="mx-auto max-w-6xl px-6 py-16 sm:px-10 sm:py-24 md:py-32">
            <div className="flex flex-col gap-12 lg:flex-row lg:items-center lg:gap-20">
              <div className="flex-1 max-w-xl">
                <div className="mb-8">
                  <img
                    src={uniklOfficialLogo}
                    alt="Universiti Kuala Lumpur · Royal College of Medicine Perak"
                    className="h- max-h-16 w-auto max-w-[min(100%,420px)] object-contain object-left sm:max-h-16"
                  />
                </div>
                <div className="mb-5 flex items-center gap-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground sm:text-xs">
                    University Kuala Lumpur Royal College of Medicine
                  </p>
                </div>
                <h1 className="font-sans">
                  <span className="block bg-gradient-to-br from-foreground via-foreground to-[oklch(0.48_0.12_290)] bg-clip-text text-[2.5rem] font-extrabold leading-[1.02] tracking-[-0.04em] text-transparent sm:text-5xl md:text-6xl lg:text-[4.25rem]">
                    Nexcheck
                  </span>
                  <span className="mt-2 block text-[1.65rem] font-bold leading-[1.12] tracking-[-0.03em] text-foreground sm:mt-3 sm:text-4xl md:text-[2.75rem] lg:text-5xl">
                    Inventory Management <br/> System
                  </span>
                </h1>
                <p className="mt-6 max-w-md text-base leading-[1.6] text-muted-foreground sm:mt-8 sm:text-lg">
                  This system is designed to help IT Department manage inventory effectively and efficiently.
                </p>
                <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:gap-4">
                  <button
                    type="button"
                    disabled={signingIn}
                    onClick={() => void handleSignIn()}
                    className="group inline-flex items-center justify-center gap-2 rounded-[10px] bg-lavender px-8 py-3 text-base font-semibold text-foreground transition-all hover:shadow-lg hover:shadow-lavender/25 disabled:opacity-70"
                  >
                    {signingIn ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Redirecting…
                      </>
                    ) : (
                      <>
                        <MicrosoftIcon />
                        Sign in with Microsoft
                      </>
                    )}
                  </button>
                </div>
              </div>
              <div className="w-full max-w-md lg:max-w-lg flex-shrink-0">
                <div className="relative">
                  <div className="pointer-events-none absolute -top-6 -left-6 z-10 h-12 w-12 rounded-full bg-lavender shadow-lg shadow-lavender/20 animate-[float_6s_ease-in-out_infinite] flex items-center justify-center">
                    <Boxes className="h-5 w-5 text-foreground" />
                  </div>
                  <div className="pointer-events-none absolute -top-4 -right-4 z-10 h-10 w-10 rounded-full bg-[oklch(0.65_0.20_350)] shadow-lg flex items-center justify-center">
                    <Bell className="h-4 w-4 text-foreground" />
                  </div>
                  <div className="pointer-events-none absolute -bottom-5 -right-5 z-10 h-11 w-11 rounded-full bg-foreground shadow-lg flex items-center justify-center">
                    <ScanBarcode className="h-4 w-4 text-background" />
                  </div>
                  <SystemOverviewPanel />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="relative">
          <div className="mx-6 rounded-[24px] bg-foreground text-background sm:mx-10">
            <div className="mx-auto max-w-6xl px-6 py-20 sm:px-10 sm:py-28">
              <div className="mb-14 max-w-lg">
                <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-lavender">How it works</p>
                <h2 className="text-3xl font-bold leading-[1.08] tracking-[-0.01em] sm:text-4xl">From chaos to clarity in three steps</h2>
              </div>
              <div className="grid grid-cols-1 gap-12 sm:grid-cols-3 sm:gap-10">
                {steps.map((step, i) => {
                  const iconColors = [
                    'bg-lavender text-foreground',
                    'bg-[oklch(0.85_0.12_155)] text-foreground',
                    'bg-[oklch(0.85_0.10_55)] text-foreground',
                  ];
                  return (
                    <div key={i}>
                      <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-[10px] ${iconColors[i]}`}>
                        <step.icon className="h-5 w-5" />
                      </div>
                      <h3 className="text-lg font-semibold tracking-[-0.02em] text-white">{step.title}</h3>
                      <p className="mt-2 text-sm leading-[1.6] text-white/70">{step.description}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <footer className="border-t border-border/60 bg-background px-6 py-10 sm:px-10 sm:py-12">
          <div className="mx-auto flex max-w-6xl flex-col gap-10 sm:flex-row sm:items-start sm:justify-between sm:gap-16">
            <div className="min-w-0 max-w-md">
              <NimsLogo size="sm" variant="light" />
              <p className="mt-4 text-sm font-semibold tracking-[-0.01em] text-foreground">
                Nexcheck Inventory Management System
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                IT Department · Universiti Kuala Lumpur Royal College of Medicine Perak
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                © {new Date().getFullYear()} Universiti Kuala Lumpur. All rights reserved.
              </p>
            </div>
            <div className="shrink-0 sm:text-right">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Contact
              </p>
              <a
                href={`mailto:${REQUEST_IT_EMAIL}`}
                className="mt-3 block text-sm font-medium text-foreground transition-colors hover:text-foreground/70"
              >
                {REQUEST_IT_EMAIL}
              </a>
              <a
                href="https://itd.rcmp.edu.my/feedback"
                className="mt-2 block text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Submit feedback
              </a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
