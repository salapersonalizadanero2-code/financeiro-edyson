import { useMemo, useState } from 'react';
import { Pencil, Plus, Tag, Trash2 } from 'lucide-react';
import { useApp } from '../store';
import { STATUS_LABEL, TX_LABEL, type Transaction, type TxStatus, type TxType } from '../lib/types';
import { categoryName, topCategory } from '../lib/selectors';
import { classifyTx, deleteTransaction } from '../lib/ops';
import { brl } from '../lib/utils';
import { Card, CategorySelect, Empty, Field, Modal, PageHeader } from '../components/ui';
import { TxItem } from '../components/TxItem';
import { TransactionForm } from '../components/TransactionForm';

export default function Transactions() {
  const { state, commit, confirm } = useApp();
  const [form, setForm] = useState<{ tx?: Transaction } | null>(null);
  const [classify, setClassify] = useState<Transaction | null>(null);
  const [f, setF] = useState({ year: '', month: '', account: '', category: '', type: '', status: '', q: '' });
  const [limit, setLimit] = useState(60);

  const years = useMemo(() => Array.from(new Set(state.transactions.map((t) => t.date.slice(0, 4)))).sort().reverse(), [state.transactions]);

  const rows = useMemo(() => {
    return state.transactions
      .filter((t) => {
        if (f.year && t.date.slice(0, 4) !== f.year) return false;
        if (f.month && t.date.slice(5, 7) !== f.month) return false;
        if (f.account && t.fromAccountId !== f.account && t.toAccountId !== f.account) return false;
        if (f.category === 'none' ? t.categoryId !== null : f.category && topCategory(state.categories, t.categoryId)?.id !== f.category && t.categoryId !== f.category) return false;
        if (f.type && t.type !== f.type) return false;
        if (f.status && t.status !== f.status) return false;
        if (f.q && !t.description.toLowerCase().includes(f.q.toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }, [state.transactions, state.categories, f]);

  const sum = useMemo(() => {
    let inc = 0, out = 0;
    for (const t of rows) {
      if (t.status === 'pending') continue;
      if (t.type === 'income') inc += t.amount;
      if (t.type === 'expense' || t.type === 'installment') out += t.amount;
    }
    return { inc, out };
  }, [rows]);

  const remove = async (t: Transaction) => {
    let extra = '';
    if (t.obligationId && t.installmentNo != null) extra = '\n\nIsso também desfaz o pagamento da parcela vinculada (a parcela volta a ficar em aberto).';
    if (t.refId) extra = '\n\nIsso também volta o recebimento previsto para “aguardando confirmação”.';
    if (!t.historical && t.status !== 'pending') extra += '\n\nOs saldos serão recalculados automaticamente (estorno).';
    const ok = await confirm({ title: 'Excluir lançamento?', message: `“${t.description}” — ${brl(t.amount)}.${extra}`, confirmLabel: 'Excluir', danger: true });
    if (ok) commit((s) => deleteTransaction(s, t.id), 'Lançamento excluído e saldos recalculados.');
  };

  const sel = (k: keyof typeof f, v: string) => { setF({ ...f, [k]: v }); setLimit(60); };
  const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
  const mNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

  return (
    <div>
      <PageHeader
        title="Lançamentos"
        subtitle="Registre uma vez: saldos, patrimônio, gráficos e relatórios são atualizados automaticamente."
        actions={<button className="btn-primary" onClick={() => setForm({})}><Plus className="h-4 w-4" />Novo lançamento</button>}
      />

      <Card className="mb-4">
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 lg:grid-cols-7">
          <Field label="Busca" className="col-span-2 md:col-span-4 lg:col-span-1"><input className="input" placeholder="Descrição…" value={f.q} onChange={(e) => sel('q', e.target.value)} /></Field>
          <Field label="Ano"><select className="input" value={f.year} onChange={(e) => sel('year', e.target.value)}><option value="">Todos</option>{years.map((y) => <option key={y}>{y}</option>)}</select></Field>
          <Field label="Mês"><select className="input" value={f.month} onChange={(e) => sel('month', e.target.value)}><option value="">Todos</option>{months.map((m, i) => <option key={m} value={m}>{mNames[i]}</option>)}</select></Field>
          <Field label="Conta"><select className="input" value={f.account} onChange={(e) => sel('account', e.target.value)}><option value="">Todas</option>{state.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
          <Field label="Categoria">
            <select className="input" value={f.category} onChange={(e) => sel('category', e.target.value)}>
              <option value="">Todas</option><option value="none">A classificar (sem categoria)</option>
              {state.categories.filter((c) => !c.parentId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Tipo"><select className="input" value={f.type} onChange={(e) => sel('type', e.target.value as TxType)}><option value="">Todos</option>{(Object.keys(TX_LABEL) as TxType[]).map((t) => <option key={t} value={t}>{TX_LABEL[t]}</option>)}</select></Field>
          <Field label="Situação"><select className="input" value={f.status} onChange={(e) => sel('status', e.target.value as TxStatus)}><option value="">Todas</option>{(Object.keys(STATUS_LABEL) as TxStatus[]).map((t) => <option key={t} value={t}>{STATUS_LABEL[t]}</option>)}</select></Field>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted">
          <span>{rows.length} lançamento(s)</span>
          <span>Receitas: <b className="text-ok">{brl(sum.inc)}</b></span>
          <span>Despesas: <b className="text-bad">{brl(sum.out)}</b></span>
          {Object.values(f).some(Boolean) && <button className="font-semibold text-brand" onClick={() => setF({ year: '', month: '', account: '', category: '', type: '', status: '', q: '' })}>Limpar filtros</button>}
        </div>
      </Card>

      <Card>
        {rows.length === 0 ? <Empty>Nenhum lançamento encontrado.</Empty> : (
          <div className="divide-y divide-line">
            {rows.slice(0, limit).map((t) => (
              <TxItem key={t.id} state={state} t={t} actions={<>
                {t.status === 'to_classify' && (t.type === 'income' || t.type === 'expense') && <button className="btn-soft btn-sm" onClick={() => setClassify(t)}><Tag className="h-3.5 w-3.5" />Classificar</button>}
                <button className="btn-ghost btn-sm" onClick={() => setForm({ tx: t })} aria-label="Editar"><Pencil className="h-3.5 w-3.5" /></button>
                <button className="btn-danger btn-sm" onClick={() => remove(t)} aria-label="Excluir"><Trash2 className="h-3.5 w-3.5" /></button>
              </>} />
            ))}
          </div>
        )}
        {rows.length > limit && <div className="mt-3 text-center"><button className="btn-ghost" onClick={() => setLimit(limit + 60)}>Mostrar mais</button></div>}
      </Card>

      {form && <TransactionForm initial={form.tx} onClose={() => setForm(null)} />}
      {classify && <ClassifyModal tx={classify} onClose={() => setClassify(null)} />}
    </div>
  );
}

function ClassifyModal({ tx, onClose }: { tx: Transaction; onClose: () => void }) {
  const { state, commit } = useApp();
  const [cat, setCat] = useState('');
  return (
    <Modal open onClose={onClose} title="Classificar lançamento" footer={<><button className="btn-ghost" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={!cat} onClick={() => { if (commit((s) => classifyTx(s, tx.id, cat), 'Lançamento classificado.')) onClose(); }}>Confirmar categoria</button></>}>
      <p className="mb-3 text-sm"><b>{tx.description}</b> — {brl(tx.amount)}</p>
      <Field label="Categoria"><CategorySelect value={cat} onChange={setCat} kind={tx.type === 'income' ? 'income' : 'expense'} emptyLabel="Escolha uma categoria…" /></Field>
      <p className="mt-2 text-xs text-muted">Categoria atual: {categoryName(state.categories, tx.categoryId)}. Se a transferência for de uma conta sua, edite o lançamento e mude o tipo para “Transferência”.</p>
    </Modal>
  );
}
