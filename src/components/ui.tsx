import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useApp } from '../store';
import { STATUS_LABEL, TX_LABEL, type TxStatus, type TxType } from '../lib/types';
import { brl } from '../lib/utils';
import { activeAccounts } from '../lib/selectors';

export const CHART_COLORS = ['#7C3AED', '#A78BFA', '#4C1D95', '#C4B5FD', '#8B5CF6', '#6D28D9', '#DDD6FE', '#5B21B6', '#9F7AEA', '#B794F4', '#553C9A', '#D6BCFA'];

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 max-w-2xl text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, action, children, className = '' }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card fade-up p-4 sm:p-5 ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-sm font-bold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

type Tone = 'brand' | 'ok' | 'bad' | 'warn' | 'muted';
const toneText: Record<Tone, string> = { brand: 'text-brand dark:text-brand-soft', ok: 'text-ok', bad: 'text-bad', warn: 'text-warn', muted: 'text-muted' };
const toneBg: Record<Tone, string> = { brand: 'bg-brand/10 text-brand dark:text-brand-soft', ok: 'bg-ok/10 text-ok', bad: 'bg-bad/10 text-bad', warn: 'bg-warn/15 text-warn', muted: 'bg-tint text-muted' };

export function Stat({ label, value, sub, tone = 'brand', icon, onClick }: { label: string; value: string; sub?: ReactNode; tone?: Tone; icon?: ReactNode; onClick?: () => void }) {
  return (
    <div className={`card fade-up p-4 ${onClick ? 'cursor-pointer transition hover:border-brand/50' : ''}`} onClick={onClick}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-muted">{label}</span>
        {icon && <span className={`grid h-7 w-7 place-items-center rounded-lg ${toneBg[tone]}`}>{icon}</span>}
      </div>
      <div className={`mt-1.5 text-xl font-bold tracking-tight sm:text-[22px] ${tone === 'brand' ? '' : toneText[tone]}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function Badge({ tone = 'muted', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge ${toneBg[tone]}`}>{children}</span>;
}

export function StatusBadge({ status }: { status: TxStatus }) {
  return <Badge tone={status === 'confirmed' ? 'ok' : status === 'pending' ? 'warn' : 'brand'}>{STATUS_LABEL[status]}</Badge>;
}

export function TypeBadge({ type }: { type: TxType }) {
  const tone: Tone = type === 'income' ? 'ok' : type === 'expense' || type === 'installment' ? 'bad' : type === 'adjustment' ? 'warn' : 'brand';
  return <Badge tone={tone}>{TX_LABEL[type]}</Badge>;
}

export function Progress({ value, tone = 'brand', height = 'h-2' }: { value: number; tone?: Tone; height?: string }) {
  const v = Math.max(0, Math.min(100, value));
  const bg = tone === 'ok' ? 'bg-ok' : tone === 'bad' ? 'bg-bad' : tone === 'warn' ? 'bg-warn' : 'bg-brand';
  return (
    <div className={`w-full overflow-hidden rounded-full bg-tint ${height}`}>
      <div className={`${bg} ${height} rounded-full transition-all duration-500`} style={{ width: `${v}%` }} />
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">{children}</div>;
}

export function Notice({ tone = 'warn', children }: { tone?: Tone; children: ReactNode }) {
  return <div className={`rounded-xl px-3.5 py-2.5 text-sm ${toneBg[tone]}`}>{children}</div>;
}

export function Money({ value, signed, className = '' }: { value: number; signed?: boolean; className?: string }) {
  const tone = value > 0 ? 'text-ok' : value < 0 ? 'text-bad' : '';
  return <span className={`${signed ? tone : ''} ${className} tabular-nums`}>{signed && value > 0 ? '+' : ''}{brl(value)}</span>;
}

export function Modal({ open, title, onClose, children, footer, wide }: { open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="no-print fixed inset-0 z-[90] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        className={`pop card flex max-h-[92vh] w-full flex-col rounded-b-none sm:rounded-b-2xl ${wide ? 'max-w-3xl' : 'max-w-lg'}`}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h3 className="text-base font-bold">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-muted hover:bg-tint" aria-label="Fechar"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, hint, children, className = '' }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted">{hint}</span>}
    </label>
  );
}

export function MoneyInput({ value, onChange, placeholder = '0,00', ...rest }: { value: string; onChange: (v: string) => void; placeholder?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return <input {...rest} className="input" inputMode="decimal" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value.replace(/[^\d.,-]/g, ''))} />;
}

export function AccountSelect({ value, onChange, allowEmpty, emptyLabel = 'Selecione…', kinds, includeId }: { value: string; onChange: (v: string) => void; allowEmpty?: boolean; emptyLabel?: string; kinds?: string[]; includeId?: string }) {
  const { state } = useApp();
  const list = state.accounts.filter((a) => (!a.archived || a.id === includeId) && (!kinds || kinds.includes(a.kind)));
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      {(allowEmpty || !value) && <option value="">{emptyLabel}</option>}
      {list.map((a) => <option key={a.id} value={a.id}>{a.name}{a.archived ? ' (arquivada)' : ''}</option>)}
    </select>
  );
}

export function CategorySelect({ value, onChange, kind, emptyLabel = 'Sem categoria (A classificar)' }: { value: string; onChange: (v: string) => void; kind?: 'expense' | 'income'; emptyLabel?: string }) {
  const { state } = useApp();
  const cats = state.categories.filter((c) => !kind || c.kind === kind);
  const tops = cats.filter((c) => !c.parentId);
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{emptyLabel}</option>
      {tops.map((t) => (
        <optgroup key={t.id} label={t.name}>
          <option value={t.id}>{t.name}</option>
          {cats.filter((c) => c.parentId === t.id).map((c) => <option key={c.id} value={c.id}>{t.name} › {c.name}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

export function useActiveAccounts() {
  const { state } = useApp();
  return activeAccounts(state);
}

export function MoneyTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color?: string; payload?: { fill?: string } }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-card px-3 py-2 text-xs shadow-lg">
      {label && <div className="mb-1 font-bold">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color ?? p.payload?.fill }} />
          <span className="text-muted">{p.name}:</span>
          <span className="font-semibold tabular-nums">{brl(p.value)}</span>
        </div>
      ))}
    </div>
  );
}
