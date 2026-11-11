import { useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Pencil, PiggyBank, Plus, Trash2 } from 'lucide-react';
import { useApp } from '../store';
import type { Investment, InvestmentType } from '../lib/types';
import { deleteInvestment, saveInvestment, setInvestmentValue } from '../lib/ops';
import { blockedOf, computeTotals, investmentMap, investmentTxs, nextUnlock } from '../lib/selectors';
import { brl, fmtDate, numToInput, parseMoney } from '../lib/utils';
import { Badge, Card, Empty, Field, Modal, MoneyInput, Notice, PageHeader, Stat } from '../components/ui';
import { TxItem } from '../components/TxItem';
import { TransactionForm } from '../components/TransactionForm';

const STATUS = { active: 'Ativo', matured: 'Vencido', redeemed: 'Resgatado', pending_confirmation: 'Posição pendente de confirmação' } as const;
const TYPES: InvestmentType[] = ['CDB', 'LCI', 'LCA', 'Tesouro Direto', 'Outro'];

export default function Investments() {
  const { state, today, commit, confirm, go } = useApp();
  const totals = computeTotals(state, today);
  const inv = investmentMap(state);
  const [edit, setEdit] = useState<Investment | 'new' | null>(null);
  const [value, setValue] = useState<Investment | null>(null);
  const [move, setMove] = useState<{ type: 'application' | 'redemption'; id: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const savings = state.accounts.filter((a) => !a.archived && a.kind === 'savings');
  const list = state.investments.filter((i) => !i.archived);

  const remove = async (i: Investment) => {
    const hasTx = state.transactions.some((t) => t.investmentId === i.id);
    const ok = await confirm({ title: `Excluir “${i.name}”?`, message: hasTx ? 'Há movimentações vinculadas: o investimento será arquivado e o histórico preservado.' : 'O investimento será removido.', danger: true, confirmLabel: 'Excluir' });
    if (ok) commit((s) => deleteInvestment(s, i.id), 'Investimento removido.');
  };

  return (
    <div>
      <PageHeader title="Investimentos e dinheiro guardado" subtitle="Aplicar e resgatar não são despesa nem receita: o dinheiro só muda de lugar e é contado uma única vez." actions={<button className="btn-primary" onClick={() => setEdit('new')}><Plus className="h-4 w-4" />Novo investimento</button>} />

      <div className="mb-4 grid grid-cols-3 gap-3">
        <Stat label="Total guardado" value={brl(totals.saved)} />
        <Stat label="Caixinhas / cofrinhos" value={brl(totals.savingsAccounts)} sub="Contas do tipo caixinha" />
        <Stat label="Investimentos" value={brl(totals.investments)} sub="Valores confirmados" />
      </div>

      <h2 className="mb-2 text-sm font-bold">Caixinhas e cofrinhos</h2>
      <div className="mb-6 grid gap-3 md:grid-cols-2">
        {savings.length === 0 && <Empty>Nenhuma caixinha cadastrada. Crie uma conta do tipo “Caixinha / cofrinho” em Contas.</Empty>}
        {savings.map((a) => {
          const bal = totals.balances[a.id] ?? 0;
          const bl = blockedOf(a, bal, today);
          const nu = nextUnlock(a, today);
          return (
            <Card key={a.id}>
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-tint text-brand"><PiggyBank className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1"><div className="truncate font-bold">{a.name}</div><div className="text-xs text-muted">Disponível {brl(bal - bl)}{bl > 0 && <> · bloqueado {brl(bl)}{nu ? ` até ${fmtDate(nu.unlockDate)}` : ''}</>}</div></div>
                <div className="text-lg font-bold tabular-nums">{brl(bal)}</div>
              </div>
              <div className="mt-3 flex gap-1.5">
                <button className="btn-soft btn-sm" onClick={() => setMove({ type: 'application', id: a.id })}><ArrowDownToLine className="h-3.5 w-3.5" />Guardar</button>
                <button className="btn-ghost btn-sm" onClick={() => setMove({ type: 'redemption', id: a.id })}><ArrowUpFromLine className="h-3.5 w-3.5" />Resgatar</button>
                <button className="btn-ghost btn-sm" onClick={() => go('contas')}>Ver conta</button>
              </div>
            </Card>
          );
        })}
      </div>

      <h2 className="mb-2 text-sm font-bold">Investimentos (CDB, LCI, LCA, Tesouro…)</h2>
      <div className="grid gap-4">
        {list.length === 0 && <Empty>Nenhum investimento cadastrado.</Empty>}
        {list.map((i) => {
          const v = inv[i.id];
          const txs = investmentTxs(state, i);
          const pending = i.status === 'pending_confirmation';
          return (
            <Card key={i.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div><h3 className="text-base font-bold">{i.name}</h3><p className="text-xs text-muted">{i.institution || 'Instituição não informada'} · {i.type}</p></div>
                <Badge tone={pending ? 'warn' : i.status === 'active' ? 'ok' : 'muted'}>{STATUS[i.status]}</Badge>
              </div>
              {pending && <div className="mt-3"><Notice>Saldo atual <b>não confirmado</b> — não foi deduzido das movimentações e não entra no patrimônio até você informar o valor do extrato.</Notice></div>}
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {[
                  ['Valor atual', pending && v.value === 0 ? 'Pendente' : brl(v.value)],
                  ['Valor aplicado', i.appliedBase == null && v.applied === 0 ? '—' : brl(v.applied)],
                  ['Data da aplicação', fmtDate(i.applicationDate)],
                  ['Vencimento', fmtDate(i.maturityDate)],
                  ['Rentabilidade informada', i.yieldInfo || '—'],
                  ['Liquidez', i.liquidity || '—'],
                ].map(([k, val]) => <div key={k} className="rounded-xl bg-tint/60 p-2.5"><div className="text-[11px] font-semibold text-muted">{k}</div><div className="text-sm font-bold">{val}</div></div>)}
              </div>
              {i.notes && <p className="mt-2 text-xs text-muted">{i.notes}</p>}
              <div className="mt-3 flex flex-wrap gap-1.5">
                <button className="btn-primary btn-sm" onClick={() => setMove({ type: 'application', id: i.id })}><ArrowDownToLine className="h-3.5 w-3.5" />Aplicar</button>
                <button className="btn-soft btn-sm" onClick={() => setMove({ type: 'redemption', id: i.id })}><ArrowUpFromLine className="h-3.5 w-3.5" />Resgatar</button>
                <button className="btn-ghost btn-sm" onClick={() => setValue(i)}>Informar valor atual</button>
                <button className="btn-ghost btn-sm" onClick={() => setOpen(open === i.id ? null : i.id)}>Histórico ({txs.length})</button>
                <button className="btn-ghost btn-sm" onClick={() => setEdit(i)}><Pencil className="h-3.5 w-3.5" />Editar</button>
                <button className="btn-danger btn-sm" onClick={() => remove(i)}><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
              {open === i.id && (
                <div className="mt-3 divide-y divide-line rounded-xl border border-line px-3">
                  {txs.length === 0 ? <p className="py-3 text-sm text-muted">Sem aplicações ou resgates registrados.</p> : txs.map((t) => <TxItem key={t.id} state={state} t={t} />)}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {edit && <InvestmentForm inv={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
      {value && <ValueForm inv={value} current={inv[value.id].value} onClose={() => setValue(null)} />}
      {move && (
        <TransactionForm
          presetType={move.type}
          preset={state.investments.some((i) => i.id === move.id) ? { investmentId: move.id } : move.type === 'application' ? { toAccountId: move.id } : { fromAccountId: move.id }}
          onClose={() => setMove(null)}
        />
      )}
    </div>
  );
}

function ValueForm({ inv, current, onClose }: { inv: Investment; current: number; onClose: () => void }) {
  const { commit } = useApp();
  const [v, setV] = useState(inv.status === 'pending_confirmation' ? '' : numToInput(current));
  return (
    <Modal open onClose={onClose} title={`Valor atual — ${inv.name}`} footer={<><button className="btn-ghost" onClick={onClose}>Cancelar</button><button className="btn-primary" onClick={() => { if (commit((s) => setInvestmentValue(s, inv.id, parseMoney(v)), 'Valor atual confirmado.')) onClose(); }}>Confirmar valor</button></>}>
      <div className="grid gap-3.5">
        <Notice tone="muted">Informe o valor que consta no extrato/app da instituição. É um valor <b>confirmado por você</b> — o sistema não estima rendimento. Não cria movimentações nem altera saldos de contas.</Notice>
        <Field label="Valor atual confirmado (R$)"><MoneyInput value={v} onChange={setV} autoFocus /></Field>
      </div>
    </Modal>
  );
}

function InvestmentForm({ inv, onClose }: { inv: Investment | null; onClose: () => void }) {
  const { commit } = useApp();
  const [name, setName] = useState(inv?.name ?? '');
  const [inst, setInst] = useState(inv?.institution ?? '');
  const [type, setType] = useState<InvestmentType>(inv?.type ?? 'CDB');
  const [applied, setApplied] = useState('');
  const [cur, setCur] = useState('');
  const [appDate, setAppDate] = useState(inv?.applicationDate ?? '');
  const [yieldInfo, setYieldInfo] = useState(inv?.yieldInfo ?? '');
  const [mat, setMat] = useState(inv?.maturityDate ?? '');
  const [liq, setLiq] = useState(inv?.liquidity ?? '');
  const [status, setStatus] = useState<Investment['status']>(inv?.status ?? 'active');
  const [notes, setNotes] = useState(inv?.notes ?? '');
  const submit = () => {
    const base: Omit<Investment, 'id'> = inv
      ? { ...inv, name, institution: inst, type, applicationDate: appDate || null, yieldInfo, maturityDate: mat || null, liquidity: liq, status, notes }
      : {
        name, institution: inst, type, applicationDate: appDate || null, yieldInfo, maturityDate: mat || null, liquidity: liq, notes,
        appliedBase: applied.trim() ? parseMoney(applied) : null, baseValue: cur.trim() ? parseMoney(cur) : null,
        status: cur.trim() ? status : 'pending_confirmation',
      };
    if (commit((s) => saveInvestment(s, { ...base, id: inv?.id }), 'Investimento salvo.')) onClose();
  };
  return (
    <Modal open onClose={onClose} wide title={inv ? 'Editar investimento' : 'Novo investimento'} footer={<><button className="btn-ghost" onClick={onClose}>Cancelar</button><button className="btn-primary" onClick={submit}>Salvar</button></>}>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field label="Nome"><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        <Field label="Instituição"><input className="input" value={inst} onChange={(e) => setInst(e.target.value)} /></Field>
        <Field label="Tipo"><select className="input" value={type} onChange={(e) => setType(e.target.value as InvestmentType)}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Situação"><select className="input" value={status} onChange={(e) => setStatus(e.target.value as Investment['status'])}>{(Object.keys(STATUS) as Array<keyof typeof STATUS>).map((k) => <option key={k} value={k}>{STATUS[k]}</option>)}</select></Field>
        {!inv && <>
          <Field label="Valor aplicado inicial (R$)" hint="Opcional. Aplicações futuras devem ser lançadas como “Aplicação”."><MoneyInput value={applied} onChange={setApplied} /></Field>
          <Field label="Valor atual (R$)" hint="Deixe vazio se a posição ainda precisa ser confirmada."><MoneyInput value={cur} onChange={setCur} /></Field>
        </>}
        <Field label="Data da aplicação"><input type="date" className="input" value={appDate} onChange={(e) => setAppDate(e.target.value)} /></Field>
        <Field label="Vencimento"><input type="date" className="input" value={mat} onChange={(e) => setMat(e.target.value)} /></Field>
        <Field label="Rentabilidade informada (texto)" hint="Apenas o que a instituição informou — nunca estimativa."><input className="input" value={yieldInfo} onChange={(e) => setYieldInfo(e.target.value)} placeholder="Ex.: 100% do CDI" /></Field>
        <Field label="Liquidez"><input className="input" value={liq} onChange={(e) => setLiq(e.target.value)} placeholder="Ex.: Diária, no vencimento" /></Field>
        <Field label="Observações" className="sm:col-span-2"><textarea className="input min-h-16" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
