import type {
  Account, AppState, BaseObligation, Block, Category, Contract, Debt, Investment, Statement, Transaction,
} from './types';
import {
  addMonthsISO, addMonthsYM, dateInMonth, daysDiff, monthRange, monthShort, r2, ymOf,
} from './utils';

// ====================== Efeitos contábeis ======================
/** Lançamento que movimenta saldos: não é apenas histórico e não está pendente. */
export const isEffective = (t: Transaction): boolean => !t.historical && t.status !== 'pending';

export interface Effects {
  acc: Array<[string, number]>;
  inv: Array<[string, number, boolean]>; // [id, delta, isApplication]
}

export function txEffects(t: Transaction): Effects {
  const acc: Effects['acc'] = [];
  const inv: Effects['inv'] = [];
  const a = t.amount;
  switch (t.type) {
    case 'income':
      if (t.toAccountId) acc.push([t.toAccountId, a]);
      break;
    case 'expense':
    case 'installment':
      if (t.fromAccountId) acc.push([t.fromAccountId, -a]);
      break;
    case 'transfer':
      if (t.fromAccountId) acc.push([t.fromAccountId, -a]);
      if (t.toAccountId) acc.push([t.toAccountId, a]);
      break;
    case 'application':
      if (t.fromAccountId) acc.push([t.fromAccountId, -a]);
      if (t.toAccountId) acc.push([t.toAccountId, a]);
      if (t.investmentId) inv.push([t.investmentId, a, true]);
      break;
    case 'redemption':
      if (t.fromAccountId) acc.push([t.fromAccountId, -a]);
      if (t.investmentId) inv.push([t.investmentId, -a, false]);
      if (t.toAccountId) acc.push([t.toAccountId, a]);
      break;
    case 'adjustment':
      if (t.toAccountId) acc.push([t.toAccountId, t.adjustDirection === 'out' ? -a : a]);
      break;
  }
  return { acc, inv };
}

/** Variação líquida do patrimônio causada pelo lançamento (transferências/aplicações/resgates = 0). */
export function netWorthDelta(t: Transaction): number {
  switch (t.type) {
    case 'income': return t.amount;
    case 'expense':
    case 'installment': return -t.amount;
    case 'adjustment': return t.adjustDirection === 'out' ? -t.amount : t.amount;
    default: return 0;
  }
}

export function balancesMap(state: AppState, excludeTxId?: string): Record<string, number> {
  const m: Record<string, number> = {};
  for (const a of state.accounts) m[a.id] = a.openingBalance;
  for (const t of state.transactions) {
    if (!isEffective(t) || t.id === excludeTxId) continue;
    for (const [id, d] of txEffects(t).acc) if (id in m) m[id] = r2(m[id] + d);
  }
  return m;
}

export function investmentMap(state: AppState): Record<string, { value: number; applied: number }> {
  const m: Record<string, { value: number; applied: number }> = {};
  for (const i of state.investments) m[i.id] = { value: i.baseValue ?? 0, applied: i.appliedBase ?? 0 };
  for (const t of state.transactions) {
    if (!isEffective(t)) continue;
    for (const [id, d, isApp] of txEffects(t).inv) {
      if (!(id in m)) continue;
      m[id].value = r2(m[id].value + d);
      if (isApp) m[id].applied = r2(m[id].applied + d);
    }
  }
  return m;
}

// ====================== Bloqueios ======================
export const isBlockActive = (b: Block, today: string): boolean => today < b.unlockDate;

export function blockedOf(acc: Account, balance: number, today: string): number {
  const sum = acc.blocks.filter((b) => isBlockActive(b, today)).reduce((s, b) => s + b.amount, 0);
  return r2(Math.min(Math.max(balance, 0), sum));
}

export function nextUnlock(acc: Account, today: string): Block | null {
  const act = acc.blocks.filter((b) => isBlockActive(b, today)).sort((a, b) => a.unlockDate.localeCompare(b.unlockDate));
  return act[0] ?? null;
}

// ====================== Totais ======================
export interface Totals {
  patrimony: number;
  available: number;
  blocked: number;
  banks: number;
  savingsAccounts: number;
  investments: number;
  saved: number;
  balances: Record<string, number>;
}

export function computeTotals(state: AppState, today: string): Totals {
  const balances = balancesMap(state);
  const inv = investmentMap(state);
  let banks = 0, savingsAccounts = 0, blocked = 0, available = 0;
  for (const a of state.accounts) {
    if (a.archived) continue;
    const b = balances[a.id] ?? 0;
    const bl = blockedOf(a, b, today);
    blocked += bl;
    available += b - bl;
    if (a.kind === 'savings') savingsAccounts += b;
    else banks += b;
  }
  const investments = state.investments.filter((i) => !i.archived).reduce((s, i) => s + (inv[i.id]?.value ?? 0), 0);
  return {
    patrimony: r2(banks + savingsAccounts + investments),
    available: r2(available),
    blocked: r2(blocked),
    banks: r2(banks),
    savingsAccounts: r2(savingsAccounts),
    investments: r2(investments),
    saved: r2(savingsAccounts + investments),
    balances,
  };
}

// ====================== Obrigações (dívidas e contratos) ======================
export type ObRef = { kind: 'debt'; ob: Debt } | { kind: 'contract'; ob: Contract };

export function findObligation(state: AppState, id: string): ObRef | null {
  const d = state.debts.find((x) => x.id === id);
  if (d) return { kind: 'debt', ob: d };
  const c = state.contracts.find((x) => x.id === id);
  if (c) return { kind: 'contract', ob: c };
  return null;
}

export function installmentDue(ob: BaseObligation, no: number): string | null {
  return ob.firstDueDate ? addMonthsISO(ob.firstDueDate, no - 1) : null;
}

export interface Progress {
  paidNos: Set<number>;
  txByNo: Map<number, Transaction>;
  paid: number;
  remaining: number;
  nextNo: number | null;
  nextDue: string | null;
  amortized: number;
}

export function obligationProgress(state: AppState, ob: BaseObligation): Progress {
  const paidNos = new Set<number>();
  const txByNo = new Map<number, Transaction>();
  for (let i = 1; i <= Math.min(ob.paidBefore, ob.totalInstallments); i++) paidNos.add(i);
  let amortized = 0;
  for (const t of state.transactions) {
    if (t.obligationId !== ob.id || t.status === 'pending') continue;
    if (t.installmentNo != null) {
      paidNos.add(t.installmentNo);
      txByNo.set(t.installmentNo, t);
    } else if (t.type === 'expense') amortized += t.amount;
  }
  let nextNo: number | null = null;
  for (let i = 1; i <= ob.totalInstallments; i++) if (!paidNos.has(i)) { nextNo = i; break; }
  const paid = paidNos.size;
  return {
    paidNos, txByNo, paid,
    remaining: Math.max(0, ob.totalInstallments - paid),
    nextNo,
    nextDue: nextNo ? installmentDue(ob, nextNo) : null,
    amortized: r2(amortized),
  };
}

export function obligationBalance(state: AppState, ref: ObRef): number {
  const p = obligationProgress(state, ref.ob);
  const base = p.remaining * ref.ob.installmentAmount;
  if (ref.kind === 'contract') {
    if (ref.ob.balanceOverride != null) return r2(ref.ob.balanceOverride);
    return r2(Math.max(0, base - p.amortized));
  }
  return r2(base);
}

export interface DebtTotals {
  owe: number;
  clarify: number;
  receivable: number;
  futureAmount: number;
  futureCount: number;
}

export function debtTotals(state: AppState): DebtTotals {
  let owe = 0, clarify = 0, receivable = 0, futureAmount = 0, futureCount = 0;
  for (const d of state.debts) {
    const ref: ObRef = { kind: 'debt', ob: d };
    const bal = obligationBalance(state, ref);
    if (d.direction === 'owe') {
      owe += bal;
      if (d.totalInstallments > 1) {
        futureAmount += bal;
        futureCount += obligationProgress(state, d).remaining;
      }
    } else if (d.direction === 'unknown') clarify += bal;
    else receivable += bal;
  }
  for (const c of state.contracts) {
    if (c.contractStatus === 'cancelled' || c.contractStatus === 'paid_off') continue;
    const bal = obligationBalance(state, { kind: 'contract', ob: c });
    owe += bal;
    futureAmount += bal;
    futureCount += obligationProgress(state, c).remaining;
  }
  return { owe: r2(owe), clarify: r2(clarify), receivable: r2(receivable), futureAmount: r2(futureAmount), futureCount };
}

export interface DueItem {
  key: string;
  kind: 'obligation' | 'tx';
  name: string;
  amount: number;
  date: string | null;
  overdue: boolean;
  label: string;
}

export function upcomingDues(state: AppState, today: string, horizonDays = 45): DueItem[] {
  const items: DueItem[] = [];
  const push = (it: Omit<DueItem, 'overdue'>) => {
    const overdue = !!it.date && it.date < today;
    if (it.date && !overdue && daysDiff(today, it.date) > horizonDays) return;
    items.push({ ...it, overdue });
  };
  const obs: ObRef[] = [
    ...state.debts.filter((d) => d.direction === 'owe').map((ob) => ({ kind: 'debt' as const, ob })),
    ...state.contracts.filter((c) => c.contractStatus !== 'cancelled' && c.contractStatus !== 'paid_off').map((ob) => ({ kind: 'contract' as const, ob })),
  ];
  for (const r of obs) {
    const p = obligationProgress(state, r.ob);
    if (!p.nextNo) continue;
    push({
      key: `${r.ob.id}:${p.nextNo}`, kind: 'obligation', name: r.ob.name, amount: r.ob.installmentAmount,
      date: p.nextDue, label: `Parcela ${p.nextNo}/${r.ob.totalInstallments}`,
    });
  }
  for (const t of state.transactions) {
    if (t.status === 'pending' && (t.type === 'expense' || t.type === 'installment')) {
      push({ key: t.id, kind: 'tx', name: t.description, amount: t.amount, date: t.date, label: 'Despesa pendente' });
    }
  }
  return items.sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'));
}

// ====================== Categorias ======================
export function topCategory(cats: Category[], id: string | null): Category | null {
  if (!id) return null;
  let c = cats.find((x) => x.id === id) ?? null;
  while (c && c.parentId) {
    const p = cats.find((x) => x.id === c!.parentId);
    if (!p) break;
    c = p;
  }
  return c;
}

export function categoryName(cats: Category[], id: string | null): string {
  if (!id) return 'A classificar';
  const c = cats.find((x) => x.id === id);
  if (!c) return 'Categoria removida';
  const p = c.parentId ? cats.find((x) => x.id === c.parentId) : null;
  return p ? `${p.name} › ${c.name}` : c.name;
}

// ====================== Estatísticas por período ======================
export interface PeriodStats {
  income: number;
  toClassify: number;
  expense: number;
  installments: number;
  invested: number;
  redeemed: number;
  transfers: number;
  adjustments: number;
  byCategory: Record<string, number>; // por categoria de topo ('none' = sem categoria)
  count: number;
}

export function periodStats(state: AppState, from: string, to: string): PeriodStats {
  const s: PeriodStats = { income: 0, toClassify: 0, expense: 0, installments: 0, invested: 0, redeemed: 0, transfers: 0, adjustments: 0, byCategory: {}, count: 0 };
  for (const t of state.transactions) {
    if (t.status === 'pending' || t.date < from || t.date > to) continue;
    s.count++;
    switch (t.type) {
      case 'income':
        s.income += t.amount;
        if (t.status === 'to_classify') s.toClassify += t.amount;
        break;
      case 'expense':
      case 'installment': {
        s.expense += t.amount;
        if (t.type === 'installment') s.installments += t.amount;
        const k = topCategory(state.categories, t.categoryId)?.id ?? 'none';
        s.byCategory[k] = r2((s.byCategory[k] ?? 0) + t.amount);
        break;
      }
      case 'transfer': s.transfers += t.amount; break;
      case 'application': s.invested += t.amount; break;
      case 'redemption': s.redeemed += t.amount; break;
      case 'adjustment': s.adjustments += t.adjustDirection === 'out' ? -t.amount : t.amount; break;
    }
  }
  (Object.keys(s) as Array<keyof PeriodStats>).forEach((k) => {
    const v = s[k];
    if (typeof v === 'number') (s as unknown as Record<string, number>)[k] = r2(v);
  });
  return s;
}

export function monthStats(state: AppState, ym: string): PeriodStats {
  const [a, b] = monthRange(ym);
  return periodStats(state, a, b);
}

export function monthSeries(state: AppState, endYm: string, n: number) {
  const out: Array<{ ym: string; label: string; receitas: number; despesas: number }> = [];
  for (let i = n - 1; i >= 0; i--) {
    const ym = addMonthsYM(endYm, -i);
    const s = monthStats(state, ym);
    out.push({ ym, label: monthShort(ym), receitas: s.income, despesas: s.expense });
  }
  return out;
}

/** Gasto por categoria (inclui subcategorias) para controle de limites. */
export function limitStatus(state: AppState, ym: string) {
  const [from, to] = monthRange(ym);
  const spent: Record<string, number> = {};
  for (const t of state.transactions) {
    if (t.status === 'pending' || t.date < from || t.date > to) continue;
    if (t.type !== 'expense' && t.type !== 'installment') continue;
    const top = topCategory(state.categories, t.categoryId);
    if (top) spent[top.id] = (spent[top.id] ?? 0) + t.amount;
    if (t.categoryId && top && top.id !== t.categoryId) spent[t.categoryId] = (spent[t.categoryId] ?? 0) + t.amount;
  }
  return state.categories
    .filter((c) => c.kind === 'expense')
    .map((c) => {
      const sp = r2(spent[c.id] ?? 0);
      const ratio = c.limit ? sp / c.limit : 0;
      return { category: c, spent: sp, ratio, level: !c.limit ? 'none' : ratio >= 1 ? 'over' : ratio >= 0.8 ? 'warn' : 'ok' } as const;
    });
}

// ====================== Evolução do patrimônio ======================
export function patrimonySeries(state: AppState, today: string) {
  const base =
    state.accounts.reduce((s, a) => s + a.openingBalance, 0) +
    state.investments.reduce((s, i) => s + (i.baseValue ?? 0), 0);
  const eff = state.transactions.filter((t) => isEffective(t) && netWorthDelta(t) !== 0);
  let startYm = ymOf(state.openingDate);
  let endYm = ymOf(today);
  for (const t of eff) {
    const y = ymOf(t.date);
    if (y < startYm) startYm = y;
    if (y > endYm) endYm = y;
  }
  if (endYm < startYm) endYm = startYm;
  const out: Array<{ ym: string; label: string; patrimonio: number }> = [];
  let ym = startYm;
  while (ym <= endYm && out.length < 60) {
    const end = monthRange(ym)[1];
    const v = eff.filter((t) => t.date <= end).reduce((s, t) => s + netWorthDelta(t), base);
    out.push({ ym, label: monthShort(ym), patrimonio: r2(v) });
    ym = addMonthsYM(ym, 1);
  }
  return out.slice(-24);
}

// ====================== Metas ======================
export function goalAccumulated(g: { contributions: Array<{ amount: number }> }): number {
  return r2(g.contributions.reduce((s, c) => s + c.amount, 0));
}

// ====================== Receitas recorrentes ======================
export function incomeRefId(sourceId: string, ym: string): string {
  return `${sourceId}:${ym}`;
}

// ====================== Planejamento ======================
export interface PlanInstallment { key: string; name: string; no: number; amount: number; date: string | null }

export function installmentsDueInMonth(state: AppState, ym: string, today: string): { unpaid: PlanInstallment[]; paidAmount: number } {
  const unpaid: PlanInstallment[] = [];
  let paidAmount = 0;
  const obs: BaseObligation[] = [
    ...state.debts.filter((d) => d.direction === 'owe'),
    ...state.contracts.filter((c) => c.contractStatus !== 'cancelled' && c.contractStatus !== 'paid_off'),
  ];
  for (const ob of obs) {
    const p = obligationProgress(state, ob);
    for (let no = 1; no <= ob.totalInstallments; no++) {
      const due = installmentDue(ob, no);
      if (p.paidNos.has(no)) {
        const tx = p.txByNo.get(no);
        if (tx && ymOf(tx.date) === ym) paidAmount += tx.amount;
        continue;
      }
      if (due && ymOf(due) === ym) unpaid.push({ key: `${ob.id}:${no}`, name: ob.name, no, amount: ob.installmentAmount, date: due });
      else if (!due && no === p.nextNo && ym === ymOf(today)) unpaid.push({ key: `${ob.id}:${no}`, name: ob.name, no, amount: ob.installmentAmount, date: null });
    }
  }
  return { unpaid, paidAmount: r2(paidAmount) };
}

export function isFixedCategory(cats: Category[], id: string | null): boolean {
  return !!topCategory(cats, id)?.fixed;
}

export function planFor(state: AppState, ym: string, today: string) {
  const [from, to] = monthRange(ym);
  const stats = monthStats(state, ym);
  const plan = state.planning[ym] ?? { investments: 0, goals: 0, variable: null };
  const sources = state.incomeSources.filter((s) => s.active);
  const salaryPlanned = r2(sources.filter((s) => s.kind === 'salary').reduce((a, s) => a + s.amount, 0));
  const received = new Set(state.transactions.filter((t) => t.refId && t.status !== 'pending').map((t) => t.refId!));
  const pendingSources = sources.filter((s) => !received.has(incomeRefId(s.id, ym)));
  const pendingSalary = r2(pendingSources.reduce((a, s) => a + s.amount, 0));
  const pendingTx = state.transactions.filter((t) => t.status === 'pending' && t.date >= from && t.date <= to);
  const pendingIncomeTx = r2(pendingTx.filter((t) => t.type === 'income').reduce((a, t) => a + t.amount, 0));
  const pendingExp = pendingTx.filter((t) => t.type === 'expense' || t.type === 'installment');
  const pendingFixed = r2(pendingExp.filter((t) => isFixedCategory(state.categories, t.categoryId)).reduce((a, t) => a + t.amount, 0));
  const pendingVariable = r2(pendingExp.reduce((a, t) => a + t.amount, 0) - pendingFixed);

  let fixedRealized = 0, variableRealized = 0;
  for (const t of state.transactions) {
    if (t.status === 'pending' || t.type !== 'expense' || t.date < from || t.date > to) continue;
    if (isFixedCategory(state.categories, t.categoryId)) fixedRealized += t.amount;
    else variableRealized += t.amount;
  }
  fixedRealized = r2(fixedRealized);
  variableRealized = r2(variableRealized);

  const inst = installmentsDueInMonth(state, ym, today);
  const instDue = r2(inst.unpaid.reduce((a, i) => a + i.amount, 0));
  const variableBudget = plan.variable ?? state.settings.spendEstimateMax;
  const variableForecast = r2(Math.max(variableBudget, variableRealized + pendingVariable));
  const goalsDone = r2(state.goals.reduce((a, g) => a + g.contributions.filter((c) => c.date >= from && c.date <= to).reduce((s, c) => s + c.amount, 0), 0));
  const invRemaining = r2(Math.max(0, plan.investments - stats.invested));
  const goalsRemaining = r2(Math.max(0, plan.goals - goalsDone));

  const incomeForecast = r2(stats.income + pendingSalary + pendingIncomeTx);
  const expenseForecast = r2(fixedRealized + pendingFixed + variableForecast + stats.installments + instDue);
  const result = r2(incomeForecast - expenseForecast - invRemaining - goalsRemaining);
  const totals = computeTotals(state, today);
  const freeToSpend = r2(totals.available + pendingSalary + pendingIncomeTx - pendingFixed - instDue - invRemaining - goalsRemaining - pendingVariable);
  const endBalance = r2(totals.available + pendingSalary + pendingIncomeTx - pendingFixed - pendingVariable - instDue - Math.max(0, variableBudget - variableRealized - pendingVariable) - invRemaining);

  return {
    plan, stats, salaryPlanned, pendingSources, pendingSalary, pendingIncomeTx, fixedRealized, pendingFixed,
    variableRealized, pendingVariable, variableBudget, variableForecast, instUnpaid: inst.unpaid, instDue, instPaid: stats.installments,
    invRemaining, goalsRemaining, goalsDone, incomeForecast, expenseForecast, result, freeToSpend, endBalance,
    availableNow: totals.available,
    deficit: expenseForecast + invRemaining + goalsRemaining > incomeForecast,
  };
}

// ====================== Conciliação de extratos ======================
export function statementCheck(state: AppState, st: Statement) {
  let regIn = 0, regOut = 0;
  for (const t of state.transactions) {
    if (t.status === 'pending' || t.date < st.from || t.date > st.to) continue;
    if (t.toAccountId === st.accountId && t.type !== 'adjustment') regIn += t.amount;
    if (t.fromAccountId === st.accountId) regOut += t.amount;
  }
  regIn = r2(regIn);
  regOut = r2(regOut);
  const diffIn = r2(st.entradas - regIn);
  const diffOut = r2(st.saidas - regOut);
  let equation: null | { expected: number; ok: boolean } = null;
  if (st.saldoInicial != null) {
    const expected = r2(st.saldoInicial + (st.rendimento ?? 0) + st.entradas - st.saidas);
    equation = { expected, ok: Math.abs(expected - st.saldoFinal) < 0.005 };
  }
  return { regIn, regOut, diffIn, diffOut, ok: diffIn === 0 && diffOut === 0 && (equation?.ok ?? true), equation };
}

// ====================== Investimentos / contas ======================
export function investmentTxs(state: AppState, inv: Investment): Transaction[] {
  return state.transactions.filter((t) => t.investmentId === inv.id).sort((a, b) => b.date.localeCompare(a.date));
}

export function accountTxs(state: AppState, accId: string): Transaction[] {
  return state.transactions
    .filter((t) => t.fromAccountId === accId || t.toAccountId === accId)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

export function activeAccounts(state: AppState): Account[] {
  return state.accounts.filter((a) => !a.archived);
}

export function incomeDateFor(day: number, ym: string): string {
  return dateInMonth(ym, day);
}
