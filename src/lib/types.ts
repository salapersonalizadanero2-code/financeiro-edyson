// Modelo de dados do sistema financeiro pessoal.
// Regra de ouro: saldos NUNCA são digitados diretamente — são sempre derivados:
//   saldo = saldo de referência (openingBalance) + efeito dos lançamentos não-históricos.

export type AccountKind = 'checking' | 'savings' | 'cash' | 'wallet';

export interface Block {
  id: string;
  amount: number;
  unlockDate: string; // YYYY-MM-DD — a partir desta data o valor fica disponível
  description: string;
}

export interface Account {
  id: string;
  name: string;
  institution: string;
  kind: AccountKind;
  openingBalance: number; // saldo de referência na data openingDate
  blocks: Block[];
  archived?: boolean;
  notes?: string;
}

export type TxType =
  | 'income'
  | 'expense'
  | 'transfer'
  | 'application'
  | 'redemption'
  | 'installment'
  | 'adjustment';

export type TxStatus = 'confirmed' | 'pending' | 'to_classify';

export interface Transaction {
  id: string;
  type: TxType;
  description: string;
  amount: number; // sempre positivo
  date: string;
  categoryId: string | null;
  fromAccountId: string | null;
  toAccountId: string | null;
  investmentId: string | null;
  obligationId: string | null; // dívida ou contrato
  installmentNo: number | null;
  refId: string | null; // ex.: receita recorrente "sourceId:YYYY-MM"
  adjustDirection: 'in' | 'out' | null;
  notes: string;
  status: TxStatus;
  historical: boolean; // true = apenas registro; já está refletido no saldo de referência
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  kind: 'expense' | 'income';
  parentId: string | null;
  limit: number | null;
  fixed: boolean;
}

export interface IncomeSource {
  id: string;
  name: string;
  amount: number;
  day: number;
  accountId: string | null;
  kind: 'salary' | 'other';
  active: boolean;
  categoryId: string | null;
}

export interface BaseObligation {
  id: string;
  name: string;
  installmentAmount: number;
  totalInstallments: number;
  paidBefore: number; // parcelas pagas antes do uso do sistema (sem lançamento)
  firstDueDate: string | null; // vencimento da parcela nº 1
  accountId: string | null;
  notes: string;
}

export interface Debt extends BaseObligation {
  description: string;
  totalAmount: number | null;
  direction: 'owe' | 'receivable' | 'unknown';
}

export interface Bid {
  id: string;
  date: string;
  amount: number;
  note: string;
}

export interface Contract extends BaseObligation {
  kind: 'consorcio' | 'financiamento';
  institution: string;
  assetValue: number | null;
  downPayment: number | null;
  creditLetter: number | null;
  financedAmount: number | null;
  adminFeePct: number | null;
  interestRate: number | null;
  cet: number | null;
  termMonths: number | null;
  contractStatus: 'active' | 'contemplated' | 'paid_off' | 'cancelled';
  group: string;
  quota: string;
  administrator: string;
  reserveFundPct: number | null;
  insurance: number | null;
  bids: Bid[];
  contemplationDate: string | null;
  contemplationNote: string;
  balanceOverride: number | null;
}

export type InvestmentType = 'Caixinha' | 'CDB' | 'LCI' | 'LCA' | 'Tesouro Direto' | 'Outro';

export interface Investment {
  id: string;
  name: string;
  institution: string;
  type: InvestmentType;
  baseValue: number | null; // valor atual de referência (null = pendente de confirmação)
  appliedBase: number | null;
  applicationDate: string | null;
  yieldInfo: string; // rentabilidade INFORMADA (texto livre, nunca estimada)
  maturityDate: string | null;
  liquidity: string;
  status: 'active' | 'matured' | 'redeemed' | 'pending_confirmation';
  notes: string;
  archived?: boolean;
}

export interface Contribution {
  id: string;
  date: string;
  amount: number; // positivo = separar; negativo = retirar da meta
  note: string;
}

export interface Goal {
  id: string;
  name: string;
  target: number;
  deadline: string | null;
  priority: 'alta' | 'media' | 'baixa';
  linkedAccountId: string | null;
  linkedInvestmentId: string | null;
  notes: string;
  emergency?: boolean;
  contributions: Contribution[];
}

export interface Statement {
  id: string;
  accountId: string;
  label: string;
  from: string;
  to: string;
  entradas: number;
  saidas: number;
  saldoFinal: number;
  saldoInicial: number | null;
  rendimento: number | null;
  notes: string;
}

export interface MonthPlan {
  investments: number;
  goals: number;
  variable: number | null;
}

export interface Settings {
  theme: 'light' | 'dark';
  simulatedDate: string | null;
  spendEstimateMin: number;
  spendEstimateMax: number;
}

export interface AppState {
  version: 1;
  openingDate: string;
  accounts: Account[];
  transactions: Transaction[];
  categories: Category[];
  incomeSources: IncomeSource[];
  debts: Debt[];
  contracts: Contract[];
  investments: Investment[];
  goals: Goal[];
  statements: Statement[];
  planning: Record<string, MonthPlan>;
  settings: Settings;
}

export type TxInput = Omit<Transaction, 'id' | 'createdAt'>;

export const TX_LABEL: Record<TxType, string> = {
  income: 'Receita',
  expense: 'Despesa',
  transfer: 'Transferência',
  application: 'Aplicação',
  redemption: 'Resgate',
  installment: 'Pagamento de parcela',
  adjustment: 'Ajuste de saldo',
};

export const STATUS_LABEL: Record<TxStatus, string> = {
  confirmed: 'Confirmado',
  pending: 'Pendente',
  to_classify: 'A classificar',
};

export const KIND_LABEL: Record<AccountKind, string> = {
  checking: 'Conta bancária',
  savings: 'Caixinha / cofrinho',
  cash: 'Dinheiro em espécie',
  wallet: 'Carteira digital',
};
