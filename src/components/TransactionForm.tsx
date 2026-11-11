import { useMemo, useState } from 'react';
import { useApp } from '../store';
import { TX_LABEL, type Transaction, type TxInput, type TxType } from '../lib/types';
import { blankTx } from '../lib/seed';
import { addTransaction, txWarnings, updateTransaction, validateTx } from '../lib/ops';
import { numToInput, parseMoney } from '../lib/utils';
import { findObligation, obligationProgress } from '../lib/selectors';
import { AccountSelect, CategorySelect, Field, Modal, MoneyInput } from './ui';

const TYPES: TxType[] = ['expense', 'income', 'transfer', 'application', 'redemption', 'installment', 'adjustment'];

const HINTS: Record<TxType, string> = {
  income: 'Entra dinheiro de fora: aumenta o saldo da conta e o patrimônio.',
  expense: 'Sai dinheiro para consumo: reduz o saldo da conta e o patrimônio.',
  transfer: 'Entre contas próprias: NÃO é receita nem despesa e não altera o patrimônio.',
  application: 'Guarda dinheiro (investimento/caixinha): NÃO é despesa e não altera o patrimônio.',
  redemption: 'Traz dinheiro de volta de um investimento/caixinha: NÃO é receita nova.',
  installment: 'Pagamento de parcela de dívida ou contrato: conta como despesa e atualiza o saldo devedor.',
  adjustment: 'Corrige a diferença entre o saldo do sistema e o saldo real. Fica identificado no histórico.',
};

interface Props {
  initial?: Transaction;
  presetType?: TxType;
  preset?: Partial<TxInput>;
  onClose: () => void;
}

export function TransactionForm({ initial, presetType, preset, onClose }: Props) {
  const { state, today, commit, confirm, toast } = useApp();
  const src = initial ?? ({ ...blankTx({ type: presetType ?? 'expense', description: '', amount: 0, date: today, status: 'confirmed' }), ...preset } as TxInput);
  const [type, setType] = useState<TxType>(src.type);
  const [description, setDescription] = useState(src.description);
  const [amount, setAmount] = useState(src.amount ? numToInput(src.amount) : '');
  const [date, setDate] = useState(src.date);
  const [status, setStatus] = useState(src.status);
  const [categoryId, setCategoryId] = useState(src.categoryId ?? '');
  const [fromId, setFromId] = useState(src.fromAccountId ?? '');
  const [toId, setToId] = useState(src.toAccountId ?? '');
  const [invId, setInvId] = useState(src.investmentId ?? '');
  const [appDest, setAppDest] = useState<'investment' | 'account'>(src.investmentId ? 'investment' : 'account');
  const [direction, setDirection] = useState<'in' | 'out'>(src.adjustDirection ?? 'in');
  const [notes, setNotes] = useState(src.notes);
  const [historical, setHistorical] = useState(src.historical);
  const [obId, setObId] = useState(src.obligationId ?? '');
  const [instNo, setInstNo] = useState(src.installmentNo ? String(src.installmentNo) : '');
  const [error, setError] = useState('');

  const obligations = useMemo(
    () => [
      ...state.debts.filter((d) => d.direction === 'owe').map((d) => ({ id: d.id, name: d.name })),
      ...state.contracts.filter((c) => c.contractStatus !== 'cancelled' && c.contractStatus !== 'paid_off').map((c) => ({ id: c.id, name: c.name })),
    ],
    [state.debts, state.contracts],
  );
  const unpaid = useMemo(() => {
    const ref = obId ? findObligation(state, obId) : null;
    if (!ref) return [];
    const p = obligationProgress(state, ref.ob);
    const out: number[] = [];
    for (let i = 1; i <= ref.ob.totalInstallments; i++) if (!p.paidNos.has(i) || i === src.installmentNo) out.push(i);
    return out;
  }, [obId, state, src.installmentNo]);

  const savingsAccounts = state.accounts.filter((a) => !a.archived && a.kind === 'savings');
  const isIncomeCat = type === 'income';
  const showCat = type === 'income' || type === 'expense' || type === 'installment';
  const isEdit = !!initial;

  const build = (): TxInput | null => {
    const v = parseMoney(amount);
    if (!Number.isFinite(v)) { setError('Informe um valor válido (ex.: 50,00).'); return null; }
    const t: TxInput = {
      ...blankTx({ type, description, amount: v, date }),
      status, notes, historical,
      refId: initial?.refId ?? null,
      categoryId: showCat && categoryId ? categoryId : null,
    };
    switch (type) {
      case 'income': t.toAccountId = toId || null; break;
      case 'expense': t.fromAccountId = fromId || null; break;
      case 'installment':
        t.fromAccountId = fromId || null;
        t.obligationId = obId || null;
        t.installmentNo = obId && instNo ? Number(instNo) : null;
        if (!description.trim() && obId) {
          const ref = findObligation(state, obId);
          if (ref) t.description = `${ref.ob.name} — parcela ${instNo}/${ref.ob.totalInstallments}`;
        }
        break;
      case 'transfer': t.fromAccountId = fromId || null; t.toAccountId = toId || null; break;
      case 'application':
        t.fromAccountId = fromId || null;
        if (appDest === 'investment') t.investmentId = invId || null; else t.toAccountId = toId || null;
        break;
      case 'redemption':
        t.toAccountId = toId || null;
        if (appDest === 'investment') t.investmentId = invId || null; else t.fromAccountId = fromId || null;
        break;
      case 'adjustment': t.toAccountId = toId || null; t.adjustDirection = direction; break;
    }
    if (isEdit && initial) {
      // preserva vínculos de lançamentos gerados por outros módulos
      if (initial.obligationId && type === initial.type) { t.obligationId = initial.obligationId; t.installmentNo = initial.installmentNo; }
    }
    return t;
  };

  const submit = async () => {
    setError('');
    const t = build();
    if (!t) return;
    try {
      validateTx(state, t, initial?.id);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    const warns = txWarnings(state, t, initial?.id);
    if (warns.length) {
      const ok = await confirm({ title: 'Atenção', message: warns.join('\n\n') + '\n\nDeseja salvar mesmo assim?', confirmLabel: 'Salvar mesmo assim' });
      if (!ok) return;
    }
    const done = commit((s) => (initial ? updateTransaction(s, initial.id, t) : addTransaction(s, t)), initial ? 'Lançamento atualizado.' : 'Lançamento registrado — saldos atualizados.');
    if (done) onClose();
    else toast('Revise os campos do lançamento.', 'error');
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? 'Editar lançamento' : 'Novo lançamento'}
      footer={<><button className="btn-ghost" onClick={onClose}>Cancelar</button><button className="btn-primary" onClick={submit}>{isEdit ? 'Salvar alterações' : 'Registrar'}</button></>}
    >
      <form className="grid gap-3.5 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <div className="sm:col-span-2">
          <div className="flex flex-wrap gap-1.5">
            {TYPES.map((t) => (
              <button type="button" key={t} onClick={() => setType(t)} disabled={isEdit && initial?.obligationId != null && t !== initial.type}
                className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-semibold transition ${type === t ? 'bg-brand text-white' : 'bg-tint text-muted hover:text-brand'}`}>
                {TX_LABEL[t]}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">{HINTS[type]}</p>
        </div>

        <Field label="Descrição" className="sm:col-span-2">
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Almoço, Mensalidade…" autoFocus />
        </Field>
        <Field label="Valor (R$)"><MoneyInput value={amount} onChange={setAmount} /></Field>
        <Field label="Data"><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>

        {(type === 'expense' || type === 'installment') && (
          <Field label="Conta de onde saiu"><AccountSelect value={fromId} onChange={setFromId} includeId={src.fromAccountId ?? undefined} /></Field>
        )}
        {type === 'income' && <Field label="Conta que recebeu"><AccountSelect value={toId} onChange={setToId} includeId={src.toAccountId ?? undefined} /></Field>}
        {type === 'transfer' && (
          <>
            <Field label="Conta de origem"><AccountSelect value={fromId} onChange={setFromId} allowEmpty={historical} emptyLabel={historical ? 'Não especificada' : 'Selecione…'} includeId={src.fromAccountId ?? undefined} /></Field>
            <Field label="Conta de destino"><AccountSelect value={toId} onChange={setToId} allowEmpty={historical} emptyLabel={historical ? 'Não especificada' : 'Selecione…'} includeId={src.toAccountId ?? undefined} /></Field>
          </>
        )}
        {type === 'application' && (
          <>
            <Field label="Conta de origem"><AccountSelect value={fromId} onChange={setFromId} allowEmpty={historical} includeId={src.fromAccountId ?? undefined} /></Field>
            <DestPicker mode={appDest} setMode={setAppDest} label="Destino da aplicação" invId={invId} setInvId={setInvId} accId={toId} setAccId={setToId} savings={savingsAccounts} />
          </>
        )}
        {type === 'redemption' && (
          <>
            <DestPicker mode={appDest} setMode={setAppDest} label="Origem do resgate" invId={invId} setInvId={setInvId} accId={fromId} setAccId={setFromId} savings={savingsAccounts} />
            <Field label="Conta que recebe o dinheiro"><AccountSelect value={toId} onChange={setToId} allowEmpty={historical} includeId={src.toAccountId ?? undefined} /></Field>
          </>
        )}
        {type === 'adjustment' && (
          <>
            <Field label="Conta a ajustar"><AccountSelect value={toId} onChange={setToId} includeId={src.toAccountId ?? undefined} /></Field>
            <Field label="O ajuste…">
              <select className="input" value={direction} onChange={(e) => setDirection(e.target.value as 'in' | 'out')}>
                <option value="in">Aumenta o saldo</option>
                <option value="out">Diminui o saldo</option>
              </select>
            </Field>
          </>
        )}
        {type === 'installment' && (
          <>
            <Field label="Dívida / contrato (opcional)">
              <select className="input" value={obId} onChange={(e) => { setObId(e.target.value); setInstNo(''); }} disabled={isEdit && !!initial?.obligationId}>
                <option value="">Sem vínculo</option>
                {obligations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </Field>
            {obId && (
              <Field label="Nº da parcela" hint="Parcelas já quitadas não aparecem.">
                <select className="input" value={instNo} onChange={(e) => setInstNo(e.target.value)} disabled={isEdit && !!initial?.obligationId}>
                  <option value="">Selecione…</option>
                  {unpaid.map((n) => <option key={n} value={n}>Parcela {n}</option>)}
                </select>
              </Field>
            )}
          </>
        )}

        {showCat && (
          <Field label="Categoria" hint="Sem categoria = “A classificar”.">
            <CategorySelect value={categoryId} onChange={setCategoryId} kind={isIncomeCat ? 'income' : 'expense'} />
          </Field>
        )}
        <Field label="Situação">
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="confirmed">Confirmado (movimenta o saldo)</option>
            <option value="pending">Pendente (previsto — não movimenta o saldo)</option>
            <option value="to_classify">A classificar (movimenta o saldo)</option>
          </select>
        </Field>
        <Field label="Observações" className="sm:col-span-2">
          <textarea className="input min-h-16" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <label className="flex items-start gap-2 text-xs text-muted sm:col-span-2">
          <input type="checkbox" className="mt-0.5 accent-[#7C3AED]" checked={historical} onChange={(e) => setHistorical(e.target.checked)} />
          <span>Apenas registro histórico: este valor <b>já está refletido</b> no saldo de referência da conta e não deve alterar saldos (evita contar duas vezes).</span>
        </label>
        {error && <div className="rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad sm:col-span-2">{error}</div>}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

function DestPicker(p: {
  mode: 'investment' | 'account'; setMode: (m: 'investment' | 'account') => void; label: string;
  invId: string; setInvId: (v: string) => void; accId: string; setAccId: (v: string) => void; savings: Array<{ id: string; name: string }>;
}) {
  const { state } = useApp();
  return (
    <div>
      <span className="label">{p.label}</span>
      <div className="mb-1.5 flex gap-1.5 text-xs">
        {(['account', 'investment'] as const).map((m) => (
          <button key={m} type="button" onClick={() => p.setMode(m)} className={`cursor-pointer rounded-full px-2.5 py-1 font-semibold ${p.mode === m ? 'bg-brand text-white' : 'bg-tint text-muted'}`}>
            {m === 'account' ? 'Caixinha / cofrinho' : 'Investimento'}
          </button>
        ))}
      </div>
      {p.mode === 'investment' ? (
        <select className="input" value={p.invId} onChange={(e) => p.setInvId(e.target.value)}>
          <option value="">Selecione…</option>
          {state.investments.filter((i) => !i.archived).map((i) => <option key={i.id} value={i.id}>{i.name} — {i.institution}</option>)}
        </select>
      ) : (
        <select className="input" value={p.accId} onChange={(e) => p.setAccId(e.target.value)}>
          <option value="">Selecione…</option>
          {p.savings.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      )}
    </div>
  );
}
