import { useState } from 'react';
import { Minus, Pencil, Plus, Trash2 } from 'lucide-react';
import { useApp } from '../store';
import type { Goal } from '../lib/types';
import { addContribution, deleteGoal, removeContribution, saveGoal } from '../lib/ops';
import { computeTotals, goalAccumulated } from '../lib/selectors';
import { brl, daysDiff, fmtDate, numToInput, parseMoney, pct } from '../lib/utils';
import { Badge, Card, Empty, Field, Modal, MoneyInput, Notice, PageHeader, Progress, Stat } from '../components/ui';

const PRIO = { alta: ['Prioridade alta', 'bad'], media: ['Prioridade média', 'warn'], baixa: ['Prioridade baixa', 'muted'] } as const;

export default function Goals() {
  const { state, today, commit, confirm } = useApp();
  const [edit, setEdit] = useState<Goal | 'new' | null>(null);
  const [contrib, setContrib] = useState<{ goal: Goal; sign: 1 | -1 } | null>(null);
  const [hist, setHist] = useState<string | null>(null);
  const totals = computeTotals(state, today);
  const allocated = state.goals.reduce((s, g) => s + goalAccumulated(g), 0);

  const remove = async (g: Goal) => {
    const ok = await confirm({ title: `Excluir a meta “${g.name}”?`, message: 'O valor separado volta a ficar livre (nenhum dinheiro é movimentado).', danger: true, confirmLabel: 'Excluir' });
    if (ok) commit((s) => deleteGoal(s, g.id), 'Meta excluída.');
  };

  return (
    <div>
      <PageHeader title="Metas financeiras" subtitle="Separar valor para uma meta é uma reserva virtual: você escolhe quanto — nada é destinado automaticamente e o dinheiro não sai da conta." actions={<button className="btn-primary" onClick={() => setEdit('new')}><Plus className="h-4 w-4" />Nova meta</button>} />

      <div className="mb-4 grid grid-cols-3 gap-3">
        <Stat label="Patrimônio" value={brl(totals.patrimony)} />
        <Stat label="Separado nas metas" value={brl(allocated)} />
        <Stat label="Livre (não destinado)" value={brl(totals.patrimony - allocated)} tone="ok" />
      </div>

      {state.goals.length === 0 && <Empty>Nenhuma meta cadastrada.</Empty>}
      <div className="grid gap-4 lg:grid-cols-2">
        {[...state.goals].sort((a, b) => ['alta', 'media', 'baixa'].indexOf(a.priority) - ['alta', 'media', 'baixa'].indexOf(b.priority)).map((g) => {
          const acc = goalAccumulated(g);
          const p = Math.min(100, (acc / g.target) * 100);
          const left = Math.max(0, g.target - acc);
          const days = g.deadline ? daysDiff(today, g.deadline) : null;
          const months = days != null ? Math.max(1, Math.ceil(days / 30.4)) : null;
          const linked = g.linkedAccountId ? state.accounts.find((a) => a.id === g.linkedAccountId)?.name : g.linkedInvestmentId ? state.investments.find((i) => i.id === g.linkedInvestmentId)?.name : null;
          const [prLabel, prTone] = PRIO[g.priority];
          return (
            <Card key={g.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><h3 className="text-base font-bold">{g.name}</h3><p className="text-xs text-muted">{g.deadline ? `Prazo: ${fmtDate(g.deadline)}${days != null ? (days >= 0 ? ` (${days} dias)` : ' — prazo vencido') : ''}` : 'Sem prazo definido'}{linked ? ` · ${linked}` : ''}</p></div>
                <Badge tone={prTone}>{prLabel}</Badge>
              </div>
              <div className="mt-4 flex items-end justify-between"><span className="text-2xl font-bold tabular-nums">{pct(p, 1)}</span><span className="text-xs text-muted">{brl(acc)} de {brl(g.target)}</span></div>
              <div className="mt-1.5"><Progress value={p} tone={p >= 100 ? 'ok' : 'brand'} height="h-2.5" /></div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-xl bg-tint/60 p-2.5"><div className="text-[11px] font-semibold text-muted">Falta</div><div className="font-bold tabular-nums">{brl(left)}</div></div>
                <div className="rounded-xl bg-tint/60 p-2.5"><div className="text-[11px] font-semibold text-muted">{months && left > 0 ? `Para cumprir o prazo` : 'Contribuições'}</div><div className="font-bold tabular-nums">{months && left > 0 ? `${brl(left / months)}/mês` : g.contributions.length}</div></div>
              </div>
              {g.notes && <p className="mt-2 text-xs text-muted">{g.notes}</p>}
              <div className="mt-3 flex flex-wrap gap-1.5">
                <button className="btn-primary btn-sm" onClick={() => setContrib({ goal: g, sign: 1 })}><Plus className="h-3.5 w-3.5" />Separar valor</button>
                <button className="btn-ghost btn-sm" onClick={() => setContrib({ goal: g, sign: -1 })} disabled={acc <= 0}><Minus className="h-3.5 w-3.5" />Retirar</button>
                <button className="btn-ghost btn-sm" onClick={() => setHist(hist === g.id ? null : g.id)}>Histórico ({g.contributions.length})</button>
                <button className="btn-ghost btn-sm" onClick={() => setEdit(g)}><Pencil className="h-3.5 w-3.5" /></button>
                <button className="btn-danger btn-sm" onClick={() => remove(g)}><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
              {hist === g.id && (
                <ul className="mt-3 divide-y divide-line rounded-xl border border-line px-3 text-sm">
                  {g.contributions.length === 0 && <li className="py-3 text-muted">Nenhuma contribuição ainda.</li>}
                  {[...g.contributions].sort((a, b) => b.date.localeCompare(a.date)).map((c) => (
                    <li key={c.id} className="flex items-center gap-2 py-2">
                      <span className="w-24 text-xs text-muted">{fmtDate(c.date)}</span>
                      <b className={`tabular-nums ${c.amount < 0 ? 'text-bad' : 'text-ok'}`}>{c.amount > 0 ? '+' : '−'}{brl(Math.abs(c.amount))}</b>
                      <span className="flex-1 truncate text-xs text-muted">{c.note}</span>
                      <button className="text-muted hover:text-bad" onClick={() => commit((s) => removeContribution(s, g.id, c.id), 'Contribuição removida.')} aria-label="Remover"><Trash2 className="h-3.5 w-3.5" /></button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })}
      </div>

      {edit && <GoalForm goal={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
      {contrib && <ContribForm goal={contrib.goal} sign={contrib.sign} free={totals.patrimony - allocated} onClose={() => setContrib(null)} />}
    </div>
  );
}

function ContribForm({ goal, sign, free, onClose }: { goal: Goal; sign: 1 | -1; free: number; onClose: () => void }) {
  const { today, commit } = useApp();
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  return (
    <Modal open onClose={onClose} title={`${sign > 0 ? 'Separar valor para' : 'Retirar valor de'} ${goal.name}`} footer={<><button className="btn-ghost" onClick={onClose}>Cancelar</button><button className="btn-primary" onClick={() => { if (commit((s) => addContribution(s, goal.id, sign * parseMoney(amount), date, note), sign > 0 ? 'Valor separado para a meta.' : 'Valor retirado da meta.')) onClose(); }}>Confirmar</button></>}>
      <div className="grid gap-3.5">
        {sign > 0 && <Notice tone="muted">Disponível para separar (patrimônio ainda não destinado): <b>{brl(free)}</b>.</Notice>}
        <Field label="Valor (R$)"><MoneyInput value={amount} onChange={setAmount} autoFocus /></Field>
        <Field label="Data"><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Observação"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function GoalForm({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  const { state, commit } = useApp();
  const [name, setName] = useState(goal?.name ?? '');
  const [target, setTarget] = useState(numToInput(goal?.target));
  const [deadline, setDeadline] = useState(goal?.deadline ?? '');
  const [prio, setPrio] = useState<Goal['priority']>(goal?.priority ?? 'media');
  const [link, setLink] = useState(goal?.linkedAccountId ? 'a:' + goal.linkedAccountId : goal?.linkedInvestmentId ? 'i:' + goal.linkedInvestmentId : '');
  const [notes, setNotes] = useState(goal?.notes ?? '');
  const [emergency, setEmergency] = useState(goal?.emergency ?? false);
  return (
    <Modal open onClose={onClose} title={goal ? 'Editar meta' : 'Nova meta'} footer={<><button className="btn-ghost" onClick={onClose}>Cancelar</button><button className="btn-primary" onClick={() => { if (commit((s) => saveGoal(s, { id: goal?.id, name, target: parseMoney(target), deadline: deadline || null, priority: prio, linkedAccountId: link.startsWith('a:') ? link.slice(2) : null, linkedInvestmentId: link.startsWith('i:') ? link.slice(2) : null, notes, emergency }), 'Meta salva.')) onClose(); }}>Salvar</button></>}>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field label="Nome" className="sm:col-span-2"><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        <Field label="Valor desejado (R$)"><MoneyInput value={target} onChange={setTarget} /></Field>
        <Field label="Prazo"><input type="date" className="input" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></Field>
        <Field label="Prioridade"><select className="input" value={prio} onChange={(e) => setPrio(e.target.value as Goal['priority'])}><option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option></select></Field>
        <Field label="Conta ou investimento associado">
          <select className="input" value={link} onChange={(e) => setLink(e.target.value)}>
            <option value="">Nenhum</option>
            {state.accounts.filter((a) => !a.archived).map((a) => <option key={a.id} value={'a:' + a.id}>{a.name}</option>)}
            {state.investments.filter((i) => !i.archived).map((i) => <option key={i.id} value={'i:' + i.id}>{i.name}</option>)}
          </select>
        </Field>
        <Field label="Observações" className="sm:col-span-2"><textarea className="input min-h-16" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="accent-[#7C3AED]" checked={emergency} onChange={(e) => setEmergency(e.target.checked)} />É a minha reserva de emergência (aparece no dashboard)</label>
      </div>
    </Modal>
  );
}
