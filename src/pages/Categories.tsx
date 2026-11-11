import { useState } from 'react';
import { AlertTriangle, Pencil, Plus, Trash2 } from 'lucide-react';
import { useApp } from '../store';
import type { Category } from '../lib/types';
import { deleteCategory, saveCategory, updateSettings } from '../lib/ops';
import { limitStatus } from '../lib/selectors';
import { brl, monthLong, numToInput, parseMoney } from '../lib/utils';
import { Badge, Card, Field, Modal, MoneyInput, Notice, PageHeader, Progress } from '../components/ui';

export default function Categories() {
  const { state, ym, commit, confirm } = useApp();
  const [edit, setEdit] = useState<{ cat?: Category; parentId?: string | null; kind?: 'expense' | 'income' } | null>(null);
  const [min, setMin] = useState(numToInput(state.settings.spendEstimateMin));
  const [max, setMax] = useState(numToInput(state.settings.spendEstimateMax));
  const status = limitStatus(state, ym);
  const byId = Object.fromEntries(status.map((s) => [s.category.id, s]));
  const tops = state.categories.filter((c) => c.kind === 'expense' && !c.parentId);
  const alerts = status.filter((s) => s.level === 'warn' || s.level === 'over');

  const remove = async (c: Category) => {
    const ok = await confirm({ title: `Excluir “${c.name}”?`, message: 'Só é possível excluir categorias sem lançamentos e sem subcategorias.', danger: true, confirmLabel: 'Excluir' });
    if (ok) commit((s) => deleteCategory(s, c.id), 'Categoria excluída.');
  };

  const Row = ({ c, sub }: { c: Category; sub?: boolean }) => {
    const st = byId[c.id];
    return (
      <div className={`py-3 ${sub ? 'pl-5' : ''}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`${sub ? 'text-sm' : 'font-semibold'}`}>{sub ? '↳ ' : ''}{c.name}</span>
          {c.fixed && <Badge tone="brand">Fixa</Badge>}
          {st?.level === 'over' && <Badge tone="bad">Limite ultrapassado</Badge>}
          {st?.level === 'warn' && <Badge tone="warn">Perto do limite</Badge>}
          <span className="ml-auto text-sm tabular-nums">{brl(st?.spent ?? 0)}{c.limit ? <span className="text-muted"> / {brl(c.limit)}</span> : <span className="text-xs text-muted"> · sem limite</span>}</span>
          <div className="flex gap-1">
            {!sub && <button className="btn-soft btn-sm" onClick={() => setEdit({ parentId: c.id, kind: 'expense' })}><Plus className="h-3.5 w-3.5" />Sub</button>}
            <button className="btn-ghost btn-sm" onClick={() => setEdit({ cat: c })} aria-label="Editar"><Pencil className="h-3.5 w-3.5" /></button>
            <button className="btn-danger btn-sm" onClick={() => remove(c)} aria-label="Excluir"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        </div>
        {c.limit && <div className="mt-1.5"><Progress value={(st?.ratio ?? 0) * 100} tone={st?.level === 'over' ? 'bad' : st?.level === 'warn' ? 'warn' : 'brand'} height="h-1.5" /></div>}
      </div>
    );
  };

  return (
    <div>
      <PageHeader title="Despesas e categorias" subtitle={`Defina limites mensais e acompanhe os gastos de ${monthLong(ym)}.`} actions={<button className="btn-primary" onClick={() => setEdit({ kind: 'expense' })}><Plus className="h-4 w-4" />Nova categoria</button>} />

      {alerts.length > 0 && (
        <div className="mb-4 grid gap-2">
          {alerts.map((a) => (
            <Notice key={a.category.id} tone={a.level === 'over' ? 'bad' : 'warn'}>
              <AlertTriangle className="mr-1 inline h-4 w-4" />
              <b>{a.category.name}</b>: {brl(a.spent)} de {brl(a.category.limit)} ({Math.round(a.ratio * 100)}%) {a.level === 'over' ? '— limite ultrapassado.' : '— próximo de ultrapassar o limite.'}
            </Notice>
          ))}
        </div>
      )}

      <Card title="Referência de gastos pessoais mensais" className="mb-4">
        <p className="mb-3 text-xs text-muted">Sua estimativa anterior. É apenas uma <b>referência editável</b> usada no planejamento — não gera nenhuma despesa automática.</p>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Mínimo (R$)"><MoneyInput value={min} onChange={setMin} /></Field>
          <Field label="Máximo (R$)"><MoneyInput value={max} onChange={setMax} /></Field>
          <button className="btn-soft" onClick={() => commit((s) => updateSettings(s, { spendEstimateMin: parseMoney(min), spendEstimateMax: parseMoney(max) }), 'Referência atualizada.')}>Salvar referência</button>
        </div>
      </Card>

      <Card title="Categorias de despesa">
        <div className="divide-y divide-line">
          {tops.map((c) => (
            <div key={c.id}>
              <Row c={c} />
              {state.categories.filter((s) => s.parentId === c.id).map((s) => <Row key={s.id} c={s} sub />)}
            </div>
          ))}
        </div>
      </Card>

      <Card title="Categorias de receita" className="mt-4">
        <div className="flex flex-wrap gap-2">
          {state.categories.filter((c) => c.kind === 'income' && !c.parentId).map((c) => (
            <span key={c.id} className="inline-flex items-center gap-1 rounded-full bg-tint py-1 pr-1 pl-3 text-sm">
              {c.name}
              <button className="rounded-full p-1.5 hover:bg-brand/10" onClick={() => setEdit({ cat: c })} aria-label="Editar"><Pencil className="h-3 w-3" /></button>
              <button className="rounded-full p-1.5 hover:bg-bad/10 hover:text-bad" onClick={() => remove(c)} aria-label="Excluir"><Trash2 className="h-3 w-3" /></button>
            </span>
          ))}
          <button className="btn-soft btn-sm" onClick={() => setEdit({ kind: 'income' })}><Plus className="h-3.5 w-3.5" />Nova</button>
        </div>
      </Card>

      {edit && <CategoryForm {...edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function CategoryForm({ cat, parentId, kind, onClose }: { cat?: Category; parentId?: string | null; kind?: 'expense' | 'income'; onClose: () => void }) {
  const { state, commit } = useApp();
  const [name, setName] = useState(cat?.name ?? '');
  const [limit, setLimit] = useState(cat?.limit ? numToInput(cat.limit) : '');
  const [fixed, setFixed] = useState(cat?.fixed ?? false);
  const [parent, setParent] = useState(cat?.parentId ?? parentId ?? '');
  const k = cat?.kind ?? kind ?? 'expense';
  const hasChildren = cat ? state.categories.some((c) => c.parentId === cat.id) : false;
  return (
    <Modal open onClose={onClose} title={cat ? 'Editar categoria' : parentId ? 'Nova subcategoria' : 'Nova categoria'} footer={<><button className="btn-ghost" onClick={onClose}>Cancelar</button><button className="btn-primary" onClick={() => { if (commit((s) => saveCategory(s, { id: cat?.id, name, kind: k, parentId: parent || null, limit: limit.trim() ? parseMoney(limit) : null, fixed }), 'Categoria salva.')) onClose(); }}>Salvar</button></>}>
      <div className="grid gap-3.5">
        <Field label="Nome"><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        <Field label="Categoria principal (deixe vazio para categoria de topo)">
          <select className="input" value={parent} onChange={(e) => setParent(e.target.value)} disabled={hasChildren}>
            <option value="">Nenhuma (categoria de topo)</option>
            {state.categories.filter((c) => c.kind === k && !c.parentId && c.id !== cat?.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        {k === 'expense' && (
          <>
            <Field label="Limite mensal (R$, opcional)" hint="Você será alertado ao chegar em 80% do limite."><MoneyInput value={limit} onChange={setLimit} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-[#7C3AED]" checked={fixed} onChange={(e) => setFixed(e.target.checked)} />Despesa fixa (usada no planejamento mensal)</label>
          </>
        )}
      </div>
    </Modal>
  );
}
