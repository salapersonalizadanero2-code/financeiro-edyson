import { useState } from 'react';
import { ArrowLeftRight, History, Lock, LockOpen, Pencil, Plus, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useApp } from '../store';
import { KIND_LABEL, type Account, type AccountKind, type Block } from '../lib/types';
import { accountTxs, blockedOf, computeTotals, isBlockActive } from '../lib/selectors';
import { adjustBalance, archiveAccount, saveAccount } from '../lib/ops';
import { brl, daysDiff, fmtDate, numToInput, parseMoney, uid } from '../lib/utils';
import { Badge, Card, Empty, Field, Modal, MoneyInput, Notice, PageHeader, Stat } from '../components/ui';
import { TxItem } from '../components/TxItem';
import { TransactionForm } from '../components/TransactionForm';

export default function Accounts() {
  const { state, today, commit, confirm } = useApp();
  const totals = computeTotals(state, today);
  const [edit, setEdit] = useState<Account | 'new' | null>(null);
  const [adjust, setAdjust] = useState<Account | null>(null);
  const [history, setHistory] = useState<Account | null>(null);
  const [transfer, setTransfer] = useState(false);
  const list = state.accounts.filter((a) => !a.archived);
  const archived = state.accounts.filter((a) => a.archived);

  const remove = async (a: Account) => {
    const ok = await confirm({
      title: `Excluir "${a.name}"?`,
      message: 'A conta será arquivada: ela some das listas e dos totais, mas todo o histórico de movimentações é preservado. Só é possível se o saldo for zero.',
      confirmLabel: 'Excluir conta', danger: true,
    });
    if (ok) commit((s) => archiveAccount(s, a.id), 'Conta arquivada. O histórico foi preservado.');
  };

  return (
    <div>
      <PageHeader
        title="Contas e carteiras"
        subtitle="Cada conta, caixinha e cofrinho tem saldo próprio. O saldo é calculado automaticamente pelos lançamentos."
        actions={<><button className="btn-ghost" onClick={() => setTransfer(true)}><ArrowLeftRight className="h-4 w-4" />Transferir</button><button className="btn-primary" onClick={() => setEdit('new')}><Plus className="h-4 w-4" />Nova conta</button></>}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Patrimônio" value={brl(totals.patrimony)} />
        <Stat label="Disponível" value={brl(totals.available)} tone="ok" />
        <Stat label="Bloqueado" value={brl(totals.blocked)} tone="warn" />
        <Stat label="Investimentos" value={brl(totals.investments)} sub="Fora das contas" />
      </div>

      <Notice tone="muted">
        Transferir entre contas próprias <b>não é receita nem despesa</b> e não altera o patrimônio. Se o saldo real divergir do sistema, use <b>Ajustar saldo</b> — o ajuste fica identificado no histórico.
      </Notice>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {list.map((a) => {
          const bal = totals.balances[a.id] ?? 0;
          const blocked = blockedOf(a, bal, today);
          return (
            <Card key={a.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate font-bold">{a.name}</h3>
                  <div className="mt-0.5 flex flex-wrap gap-1.5"><Badge tone="brand">{KIND_LABEL[a.kind]}</Badge></div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold tabular-nums">{brl(bal)}</div>
                  <div className="text-[11px] text-muted">saldo total</div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-xl bg-ok/10 p-2.5"><div className="text-[11px] font-semibold text-ok">Disponível</div><div className="font-bold tabular-nums">{brl(bal - blocked)}</div></div>
                <div className="rounded-xl bg-warn/10 p-2.5"><div className="text-[11px] font-semibold text-warn">Bloqueado</div><div className="font-bold tabular-nums">{brl(blocked)}</div></div>
              </div>
              {a.blocks.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {a.blocks.map((b) => {
                    const active = isBlockActive(b, today);
                    return (
                      <li key={b.id} className={`flex items-start gap-2 rounded-xl p-2.5 text-xs ${active ? 'bg-warn/10 text-warn' : 'bg-ok/10 text-ok'}`}>
                        {active ? <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <LockOpen className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                        <span>
                          <b>{brl(b.amount)}</b> {active ? `bloqueados — desbloqueio em ${fmtDate(b.unlockDate)} (faltam ${daysDiff(today, b.unlockDate)} dias).` : `desbloqueados em ${fmtDate(b.unlockDate)} e já disponíveis.`}
                          <span className="block text-muted">{active ? 'Não é receita nem transferência: só muda de “bloqueado” para “disponível”.' : 'O patrimônio não mudou com o desbloqueio.'}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              {a.notes && <p className="mt-2 text-xs text-muted">{a.notes}</p>}
              <div className="mt-4 flex flex-wrap gap-1.5">
                <button className="btn-soft btn-sm" onClick={() => setHistory(a)}><History className="h-3.5 w-3.5" />Histórico ({accountTxs(state, a.id).length})</button>
                <button className="btn-ghost btn-sm" onClick={() => setAdjust(a)}><SlidersHorizontal className="h-3.5 w-3.5" />Ajustar saldo</button>
                <button className="btn-ghost btn-sm" onClick={() => setEdit(a)}><Pencil className="h-3.5 w-3.5" />Editar</button>
                <button className="btn-danger btn-sm" onClick={() => remove(a)}><Trash2 className="h-3.5 w-3.5" />Excluir</button>
              </div>
            </Card>
          );
        })}
      </div>
      {list.length === 0 && <Empty>Nenhuma conta cadastrada. Crie a primeira conta.</Empty>}
      {archived.length > 0 && <p className="mt-4 text-xs text-muted">{archived.length} conta(s) arquivada(s) — o histórico delas continua nos lançamentos: {archived.map((a) => a.name).join(', ')}.</p>}

      {edit && <AccountForm account={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
      {adjust && <AdjustForm account={adjust} balance={totals.balances[adjust.id] ?? 0} onClose={() => setAdjust(null)} />}
      {history && (
        <Modal open title={`Histórico — ${history.name}`} onClose={() => setHistory(null)} wide>
          {accountTxs(state, history.id).length ? (
            <div className="divide-y divide-line">{accountTxs(state, history.id).map((t) => <TxItem key={t.id} state={state} t={t} accountId={history.id} />)}</div>
          ) : <Empty>Sem movimentações nesta conta.</Empty>}
        </Modal>
      )}
      {transfer && <TransactionForm presetType="transfer" onClose={() => setTransfer(false)} />}
    </div>
  );
}

function AccountForm({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const { commit } = useApp();
  const [name, setName] = useState(account?.name ?? '');
  const [inst, setInst] = useState(account?.institution ?? '');
  const [kind, setKind] = useState<AccountKind>(account?.kind ?? 'checking');
  const [bal, setBal] = useState(account ? numToInput(account.openingBalance) : '0,00');
  const [notes, setNotes] = useState(account?.notes ?? '');
  const [blocks, setBlocks] = useState<Block[]>(account?.blocks ?? []);
  const [bAmounts, setBAmounts] = useState<Record<string, string>>(Object.fromEntries((account?.blocks ?? []).map((b) => [b.id, numToInput(b.amount)])));

  const submit = () => {
    const ok = commit((s) => saveAccount(s, {
      id: account?.id, name, institution: inst, kind, openingBalance: parseMoney(bal), notes,
      blocks: blocks.map((b) => ({ ...b, amount: parseMoney(bAmounts[b.id]) })),
    }), account ? 'Conta atualizada.' : 'Conta criada.');
    if (ok) onClose();
  };

  return (
    <Modal open onClose={onClose} title={account ? 'Editar conta' : 'Nova conta'} footer={<><button className="btn-ghost" onClick={onClose}>Cancelar</button><button className="btn-primary" onClick={submit}>Salvar</button></>}>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field label="Nome" className="sm:col-span-2"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Nubank — conta" autoFocus /></Field>
        <Field label="Instituição"><input className="input" value={inst} onChange={(e) => setInst(e.target.value)} /></Field>
        <Field label="Tipo">
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value as AccountKind)}>
            {(Object.keys(KIND_LABEL) as AccountKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </Field>
        <Field label={account ? 'Saldo de referência (R$)' : 'Saldo inicial (R$)'} hint={account ? 'Mude apenas para corrigir o saldo inicial. Para diferenças do dia a dia, use “Ajustar saldo”.' : 'Valor que a conta tem hoje. Lançamentos futuros somam/subtraem a partir dele.'} className="sm:col-span-2">
          <MoneyInput value={bal} onChange={setBal} />
        </Field>
        <div className="sm:col-span-2">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="label !mb-0">Valores bloqueados (parte do saldo, não disponível até a data)</span>
            <button type="button" className="btn-soft btn-sm" onClick={() => { const id = uid('blk'); setBlocks([...blocks, { id, amount: 0, unlockDate: '', description: '' }]); setBAmounts({ ...bAmounts, [id]: '' }); }}><Plus className="h-3.5 w-3.5" />Bloqueio</button>
          </div>
          {blocks.length === 0 && <p className="text-xs text-muted">Nenhum bloqueio.</p>}
          {blocks.map((b) => (
            <div key={b.id} className="mb-2 grid grid-cols-[1fr_1fr_auto] items-end gap-2">
              <Field label="Valor"><MoneyInput value={bAmounts[b.id] ?? ''} onChange={(v) => setBAmounts({ ...bAmounts, [b.id]: v })} /></Field>
              <Field label="Desbloqueio em"><input type="date" className="input" value={b.unlockDate} onChange={(e) => setBlocks(blocks.map((x) => (x.id === b.id ? { ...x, unlockDate: e.target.value } : x)))} /></Field>
              <button type="button" className="btn-danger btn-sm mb-1" onClick={() => setBlocks(blocks.filter((x) => x.id !== b.id))} aria-label="Remover bloqueio"><Trash2 className="h-4 w-4" /></button>
              <input className="input col-span-3 !py-1.5 text-xs" placeholder="Descrição (opcional)" value={b.description} onChange={(e) => setBlocks(blocks.map((x) => (x.id === b.id ? { ...x, description: e.target.value } : x)))} />
            </div>
          ))}
        </div>
        <Field label="Observações" className="sm:col-span-2"><textarea className="input min-h-16" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function AdjustForm({ account, balance, onClose }: { account: Account; balance: number; onClose: () => void }) {
  const { commit, today } = useApp();
  const [actual, setActual] = useState('');
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const v = parseMoney(actual);
  const diff = Number.isFinite(v) ? v - balance : null;
  return (
    <Modal open onClose={onClose} title={`Ajustar saldo — ${account.name}`}
      footer={<><button className="btn-ghost" onClick={onClose}>Cancelar</button><button className="btn-primary" onClick={() => { if (commit((s) => adjustBalance(s, account.id, v, date, note), 'Ajuste registrado e identificado no histórico.')) onClose(); }}>Registrar ajuste</button></>}>
      <div className="grid gap-3.5">
        <Notice tone="warn">Saldo no sistema: <b>{brl(balance)}</b>. Informe o saldo real da conta (ex.: do app do banco). A diferença vira um <b>ajuste identificado</b> — nada é inventado em silêncio.</Notice>
        <Field label="Saldo real (R$)"><MoneyInput value={actual} onChange={setActual} autoFocus /></Field>
        {diff != null && <div className="text-sm">Diferença: <b className={diff === 0 ? '' : diff > 0 ? 'text-ok' : 'text-bad'}>{brl(diff)}</b></div>}
        <Field label="Data"><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Motivo / observação"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
