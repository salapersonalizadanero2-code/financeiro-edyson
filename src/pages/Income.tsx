import { useState } from 'react';
import { Check, Pencil, Plus, Trash2, Undo2 } from 'lucide-react';
import { useApp } from '../store';
import type { IncomeSource } from '../lib/types';
import { confirmIncome, deleteIncomeSource, saveIncomeSource, saveSalaryPlan, undoIncome } from '../lib/ops';
import { incomeRefId, monthStats } from '../lib/selectors';
import { brl, dateInMonth, fmtDate, monthLong, numToInput, parseMoney } from '../lib/utils';
import { AccountSelect, Badge, Card, CategorySelect, Empty, Field, Modal, MoneyInput, Notice, PageHeader, Stat } from '../components/ui';
import { accName } from '../components/TxItem';

export default function Income() {
  const { state, today, ym, commit, confirm } = useApp();
  const [salary, setSalary] = useState(false);
  const [src, setSrc] = useState<IncomeSource | 'new' | null>(null);
  const [receive, setReceive] = useState<IncomeSource | null>(null);
  const stats = monthStats(state, ym);

  const rows = state.incomeSources.map((s) => {
    const refId = incomeRefId(s.id, ym);
    const tx = state.transactions.find((t) => t.refId === refId && t.status !== 'pending');
    const date = dateInMonth(ym, s.day);
    return { s, tx, date, refId, late: !tx && date < today };
  });
  const active = rows.filter((r) => r.s.active);
  const planned = active.reduce((a, r) => a + r.s.amount, 0);
  const received = active.reduce((a, r) => a + (r.tx ? r.tx.amount : 0), 0);
  const salaryTotal = state.incomeSources.filter((s) => s.kind === 'salary' && s.active).reduce((a, s) => a + s.amount, 0);

  const undo = async (refId: string, name: string) => {
    const ok = await confirm({ title: 'Desfazer recebimento?', message: `“${name}” voltará a ser apenas uma receita prevista e o valor será estornado do saldo da conta.`, confirmLabel: 'Desfazer', danger: true });
    if (ok) commit((s) => undoIncome(s, refId), 'Recebimento desfeito.');
  };
  const remove = async (s: IncomeSource) => {
    const ok = await confirm({ title: 'Excluir fonte de renda?', message: `“${s.name}” deixará de ser prevista nos próximos meses.`, danger: true, confirmLabel: 'Excluir' });
    if (ok) commit((st) => deleteIncomeSource(st, s.id), 'Fonte excluída.');
  };

  return (
    <div>
      <PageHeader
        title="Receitas e salário"
        subtitle="Receitas previstas só viram dinheiro em conta depois que você confirma o recebimento."
        actions={<><button className="btn-ghost" onClick={() => setSalary(true)}><Pencil className="h-4 w-4" />Alterar salário</button><button className="btn-primary" onClick={() => setSrc('new')}><Plus className="h-4 w-4" />Outra fonte de renda</button></>}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Salário mensal" value={brl(salaryTotal)} sub={`Divisão em ${state.incomeSources.filter((s) => s.kind === 'salary' && s.active).length} parte(s)`} />
        <Stat label={`Previsto · ${monthLong(ym)}`} value={brl(planned)} tone="warn" />
        <Stat label="Efetivamente recebido" value={brl(received)} tone="ok" sub="Das receitas recorrentes" />
        <Stat label="A receber" value={brl(Math.max(0, planned - received))} tone="warn" />
      </div>

      <Card title={`Recebimentos de ${monthLong(ym)}`}>
        {rows.length === 0 ? <Empty>Nenhuma fonte de renda cadastrada.</Empty> : (
          <div className="divide-y divide-line">
            {rows.map(({ s, tx, date, refId, late }) => (
              <div key={s.id} className={`flex flex-wrap items-center gap-3 py-3 ${s.active ? '' : 'opacity-50'}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{s.name}</span>
                    {!s.active ? <Badge>Inativa</Badge> : tx ? <Badge tone="ok">Recebido em {fmtDate(tx.date)}</Badge> : late ? <Badge tone="bad">Aguardando confirmação (previsto {fmtDate(date)})</Badge> : <Badge tone="warn">Previsto para {fmtDate(date)}</Badge>}
                  </div>
                  <div className="text-xs text-muted">Todo dia {s.day} · {tx ? `Conta: ${accName(state, tx.toAccountId)}` : s.accountId ? `Conta padrão: ${accName(state, s.accountId)}` : 'Escolha a conta ao confirmar'}</div>
                </div>
                <div className="text-right text-lg font-bold tabular-nums">{brl(tx ? tx.amount : s.amount)}</div>
                <div className="flex gap-1.5">
                  {s.active && (tx
                    ? <button className="btn-ghost btn-sm" onClick={() => undo(refId, s.name)}><Undo2 className="h-3.5 w-3.5" />Desfazer</button>
                    : <button className="btn-primary btn-sm" onClick={() => setReceive(s)}><Check className="h-3.5 w-3.5" />Confirmar recebimento</button>)}
                  {s.kind === 'other' && <>
                    <button className="btn-ghost btn-sm" onClick={() => setSrc(s)} aria-label="Editar"><Pencil className="h-3.5 w-3.5" /></button>
                    <button className="btn-danger btn-sm" onClick={() => remove(s)} aria-label="Excluir"><Trash2 className="h-3.5 w-3.5" /></button>
                  </>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="mt-4"><Notice tone="muted">Receitas lançadas no mês (todas as origens): <b>{brl(stats.income)}</b>{stats.toClassify > 0 && <> — dos quais <b>{brl(stats.toClassify)}</b> ainda estão <b>A classificar</b></>}. Salário e outras fontes só entram aqui depois de confirmados.</Notice></div>

      {salary && <SalaryForm onClose={() => setSalary(false)} />}
      {src && <SourceForm source={src === 'new' ? null : src} onClose={() => setSrc(null)} />}
      {receive && <ReceiveForm source={receive} ym={ym} onClose={() => setReceive(null)} />}
    </div>
  );
}

function SalaryForm({ onClose }: { onClose: () => void }) {
  const { state, commit } = useApp();
  const s1 = state.incomeSources.find((s) => s.id === 'inc-sal-1');
  const s2 = state.incomeSources.find((s) => s.id === 'inc-sal-2');
  const total = (s1?.amount ?? 0) + (s2?.amount ?? 0);
  const [t, setT] = useState(numToInput(total || 913));
  const [pct, setPct] = useState(String(s1 && total ? Math.round((s1.amount / total) * 100) : 60));
  const [d1, setD1] = useState(String(s1?.day ?? 5));
  const [d2, setD2] = useState(String(s2?.day ?? 20));
  const [acc, setAcc] = useState(s1?.accountId ?? '');
  const tv = parseMoney(t);
  const p = Number(pct);
  const a1 = Number.isFinite(tv) ? Math.round(tv * p) / 100 : 0;
  return (
    <Modal open onClose={onClose} title="Salário e datas de pagamento" footer={<><button className="btn-ghost" onClick={onClose}>Cancelar</button><button className="btn-primary" onClick={() => { if (commit((s) => saveSalaryPlan(s, { total: tv, pct1: p, day1: Number(d1), day2: Number(d2), accountId: acc || null }), 'Salário atualizado.')) onClose(); }}>Salvar</button></>}>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field label="Renda mensal total (R$)"><MoneyInput value={t} onChange={setT} /></Field>
        <Field label="Percentual da 1ª parte (%)"><input className="input" inputMode="numeric" value={pct} onChange={(e) => setPct(e.target.value.replace(/\D/g, ''))} /></Field>
        <Field label="Dia do 1º pagamento"><input className="input" inputMode="numeric" value={d1} onChange={(e) => setD1(e.target.value.replace(/\D/g, ''))} /></Field>
        <Field label="Dia do 2º pagamento"><input className="input" inputMode="numeric" value={d2} onChange={(e) => setD2(e.target.value.replace(/\D/g, ''))} /></Field>
        <Field label="Conta padrão de recebimento (opcional)" className="sm:col-span-2"><AccountSelect value={acc} onChange={setAcc} allowEmpty emptyLabel="Escolher na hora de confirmar" /></Field>
        {Number.isFinite(tv) && p >= 1 && p <= 99 && <div className="rounded-xl bg-tint p-3 text-sm sm:col-span-2">1ª parte: <b>{brl(a1)}</b> · 2ª parte: <b>{brl(tv - a1)}</b></div>}
      </div>
    </Modal>
  );
}

function SourceForm({ source, onClose }: { source: IncomeSource | null; onClose: () => void }) {
  const { commit } = useApp();
  const [name, setName] = useState(source?.name ?? '');
  const [amount, setAmount] = useState(source ? numToInput(source.amount) : '');
  const [day, setDay] = useState(String(source?.day ?? 10));
  const [acc, setAcc] = useState(source?.accountId ?? '');
  const [cat, setCat] = useState(source?.categoryId ?? '');
  const [active, setActive] = useState(source?.active ?? true);
  return (
    <Modal open onClose={onClose} title={source ? 'Editar fonte de renda' : 'Nova fonte de renda'} footer={<><button className="btn-ghost" onClick={onClose}>Cancelar</button><button className="btn-primary" onClick={() => { if (commit((s) => saveIncomeSource(s, { id: source?.id, name, amount: parseMoney(amount), day: Number(day), accountId: acc || null, kind: 'other', active, categoryId: cat || null }), 'Fonte de renda salva.')) onClose(); }}>Salvar</button></>}>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field label="Nome" className="sm:col-span-2"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Freelance, Aluguel…" autoFocus /></Field>
        <Field label="Valor mensal (R$)"><MoneyInput value={amount} onChange={setAmount} /></Field>
        <Field label="Dia do recebimento"><input className="input" inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value.replace(/\D/g, ''))} /></Field>
        <Field label="Conta padrão"><AccountSelect value={acc} onChange={setAcc} allowEmpty emptyLabel="Escolher ao confirmar" /></Field>
        <Field label="Categoria"><CategorySelect value={cat} onChange={setCat} kind="income" /></Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="accent-[#7C3AED]" checked={active} onChange={(e) => setActive(e.target.checked)} />Fonte ativa (aparece nas previsões)</label>
      </div>
    </Modal>
  );
}

function ReceiveForm({ source, ym, onClose }: { source: IncomeSource; ym: string; onClose: () => void }) {
  const { state, commit } = useApp();
  const first = state.accounts.find((a) => !a.archived && a.kind === 'checking')?.id ?? '';
  const [acc, setAcc] = useState(source.accountId ?? first);
  const [date, setDate] = useState(dateInMonth(ym, source.day));
  const [amount, setAmount] = useState(numToInput(source.amount));
  return (
    <Modal open onClose={onClose} title="Confirmar recebimento" footer={<><button className="btn-ghost" onClick={onClose}>Cancelar</button><button className="btn-primary" onClick={() => { if (commit((s) => confirmIncome(s, { sourceId: source.id, ym, accountId: acc, date, amount: parseMoney(amount) }), 'Recebimento confirmado — saldo atualizado.')) onClose(); }}>Confirmar</button></>}>
      <div className="grid gap-3.5">
        <p className="text-sm"><b>{source.name}</b> · {monthLong(ym)}</p>
        <Field label="Valor efetivamente recebido (R$)"><MoneyInput value={amount} onChange={setAmount} /></Field>
        <Field label="Data do recebimento"><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Conta que recebeu"><AccountSelect value={acc} onChange={setAcc} /></Field>
      </div>
    </Modal>
  );
}
