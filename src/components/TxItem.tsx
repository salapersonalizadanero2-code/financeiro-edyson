import type { ReactNode } from 'react';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, PiggyBank, Receipt, SlidersHorizontal, Undo2 } from 'lucide-react';
import type { AppState, Transaction } from '../lib/types';
import { brl, fmtDate } from '../lib/utils';
import { categoryName, netWorthDelta, txEffects } from '../lib/selectors';
import { Badge, StatusBadge, TypeBadge } from './ui';

export function accName(state: AppState, id: string | null, fallback = 'Não especificada'): string {
  if (!id) return fallback;
  return state.accounts.find((a) => a.id === id)?.name ?? 'Conta removida';
}

export function routeLabel(state: AppState, t: Transaction): string {
  const inv = t.investmentId ? state.investments.find((i) => i.id === t.investmentId)?.name ?? 'Investimento' : null;
  switch (t.type) {
    case 'income': return `→ ${accName(state, t.toAccountId)}`;
    case 'expense':
    case 'installment': return accName(state, t.fromAccountId);
    case 'adjustment': return accName(state, t.toAccountId);
    case 'transfer': return `${accName(state, t.fromAccountId)} → ${accName(state, t.toAccountId, 'Conta própria (não especificada)')}`;
    case 'application': return `${accName(state, t.fromAccountId)} → ${inv ?? accName(state, t.toAccountId)}`;
    case 'redemption': return `${inv ?? accName(state, t.fromAccountId)} → ${accName(state, t.toAccountId)}`;
  }
}

const ICON: Record<Transaction['type'], typeof ArrowUpRight> = {
  income: ArrowDownLeft, expense: ArrowUpRight, transfer: ArrowLeftRight, application: PiggyBank,
  redemption: Undo2, installment: Receipt, adjustment: SlidersHorizontal,
};

/** Valor com sinal. Com accountId: efeito naquela conta. Sem: efeito no patrimônio (transferências = 0). */
export function signedAmount(t: Transaction, accountId?: string): number {
  if (accountId) {
    return txEffects(t).acc.filter(([id]) => id === accountId).reduce((s, [, d]) => s + d, 0);
  }
  return netWorthDelta(t);
}

export function TxItem({ state, t, accountId, actions, compact }: { state: AppState; t: Transaction; accountId?: string; actions?: ReactNode; compact?: boolean }) {
  const Icon = ICON[t.type];
  const v = signedAmount(t, accountId);
  const color = v > 0 ? 'text-ok' : v < 0 ? 'text-bad' : 'text-muted';
  const bg = v > 0 ? 'bg-ok/10 text-ok' : v < 0 ? 'bg-bad/10 text-bad' : 'bg-tint text-brand dark:text-brand-soft';
  const cat = t.type === 'income' || t.type === 'expense' || t.type === 'installment' ? categoryName(state.categories, t.categoryId) : null;
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${bg}`}><Icon className="h-4 w-4" /></span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="truncate text-sm font-semibold">{t.description}</span>
          {!compact && <TypeBadge type={t.type} />}
          {t.status !== 'confirmed' && <StatusBadge status={t.status} />}
          {t.historical && <Badge tone="muted">Histórico</Badge>}
        </div>
        <div className="truncate text-xs text-muted">
          {fmtDate(t.date)} · {routeLabel(state, t)}{cat ? ` · ${cat}` : ''}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className={`text-sm font-bold tabular-nums ${color}`}>
          {v > 0 ? '+' : v < 0 ? '−' : ''}{brl(Math.abs(v === 0 ? t.amount : v))}
        </div>
        {actions && <div className="mt-1 flex justify-end gap-1">{actions}</div>}
      </div>
    </div>
  );
}
