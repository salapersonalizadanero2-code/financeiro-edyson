import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useApp } from '../store';
import type { Debt } from '../lib/types';
import { deleteDebt, saveDebt } from '../lib/ops';
import { debtTotals, obligationBalance, obligationProgress } from '../lib/selectors';
import { brl, daysDiff, fmtDate, numToInput, parseMoney } from '../lib/utils';
import { AccountSelect, Badge, Card, Empty, Field, Modal, MoneyInput, Notice, PageHeader, Progress, Stat } from '../components/ui';
import { Installments } from '../components/Installments';

export default function Debts() {
  const { state, today, commit, confirm } = useApp();
  const [edit, setEdit] = useState<Debt | 'new' | null>(null);
  const tot = debtTotals(state);

  const remove = async (d: Debt) => {
    const ok = await confirm({ title: `Excluir “${d.name}”?`, message: 'Só é possível se não houver pagamentos registrados nesta dívida.', danger: true, confirmLabel: 'Excluir' });
    if (ok) commit((s) => deleteDebt(s, d.id), 'Dívida excluída.');
  };
  const setDirection = (d: Debt, direction: Debt['direction']) =>
    commit((s) => saveDebt(s, { ...d, direction }), direction === 'owe' ? 'Registrado: você deve este valor.' : 'Registrado: devem este valor a você.');

  return (
    <div>
      <PageHeader title="Dívidas e parcelas" subtitle="Cada parcela paga desconta da conta escolhida, vira despesa e atualiza o saldo devedor e o dashboard." actions={<button className="btn-primary" onClick={() => setEdit('new')}><Plus className="h-4 w-4" />Nova dívida</button>} />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Saldo devedor" value={brl(tot.owe)} tone="bad" sub="Dívidas + contratos" />
        <Stat label="Parcelas restantes" value={String(tot.futureCount)} tone="warn" sub={brl(tot.futureAmount)} />
        <Stat label="A esclarecer" value={brl(tot.clarify)} tone="warn" sub="Direção indefinida" />
        <Stat label="A receber de terceiros" value={brl(tot.receivable)} tone="ok" />
      </div>

      <div className="grid gap-4">
        {state.debts.length === 0 && <Empty>Nenhuma dívida cadastrada.</Empty>}
        {state.debts.map((d) => {
          const p = obligationProgress(state, d);
          const bal = obligationBalance(state, { kind: 'debt', ob: d });
          const done = p.remaining === 0;
          const overdue = !!p.nextDue && p.nextDue < today && !done;
          const pctPaid = (p.paid / d.totalInstallments) * 100;
          return (
            <Card key={d.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-base font-bold">{d.name}</h3>
                  {d.description && <p className="mt-0.5 text-xs text-muted">{d.description}</p>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {d.direction === 'unknown' && <Badge tone="warn">A esclarecer</Badge>}
                  {d.direction === 'receivable' && <Badge tone="ok">Devem a mim</Badge>}
                  {d.direction === 'owe' && <Badge tone="brand">Eu devo</Badge>}
                  {done ? <Badge tone="ok">Quitada</Badge> : overdue ? <Badge tone="bad">Atrasada</Badge> : d.direction !== 'unknown' && <Badge tone="warn">Em andamento</Badge>}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3 lg:grid-cols-6">
                {[
                  ['Valor total', d.totalAmount != null ? brl(d.totalAmount) : brl(d.installmentAmount * d.totalInstallments) + '*'],
                  ['Parcela', brl(d.installmentAmount)],
                  ['Pagas', `${p.paid} de ${d.totalInstallments}`],
                  ['Restantes', String(p.remaining)],
                  [d.direction === 'receivable' ? 'Saldo a receber' : 'Saldo devedor', brl(bal)],
                  ['Próx. vencimento', p.nextDue ? `${fmtDate(p.nextDue)}${daysDiff(today, p.nextDue) >= 0 ? ` (${daysDiff(today, p.nextDue)}d)` : ''}` : done ? '—' : 'não informado'],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-xl bg-tint/60 p-2.5"><div className="text-[11px] font-semibold text-muted">{k}</div><div className="font-bold tabular-nums">{v}</div></div>
                ))}
              </div>
              {d.totalAmount == null && <p className="mt-1 text-[11px] text-muted">* estimado: parcela × quantidade (valor total não informado).</p>}
              <div className="my-3"><Progress value={pctPaid} tone={done ? 'ok' : 'brand'} /></div>
              {d.notes && <p className="mb-3 text-xs text-muted">{d.notes}</p>}

              {d.direction === 'unknown' ? (
                <div className="rounded-xl bg-warn/10 p-3">
                  <p className="mb-2 text-sm font-semibold text-warn">Quem deve a quem? Não presumimos a direção — escolha:</p>
                  <div className="flex flex-wrap gap-2">
                    <button className="btn-soft" onClick={() => setDirection(d, 'owe')}>Eu devo {brl(d.installmentAmount)}</button>
                    <button className="btn-soft" onClick={() => setDirection(d, 'receivable')}>Devem a mim {brl(d.installmentAmount)}</button>
                  </div>
                </div>
              ) : <Installments target={{ kind: 'debt', ob: d }} />}

              <div className="mt-3 flex gap-1.5 border-t border-line pt-3">
                <button className="btn-ghost btn-sm" onClick={() => setEdit(d)}><Pencil className="h-3.5 w-3.5" />Editar</button>
                <button className="btn-danger btn-sm" onClick={() => remove(d)}><Trash2 className="h-3.5 w-3.5" />Excluir</button>
              </div>
            </Card>
          );
        })}
      </div>

      {edit && <DebtForm debt={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function DebtForm({ debt, onClose }: { debt: Debt | null; onClose: () => void }) {
  const { commit } = useApp();
  const [name, setName] = useState(debt?.name ?? '');
  const [desc, setDesc] = useState(debt?.description ?? '');
  const [total, setTotal] = useState(numToInput(debt?.totalAmount));
  const [inst, setInst] = useState(numToInput(debt?.installmentAmount));
  const [n, setN] = useState(String(debt?.totalInstallments ?? 1));
  const [paid, setPaid] = useState(String(debt?.paidBefore ?? 0));
  const [due, setDue] = useState(debt?.firstDueDate ?? '');
  const [acc, setAcc] = useState(debt?.accountId ?? '');
  const [dir, setDir] = useState<Debt['direction']>(debt?.direction ?? 'owe');
  const [notes, setNotes] = useState(debt?.notes ?? '');
  const submit = () => {
    const ok = commit((s) => saveDebt(s, {
      id: debt?.id, name, description: desc, totalAmount: total.trim() ? parseMoney(total) : null, installmentAmount: parseMoney(inst),
      totalInstallments: Number(n), paidBefore: Number(paid), firstDueDate: due || null, accountId: acc || null, direction: dir, notes,
    }), 'Dívida salva.');
    if (ok) onClose();
  };
  return (
    <Modal open onClose={onClose} wide title={debt ? 'Editar dívida' : 'Nova dívida'} footer={<><button className="btn-ghost" onClick={onClose}>Cancelar</button><button className="btn-primary" onClick={submit}>Salvar</button></>}>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field label="Nome" className="sm:col-span-2"><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        <Field label="Descrição" className="sm:col-span-2"><input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
        <Field label="Valor total (R$, opcional)"><MoneyInput value={total} onChange={setTotal} /></Field>
        <Field label="Valor da parcela (R$)"><MoneyInput value={inst} onChange={setInst} /></Field>
        <Field label="Quantidade de parcelas"><input className="input" inputMode="numeric" value={n} onChange={(e) => setN(e.target.value.replace(/\D/g, ''))} /></Field>
        <Field label="Parcelas já pagas antes do sistema" hint="Para evitar duplicação, confira o histórico antes de informar."><input className="input" inputMode="numeric" value={paid} onChange={(e) => setPaid(e.target.value.replace(/\D/g, ''))} /></Field>
        <Field label="Vencimento da parcela nº 1" hint="As demais vencem no mesmo dia dos meses seguintes."><input type="date" className="input" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
        <Field label="Conta padrão de pagamento"><AccountSelect value={acc} onChange={setAcc} allowEmpty emptyLabel="Escolher ao pagar" /></Field>
        <Field label="Direção da dívida" className="sm:col-span-2">
          <select className="input" value={dir} onChange={(e) => setDir(e.target.value as Debt['direction'])}>
            <option value="owe">Eu devo</option><option value="receivable">Devem a mim</option><option value="unknown">A esclarecer</option>
          </select>
        </Field>
        <Field label="Observações" className="sm:col-span-2"><textarea className="input min-h-16" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        {debt && <div className="sm:col-span-2"><Notice tone="muted">Pagamentos já registrados pelo botão PAGAR PARCELA ficam preservados.</Notice></div>}
      </div>
    </Modal>
  );
}
