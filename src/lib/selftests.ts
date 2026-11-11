import type { Account, AppState } from './types';
import { blankTx, createEmptyState, createSeedState } from './seed';
import {
  addTransaction, confirmIncome, exportBackup, normalizeState, payInstallment, saveDebt, undoInstallment,
} from './ops';
import { balancesMap, computeTotals, debtTotals, findObligation, obligationBalance, obligationProgress } from './selectors';

export interface TestResult { name: string; ok: boolean; detail: string }

const acc = (id: string, name: string, bal: number): Account => ({ id, name, institution: '', kind: 'checking', openingBalance: bal, blocks: [] });

function base(): AppState {
  const s = createEmptyState();
  s.accounts = [acc('A', 'Conta A', 100), acc('B', 'Conta B', 50)];
  s.settings.simulatedDate = '2026-11-10';
  return s;
}

function throws(fn: () => unknown): boolean {
  try { fn(); return false; } catch { return true; }
}

export function runSelfTests(): TestResult[] {
  const out: TestResult[] = [];
  const t = (name: string, fn: () => string | true) => {
    try {
      const r = fn();
      out.push({ name, ok: r === true, detail: r === true ? 'OK' : r });
    } catch (e) {
      out.push({ name, ok: false, detail: 'Erro: ' + (e as Error).message });
    }
  };
  const eq = (label: string, got: number, want: number) => (Math.abs(got - want) < 0.005 ? true : `${label}: obtido ${got}, esperado ${want}`);

  t('Despesa: R$ 100,00 − R$ 20,00 = R$ 80,00', () => {
    const s = addTransaction(base(), blankTx({ type: 'expense', description: 'Teste', amount: 20, date: '2026-11-10', fromAccountId: 'A' }));
    return eq('saldo', balancesMap(s).A, 80);
  });

  t('Transferência A→B de R$ 30: A=70, B=80, patrimônio=150, sem receita/despesa', () => {
    const s = addTransaction(base(), blankTx({ type: 'transfer', description: 'Transf', amount: 30, date: '2026-11-10', fromAccountId: 'A', toAccountId: 'B' }));
    const b = balancesMap(s);
    const tot = computeTotals(s, '2026-11-10');
    return eq('A', b.A, 70) === true && eq('B', b.B, 80) === true ? eq('patrimônio', tot.patrimony, 150) : 'saldos incorretos';
  });

  t('Aplicação e resgate não alteram o patrimônio nem são despesa/receita', () => {
    let s = base();
    s.investments = [{ id: 'I', name: 'CDB teste', institution: '', type: 'CDB', baseValue: 0, appliedBase: 0, applicationDate: null, yieldInfo: '', maturityDate: null, liquidity: '', status: 'active', notes: '' }];
    s = addTransaction(s, blankTx({ type: 'application', description: 'Aplicar', amount: 40, date: '2026-11-10', fromAccountId: 'A', investmentId: 'I' }));
    const p1 = computeTotals(s, '2026-11-10');
    s = addTransaction(s, blankTx({ type: 'redemption', description: 'Resgatar', amount: 10, date: '2026-11-10', investmentId: 'I', toAccountId: 'B' }));
    const p2 = computeTotals(s, '2026-11-10');
    return p1.patrimony === 150 && p2.patrimony === 150 && balancesMap(s).A === 60 && balancesMap(s).B === 60 && p2.investments === 30 ? true : 'patrimônio mudou ou saldos incorretos';
  });

  t('Caixinha: antes de 03/12/2026 (287,90 / 203,76 / 84,14) e depois (287,90 / 287,90 / 0)', () => {
    const s = createSeedState();
    const before = computeTotals(s, '2026-12-02');
    const after = computeTotals(s, '2026-12-03');
    const cx = s.accounts.find((a) => a.id === 'acc-inter-cx')!;
    const bal = before.balances['acc-inter-cx'];
    if (bal !== 287.9) return 'total da caixinha incorreto';
    if (before.blocked !== 84.14) return `bloqueado antes: ${before.blocked}`;
    if (after.blocked !== 0) return `bloqueado depois: ${after.blocked}`;
    if (before.patrimony !== after.patrimony) return 'patrimônio mudou no desbloqueio';
    if (cx.openingBalance !== 287.9) return 'saldo inicial incorreto';
    return eq('disp antes', before.available, 717.2) === true ? eq('disp depois', after.available, 801.34) : 'disponível incorreto';
  });

  t('Dados iniciais: patrimônio R$ 801,34 e disponível R$ 717,20', () => {
    const s = createSeedState();
    const tot = computeTotals(s, '2026-11-10');
    return eq('patrimônio', tot.patrimony, 801.34) === true ? eq('disponível', tot.available, 717.2) : `patrimônio ${tot.patrimony}`;
  });

  t('Registros históricos não alteram saldos (LCI já incluída no saldo do Inter)', () => {
    const s = createSeedState();
    return eq('Inter', balancesMap(s)['acc-inter'], 312.5);
  });

  t('Bloqueado não pode ser gasto: despesa de R$ 250 na caixinha é recusada', () => {
    const s = createSeedState();
    s.settings.simulatedDate = '2026-11-10';
    return throws(() => addTransaction(s, blankTx({ type: 'expense', description: 'x', amount: 250, date: '2026-11-10', fromAccountId: 'acc-inter-cx' }))) ? true : 'permitiu gastar valor bloqueado';
  });

  t('Parcela de R$ 50: saldo −50, parcela paga, saldo devedor atualizado, 2º pagamento bloqueado', () => {
    let s = base();
    s = saveDebt(s, {
      name: 'Teste', description: '', totalAmount: 150, installmentAmount: 50, totalInstallments: 3, paidBefore: 0,
      firstDueDate: '2026-11-15', accountId: 'A', notes: '', direction: 'owe',
    });
    const id = s.debts[0].id;
    const before = obligationBalance(s, findObligation(s, id)!);
    s = payInstallment(s, { obligationId: id, no: 1, accountId: 'A', date: '2026-11-10' });
    const p = obligationProgress(s, s.debts[0]);
    const after = obligationBalance(s, findObligation(s, id)!);
    if (balancesMap(s).A !== 50) return 'saldo não reduzido';
    if (p.paid !== 1 || p.remaining !== 2) return 'contagem de parcelas incorreta';
    if (before - after !== 50) return 'saldo devedor incorreto';
    if (!throws(() => payInstallment(s, { obligationId: id, no: 1, accountId: 'A', date: '2026-11-10' }))) return 'permitiu pagar duas vezes';
    const tx = s.transactions[0];
    s = undoInstallment(s, tx.id);
    return balancesMap(s).A === 100 && obligationProgress(s, s.debts[0]).paid === 0 ? true : 'estorno incorreto';
  });

  t('Celular: 6 pagas e 4 restantes nos dados iniciais; dívida total não duplica', () => {
    const s = createSeedState();
    const cel = s.debts.find((d) => d.id === 'debt-celular')!;
    const p = obligationProgress(s, cel);
    const d = debtTotals(s);
    return p.paid === 6 && p.remaining === 4 && eq('dívidas', d.owe, 804.64) === true && d.clarify === 100 ? true : `pagas ${p.paid}, dívida ${d.owe}`;
  });

  t('Receita prevista só vira saldo após confirmação (e não duplica)', () => {
    let s = base();
    s = { ...s, incomeSources: [{ id: 'S', name: 'Salário', amount: 547.8, day: 5, accountId: null, kind: 'salary', active: true, categoryId: null }] };
    if (balancesMap(s).A !== 100) return 'saldo mudou antes da confirmação';
    s = confirmIncome(s, { sourceId: 'S', ym: '2026-11', accountId: 'A', date: '2026-11-05', amount: 547.8 });
    if (balancesMap(s).A !== 647.8) return 'saldo não atualizado';
    return throws(() => confirmIncome(s, { sourceId: 'S', ym: '2026-11', accountId: 'A', date: '2026-11-05', amount: 547.8 })) ? true : 'permitiu confirmar duas vezes';
  });

  t('Persistência e backup: exportar JSON e restaurar preserva os dados', () => {
    let s = createSeedState();
    s = addTransaction(s, blankTx({ type: 'expense', description: 'Mercado', amount: 12.34, date: '2026-11-10', fromAccountId: 'acc-inter' }));
    const json = exportBackup(s);
    const r = normalizeState(JSON.parse(json));
    const same =
      r.accounts.length === s.accounts.length && r.transactions.length === s.transactions.length &&
      r.debts.length === s.debts.length && r.goals.length === s.goals.length &&
      computeTotals(r, '2026-11-10').patrimony === computeTotals(s, '2026-11-10').patrimony;
    const viaLS = normalizeState(JSON.parse(JSON.stringify(s)));
    return same && viaLS.transactions.length === s.transactions.length ? true : 'dados divergentes após restauração';
  });

  t('Validações: valor zero, data inválida e transferência para a mesma conta são recusados', () => {
    const s = base();
    const a = throws(() => addTransaction(s, blankTx({ type: 'expense', description: 'x', amount: 0, date: '2026-11-10', fromAccountId: 'A' })));
    const b = throws(() => addTransaction(s, blankTx({ type: 'expense', description: 'x', amount: 5, date: '2026-13-40', fromAccountId: 'A' })));
    const c = throws(() => addTransaction(s, blankTx({ type: 'transfer', description: 'x', amount: 5, date: '2026-11-10', fromAccountId: 'A', toAccountId: 'A' })));
    return a && b && c ? true : 'validação ausente';
  });

  return out;
}
