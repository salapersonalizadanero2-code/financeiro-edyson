import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, CheckCircle2, FileDown, Printer } from 'lucide-react';
import { useApp } from '../store';
import { TX_LABEL, STATUS_LABEL } from '../lib/types';
import { categoryName, debtTotals, monthStats, obligationProgress, patrimonySeries, periodStats, statementCheck } from '../lib/selectors';
import { addMonthsYM, brl, download, fmtDate, monthLong, monthShort, pct, toCSV } from '../lib/utils';
import { accName, routeLabel } from '../components/TxItem';
import { Badge, CHART_COLORS, Card, Empty, MoneyTooltip, Notice, PageHeader, Stat } from '../components/ui';

export default function Reports() {
  const { state, today, ym } = useApp();
  const [mode, setMode] = useState<'month' | 'year'>('month');
  const year = ym.slice(0, 4);
  const [from, to, title] = mode === 'month' ? [`${ym}-01`, `${ym}-31`, monthLong(ym)] : [`${year}-01-01`, `${year}-12-31`, `ano de ${year}`];
  const stats = useMemo(() => periodStats(state, from, to), [state, from, to]);
  const prev = useMemo(() => monthStats(state, addMonthsYM(ym, -1)), [state, ym]);
  const yearSeries = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const m = `${year}-${String(i + 1).padStart(2, '0')}`;
    const s = monthStats(state, m);
    return { ym: m, label: monthShort(m), receitas: s.income, despesas: s.expense, saldo: s.income - s.expense };
  }), [state, year]);
  const pat = useMemo(() => patrimonySeries(state, today), [state, today]);
  const dt = debtTotals(state);
  const all = [...state.debts.filter((d) => d.direction === 'owe'), ...state.contracts];
  const paidOff = all.filter((o) => obligationProgress(state, o).remaining === 0).length;
  const catRows = Object.entries(stats.byCategory).map(([id, v]) => ({ name: id === 'none' ? 'A classificar' : categoryName(state.categories, id), value: v })).sort((a, b) => b.value - a.value);
  const periodTxs = state.transactions.filter((t) => t.date >= from && t.date <= to && t.status !== 'pending').sort((a, b) => a.date.localeCompare(b.date));

  const exportCSV = () => {
    const rows: unknown[][] = [['Data', 'Tipo', 'Descrição', 'Valor', 'Categoria', 'Conta / rota', 'Situação', 'Histórico', 'Observações']];
    for (const t of state.transactions.slice().sort((a, b) => a.date.localeCompare(b.date))) {
      rows.push([fmtDate(t.date), TX_LABEL[t.type], t.description, t.amount.toFixed(2).replace('.', ','), categoryName(state.categories, t.categoryId), routeLabel(state, t), STATUS_LABEL[t.status], t.historical ? 'sim' : 'não', t.notes]);
    }
    download(`lancamentos-${today}.csv`, toCSV(rows), 'text/csv;charset=utf-8');
  };
  const exportAccountsCSV = () => {
    const rows: unknown[][] = [['Conta', 'Instituição', 'Saldo de referência']];
    state.accounts.forEach((a) => rows.push([a.name, a.institution, a.openingBalance.toFixed(2).replace('.', ',')]));
    download(`contas-${today}.csv`, toCSV(rows), 'text/csv;charset=utf-8');
  };
  const exportJSON = () => {
    download(`relatorio-${mode === 'month' ? ym : year}.json`, JSON.stringify({ periodo: title, resumo: stats, lancamentos: periodTxs }, null, 2), 'application/json');
  };

  const delta = (a: number, b: number) => (b === 0 ? (a === 0 ? '—' : 'novo') : `${a >= b ? '+' : ''}${pct(((a - b) / b) * 100, 0)}`);

  return (
    <div>
      <PageHeader
        title="Relatórios e histórico"
        subtitle={`Período: ${title}`}
        actions={<>
          <div className="flex rounded-xl border border-line bg-card p-0.5">
            {(['month', 'year'] as const).map((m) => <button key={m} onClick={() => setMode(m)} className={`cursor-pointer rounded-lg px-3 py-1.5 text-sm font-semibold ${mode === m ? 'bg-brand text-white' : 'text-muted'}`}>{m === 'month' ? 'Mensal' : 'Anual'}</button>)}
          </div>
          <button className="btn-ghost" onClick={exportCSV}><FileDown className="h-4 w-4" />CSV</button>
          <button className="btn-ghost" onClick={exportJSON}><FileDown className="h-4 w-4" />JSON</button>
          <button className="btn-primary" onClick={() => window.print()}><Printer className="h-4 w-4" />Imprimir / PDF</button>
        </>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total de receitas" value={brl(stats.income)} tone="ok" sub={stats.toClassify > 0 ? `${brl(stats.toClassify)} a classificar` : undefined} />
        <Stat label="Total de despesas" value={brl(stats.expense)} tone="bad" />
        <Stat label="Resultado (receitas − despesas)" value={brl(stats.income - stats.expense)} tone={stats.income - stats.expense >= 0 ? 'ok' : 'bad'} />
        <Stat label="Total investido" value={brl(stats.invested)} />
        <Stat label="Total resgatado" value={brl(stats.redeemed)} />
        <Stat label="Transferências internas" value={brl(stats.transfers)} sub="Fora de receitas/despesas" />
        <Stat label="Dívidas quitadas" value={`${paidOff} de ${all.length}`} tone="ok" />
        <Stat label="Dívidas restantes" value={brl(dt.owe)} tone="bad" sub={`${dt.futureCount} parcela(s)`} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Gastos por categoria">
          {catRows.length ? (
            <div className="flex flex-col items-center gap-3 sm:flex-row">
              <div className="h-52 w-full sm:w-1/2">
                <ResponsiveContainer><PieChart><Pie data={catRows} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} stroke="none" paddingAngle={2}>{catRows.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}</Pie><Tooltip content={<MoneyTooltip />} /></PieChart></ResponsiveContainer>
              </div>
              <ul className="w-full space-y-1.5 text-xs sm:w-1/2">
                {catRows.map((c, i) => <li key={c.name} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} /><span className="flex-1 truncate">{c.name}</span><span className="text-muted">{pct((c.value / stats.expense) * 100, 0)}</span><b className="tabular-nums">{brl(c.value)}</b></li>)}
              </ul>
            </div>
          ) : <Empty>Sem despesas no período.</Empty>}
        </Card>

        <Card title={`Comparação mês a mês — ${year}`}>
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={yearSeries} margin={{ left: -10, right: 4 }}>
                <CartesianGrid vertical={false} /><XAxis dataKey="label" tickLine={false} axisLine={false} /><YAxis tickLine={false} axisLine={false} width={46} />
                <Tooltip content={<MoneyTooltip />} cursor={{ fill: 'rgba(124,58,237,0.06)' }} /><Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="receitas" name="Receitas" fill="#16a34a" radius={[4, 4, 0, 0]} /><Bar dataKey="despesas" name="Despesas" fill="#dc2626" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {mode === 'month' && (
          <Card title={`${monthLong(ym)} × ${monthLong(addMonthsYM(ym, -1))}`}>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted"><th className="py-1">Item</th><th className="text-right">Atual</th><th className="text-right">Anterior</th><th className="text-right">Variação</th></tr></thead>
              <tbody className="divide-y divide-line">
                {([['Receitas', stats.income, prev.income], ['Despesas', stats.expense, prev.expense], ['Investido', stats.invested, prev.invested], ['Resgatado', stats.redeemed, prev.redeemed], ['Transferências', stats.transfers, prev.transfers]] as const).map(([k, a, b]) => (
                  <tr key={k}><td className="py-2">{k}</td><td className="text-right tabular-nums">{brl(a)}</td><td className="text-right tabular-nums text-muted">{brl(b)}</td><td className="text-right font-semibold">{delta(a, b)}</td></tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        <Card title="Evolução do patrimônio" className={mode === 'month' ? '' : 'lg:col-span-2'}>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted"><th className="py-1">Mês</th><th className="text-right">Patrimônio ao fim do mês</th></tr></thead>
            <tbody className="divide-y divide-line">{pat.map((p) => <tr key={p.ym}><td className="py-2 capitalize">{monthLong(p.ym)}</td><td className="text-right font-semibold tabular-nums">{brl(p.patrimonio)}</td></tr>)}</tbody>
          </table>
          <p className="mt-2 text-[11px] text-muted">Parte do saldo de referência em {fmtDate(state.openingDate)}; só lançamentos reais (receitas, despesas e ajustes) alteram o patrimônio.</p>
        </Card>
      </div>

      <Card title="Conferência de extratos informados" className="mt-4">
        <p className="mb-3 text-xs text-muted">Compara os totais informados nos extratos com os lançamentos cadastrados. Divergências <b>não</b> são preenchidas automaticamente: confira o extrato e lance o que faltar (ou use “Ajustar saldo”).</p>
        <div className="grid gap-3 md:grid-cols-2">
          {state.statements.map((st) => {
            const c = statementCheck(state, st);
            return (
              <div key={st.id} className={`rounded-xl border p-3 text-sm ${c.ok ? 'border-ok/30 bg-ok/5' : 'border-warn/40 bg-warn/5'}`}>
                <div className="mb-1.5 flex items-start justify-between gap-2"><b>{st.label}</b>{c.ok ? <Badge tone="ok"><CheckCircle2 className="h-3 w-3" />Confere</Badge> : <Badge tone="warn"><AlertTriangle className="h-3 w-3" />Divergência</Badge>}</div>
                <div className="grid grid-cols-3 gap-1 text-xs text-muted"><span /><span className="text-right">Extrato</span><span className="text-right">Lançado</span></div>
                <div className="grid grid-cols-3 gap-1"><span>Entradas</span><span className="text-right tabular-nums">{brl(st.entradas)}</span><span className="text-right tabular-nums">{brl(c.regIn)}</span></div>
                <div className="grid grid-cols-3 gap-1"><span>Saídas</span><span className="text-right tabular-nums">{brl(st.saidas)}</span><span className="text-right tabular-nums">{brl(c.regOut)}</span></div>
                {c.diffIn !== 0 && <p className="mt-1.5 text-xs font-semibold text-warn">Entradas não detalhadas: {brl(c.diffIn)} — conferir extrato.</p>}
                {c.diffOut !== 0 && <p className="mt-1 text-xs font-semibold text-warn">Saídas não detalhadas: {brl(c.diffOut)} — conferir extrato.</p>}
                {c.equation && <p className={`mt-1 text-xs ${c.equation.ok ? 'text-ok' : 'text-warn'}`}>Saldo inicial {brl(st.saldoInicial)} + rendimento {brl(st.rendimento)} + entradas − saídas = {brl(c.equation.expected)} {c.equation.ok ? '✓ confere com o saldo final' : `≠ ${brl(st.saldoFinal)}`}</p>}
                <p className="mt-1 text-xs text-muted">Saldo final informado: {brl(st.saldoFinal)} ({accName(state, st.accountId)}){st.notes ? ` · ${st.notes}` : ''}</p>
              </div>
            );
          })}
        </div>
      </Card>

      <Card title={`Lançamentos do período (${periodTxs.length})`} className="mt-4">
        {periodTxs.length === 0 ? <Empty>Sem lançamentos.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted"><th className="py-1">Data</th><th>Tipo</th><th>Descrição</th><th>Conta</th><th className="text-right">Valor</th></tr></thead>
              <tbody className="divide-y divide-line">
                {periodTxs.map((t) => <tr key={t.id}><td className="py-1.5 whitespace-nowrap">{fmtDate(t.date)}</td><td>{TX_LABEL[t.type]}</td><td>{t.description}{t.status === 'to_classify' && <span className="ml-1 text-xs text-brand">(a classificar)</span>}</td><td className="text-xs text-muted">{routeLabel(state, t)}</td><td className="text-right tabular-nums">{brl(t.amount)}</td></tr>)}
              </tbody>
            </table>
          </div>
        )}
        <div className="no-print mt-3"><button className="btn-ghost btn-sm" onClick={exportAccountsCSV}><FileDown className="h-3.5 w-3.5" />Exportar contas (CSV)</button></div>
      </Card>
      <div className="mt-4"><Notice tone="muted">Para salvar em PDF, clique em “Imprimir / PDF” e escolha “Salvar como PDF” no destino da impressão.</Notice></div>
    </div>
  );
}
