import type {
  Account, AppState, Category, Contract, Debt, Goal, IncomeSource, Investment, Statement, Transaction, TxInput,
} from './types';

export const OPENING_DATE = '2026-11-09';

export function blankTx(p: Partial<TxInput> & Pick<TxInput, 'type' | 'amount' | 'date' | 'description'>): TxInput {
  return {
    categoryId: null,
    fromAccountId: null,
    toAccountId: null,
    investmentId: null,
    obligationId: null,
    installmentNo: null,
    refId: null,
    adjustDirection: null,
    notes: '',
    status: 'confirmed',
    historical: false,
    ...p,
  };
}

const exp = (id: string, name: string, fixed = false): Category => ({ id, name, kind: 'expense', parentId: null, limit: null, fixed });
const inc = (id: string, name: string): Category => ({ id, name, kind: 'income', parentId: null, limit: null, fixed: false });

export const DEFAULT_CATEGORIES: Category[] = [
  exp('cat-alimentacao', 'Alimentação'),
  exp('cat-transporte', 'Transporte'),
  exp('cat-saude', 'Saúde'),
  exp('cat-educacao', 'Educação'),
  exp('cat-lazer', 'Lazer'),
  exp('cat-compras', 'Compras pessoais'),
  exp('cat-assinaturas', 'Assinaturas', true),
  exp('cat-presentes', 'Presentes'),
  exp('cat-familia', 'Família'),
  exp('cat-fixas', 'Contas fixas', true),
  exp('cat-dividas', 'Dívidas'),
  exp('cat-outros', 'Outros'),
  inc('cat-salario', 'Salário'),
  inc('cat-renda-extra', 'Renda extra'),
  inc('cat-reembolso', 'Reembolso'),
  inc('cat-presente-rec', 'Presente recebido'),
  inc('cat-rendimentos', 'Rendimentos'),
  inc('cat-outras-rendas', 'Outras rendas'),
];

function accounts(): Account[] {
  return [
    { id: 'acc-inter', name: 'Banco Inter — conta principal', institution: 'Banco Inter', kind: 'checking', openingBalance: 312.5, blocks: [] },
    {
      id: 'acc-inter-cx', name: 'Banco Inter — caixinha', institution: 'Banco Inter', kind: 'savings', openingBalance: 287.9,
      blocks: [{ id: 'blk-inter-cx', amount: 84.14, unlockDate: '2026-12-03', description: 'Saldo com bloqueio — não pode ser sacado antes do desbloqueio' }],
      notes: 'R$ 203,76 disponíveis + R$ 84,14 bloqueados = R$ 287,90 (valores já incluídos no total).',
    },
    { id: 'acc-mp-cofre', name: 'Mercado Pago — cofrinho', institution: 'Mercado Pago', kind: 'savings', openingBalance: 200.94, blocks: [], notes: 'Saldo do cofrinho confirmado posteriormente. Separado da conta Mercado Pago.' },
    { id: 'acc-mp', name: 'Mercado Pago — conta', institution: 'Mercado Pago', kind: 'checking', openingBalance: 0, blocks: [] },
    { id: 'acc-nu', name: 'Nubank — conta', institution: 'Nubank', kind: 'checking', openingBalance: 0, blocks: [] },
    { id: 'acc-cash', name: 'Dinheiro em espécie', institution: 'Carteira física', kind: 'cash', openingBalance: 0, blocks: [] },
  ];
}

const H = 'Registro histórico informado — já refletido no saldo de referência. Não altera saldos.';

function history(): Transaction[] {
  const mk = (n: number, p: Parameters<typeof blankTx>[0]): Transaction => ({
    ...blankTx({ historical: true, notes: H, ...p }),
    id: `hist-${n}`,
    createdAt: '2026-11-09T00:00:00.000Z',
  });
  return [
    // Mercado Pago — outubro
    mk(1, { type: 'transfer', description: 'Transferência para o cofrinho', amount: 200, date: '2026-10-16', fromAccountId: 'acc-mp', toAccountId: 'acc-mp-cofre' }),
    mk(2, { type: 'redemption', description: 'Resgate do cofrinho', amount: 793.71, date: '2026-10-22', fromAccountId: 'acc-mp-cofre', toAccountId: 'acc-mp' }),
    mk(3, { type: 'transfer', description: 'Pix para conta de minha titularidade', amount: 800, date: '2026-10-22', fromAccountId: 'acc-mp', toAccountId: null, notes: H + ' Conta de destino (própria) não especificada.' }),
    // Mercado Pago — novembro
    mk(4, { type: 'redemption', description: 'Resgate do cofrinho', amount: 39.56, date: '2026-11-02', fromAccountId: 'acc-mp-cofre', toAccountId: 'acc-mp' }),
    mk(5, { type: 'income', description: 'Recebimento (origem não identificada)', amount: 100, date: '2026-11-06', toAccountId: 'acc-mp', status: 'to_classify' }),
    mk(6, { type: 'application', description: 'Aplicação no cofrinho', amount: 102.87, date: '2026-11-06', fromAccountId: 'acc-mp', toAccountId: 'acc-mp-cofre' }),
    // Nubank
    mk(7, { type: 'income', description: 'Recebimento (origem não identificada)', amount: 5.83, date: '2026-10-03', toAccountId: 'acc-nu', status: 'to_classify' }),
    mk(8, { type: 'income', description: 'Recebimento (origem não identificada)', amount: 29, date: '2026-10-24', toAccountId: 'acc-nu', status: 'to_classify' }),
    mk(9, { type: 'transfer', description: 'Transferência para minha conta Inter', amount: 35.93, date: '2026-10-31', fromAccountId: 'acc-nu', toAccountId: 'acc-inter' }),
    mk(10, { type: 'income', description: 'Recebimento (origem não identificada)', amount: 25, date: '2026-11-06', toAccountId: 'acc-nu', status: 'to_classify' }),
    mk(11, { type: 'transfer', description: 'Transferência para minha conta Inter', amount: 25, date: '2026-11-07', fromAccountId: 'acc-nu', toAccountId: 'acc-inter' }),
    // Inter — vencimento da LCI (já incluso no saldo de R$ 312,50)
    mk(12, { type: 'redemption', description: 'Vencimento LCI PRE 180', amount: 263.62, date: '2026-11-09', investmentId: 'inv-lci', toAccountId: 'acc-inter', notes: H + ' Já incluído no saldo de R$ 312,50 — não somar novamente.' }),
    // CDB — movimentações informadas (conta de origem/destino não informada)
    mk(13, { type: 'application', description: 'Aplicação CDB', amount: 120, date: '2026-10-16', investmentId: 'inv-cdb' }),
    mk(14, { type: 'application', description: 'Aplicação CDB', amount: 163, date: '2026-10-16', investmentId: 'inv-cdb' }),
    mk(15, { type: 'redemption', description: 'Resgate CDB', amount: 20, date: '2026-11-05', investmentId: 'inv-cdb' }),
    mk(16, { type: 'application', description: 'Aplicação CDB', amount: 3.13, date: '2026-11-05', investmentId: 'inv-cdb' }),
    mk(17, { type: 'application', description: 'Aplicação CDB', amount: 100, date: '2026-11-06', investmentId: 'inv-cdb' }),
  ];
}

function statements(): Statement[] {
  return [
    { id: 'st-mp-out', accountId: 'acc-mp', label: 'Mercado Pago — outubro/2026', from: '2026-10-01', to: '2026-10-31', entradas: 994.62, saidas: 1000, saldoFinal: 14.86, saldoInicial: null, rendimento: null, notes: 'Extrato informado. Entradas não identificadas devem ser detalhadas e classificadas.' },
    { id: 'st-mp-nov', accountId: 'acc-mp', label: 'Mercado Pago — novembro/2026 (até 08/11)', from: '2026-11-01', to: '2026-11-08', entradas: 139.57, saidas: 154.43, saldoFinal: 0, saldoInicial: null, rendimento: null, notes: 'Saída não detalhada: conferir extrato. O Pix de R$ 163,00/163,66 não foi vinculado ao celular sem confirmação.' },
    { id: 'st-nu-out', accountId: 'acc-nu', label: 'Nubank — outubro/2026', from: '2026-10-01', to: '2026-10-31', entradas: 34.83, saidas: 35.93, saldoFinal: 0, saldoInicial: 1.09, rendimento: 0.01, notes: '' },
    { id: 'st-nu-nov', accountId: 'acc-nu', label: 'Nubank — novembro/2026', from: '2026-11-01', to: '2026-11-30', entradas: 25, saidas: 25, saldoFinal: 0, saldoInicial: null, rendimento: null, notes: '' },
  ];
}

function incomeSources(): IncomeSource[] {
  return [
    { id: 'inc-sal-1', name: 'Salário — 1ª parte (60%)', amount: 547.8, day: 5, accountId: null, kind: 'salary', active: true, categoryId: 'cat-salario' },
    { id: 'inc-sal-2', name: 'Salário — 2ª parte (40%)', amount: 365.2, day: 20, accountId: null, kind: 'salary', active: true, categoryId: 'cat-salario' },
  ];
}

function debts(): Debt[] {
  const base = { paidBefore: 0, firstDueDate: null, accountId: null as string | null, notes: '' };
  return [
    {
      ...base, id: 'debt-celular', name: 'Celular', description: 'Parcelamento do celular — plano original de 10 parcelas.',
      totalAmount: null, installmentAmount: 163.66, totalInstallments: 10, paidBefore: 6, direction: 'owe',
      notes: 'Valor da parcela é aproximado. Referência: 5 parcelas pagas em atualização anterior + parcela de novembro informada como paga = 6 pagas, 4 restantes (sem lançamentos duplicados). O Pix de R$ 163,00/163,66 de novembro NÃO foi vinculado ao celular sem confirmação. Informe o vencimento da próxima parcela.',
    },
    {
      ...base, id: 'debt-terno', name: 'Terno — casamento da minha mãe', description: 'Minha parte: R$ 150,00, em 3 vezes de R$ 50,00. Evento em 06/12/2026.',
      totalAmount: 150, installmentAmount: 50, totalInstallments: 3, direction: 'owe',
      notes: 'Datas de vencimento das parcelas não informadas.',
    },
    {
      ...base, id: 'debt-irmao', name: 'Irmão — valor a esclarecer', description: 'Pendência de R$ 50,00. Direção da dívida ainda não definida.',
      totalAmount: 50, installmentAmount: 50, totalInstallments: 1, direction: 'unknown',
    },
    {
      ...base, id: 'debt-padrinho', name: 'Padrinho — valor a esclarecer', description: 'Pendência de R$ 50,00. Direção da dívida ainda não definida.',
      totalAmount: 50, installmentAmount: 50, totalInstallments: 1, direction: 'unknown',
    },
  ];
}

function investments(): Investment[] {
  return [
    {
      id: 'inv-cdb', name: 'CDB', institution: 'A confirmar', type: 'CDB', baseValue: null, appliedBase: null, applicationDate: null,
      yieldInfo: '', maturityDate: null, liquidity: '', status: 'pending_confirmation',
      notes: 'Posição pendente de confirmação — o saldo atual NÃO foi deduzido das movimentações. Também foi informado um resgate de R$ 163,45 sem data (não lançado).',
    },
    {
      id: 'inv-lci', name: 'LCI PRE 180', institution: 'Banco Inter', type: 'LCI', baseValue: 0, appliedBase: null, applicationDate: null,
      yieldInfo: 'Pré-fixada (taxa não informada)', maturityDate: '2026-11-09', liquidity: 'No vencimento', status: 'matured',
      notes: 'Venceu em 09/11/2026 com R$ 263,62, já incluídos no saldo de R$ 312,50 da conta principal do Inter.',
    },
  ];
}

function goals(): Goal[] {
  return [
    { id: 'goal-reserva', name: 'Reserva de emergência', target: 1500, deadline: null, priority: 'alta', linkedAccountId: null, linkedInvestmentId: null, notes: '', emergency: true, contributions: [] },
    { id: 'goal-r15', name: 'Yamaha R15 ABS X-Black', target: 18000, deadline: '2028-11-30', priority: 'media', linkedAccountId: null, linkedInvestmentId: null, notes: 'Cor preta. Valor estimado. Objetivo de compra futura.', contributions: [] },
    { id: 'goal-namoro', name: 'Aniversário de namoro', target: 180, deadline: '2026-12-19', priority: 'media', linkedAccountId: null, linkedInvestmentId: null, notes: 'Orçamento estimado de R$ 130 a R$ 180 (a meta usa o valor máximo). Data: 19/12/2026.', contributions: [] },
  ];
}

export function createSeedState(): AppState {
  return {
    version: 1,
    openingDate: OPENING_DATE,
    accounts: accounts(),
    transactions: history(),
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    incomeSources: incomeSources(),
    debts: debts(),
    contracts: [] as Contract[],
    investments: investments(),
    goals: goals(),
    statements: statements(),
    planning: {},
    settings: { theme: 'light', simulatedDate: null, spendEstimateMin: 151, spendEstimateMax: 300 },
  };
}

export function createEmptyState(): AppState {
  return {
    version: 1, openingDate: '2026-01-01', accounts: [], transactions: [], categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    incomeSources: [], debts: [], contracts: [], investments: [], goals: [], statements: [], planning: {},
    settings: { theme: 'light', simulatedDate: null, spendEstimateMin: 151, spendEstimateMax: 300 },
  };
}
