import { useState } from 'react';
import { Check, ChevronDown, ChevronUp, Undo2 } from 'lucide-react';
import { useApp } from '../store';
import { payInstallment, undoInstallment } from '../lib/ops';
import { installmentDue, obligationProgress, type ObRef } from '../lib/selectors';
import { brl, fmtDate, numToInput, parseMoney } from '../lib/utils';
import { AccountSelect, Badge, Field, Modal, MoneyInput, Notice } from './ui';
import { accName } from './TxItem';

export function useCanPay(target: ObRef): { canPay: boolean; receivable: boolean; reason: string } {
  const receivable = target.kind === 'debt' && target.ob.direction === 'receivable';
  if (target.kind === 'debt' && target.ob.direction === 'unknown') return { canPay: false, receivable, reason: 'Defina antes se você deve ou se alguém deve a você.' };
  if (target.kind === 'contract' && (target.ob.contractStatus === 'cancelled' || target.ob.contractStatus === 'paid_off')) return { canPay: false, receivable, reason: 'Contrato encerrado.' };
  return { canPay: true, receivable, reason: '' };
}

/** Botão PAGAR PARCELA + cronograma com pagamento/estorno por parcela. */
export function Installments({ target, open: initialOpen = false }: { target: ObRef; open?: boolean }) {
  const { state, today, commit, confirm } = useApp();
  const [open, setOpen] = useState(initialOpen);
  const [paying, setPaying] = useState<number | null>(null);
  const { canPay, receivable, reason } = useCanPay(target);
  const ob = target.ob;
  const p = obligationProgress(state, ob);
  const verb = receivable ? 'RECEBER PARCELA' : 'PAGAR PARCELA';

  const undo = async (txId: string, no: number) => {
    const ok = await confirm({
      title: `Desfazer ${receivable ? 'recebimento' : 'pagamento'} da parcela ${no}?`,
      message: `O valor será estornado ${receivable ? 'da' : 'para a'} conta, a parcela voltará a ficar em aberto e o saldo devedor será recalculado.`,
      confirmLabel: 'Desfazer', danger: true,
    });
    if (ok) commit((s) => undoInstallment(s, txId), 'Pagamento desfeito e valor estornado.');
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {p.nextNo ? (
          <button className="btn-primary" disabled={!canPay} onClick={() => setPaying(p.nextNo)} title={reason}><Check className="h-4 w-4" />{verb} {p.nextNo}/{ob.totalInstallments}</button>
        ) : <Badge tone="ok">Todas as parcelas quitadas</Badge>}
        <button className="btn-ghost" onClick={() => setOpen(!open)}>{open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}Parcelas e histórico</button>
      </div>
      {!canPay && p.nextNo && <p className="mt-1.5 text-xs text-warn">{reason}</p>}

      {open && (
        <div className="mt-3 overflow-hidden rounded-xl border border-line">
          {Array.from({ length: ob.totalInstallments }, (_, i) => i + 1).map((no) => {
            const paid = p.paidNos.has(no);
            const tx = p.txByNo.get(no);
            const due = installmentDue(ob, no);
            const late = !paid && due && due < today;
            return (
              <div key={no} className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2 text-sm last:border-b-0">
                <span className="w-16 font-semibold">Parcela {no}</span>
                <span className="w-24 text-xs text-muted">{due ? fmtDate(due) : 'sem data'}</span>
                <span className="w-24 tabular-nums">{brl(tx ? tx.amount : ob.installmentAmount)}</span>
                <span className="flex-1">
                  {paid ? <Badge tone="ok">{receivable ? 'Recebida' : 'Paga'}{tx ? ` em ${fmtDate(tx.date)} · ${accName(state, tx.fromAccountId ?? tx.toAccountId)}` : ' (antes do sistema)'}</Badge>
                    : late ? <Badge tone="bad">Atrasada</Badge> : <Badge tone="warn">Em aberto</Badge>}
                </span>
                {paid ? (
                  tx ? <button className="btn-ghost btn-sm" onClick={() => undo(tx.id, no)}><Undo2 className="h-3.5 w-3.5" />Desfazer</button>
                    : <span className="text-[11px] text-muted">ajuste em “Editar”</span>
                ) : (
                  <button className="btn-primary btn-sm" disabled={!canPay} onClick={() => setPaying(no)}>{verb}</button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {paying != null && <PayModal target={target} no={paying} onClose={() => setPaying(null)} />}
    </div>
  );
}

function PayModal({ target, no, onClose }: { target: ObRef; no: number; onClose: () => void }) {
  const { state, today, commit } = useApp();
  const ob = target.ob;
  const first = state.accounts.find((a) => !a.archived && a.kind === 'checking')?.id ?? '';
  const [acc, setAcc] = useState(ob.accountId && state.accounts.some((a) => a.id === ob.accountId && !a.archived) ? ob.accountId : first);
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState(numToInput(ob.installmentAmount));
  const { receivable } = useCanPay(target);
  const submit = () => {
    const ok = commit((s) => payInstallment(s, { obligationId: ob.id, no, accountId: acc, date, amount: parseMoney(amount) }), receivable ? 'Recebimento registrado.' : 'Parcela paga — saldo, dívida e histórico atualizados.');
    if (ok) onClose();
  };
  return (
    <Modal open onClose={onClose} title={`${receivable ? 'Receber' : 'Pagar'} parcela ${no}/${ob.totalInstallments}`} footer={<><button className="btn-ghost" onClick={onClose}>Cancelar</button><button className="btn-primary" onClick={submit}>Confirmar {receivable ? 'recebimento' : 'pagamento'}</button></>}>
      <div className="grid gap-3.5">
        <p className="text-sm"><b>{ob.name}</b></p>
        <Notice tone="muted">
          {receivable ? 'O valor será somado ao saldo da conta escolhida.' : 'O valor será descontado da conta escolhida, registrado como despesa e a parcela ficará quitada (não poderá ser paga de novo).'}
        </Notice>
        <Field label={receivable ? 'Conta que recebeu' : 'Conta usada no pagamento'}><AccountSelect value={acc} onChange={setAcc} /></Field>
        <Field label="Valor (R$)" hint={`Valor cadastrado da parcela: ${brl(ob.installmentAmount)}. Altere se o valor real foi diferente.`}><MoneyInput value={amount} onChange={setAmount} /></Field>
        <Field label="Data"><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
