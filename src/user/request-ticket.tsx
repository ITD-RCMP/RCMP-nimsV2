import { useEffect, useState } from 'react';
import { Download, Loader2, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatDateLabel, isoToLocalDate } from '@shared/lib/date-format';
import type { UserRequestHistoryStatus } from '@shared/lib/request-schema';
import { cn } from '@/lib/utils';

export type RequestTicketData = {
  requestId: number;
  requesterName: string;
  staffId: string;
  borrowDate: string;
  returnDate: string;
  programType: string;
  usageLocation: string;
  items: { assetType: string; quantity: number }[];
  submittedAt: Date;
  status?: UserRequestHistoryStatus;
};

export const REQUEST_STATUS_META: Record<
  UserRequestHistoryStatus,
  { label: string; className: string; bg: string; ink: string }
> = {
  submitted: { label: 'Submitted', className: 'bg-amber-100 text-amber-800', bg: '#fef3c7', ink: '#92400e' },
  preparing: { label: 'Being prepared', className: 'bg-violet-100 text-violet-800', bg: '#ede9fe', ink: '#5b21b6' },
  in_use: { label: 'Checked out', className: 'bg-sky-100 text-sky-800', bg: '#e0f2fe', ink: '#075985' },
  completed: { label: 'Completed', className: 'bg-emerald-100 text-emerald-800', bg: '#d1fae5', ink: '#065f46' },
  rejected: { label: 'Rejected', className: 'bg-rose-100 text-rose-800', bg: '#ffe4e6', ink: '#9f1239' },
  unavailable: { label: 'Unavailable', className: 'bg-orange-100 text-orange-800', bg: '#ffedd5', ink: '#9a3412' },
};

const SANS = '"Manrope", ui-sans-serif, system-ui, -apple-system, sans-serif';

const COLORS = {
  topFrom: '#ede9fe',
  topTo: '#e0e7ff',
  accent: '#7c3aed',
  dot: '#8b5cf6',
  connector: '#c4b5fd',
  ink: '#1e1b2e',
  muted: '#7a7488',
  line: '#e9e5f5',
  paper: '#ffffff',
  bgFrom: '#f5f3ff',
  bgTo: '#fffbeb',
};

/** Inclusive day count between two ISO dates (same day = 1). */
export function borrowDurationDays(borrowIso: string, returnIso: string): number | null {
  const from = isoToLocalDate(borrowIso);
  const to = isoToLocalDate(returnIso);
  if (!from || !to) return null;
  return Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
}

function dayMonth(iso: string) {
  return isoToLocalDate(iso)?.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) ?? iso;
}

function weekdayYear(iso: string) {
  const d = isoToLocalDate(iso);
  if (!d) return '';
  return `${d.toLocaleDateString('en-GB', { weekday: 'short' })}, ${d.getFullYear()}`;
}

function submittedLabel(date: Date) {
  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Deterministic decorative barcode bar widths (1–3) seeded by the request id. */
function barcodeBars(seed: number, count = 46): number[] {
  let state = (seed * 2654435761) >>> 0 || 1;
  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    state = (state * 1664525 + 1013904223) >>> 0;
    bars.push(1 + (state % 3));
  }
  return bars;
}

function Barcode({ seed, className }: { seed: number; className?: string }) {
  const bars = barcodeBars(seed);
  let x = 0;
  const rects = bars.map((w, i) => {
    const rect = i % 2 === 0 ? <rect key={i} x={x} y={0} width={w} height={40} /> : null;
    x += w;
    return rect;
  });
  return (
    <svg
      viewBox={`0 0 ${x} 40`}
      preserveAspectRatio="none"
      className={cn('h-10 w-full fill-foreground/85', className)}
      aria-hidden
    >
      {rects}
    </svg>
  );
}

const NOTCH = 14;
const topMask = `radial-gradient(circle at 0 100%, transparent ${NOTCH}px, #000 ${NOTCH + 0.5}px) left / 51% 100% no-repeat, radial-gradient(circle at 100% 100%, transparent ${NOTCH}px, #000 ${NOTCH + 0.5}px) right / 51% 100% no-repeat`;
const bottomMask = `radial-gradient(circle at 0 0, transparent ${NOTCH}px, #000 ${NOTCH + 0.5}px) left / 51% 100% no-repeat, radial-gradient(circle at 100% 0, transparent ${NOTCH}px, #000 ${NOTCH + 0.5}px) right / 51% 100% no-repeat`;

export function RequestTicket({ ticket }: { ticket: RequestTicketData }) {
  const days = borrowDurationDays(ticket.borrowDate, ticket.returnDate);
  const status = REQUEST_STATUS_META[ticket.status ?? 'submitted'];

  return (
    <div className="drop-shadow-[0_16px_28px_rgba(76,29,149,0.16)]">
      <div
        className="relative overflow-hidden rounded-t-[24px] bg-gradient-to-br from-violet-100 via-violet-50 to-indigo-100 px-6 pb-7 pt-6"
        style={{ mask: topMask, WebkitMask: topMask }}
      >
        <div className="pointer-events-none absolute -right-14 -top-16 h-44 w-44 rounded-full bg-white/70 blur-3xl" />
        <div className="relative flex items-center justify-between gap-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-600">ITD · NIMS</p>
          <span
            className={cn(
              'rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide',
              status.className,
            )}
          >
            {status.label}
          </span>
        </div>
        <p className="relative mt-4 text-[13px] font-medium text-muted-foreground">Equipment request</p>
        <p className="relative font-mono text-[40px] font-extrabold leading-none tracking-tight">
          #{ticket.requestId}
        </p>

        <div className="relative mt-6 flex items-end justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-violet-600">Borrow</p>
            <p className="mt-1 text-xl font-extrabold leading-none">{dayMonth(ticket.borrowDate)}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{weekdayYear(ticket.borrowDate)}</p>
          </div>
          <div className="mb-5 flex flex-1 flex-col items-center px-1">
            <span className="text-[11px] font-semibold text-violet-600">
              {days != null ? `${days} day${days === 1 ? '' : 's'}` : ''}
            </span>
            <span className="relative mt-1 h-px w-full max-w-24 border-t border-dashed border-violet-300">
              <span className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-violet-500" />
              <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-violet-500" />
            </span>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-violet-600">Return</p>
            <p className="mt-1 text-xl font-extrabold leading-none">{dayMonth(ticket.returnDate)}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{weekdayYear(ticket.returnDate)}</p>
          </div>
        </div>
      </div>

      <div
        className="relative rounded-b-[24px] bg-white px-6 pb-6 pt-7"
        style={{ mask: bottomMask, WebkitMask: bottomMask }}
      >
        <span
          className="absolute inset-x-5 top-0 border-t-2 border-dashed border-violet-100"
          aria-hidden
        />
        <dl className="space-y-4 text-sm">
          <TicketRow label="Requested by">
            {ticket.requesterName}
            <span className="ml-1.5 font-mono text-xs font-medium text-muted-foreground">{ticket.staffId}</span>
          </TicketRow>
          <div className="grid grid-cols-2 gap-4">
            <TicketRow label="Program">{ticket.programType}</TicketRow>
            <TicketRow label="Location">{ticket.usageLocation}</TicketRow>
          </div>
          <TicketRow label="Equipment">
            <ul className="mt-0.5 space-y-1">
              {ticket.items.map((item) => (
                <li key={item.assetType} className="flex items-center justify-between gap-3">
                  <span>{item.assetType}</span>
                  <span className="font-mono text-xs font-bold tabular-nums text-muted-foreground">
                    × {item.quantity}
                  </span>
                </li>
              ))}
            </ul>
          </TicketRow>
        </dl>
        <div className="mt-6 border-t border-dashed border-violet-100 pt-5">
          <Barcode seed={ticket.requestId} />
          <p className="mt-2 text-center text-[10px] font-medium text-muted-foreground">
            #{ticket.requestId} · Submitted {submittedLabel(ticket.submittedAt)}
          </p>
        </div>
      </div>
    </div>
  );
}

function TicketRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words font-semibold leading-snug text-foreground">{children}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PNG export — the ticket is redrawn on a canvas so the image is crisp and does
// not depend on DOM-to-image libraries or CSS mask support.
// ---------------------------------------------------------------------------

type Ctx = CanvasRenderingContext2D;

function setFont(ctx: Ctx, weight: number, size: number, tracking = 0) {
  ctx.font = `${weight} ${size}px ${SANS}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${tracking}px`;
}

function wrapText(ctx: Ctx, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width <= maxWidth || !line) {
        line = next;
      } else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

export async function renderTicketPng(ticket: RequestTicketData, scale = 3): Promise<Blob> {
  if (typeof document !== 'undefined' && document.fonts) {
    await Promise.all([
      document.fonts.load(`500 12px ${SANS}`),
      document.fonts.load(`700 12px ${SANS}`),
      document.fonts.load(`800 12px ${SANS}`),
    ]).catch(() => undefined);
  }

  const W = 400;
  const PAD = 28;
  const TX = PAD;
  const TW = W - PAD * 2;
  const IN = 24;
  const CW = TW - IN * 2;
  const TOP_H = 196;
  const days = borrowDurationDays(ticket.borrowDate, ticket.returnDate);
  const status = REQUEST_STATUS_META[ticket.status ?? 'submitted'];

  const measure = document.createElement('canvas').getContext('2d')!;
  setFont(measure, 700, 15);
  const nameLines = wrapText(measure, `${ticket.requesterName} · ${ticket.staffId}`, CW);
  const programLines = wrapText(measure, ticket.programType, CW);
  const locationLines = wrapText(measure, ticket.usageLocation, CW);

  const LABEL_H = 18;
  const LINE_H = 21;
  const ITEM_H = 24;
  const GAP = 16;
  const rowsH =
    LABEL_H * 4 +
    (nameLines.length + programLines.length + locationLines.length) * LINE_H +
    ticket.items.length * ITEM_H +
    GAP * 3;
  const BOTTOM_H = 28 + rowsH + 20 + 44 + 26 + IN;
  const ticketTop = PAD;
  const seamY = ticketTop + TOP_H;
  const H = ticketTop + TOP_H + BOTTOM_H + 52;

  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, COLORS.bgFrom);
  bg.addColorStop(1, COLORS.bgTo);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const off = document.createElement('canvas');
  off.width = canvas.width;
  off.height = canvas.height;
  const o = off.getContext('2d')!;
  o.scale(scale, scale);

  // Ticket body
  const topFill = o.createLinearGradient(TX, ticketTop, TX + TW, ticketTop + TOP_H);
  topFill.addColorStop(0, COLORS.topFrom);
  topFill.addColorStop(1, COLORS.topTo);
  o.fillStyle = topFill;
  o.beginPath();
  o.roundRect(TX, ticketTop, TW, TOP_H, [24, 24, 0, 0]);
  o.fill();
  const glow = o.createRadialGradient(TX + TW - 20, ticketTop + 10, 0, TX + TW - 20, ticketTop + 10, 130);
  glow.addColorStop(0, 'rgba(255,255,255,0.75)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  o.save();
  o.clip();
  o.fillStyle = glow;
  o.fillRect(TX, ticketTop, TW, TOP_H);
  o.restore();

  o.fillStyle = COLORS.paper;
  o.beginPath();
  o.roundRect(TX, seamY, TW, BOTTOM_H, [0, 0, 24, 24]);
  o.fill();

  // Top section
  let y = ticketTop + IN;
  o.textBaseline = 'alphabetic';
  o.textAlign = 'left';
  setFont(o, 700, 11, 2);
  o.fillStyle = COLORS.accent;
  o.fillText('ITD · NIMS', TX + IN, y + 11);

  setFont(o, 700, 10, 0.6);
  const pillText = status.label.toUpperCase();
  const pillW = o.measureText(pillText).width + 20;
  o.fillStyle = status.bg;
  o.beginPath();
  o.roundRect(TX + TW - IN - pillW, y - 3, pillW, 22, 11);
  o.fill();
  o.fillStyle = status.ink;
  o.fillText(pillText, TX + TW - IN - pillW + 10, y + 12);

  setFont(o, 500, 13);
  o.fillStyle = COLORS.muted;
  o.fillText('Equipment request', TX + IN, y + 44);
  setFont(o, 800, 40, -0.5);
  o.fillStyle = COLORS.ink;
  o.fillText(`#${ticket.requestId}`, TX + IN, y + 86);

  const dateY = y + 116;
  setFont(o, 700, 10, 1.4);
  o.fillStyle = COLORS.accent;
  o.fillText('BORROW', TX + IN, dateY);
  o.textAlign = 'right';
  o.fillText('RETURN', TX + TW - IN, dateY);
  setFont(o, 800, 20);
  o.fillStyle = COLORS.ink;
  o.textAlign = 'left';
  o.fillText(dayMonth(ticket.borrowDate), TX + IN, dateY + 24);
  o.textAlign = 'right';
  o.fillText(dayMonth(ticket.returnDate), TX + TW - IN, dateY + 24);
  setFont(o, 500, 11);
  o.fillStyle = COLORS.muted;
  o.textAlign = 'left';
  o.fillText(weekdayYear(ticket.borrowDate), TX + IN, dateY + 42);
  o.textAlign = 'right';
  o.fillText(weekdayYear(ticket.returnDate), TX + TW - IN, dateY + 42);

  const midX = TX + TW / 2;
  if (days != null) {
    setFont(o, 600, 11);
    o.fillStyle = COLORS.accent;
    o.textAlign = 'center';
    o.fillText(`${days} day${days === 1 ? '' : 's'}`, midX, dateY + 8);
  }
  o.strokeStyle = COLORS.connector;
  o.setLineDash([4, 4]);
  o.lineWidth = 1;
  o.beginPath();
  o.moveTo(midX - 36, dateY + 18);
  o.lineTo(midX + 36, dateY + 18);
  o.stroke();
  o.setLineDash([]);
  o.fillStyle = COLORS.dot;
  for (const dx of [-36, 36]) {
    o.beginPath();
    o.arc(midX + dx, dateY + 18, 3.5, 0, Math.PI * 2);
    o.fill();
  }

  // Perforation
  o.globalCompositeOperation = 'destination-out';
  for (const cx of [TX, TX + TW]) {
    o.beginPath();
    o.arc(cx, seamY, NOTCH, 0, Math.PI * 2);
    o.fill();
  }
  o.globalCompositeOperation = 'source-over';
  o.strokeStyle = COLORS.line;
  o.lineWidth = 2;
  o.setLineDash([6, 6]);
  o.beginPath();
  o.moveTo(TX + NOTCH + 8, seamY + 1);
  o.lineTo(TX + TW - NOTCH - 8, seamY + 1);
  o.stroke();
  o.setLineDash([]);

  // Bottom section
  o.textAlign = 'left';
  y = seamY + 28;
  const drawLabel = (text: string) => {
    setFont(o, 700, 10, 1.2);
    o.fillStyle = COLORS.muted;
    o.fillText(text.toUpperCase(), TX + IN, y + 10);
    y += LABEL_H;
  };
  const drawLines = (lines: string[]) => {
    setFont(o, 700, 15);
    o.fillStyle = COLORS.ink;
    for (const line of lines) {
      o.fillText(line, TX + IN, y + 15);
      y += LINE_H;
    }
    y += GAP;
  };
  drawLabel('Requested by');
  drawLines(nameLines);
  drawLabel('Program');
  drawLines(programLines);
  drawLabel('Location');
  drawLines(locationLines);
  drawLabel('Equipment');
  for (const item of ticket.items) {
    setFont(o, 600, 14);
    o.fillStyle = COLORS.ink;
    o.textAlign = 'left';
    o.fillText(item.assetType, TX + IN, y + 16);
    setFont(o, 700, 13);
    o.fillStyle = COLORS.muted;
    o.textAlign = 'right';
    o.fillText(`× ${item.quantity}`, TX + TW - IN, y + 16);
    y += ITEM_H;
  }
  o.textAlign = 'left';

  y += 12;
  o.strokeStyle = COLORS.line;
  o.lineWidth = 1;
  o.setLineDash([4, 4]);
  o.beginPath();
  o.moveTo(TX + IN, y);
  o.lineTo(TX + TW - IN, y);
  o.stroke();
  o.setLineDash([]);
  y += 20;

  const bars = barcodeBars(ticket.requestId);
  const unit = CW / bars.reduce((a, b) => a + b, 0);
  let bx = TX + IN;
  o.fillStyle = COLORS.ink;
  bars.forEach((w, i) => {
    if (i % 2 === 0) o.fillRect(bx, y, w * unit, 40);
    bx += w * unit;
  });
  y += 58;
  setFont(o, 500, 10);
  o.fillStyle = COLORS.muted;
  o.textAlign = 'center';
  o.fillText(`#${ticket.requestId} · Submitted ${submittedLabel(ticket.submittedAt)}`, midX, y);

  // Composite ticket with a soft shadow
  ctx.save();
  ctx.shadowColor = 'rgba(76,29,149,0.16)';
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 14;
  ctx.drawImage(off, 0, 0, W, H);
  ctx.restore();

  setFont(ctx, 500, 11);
  ctx.fillStyle = COLORS.muted;
  ctx.textAlign = 'center';
  ctx.fillText('Show this ticket to ITD when collecting your equipment.', W / 2, H - 24);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not create image.'))), 'image/png');
  });
}

function ticketFileName(ticket: RequestTicketData) {
  return `itd-request-${ticket.requestId}.png`;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Save / Share buttons for a ticket. The PNG is pre-rendered so Share runs straight from the tap (iOS needs the user gesture). */
export function TicketActions({ ticket, className }: { ticket: RequestTicketData; className?: string }) {
  const [png, setPng] = useState<Blob | null>(null);
  const [busy, setBusy] = useState<'save' | 'share' | null>(null);

  useEffect(() => {
    let alive = true;
    setPng(null);
    void renderTicketPng(ticket)
      .then((blob) => alive && setPng(blob))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [ticket]);

  const getPng = async () => png ?? (await renderTicketPng(ticket));

  const handleSave = async () => {
    setBusy('save');
    try {
      downloadBlob(await getPng(), ticketFileName(ticket));
      toast.success('Ticket saved as image.');
    } catch {
      toast.error('Could not create the ticket image. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const handleShare = async () => {
    setBusy('share');
    try {
      const blob = await getPng();
      const file = new File([blob], ticketFileName(ticket), { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: `ITD equipment request #${ticket.requestId}`,
            text: `My ITD equipment request #${ticket.requestId} (${formatDateLabel(ticket.borrowDate)} – ${formatDateLabel(ticket.returnDate)})`,
          });
        } catch (e) {
          if (!(e instanceof DOMException && e.name === 'AbortError')) {
            toast.error('Sharing failed. Try saving the image instead.');
          }
        }
        return;
      }
      downloadBlob(blob, ticketFileName(ticket));
      toast('Sharing is not supported on this browser, so the ticket was saved instead.');
    } catch {
      toast.error('Could not create the ticket image. Try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={cn('grid grid-cols-2 gap-3', className)}>
      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={busy != null}
        className="user-surface flex h-12 items-center justify-center gap-2 rounded-full text-sm font-bold text-violet-700 transition-transform active:scale-95 disabled:opacity-60"
      >
        {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        Save image
      </button>
      <button
        type="button"
        onClick={() => void handleShare()}
        disabled={busy != null}
        className="user-cta flex h-12 items-center justify-center gap-2 rounded-full text-sm font-bold transition-transform active:scale-95 disabled:opacity-60"
      >
        {busy === 'share' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
        Share ticket
      </button>
    </div>
  );
}
