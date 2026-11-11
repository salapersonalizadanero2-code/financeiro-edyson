import { useState } from 'react';
import { Gavel, Pencil, Plus, Trash2 } from 'lucide-react';
import { useApp } from '../store';
import type { Contract } from '../lib/types';
import { addBid, amortize, deleteContract, removeBid, saveContract } from '../lib/ops';
import { obligationBalance, obligationProgress } from '../lib/selectors';
import { brl, fmtDate, numToInput, parseMoney } from '../lib/utils';
import { AccountSelect, Badge, Card, Empty, Field, Modal, MoneyInput, Notice, PageHeader, Progress, Stat } from '../components/ui';
import { Installments } from '../components/Installments';
import { accName } from '../components/TxItem';

const STATUS: Record<Contract['contractStatus'], string> = { active: 'Ativo', contemplated: 'Contemplado', paid_off: 'Quitado', cancelled: 'Cancelado' };

export default function Contracts() {
  const { state, today, commit, confirm } = useApp();
  const [edit, setEdit] = useState<Contract | 'new' | null>(null);
  const [bid, setBid] = useState<Contract | null>(null);
  const [amort, setAmort] = useState<Contract | null>(null);

  const active = state.contracts.filter((c) => c.contractStatus !== 'cancelled' && c.contractStatus !== 'paid_off');
  const balance = active.reduce((s, c) => s + obligationBalance(state, { kind: 'contract', ob: c }), 0);
  const monthly = active.reduce((s, c) => s + (obligationProgress(state, c).remaining > 0 ? c.installmentAmount : 0), 0);

  const remove = async (c: Contract) => {
    const ok = await confirm({ title: `Excluir “${c.name}”?`, message: 'Só é possível se não houver pagamentos registrados neste contrato.', danger: true, confirmLabel: 'Excluir' });
    if (ok) commit((s) => deleteContract(s, c.id), 'Contrato excluído.');
  };

  const Info = ({ k, v }: { k: string; v: string | null }) => (v ? <div className="rounded-xl bg-tint/60 p-2.5"><div className="text-[11px] font-semibold text-muted">{k}</div><div className="text-sm font-bold">{v}</div></div> : null);
  const money = (n: number | null) => (n != null ? brl(n) : null);
  const pc = (n: number | null) => (n != null ? `${String(n).replace('.', ',')}%` : null);

  return (
    <div>
      <PageHeader title="Consórcios e financiamentos" subtitle="Contratos de longo prazo. Só aparecem aqui os dados que você informar — nenhuma taxa ou condição é inventada." actions={<button className="btn-primary" onClick={() => setEdit('new')}><Plus className="h-4 w-4" />Novo contrato</button>} />

      <div className="mb-4 grid grid-cols-3 gap-3">
        <Stat label="Contratos ativos" value={String(active.length)} />
        <Stat label="Saldo devedor" value={brl(balance)} tone="bad" />
        <Stat label="Parcelas mensais" value={brl(monthly)} tone="warn" />
      </div>

      {state.contracts.length === 0 && <Empty>Nenhum consórcio ou financiamento cadastrado. Use “Novo contrato” quando quiser acompanhar um.</Empty>}

      <div className="grid gap-4">
        {state.contracts.map((c) => {
          const p = obligationProgress(state, c);
          const isC = c.kind === 'consorcio';
          const bal = obligationBalance(state, { kind: 'contract', ob: c });
          const amortTxs = state.transactions.filter((t) => t.obligationId === c.id && t.installmentNo == null && t.type === 'expense');
          return (
            <Card key={c.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold">{c.name}</h3>
                  <p className="text-xs text-muted">{c.institution || 'Instituição não informada'}</p>
                </div>
                <div className="flex gap-1.5"><Badge tone="brand">{isC ? 'Consórcio' : 'Financiamento'}</Badge><Badge tone={c.contractStatus === 'active' ? 'warn' : c.contractStatus === 'cancelled' ? 'muted' : 'ok'}>{STATUS[c.contractStatus]}</Badge></div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                <Info k="Valor do bem" v={money(c.assetValue)} />
                <Info k="Entrada" v={money(c.downPayment)} />
                <Info k={isC ? 'Carta de crédito' : 'Valor financiado'} v={money(isC ? c.creditLetter : c.financedAmount)} />
                <Info k="Parcela" v={brl(c.installmentAmount)} />
                <Info k="Parcelas pagas" v={`${p.paid} de ${c.totalInstallments}`} />
                <Info k="Restantes" v={String(p.remaining)} />
                <Info k="Saldo devedor" v={brl(bal) + (c.balanceOverride != null ? '' : ' (calculado)')} />
                <Info k="Próx. vencimento" v={p.nextDue ? fmtDate(p.nextDue) : null} />
                <Info k="Prazo total" v={c.termMonths != null ? `${c.termMonths} meses` : null} />
                <Info k="Taxa de administração" v={pc(c.adminFeePct)} />
                <Info k="Fundo de reserva" v={pc(c.reserveFundPct)} />
                <Info k="Seguro" v={money(c.insurance)} />
                <Info k="Taxa de juros" v={pc(c.interestRate)} />
                <Info k="CET" v={pc(c.cet)} />
                <Info k="Grupo / cota" v={c.group || c.quota ? `${c.group || '—'} / ${c.quota || '—'}` : null} />
                <Info k="Administradora" v={c.administrator || null} />
                <Info k="Conta de pagamento" v={c.accountId ? accName(state, c.accountId) : null} />
              </div>
              <div className="my-3"><Progress value={(p.paid / c.totalInstallments) * 100} tone={p.remaining === 0 ? 'ok' : 'brand'} /></div>
              {c.notes && <p className="mb-3 text-xs text-muted">{c.notes}</p>}

              {isC && (
                <div className="mb-3 rounded-xl border border-line p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold">Lances e contemplação</span>
                    <button className="btn-soft btn-sm" onClick={() => setBid(c)}><Gavel className="h-3.5 w-3.5" />Registrar lance</button>
                  </div>
                  <p className="mt-1 text-xs text-muted">{c.contemplationDate ? `Contemplado em ${fmtDate(c.contemplationDate)}. ${c.contemplationNote}` : 'Ainda não contemplado.'}</p>
                  {c.bids.length > 0 && (
                    <ul className="mt-2 divide-y divide-line text-sm">
                      {c.bids.map((b) => (
                        <li key={b.id} className="flex items-center gap-2 py-1.5">
                          <span className="w-24 text-xs text-muted">{fmtDate(b.date)}</span><b className="tabular-nums">{brl(b.amount)}</b><span className="flex-1 truncate text-xs text-muted">{b.note}</span>
                          <button className="text-muted hover:text-bad" onClick={() => commit((s) => removeBid(s, c.id, b.id), 'Lance removido.')} aria-label="Remover"><Trash2 className="h-3.5 w-3.5" /></button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-1 text-[11px] text-muted">O lance é um registro informativo. Se pagou o lance com dinheiro seu, lance também a despesa/amortização.</p>
                </div>
              )}
              {!isC && (
                <div className="mb-3 rounded-xl border border-line p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold">Amortizações {amortTxs.length > 0 && `(${brl(p.amortized)})`}</span>
                    <button className="btn-soft btn-sm" onClick={() => setAmort(c)}><Plus className="h-3.5 w-3.5" />Registrar amortização</button>
                  </div>
                  {amortTxs.length === 0 ? <p className="mt-1 text-xs text-muted">Nenhuma amortização registrada.</p> : (
                    <ul className="mt-2 divide-y divide-line text-sm">
                      {amortTxs.map((t) => <li key={t.id} className="flex items-center gap-2 py-1.5"><span className="w-24 text-xs text-muted">{fmtDate(t.date)}</span><b className="tabular-nums">{brl(t.amount)}</b><span className="flex-1 truncate text-xs text-muted">{accName(state, t.fromAccountId)} {t.notes}</span></li>)}
                    </ul>
                  )}
                </div>
              )}

              <Installments target={{ kind: 'contract', ob: c }} />
              <div className="mt-3 flex gap-1.5 border-t border-line pt-3">
                <button className="btn-ghost btn-sm" onClick={() => setEdit(c)}><Pencil className="h-3.5 w-3.5" />Editar</button>
                <button className="btn-danger btn-sm" onClick={() => remove(c)}><Trash2 className="h-3.5 w-3.5" />Excluir</button>
              </div>
            </Card>
          );
        })}
      </div>

      {edit && <ContractForm contract={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
      {bid && <BidForm contract={bid} onClose={() => setBid(null)} today={today} />}
      {amort && <AmortForm contract={amort} onClose={() => setAmort(null)} />}
    </div>
  );
}

function BidForm({ contract, onClose, today }: { contract: Contract; onClose: () => void; today: string }) {
  const { commit } = useApp();
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  return (
    <Modal open onClose={onClose} title={`Registrar lance — ${contract.name}`} footer={<><button className="btn-ghost" onClick={onClose}>Cancelar</button><button className="btn-primary" onClick={() => { if (commit((s) => addBid(s, contract.id, { date, amount: parseMoney(amount), note }), 'Lance registrado.')) onClose(); }}>Salvar</button></>}>
      <div className="grid gap-3.5">
        <Field label="Valor do lance (R$)"><MoneyInput value={amount} onChange={setAmount} autoFocus /></Field>
        <Field label="Data"><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Observação (ofertado, contemplado…)"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function AmortForm({ contract, onClose }: { contract: Contract; onClose: () => void }) {
  const { today, commit } = useApp();
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState('');
  const [acc, setAcc] = useState(contract.accountId ?? '');
  const [note, setNote] = useState('');
  return (
    <Modal open onClose={onClose} title={`Amortização — ${contract.name}`} footer={<><button className="btn-ghost" onClick={onClose}>Cancelar</button><button className="btn-primary" onClick={() => { if (commit((s) => amortize(s, { contractId: contract.id, amount: parseMoney(amount), date, accountId: acc, note }), 'Amortização registrada — saldo da conta e do contrato atualizados.')) onClose(); }}>Registrar</button></>}>
      <div className="grid gap-3.5">
        <Notice tone="muted">O valor sai da conta escolhida (despesa de dívida) e reduz o saldo devedor calculado.</Notice>
        <Field label="Valor amortizado (R$)"><MoneyInput value={amount} onChange={setAmount} autoFocus /></Field>
        <Field label="Conta"><AccountSelect value={acc} onChange={setAcc} /></Field>
        <Field label="Data"><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Observação"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

type F = Record<string, string>;
const N = (s: string) => (s.trim() ? parseMoney(s) : null);

function ContractForm({ contract: c, onClose }: { contract: Contract | null; onClose: () => void }) {
  const { commit } = useApp();
  const [kind, setKind] = useState<Contract['kind']>(c?.kind ?? 'financiamento');
  const [status, setStatus] = useState<Contract['contractStatus']>(c?.contractStatus ?? 'active');
  const [f, setF] = useState<F>({
    name: c?.name ?? '', institution: c?.institution ?? '', assetValue: numToInput(c?.assetValue), downPayment: numToInput(c?.downPayment),
    creditLetter: numToInput(c?.creditLetter), financedAmount: numToInput(c?.financedAmount), adminFeePct: numToInput(c?.adminFeePct),
    interestRate: numToInput(c?.interestRate), cet: numToInput(c?.cet), termMonths: c?.termMonths != null ? String(c.termMonths) : '',
    total: String(c?.totalInstallments ?? ''), inst: numToInput(c?.installmentAmount), paid: String(c?.paidBefore ?? 0), due: c?.firstDueDate ?? '',
    acc: c?.accountId ?? '', group: c?.group ?? '', quota: c?.quota ?? '', administrator: c?.administrator ?? '', reserve: numToInput(c?.reserveFundPct),
    insurance: numToInput(c?.insurance), contDate: c?.contemplationDate ?? '', contNote: c?.contemplationNote ?? '', override: numToInput(c?.balanceOverride), notes: c?.notes ?? '',
  });
  const set = (k: string) => (v: string) => setF({ ...f, [k]: v });
  const inp = (k: string, label: string, props: { money?: boolean; type?: string; hint?: string; int?: boolean; cls?: string } = {}) => (
    <Field label={label} hint={props.hint} className={props.cls}>
      {props.money ? <MoneyInput value={f[k]} onChange={set(k)} /> : <input type={props.type ?? 'text'} className="input" inputMode={props.int ? 'numeric' : undefined} value={f[k]} onChange={(e) => set(k)(props.int ? e.target.value.replace(/\D/g, '') : e.target.value)} />}
    </Field>
  );
  const isC = kind === 'consorcio';

  const submit = () => {
    const base = c ?? { bids: [] as Contract['bids'] };
    const ok = commit((s) => saveContract(s, {
      id: c?.id, name: f.name, kind, institution: f.institution, assetValue: N(f.assetValue), downPayment: N(f.downPayment),
      creditLetter: isC ? N(f.creditLetter) : null, financedAmount: isC ? null : N(f.financedAmount), adminFeePct: isC ? N(f.adminFeePct) : null,
      interestRate: isC ? null : N(f.interestRate), cet: isC ? null : N(f.cet), termMonths: f.termMonths ? Number(f.termMonths) : null,
      totalInstallments: Number(f.total), installmentAmount: parseMoney(f.inst), paidBefore: Number(f.paid || 0), firstDueDate: f.due || null,
      accountId: f.acc || null, contractStatus: status, group: isC ? f.group : '', quota: isC ? f.quota : '', administrator: isC ? f.administrator : '',
      reserveFundPct: isC ? N(f.reserve) : null, insurance: N(f.insurance), bids: base.bids, contemplationDate: isC ? f.contDate || null : null,
      contemplationNote: isC ? f.contNote : '', balanceOverride: N(f.override), notes: f.notes,
    }), 'Contrato salvo.');
    if (ok) onClose();
  };

  return (
    <Modal open onClose={onClose} wide title={c ? 'Editar contrato' : 'Novo contrato'} footer={<><button className="btn-ghost" onClick={onClose}>Cancelar</button><button className="btn-primary" onClick={submit}>Salvar</button></>}>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field label="Modalidade">
          <div className="flex gap-1.5">
            {(['financiamento', 'consorcio'] as const).map((k) => <button key={k} type="button" onClick={() => setKind(k)} className={`flex-1 cursor-pointer rounded-xl px-3 py-2 text-sm font-semibold ${kind === k ? 'bg-brand text-white' : 'bg-tint text-muted'}`}>{k === 'consorcio' ? 'Consórcio' : 'Financiamento'}</button>)}
          </div>
        </Field>
        <Field label="Situação do contrato">
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as Contract['contractStatus'])}>
            {(Object.keys(STATUS) as Array<keyof typeof STATUS>).map((k) => <option key={k} value={k}>{STATUS[k]}</option>)}
          </select>
        </Field>
        {inp('name', 'Nome do bem', { cls: 'sm:col-span-2' })}
        {inp('institution', isC ? 'Instituição / administradora' : 'Instituição financeira')}
        {inp('assetValue', 'Valor do bem (R$)', { money: true })}
        {inp('downPayment', 'Valor de entrada (R$)', { money: true })}
        {isC ? inp('creditLetter', 'Carta de crédito (R$)', { money: true }) : inp('financedAmount', 'Valor financiado (R$)', { money: true })}
        {isC ? (
          <>
            {inp('group', 'Grupo')}{inp('quota', 'Cota')}{inp('administrator', 'Administradora')}
            {inp('adminFeePct', 'Taxa de administração (%)', { money: true })}{inp('reserve', 'Fundo de reserva (%)', { money: true })}
          </>
        ) : (
          <>{inp('interestRate', 'Taxa de juros (% — informe se souber)', { money: true })}{inp('cet', 'Custo efetivo total (% — se informado)', { money: true })}</>
        )}
        {inp('insurance', 'Seguro (R$, se houver)', { money: true })}
        {inp('termMonths', 'Prazo total (meses)', { int: true })}
        {inp('total', 'Quantidade de parcelas', { int: true })}
        {inp('inst', 'Valor da parcela (R$)', { money: true })}
        {inp('paid', 'Parcelas já pagas antes do sistema', { int: true })}
        {inp('due', 'Vencimento da parcela nº 1', { type: 'date' })}
        <Field label="Conta padrão de pagamento"><AccountSelect value={f.acc} onChange={set('acc')} allowEmpty emptyLabel="Escolher ao pagar" /></Field>
        {inp('override', 'Saldo devedor informado pela instituição (R$, opcional)', { money: true, hint: 'Se vazio, o sistema calcula: parcelas restantes × valor da parcela − amortizações.', cls: 'sm:col-span-2' })}
        {isC && <>{inp('contDate', 'Data da contemplação', { type: 'date' })}{inp('contNote', 'Observação da contemplação')}</>}
        <Field label="Observações" className="sm:col-span-2"><textarea className="input min-h-16" value={f.notes} onChange={(e) => set('notes')(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
