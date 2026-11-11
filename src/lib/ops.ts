import type {
  Account, AccountKind, AppState, Bid, BaseObligation, Block, Category, Contract, Debt, Goal, IncomeSource,
  Investment, MonthPlan, Settings, TxInput,
} from './types';
import { blankTx, createEmptyState } from './seed';
import {
  balancesMap, blockedOf, computeTotals, findObligation, goalAccumulated, incomeRefId, investmentMap,
  isEffective, obligationProgress, txEffects,
} from './selectors';
import { brl, fmtDate, isISO, r2, todayISO, uid } from './utils';

export const getToday = (state: AppState): string => state.settings.simulatedDate ?? todayISO();

const fail = (msg: string): never => {
  throw new Error(msg);
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

// ====================== Lançamentos ======================
export function validateTx(state: AppState, t: TxInput, excludeId?: string): void {
  if (!t.description.trim()) fail('Informe uma descrição para o lançamento.');
  if (!Number.isFinite(t.amount) || t.amount <= 0) fail('O valor deve ser maior que zero.');
  if (r2(t.amount) !== t.amount) fail('O valor deve ter no máximo 2 casas decimais.');
  if (!isISO(t.date)) fail('Data inválida.');
  const acc = (id: string | null) => (id ? state.accounts.find((a) => a.id === id) : undefined);
  const needs = (id: string | null, label: string) => {
    const a = acc(id);
    if (!a) fail(`Selecione ${label}.`);
    else if (a.archived) fail(`A conta "${a.name}" está arquivada.`);
  };
  const hist = t.historical;
  if (t.fromAccountId && !acc(t.fromAccountId)) fail('Conta de origem inexistente.');
  if (t.toAccountId && !acc(t.toAccountId)) fail('Conta de destino inexistente.');
  if (t.investmentId && !state.investments.find((i) => i.id === t.investmentId)) fail('Investimento inexistente.');

  switch (t.type) {
    case 'income':
      if (!hist) needs(t.toAccountId, 'a conta que recebeu o valor');
      break;
    case 'expense':
    case 'installment':
      if (!hist) needs(t.fromAccountId, 'a conta de onde saiu o valor');
      break;
    case 'transfer':
      if (!hist) {
        needs(t.fromAccountId, 'a conta de origem');
        needs(t.toAccountId, 'a conta de destino');
      }
      if (t.fromAccountId && t.fromAccountId === t.toAccountId) fail('Origem e destino não podem ser a mesma conta.');
      break;
    case 'application':
      if (!hist) needs(t.fromAccountId, 'a conta de origem da aplicação');
      if (!hist && !!t.toAccountId === !!t.investmentId) fail('Escolha o destino da aplicação: um investimento OU uma caixinha/conta.');
      if (t.fromAccountId && t.fromAccountId === t.toAccountId) fail('Origem e destino não podem ser a mesma conta.');
      break;
    case 'redemption':
      if (!hist) needs(t.toAccountId, 'a conta que receberá o resgate');
      if (!hist && !!t.fromAccountId === !!t.investmentId) fail('Escolha a origem do resgate: um investimento OU uma caixinha/conta.');
      if (t.fromAccountId && t.fromAccountId === t.toAccountId) fail('Origem e destino não podem ser a mesma conta.');
      break;
    case 'adjustment':
      needs(t.toAccountId, 'a conta a ajustar');
      if (!t.adjustDirection) fail('Informe se o ajuste aumenta ou diminui o saldo.');
      break;
  }

  if (t.obligationId && !findObligation(state, t.obligationId)) fail('Dívida/contrato inexistente.');

  // Regras de saldo (não se aplica a registros históricos, pendentes e ajustes)
  if (hist || t.status === 'pending' || t.type === 'adjustment') return;
  const without = excludeId ? { ...state, transactions: state.transactions.filter((x) => x.id !== excludeId) } : state;
  const bals = balancesMap(without);
  const today = getToday(state);
  const probe = { ...blankTx(t), id: 'probe', createdAt: '' };
  const eff = txEffects(probe);
  for (const [id, d] of eff.acc) {
    if (d >= 0) continue;
    const a = state.accounts.find((x) => x.id === id)!;
    const bal = bals[id] ?? 0;
    const blocked = blockedOf(a, bal, today);
    if (blocked > 0 && -d > r2(bal - blocked) + 0.001) {
      const blk = a.blocks.filter((b) => today < b.unlockDate).sort((x, y) => x.unlockDate.localeCompare(y.unlockDate))[0];
      fail(`Saldo disponível insuficiente em "${a.name}": ${brl(bal - blocked)} disponíveis; ${brl(blocked)} estão bloqueados${blk ? ` até ${fmtDate(blk.unlockDate)}` : ''}.`);
    }
  }
  const invs = investmentMap(without);
  for (const [id, d] of eff.inv) {
    const inv = state.investments.find((i) => i.id === id)!;
    if (d < 0 && inv.baseValue != null && -d > (invs[id]?.value ?? 0) + 0.001)
      fail(`Resgate maior que o valor atual de "${inv.name}" (${brl(invs[id]?.value ?? 0)}).`);
  }
}

/** Avisos não-bloqueantes (o usuário pode confirmar mesmo assim). */
export function txWarnings(state: AppState, t: TxInput, excludeId?: string): string[] {
  const w: string[] = [];
  const dup = state.transactions.find(
    (x) =>
      x.id !== excludeId && x.type === t.type && x.amount === t.amount && x.date === t.date &&
      norm(x.description) === norm(t.description) && x.fromAccountId === t.fromAccountId && x.toAccountId === t.toAccountId,
  );
  if (dup) w.push('Já existe um lançamento idêntico (mesmo tipo, valor, data, descrição e contas). Isso pode ser uma duplicidade.');
  if (!t.historical && t.status !== 'pending' && t.type !== 'adjustment') {
    const without = excludeId ? { ...state, transactions: state.transactions.filter((x) => x.id !== excludeId) } : state;
    const bals = balancesMap(without);
    const eff = txEffects({ ...blankTx(t), id: 'probe', createdAt: '' });
    for (const [id, d] of eff.acc) {
      const a = state.accounts.find((x) => x.id === id);
      if (a && d < 0 && (bals[id] ?? 0) + d < -0.001) w.push(`"${a.name}" ficará com saldo negativo (${brl((bals[id] ?? 0) + d)}).`);
    }
  }
  return w;
}

function cleanTx(t: TxInput): TxInput {
  return { ...t, description: t.description.trim(), notes: t.notes.trim(), amount: r2(t.amount) };
}

export function addTransaction(state: AppState, input: TxInput): AppState {
  const t = cleanTx(input);
  validateTx(state, t);
  if (t.refId && state.transactions.some((x) => x.refId === t.refId && x.status !== 'pending')) fail('Esta receita já foi confirmada (evitando duplicidade).');
  if (t.obligationId && t.installmentNo != null) {
    const ref = findObligation(state, t.obligationId)!;
    if (t.installmentNo < 1 || t.installmentNo > ref.ob.totalInstallments) fail('Número de parcela inválido.');
    if (obligationProgress(state, ref.ob).paidNos.has(t.installmentNo)) fail('Esta parcela já está quitada e não pode ser paga novamente.');
  }
  return { ...state, transactions: [...state.transactions, { ...t, id: uid('tx'), createdAt: new Date().toISOString() }] };
}

export function updateTransaction(state: AppState, id: string, input: TxInput): AppState {
  const old = state.transactions.find((x) => x.id === id);
  if (!old) return fail('Lançamento não encontrado.');
  const t = cleanTx(input);
  validateTx(state, t, id);
  if (t.refId && state.transactions.some((x) => x.id !== id && x.refId === t.refId && x.status !== 'pending')) fail('Receita já confirmada em outro lançamento.');
  return { ...state, transactions: state.transactions.map((x) => (x.id === id ? { ...t, id, createdAt: x.createdAt } : x)) };
}

export function deleteTransaction(state: AppState, id: string): AppState {
  if (!state.transactions.some((x) => x.id === id)) fail('Lançamento não encontrado.');
  return { ...state, transactions: state.transactions.filter((x) => x.id !== id) };
}

/** Classifica um lançamento "A classificar": escolhe categoria e confirma. */
export function classifyTx(state: AppState, id: string, categoryId: string): AppState {
  if (!state.categories.some((c) => c.id === categoryId)) fail('Categoria inexistente.');
  return { ...state, transactions: state.transactions.map((t) => (t.id === id ? { ...t, categoryId, status: 'confirmed' } : t)) };
}

// ====================== Contas ======================
export interface AccountInput {
  id?: string;
  name: string;
  institution: string;
  kind: AccountKind;
  openingBalance: number;
  blocks: Block[];
  notes: string;
}

export function saveAccount(state: AppState, input: AccountInput): AppState {
  const name = input.name.trim();
  if (!name) fail('Informe o nome da conta.');
  if (!Number.isFinite(input.openingBalance)) fail('Saldo inválido.');
  if (state.accounts.some((a) => a.id !== input.id && !a.archived && norm(a.name) === norm(name))) fail('Já existe uma conta com esse nome.');
  for (const b of input.blocks) {
    if (!(b.amount > 0)) fail('O valor de cada bloqueio deve ser maior que zero.');
    if (!isISO(b.unlockDate)) fail('Data de desbloqueio inválida.');
  }
  const acc: Account = {
    id: input.id ?? uid('acc'), name, institution: input.institution.trim(), kind: input.kind,
    openingBalance: r2(input.openingBalance), blocks: input.blocks.map((b) => ({ ...b, amount: r2(b.amount) })), notes: input.notes.trim(),
  };
  if (input.id) {
    const old = state.accounts.find((a) => a.id === input.id);
    if (!old) fail('Conta não encontrada.');
    const total = r2(balancesMap({ ...state, accounts: state.accounts.map((a) => (a.id === acc.id ? { ...a, openingBalance: acc.openingBalance } : a)) })[acc.id]);
    if (acc.blocks.reduce((s, b) => s + b.amount, 0) > Math.max(total, 0) + 0.001) fail(`Os bloqueios (${brl(acc.blocks.reduce((s, b) => s + b.amount, 0))}) não podem exceder o saldo da conta (${brl(total)}).`);
    return { ...state, accounts: state.accounts.map((a) => (a.id === acc.id ? { ...acc, archived: a.archived } : a)) };
  }
  if (acc.blocks.reduce((s, b) => s + b.amount, 0) > Math.max(acc.openingBalance, 0) + 0.001) fail('Os bloqueios não podem exceder o saldo da conta.');
  return { ...state, accounts: [...state.accounts, acc] };
}

/** "Excluir" = arquivar: preserva todo o histórico de movimentações. */
export function archiveAccount(state: AppState, id: string): AppState {
  const a = state.accounts.find((x) => x.id === id);
  if (!a) return fail('Conta não encontrada.');
  const bal = balancesMap(state)[id] ?? 0;
  if (Math.abs(bal) >= 0.005) fail(`A conta ainda tem saldo de ${brl(bal)}. Transfira ou ajuste o saldo para zero antes de excluir.`);
  if (state.transactions.some((t) => t.status === 'pending' && (t.fromAccountId === id || t.toAccountId === id))) fail('Existem lançamentos pendentes nesta conta. Resolva-os antes.');
  return { ...state, accounts: state.accounts.map((x) => (x.id === id ? { ...x, archived: true, blocks: [] } : x)) };
}

export function adjustBalance(state: AppState, accountId: string, actual: number, date: string, note: string): AppState {
  if (!Number.isFinite(actual)) fail('Informe o saldo real da conta.');
  const bal = balancesMap(state)[accountId];
  if (bal === undefined) fail('Conta não encontrada.');
  const diff = r2(actual - bal);
  if (Math.abs(diff) < 0.005) fail('O saldo informado já confere com o saldo do sistema.');
  return addTransaction(state, blankTx({
    type: 'adjustment', description: 'Ajuste de saldo identificado', amount: Math.abs(diff), date,
    toAccountId: accountId, adjustDirection: diff > 0 ? 'in' : 'out',
    notes: `Divergência identificada: sistema ${brl(bal)} × real ${brl(actual)}. ${note}`.trim(),
  }));
}

// ====================== Receitas recorrentes ======================
export function confirmIncome(
  state: AppState,
  p: { sourceId: string; ym: string; accountId: string; date: string; amount: number },
): AppState {
  const s = state.incomeSources.find((x) => x.id === p.sourceId);
  if (!s) return fail('Fonte de renda não encontrada.');
  return addTransaction(state, blankTx({
    type: 'income', description: s.name, amount: r2(p.amount), date: p.date, toAccountId: p.accountId,
    categoryId: s.categoryId, refId: incomeRefId(s.id, p.ym), notes: `Recebimento confirmado de ${p.ym}.`,
  }));
}

export function undoIncome(state: AppState, refId: string): AppState {
  const t = state.transactions.find((x) => x.refId === refId);
  if (!t) return fail('Recebimento não encontrado.');
  return deleteTransaction(state, t.id);
}

export function saveSalaryPlan(state: AppState, p: { total: number; pct1: number; day1: number; day2: number; accountId: string | null }): AppState {
  if (!(p.total > 0)) fail('Informe o valor do salário.');
  if (!(p.pct1 >= 1 && p.pct1 <= 99)) fail('O percentual da 1ª parte deve estar entre 1 e 99.');
  for (const d of [p.day1, p.day2]) if (!Number.isInteger(d) || d < 1 || d > 31) fail('Os dias de pagamento devem estar entre 1 e 31.');
  const a1 = r2((p.total * p.pct1) / 100);
  const a2 = r2(p.total - a1);
  const mk = (id: string, name: string, amount: number, day: number): IncomeSource => {
    const old = state.incomeSources.find((s) => s.id === id);
    return { id, name, amount, day, accountId: p.accountId, kind: 'salary', active: true, categoryId: old?.categoryId ?? 'cat-salario' };
  };
  const others = state.incomeSources.filter((s) => s.id !== 'inc-sal-1' && s.id !== 'inc-sal-2');
  return {
    ...state,
    incomeSources: [
      mk('inc-sal-1', `Salário — 1ª parte (${p.pct1}%)`, a1, p.day1),
      mk('inc-sal-2', `Salário — 2ª parte (${100 - p.pct1}%)`, a2, p.day2),
      ...others,
    ],
  };
}

export function saveIncomeSource(state: AppState, s: Omit<IncomeSource, 'id'> & { id?: string }): AppState {
  if (!s.name.trim()) fail('Informe o nome da fonte de renda.');
  if (!(s.amount > 0)) fail('Informe um valor maior que zero.');
  if (!Number.isInteger(s.day) || s.day < 1 || s.day > 31) fail('Dia de recebimento inválido (1 a 31).');
  const src: IncomeSource = { ...s, id: s.id ?? uid('inc'), name: s.name.trim(), amount: r2(s.amount) };
  if (s.id) return { ...state, incomeSources: state.incomeSources.map((x) => (x.id === s.id ? src : x)) };
  return { ...state, incomeSources: [...state.incomeSources, src] };
}

export function deleteIncomeSource(state: AppState, id: string): AppState {
  if (state.transactions.some((t) => t.refId?.startsWith(id + ':'))) fail('Esta fonte possui recebimentos confirmados. Desative-a em vez de excluir, para preservar o histórico.');
  return { ...state, incomeSources: state.incomeSources.filter((x) => x.id !== id) };
}

// ====================== Dívidas, parcelas e contratos ======================
function validateObligation(state: AppState, ob: BaseObligation, name: string): void {
  if (!name.trim()) fail('Informe o nome.');
  if (!(ob.installmentAmount > 0)) fail('O valor da parcela deve ser maior que zero.');
  if (!Number.isInteger(ob.totalInstallments) || ob.totalInstallments < 1) fail('A quantidade de parcelas deve ser um número inteiro maior que zero.');
  if (!Number.isInteger(ob.paidBefore) || ob.paidBefore < 0 || ob.paidBefore > ob.totalInstallments) fail('Parcelas já pagas deve estar entre 0 e o total de parcelas.');
  if (ob.firstDueDate && !isISO(ob.firstDueDate)) fail('Data de vencimento inválida.');
  const maxPaid = Math.max(0, ...state.transactions.filter((t) => t.obligationId === ob.id && t.installmentNo != null).map((t) => t.installmentNo!));
  if (maxPaid > ob.totalInstallments) fail(`Já existe pagamento registrado da parcela ${maxPaid}; o total não pode ser menor.`);
}

export function saveDebt(state: AppState, d: Omit<Debt, 'id'> & { id?: string }): AppState {
  const debt: Debt = { ...d, id: d.id ?? uid('debt'), name: d.name.trim(), installmentAmount: r2(d.installmentAmount) };
  validateObligation(state, debt, debt.name);
  if (state.debts.some((x) => x.id !== debt.id && norm(x.name) === norm(debt.name))) fail('Já existe uma dívida com esse nome (evitando duplicidade). Edite a existente.');
  if (d.id) return { ...state, debts: state.debts.map((x) => (x.id === d.id ? debt : x)) };
  return { ...state, debts: [...state.debts, debt] };
}

export function deleteDebt(state: AppState, id: string): AppState {
  if (state.transactions.some((t) => t.obligationId === id)) fail('Existem pagamentos registrados nesta dívida. Desfaça-os antes de excluir.');
  return { ...state, debts: state.debts.filter((x) => x.id !== id) };
}

export function saveContract(state: AppState, c: Omit<Contract, 'id'> & { id?: string }): AppState {
  const ct: Contract = { ...c, id: c.id ?? uid('ctr'), name: c.name.trim(), installmentAmount: r2(c.installmentAmount) };
  validateObligation(state, ct, ct.name);
  if (state.contracts.some((x) => x.id !== ct.id && norm(x.name) === norm(ct.name))) fail('Já existe um contrato com esse nome.');
  if (c.id) return { ...state, contracts: state.contracts.map((x) => (x.id === c.id ? ct : x)) };
  return { ...state, contracts: [...state.contracts, ct] };
}

export function deleteContract(state: AppState, id: string): AppState {
  if (state.transactions.some((t) => t.obligationId === id)) fail('Existem pagamentos registrados neste contrato. Desfaça-os antes de excluir.');
  return { ...state, contracts: state.contracts.filter((x) => x.id !== id) };
}

export function payInstallment(
  state: AppState,
  p: { obligationId: string; no: number; accountId: string; date: string; amount?: number },
): AppState {
  const ref = findObligation(state, p.obligationId);
  if (!ref) return fail('Obrigação não encontrada.');
  if (ref.kind === 'debt' && ref.ob.direction === 'unknown') fail('Defina primeiro se você deve ou se alguém deve a você.');
  if (ref.kind === 'contract' && (ref.ob.contractStatus === 'cancelled' || ref.ob.contractStatus === 'paid_off')) fail('Este contrato não está ativo.');
  const prog = obligationProgress(state, ref.ob);
  if (!Number.isInteger(p.no) || p.no < 1 || p.no > ref.ob.totalInstallments) fail('Parcela inválida.');
  if (prog.paidNos.has(p.no)) fail('Esta parcela já está quitada e não pode ser paga novamente.');
  const receivable = ref.kind === 'debt' && ref.ob.direction === 'receivable';
  const amount = r2(p.amount ?? ref.ob.installmentAmount);
  const label = `${ref.ob.name} — parcela ${p.no}/${ref.ob.totalInstallments}`;
  const hasCat = (id: string) => (state.categories.some((c) => c.id === id) ? id : null);
  return addTransaction(state, blankTx({
    type: receivable ? 'income' : 'installment', description: label, amount, date: p.date,
    fromAccountId: receivable ? null : p.accountId, toAccountId: receivable ? p.accountId : null,
    obligationId: ref.ob.id, installmentNo: p.no, categoryId: receivable ? hasCat('cat-outras-rendas') : hasCat('cat-dividas'),
  }));
}

/** Desfazer pagamento = remover o lançamento; o saldo é recalculado (estorno correto). */
export function undoInstallment(state: AppState, txId: string): AppState {
  const t = state.transactions.find((x) => x.id === txId);
  if (!t || !t.obligationId || t.installmentNo == null) return fail('Pagamento não encontrado.');
  return deleteTransaction(state, txId);
}

export function amortize(state: AppState, p: { contractId: string; amount: number; date: string; accountId: string; note: string }): AppState {
  const ref = findObligation(state, p.contractId);
  if (!ref || ref.kind !== 'contract') return fail('Contrato não encontrado.');
  return addTransaction(state, blankTx({
    type: 'expense', description: `Amortização — ${ref.ob.name}`, amount: r2(p.amount), date: p.date, fromAccountId: p.accountId,
    obligationId: ref.ob.id, categoryId: state.categories.some((c) => c.id === 'cat-dividas') ? 'cat-dividas' : null, notes: p.note,
  }));
}

export function addBid(state: AppState, contractId: string, bid: Omit<Bid, 'id'>): AppState {
  if (!(bid.amount > 0)) fail('Informe o valor do lance.');
  if (!isISO(bid.date)) fail('Data inválida.');
  return { ...state, contracts: state.contracts.map((c) => (c.id === contractId ? { ...c, bids: [...c.bids, { ...bid, id: uid('bid'), amount: r2(bid.amount) }] } : c)) };
}

export function removeBid(state: AppState, contractId: string, bidId: string): AppState {
  return { ...state, contracts: state.contracts.map((c) => (c.id === contractId ? { ...c, bids: c.bids.filter((b) => b.id !== bidId) } : c)) };
}

// ====================== Investimentos ======================
export function saveInvestment(state: AppState, i: Omit<Investment, 'id'> & { id?: string }): AppState {
  if (!i.name.trim()) fail('Informe o nome do investimento.');
  if (i.baseValue != null && i.baseValue < 0) fail('O valor atual não pode ser negativo.');
  for (const d of [i.applicationDate, i.maturityDate]) if (d && !isISO(d)) fail('Data inválida.');
  const inv: Investment = { ...i, id: i.id ?? uid('inv'), name: i.name.trim() };
  if (i.id) return { ...state, investments: state.investments.map((x) => (x.id === i.id ? inv : x)) };
  return { ...state, investments: [...state.investments, inv] };
}

export function deleteInvestment(state: AppState, id: string): AppState {
  if (state.transactions.some((t) => t.investmentId === id)) {
    return { ...state, investments: state.investments.map((i) => (i.id === id ? { ...i, archived: true } : i)) };
  }
  return { ...state, investments: state.investments.filter((i) => i.id !== id) };
}

/** Informa o valor atual confirmado (ex.: extrato). Ajusta apenas o valor de referência — não cria movimentação. */
export function setInvestmentValue(state: AppState, id: string, value: number): AppState {
  const inv = state.investments.find((i) => i.id === id);
  if (!inv) return fail('Investimento não encontrado.');
  if (!Number.isFinite(value) || value < 0) fail('Valor inválido.');
  const current = investmentMap(state)[id].value;
  const base = r2(value - (current - (inv.baseValue ?? 0)));
  return {
    ...state,
    investments: state.investments.map((i) => (i.id === id ? { ...i, baseValue: base, status: i.status === 'pending_confirmation' ? 'active' : i.status } : i)),
  };
}

// ====================== Metas ======================
export function saveGoal(state: AppState, g: Omit<Goal, 'id' | 'contributions'> & { id?: string }): AppState {
  if (!g.name.trim()) fail('Informe o nome da meta.');
  if (!(g.target > 0)) fail('O valor desejado deve ser maior que zero.');
  if (g.deadline && !isISO(g.deadline)) fail('Prazo inválido.');
  if (g.id) {
    return { ...state, goals: state.goals.map((x) => (x.id === g.id ? { ...x, ...g, name: g.name.trim(), target: r2(g.target) } : x)) };
  }
  return { ...state, goals: [...state.goals, { ...g, id: uid('goal'), name: g.name.trim(), target: r2(g.target), contributions: [] }] };
}

export function deleteGoal(state: AppState, id: string): AppState {
  return { ...state, goals: state.goals.filter((g) => g.id !== id) };
}

export function addContribution(state: AppState, goalId: string, amount: number, date: string, note: string): AppState {
  const g = state.goals.find((x) => x.id === goalId);
  if (!g) return fail('Meta não encontrada.');
  if (!Number.isFinite(amount) || amount === 0) fail('Informe um valor diferente de zero.');
  if (!isISO(date)) fail('Data inválida.');
  const acc = goalAccumulated(g);
  if (amount < 0 && -amount > acc + 0.001) fail(`Você só pode retirar até ${brl(acc)} desta meta.`);
  if (amount > 0) {
    const totals = computeTotals(state, getToday(state));
    const allocated = state.goals.reduce((s, x) => s + goalAccumulated(x), 0);
    if (allocated + amount > totals.patrimony + 0.001) fail(`Você não pode separar mais do que possui. Patrimônio: ${brl(totals.patrimony)}; já separado nas metas: ${brl(allocated)}.`);
  }
  return {
    ...state,
    goals: state.goals.map((x) => (x.id === goalId ? { ...x, contributions: [...x.contributions, { id: uid('ctb'), date, amount: r2(amount), note }] } : x)),
  };
}

export function removeContribution(state: AppState, goalId: string, ctbId: string): AppState {
  return { ...state, goals: state.goals.map((x) => (x.id === goalId ? { ...x, contributions: x.contributions.filter((c) => c.id !== ctbId) } : x)) };
}

// ====================== Categorias ======================
export function saveCategory(state: AppState, c: Omit<Category, 'id'> & { id?: string }): AppState {
  const name = c.name.trim();
  if (!name) fail('Informe o nome da categoria.');
  if (c.limit != null && !(c.limit > 0)) fail('O limite mensal deve ser maior que zero.');
  if (c.parentId) {
    const p = state.categories.find((x) => x.id === c.parentId);
    if (!p) fail('Categoria principal inexistente.');
    else if (p.parentId) fail('Subcategorias só podem ter um nível.');
    else if (p.kind !== c.kind) fail('A subcategoria deve ser do mesmo tipo da principal.');
  }
  if (state.categories.some((x) => x.id !== c.id && x.kind === c.kind && x.parentId === c.parentId && norm(x.name) === norm(name))) fail('Já existe uma categoria com esse nome.');
  if (c.id && c.parentId === c.id) fail('Uma categoria não pode ser subcategoria dela mesma.');
  const cat: Category = { ...c, id: c.id ?? uid('cat'), name };
  if (c.id) return { ...state, categories: state.categories.map((x) => (x.id === c.id ? cat : x)) };
  return { ...state, categories: [...state.categories, cat] };
}

export function deleteCategory(state: AppState, id: string): AppState {
  if (state.categories.some((c) => c.parentId === id)) fail('Esta categoria possui subcategorias. Exclua-as primeiro.');
  const n = state.transactions.filter((t) => t.categoryId === id).length;
  if (n > 0) fail(`Categoria em uso por ${n} lançamento(s). Reclassifique-os antes de excluir.`);
  return { ...state, categories: state.categories.filter((c) => c.id !== id) };
}

// ====================== Planejamento e ajustes ======================
export function setPlan(state: AppState, ym: string, patch: Partial<MonthPlan>): AppState {
  const cur = state.planning[ym] ?? { investments: 0, goals: 0, variable: null };
  return { ...state, planning: { ...state.planning, [ym]: { ...cur, ...patch } } };
}

export function updateSettings(state: AppState, patch: Partial<Settings>): AppState {
  if (patch.simulatedDate && !isISO(patch.simulatedDate)) fail('Data simulada inválida.');
  return { ...state, settings: { ...state.settings, ...patch } };
}

// ====================== Backup / persistência ======================
export const BACKUP_APP = 'financas-pessoais-roxo';

export function exportBackup(state: AppState): string {
  return JSON.stringify({ app: BACKUP_APP, version: 1, exportedAt: new Date().toISOString(), data: state }, null, 2);
}

/** Valida e normaliza um estado (usado ao carregar do navegador e ao restaurar backups). */
export function normalizeState(raw: unknown): AppState {
  if (!raw || typeof raw !== 'object') return fail('Arquivo inválido.');
  const r = raw as Record<string, unknown>;
  const data = (r.app === BACKUP_APP && r.data ? r.data : r) as Record<string, unknown>;
  if (data.version !== 1) fail('Versão de dados não reconhecida.');
  const empty = createEmptyState();
  const arr = <T,>(k: string): T[] => {
    const v = data[k];
    if (v === undefined) return (empty as unknown as Record<string, T[]>)[k] ?? [];
    if (!Array.isArray(v)) return fail(`Campo "${k}" inválido.`);
    return v as T[];
  };
  const accounts = arr<Account>('accounts');
  for (const a of accounts) if (!a || typeof a.id !== 'string' || typeof a.name !== 'string' || !Number.isFinite(a.openingBalance)) fail('Contas com dados inválidos.');
  const transactions = arr<AppState['transactions'][number]>('transactions');
  for (const t of transactions) {
    if (!t || typeof t.id !== 'string' || typeof t.type !== 'string' || !Number.isFinite(t.amount) || !isISO(t.date)) fail('Lançamentos com dados inválidos.');
  }
  const ids = new Set(transactions.map((t) => t.id));
  if (ids.size !== transactions.length) fail('Há lançamentos com identificador duplicado.');
  const settings = { ...empty.settings, ...((data.settings as Partial<Settings>) ?? {}) };
  return {
    version: 1,
    openingDate: isISO(data.openingDate) ? (data.openingDate as string) : empty.openingDate,
    accounts: accounts.map((a) => ({ ...a, blocks: Array.isArray(a.blocks) ? a.blocks : [] })),
    transactions: transactions.map((t) => blankTx2(t)),
    categories: arr<Category>('categories'),
    incomeSources: arr<IncomeSource>('incomeSources'),
    debts: arr<Debt>('debts'),
    contracts: arr<Contract>('contracts').map((c) => ({ ...c, bids: Array.isArray(c.bids) ? c.bids : [] })),
    investments: arr<Investment>('investments'),
    goals: arr<Goal>('goals').map((g) => ({ ...g, contributions: Array.isArray(g.contributions) ? g.contributions : [] })),
    statements: arr<AppState['statements'][number]>('statements'),
    planning: typeof data.planning === 'object' && data.planning ? (data.planning as AppState['planning']) : {},
    settings,
  };
}

function blankTx2(t: AppState['transactions'][number]): AppState['transactions'][number] {
  return { ...blankTx({ type: t.type, amount: t.amount, date: t.date, description: t.description ?? '' }), ...t };
}

export { isEffective };
