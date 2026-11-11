import { useMemo } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  AlertTriangle, Banknote, CalendarClock, CreditCard, Landmark, Lock, PiggyBank, ShieldCheck, TrendingDown, TrendingUp, Wallet,
} from 'lucide-react';
import { useApp } from '../store';
import {
  categoryName, computeTotals, debtTotals, goalAccumulated, investmentMap, monthSeries, monthStats, nextUnlock, patrimonySeries,
  statementCheck, upcomingDues,
} from '../lib/selectors';
import { brl, daysDiff, fmtDate, monthLong, pct } from '../lib/utils';
import { Badge, CHART_COLORS, Card, Empty, MoneyTooltip, Notice, PageHeader, Progress, Stat } from '../components/ui';
import { TxItem } from '../components/TxItem';

export default function Dashboard() {
  const { state, today, ym, go } = useApp();
  const totals = useMemo(() => computeTotals(state, today), [state, today]);
  const debts = useMemo(() => debtTotals(state), [state]);
  const stats = useMemo(() => monthStats(state, ym), [state, ym]);
  const series = useMemo(() => monthSeries(state, ym, 6), [state, ym]);
  const patSeries = useMemo(() => patrimonySeries(state, today), [state, today]);
  const dues = useMemo(() => upcomingDues(state, today), [state, today]);
  const inv = useMemo(() => investmentMap(state), [state]);

  const emergency = state.goals.find((g) => g.emergency);
  const emAcc = emergency ? goalAccumulated(emergency) : 0;
  const emPct = emergency && emergency.target > 0 ? (emAcc / emergency.target) * 100 : 0;

  const accData = state.accounts.filter((a) => !a.archived && (totals.balances[a.id] ?? 0) > 0).map((a) => ({ name: a.name, value: totals.balances[a.id] }));
  const invData = state.investments.filter((i) => !i.archived && (inv[i.id]?.value ?? 0) > 0).map((i) => ({ name: i.name, value: inv[i.id].value }));
  const distribution = [...accData, ...invData];
  const catData = Object.entries(stats.byCategory)
    .map(([id, value]) => ({ name: id === 'none' ? 'A classificar' : categoryName(state.categories, id), value }))
    .sort((a, b) => b.value - a.value);
  const goalData = state.goals.map((g) => ({ name: g.name, pct: Math.min(100, Math.round((goalAccumulated(g) / g.target) * 100)), acumulado: goalAccumulated(g), meta: g.target }));

  const recent = [...state.transactions].filter((t) => t.status !== 'pending').sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, 6);
  const toClassify = state.transactions.filter((t) => t.status === 'to_classify').length;
  const divergences = state.statements.filter((s) => !statementCheck(state, s).ok).length;
  const pendingInv = state.investments.filter((i) => !i.archived && i.status === 'pending_confirmation');
  const caixinha = state.accounts.find((a) => !a.archived && a.blocks.length > 0 && nextUnlock(a, today));
  const unlock = caixinha ? nextUnlock(caixinha, today) : null;
  const monthBalance = stats.income - stats.expense;
  const hasPatPoints = patSeries.length > 1;

  return (
    <div>
      <PageHeader title="Visão geral" subtitle={`Resumo da sua situação financeira · referência: ${monthLong(ym)}`} />

      <div className="mb-4 grid gap-2.5">
        {toClassify > 0 && (
          <Notice tone="brand">
            <b>{toClassify}</b> lançamento(s) estão como <b>A classificar</b>. <button className="cursor-pointer font-semibold underline" onClick={() => go('lancamentos')}>Classificar agora</button>
          </Notice>
        )}
        {pendingInv.length > 0 && <Notice>Posição de <b>{pendingInv.map((i) => i.name).join(', ')}</b> pendente de confirmação — o valor não foi estimado e não entra no patrimônio. <button className="cursor-pointer font-semibold underline" onClick={() => go('investimentos')}>Informar valor</button></Notice>}
        {divergences > 0 && <Notice>Há <b>{divergences}</b> extrato(s) informado(s) com divergência a conferir. <button className="cursor-pointer font-semibold underline" onClick={() => go('relatorios')}>Ver conferência</button></Notice>}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Patrimônio total" value={brl(totals.patrimony)} icon={<Wallet className="h-4 w-4" />} sub="Disponível + bloqueado + investimentos" />
        <Stat label="Saldo disponível" value={brl(totals.available)} tone="ok" icon={<Banknote className="h-4 w-4" />} sub="Pode ser usado agora" />
        <Stat label="Dinheiro bloqueado" value={brl(totals.blocked)} tone="warn" icon={<Lock className="h-4 w-4" />} sub={unlock ? `Libera em ${fmtDate(unlock.unlockDate)} (${daysDiff(today, unlock.unlockDate)} dias)` : 'Nada bloqueado'} />
        <Stat label="Em contas bancárias" value={brl(totals.banks)} icon={<Landmark className="h-4 w-4" />} sub="Contas e dinheiro em espécie" />
        <Stat label="Guardado (caixinhas e investimentos)" value={brl(totals.saved)} icon={<PiggyBank className="h-4 w-4" />} sub={pendingInv.length ? 'Há posição pendente de confirmação' : 'Contados uma única vez'} />
        <Stat label="Total de dívidas" value={brl(debts.owe)} tone={debts.owe > 0 ? 'bad' : 'brand'} icon={<CreditCard className="h-4 w-4" />} sub={debts.clarify > 0 ? `+ ${brl(debts.clarify)} a esclarecer` : 'Saldo devedor atual'} onClick={() => go('dividas')} />
        <Stat label="Parcelas futuras" value={brl(debts.futureAmount)} tone="warn" icon={<CalendarClock className="h-4 w-4" />} sub={`${debts.futureCount} parcela(s) restante(s)`} onClick={() => go('dividas')} />
        <Stat label="Reserva de emergência" value={pct(emPct, 1)} icon={<ShieldCheck className="h-4 w-4" />} sub={emergency ? `${brl(emAcc)} de ${brl(emergency.target)}` : 'Meta não cadastrada'} onClick={() => go('metas')} />
        <Stat label="Receitas do mês" value={brl(stats.income)} tone="ok" icon={<TrendingUp className="h-4 w-4" />} sub={stats.toClassify > 0 ? `${brl(stats.toClassify)} a classificar` : 'Recebidas'} />
        <Stat label="Despesas do mês" value={brl(stats.expense)} tone="bad" icon={<TrendingDown className="h-4 w-4" />} sub="Inclui parcelas pagas" />
        <Stat label="Saldo mensal" value={brl(monthBalance)} tone={monthBalance >= 0 ? 'ok' : 'bad'} icon={<Wallet className="h-4 w-4" />} sub="Receitas − despesas" />
        <Stat label="Transferências / aplicações" value={brl(stats.transfers + stats.invested)} icon={<PiggyBank className="h-4 w-4" />} sub="Não são receita nem despesa" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Receitas × despesas (6 meses)">
          <div className="h-60">
            <ResponsiveContainer>
              <BarChart data={series} margin={{ left: -10, right: 4, top: 4 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} width={50} />
                <Tooltip content={<MoneyTooltip />} cursor={{ fill: 'rgba(124,58,237,0.06)' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="receitas" name="Receitas" fill="#16a34a" radius={[6, 6, 0, 0]} />
                <Bar dataKey="despesas" name="Despesas" fill="#dc2626" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Evolução do patrimônio">
          {hasPatPoints ? (
            <div className="h-60">
              <ResponsiveContainer>
                <AreaChart data={patSeries} margin={{ left: -10, right: 8, top: 4 }}>
                  <defs><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7C3AED" stopOpacity={0.35} /><stop offset="100%" stopColor="#7C3AED" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} width={50} domain={['auto', 'auto']} />
                  <Tooltip content={<MoneyTooltip />} />
                  <Area type="monotone" dataKey="patrimonio" name="Patrimônio" stroke="#7C3AED" strokeWidth={2.5} fill="url(#pg)" dot />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="grid h-60 place-items-center text-center">
              <div>
                <div className="text-3xl font-bold">{brl(patSeries[0]?.patrimonio ?? totals.patrimony)}</div>
                <p className="mt-1 text-xs text-muted">Ponto inicial em {fmtDate(state.openingDate)}.<br />A linha de evolução aparece conforme você registrar receitas e despesas em meses diferentes.</p>
              </div>
            </div>
          )}
        </Card>

        <Card title="Distribuição do dinheiro por conta">
          {distribution.length ? (
            <div className="flex flex-col items-center gap-2 sm:flex-row">
              <div className="h-52 w-full sm:w-1/2">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={distribution} dataKey="value" nameKey="name" innerRadius={48} outerRadius={80} paddingAngle={2} stroke="none">
                      {distribution.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip content={<MoneyTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="w-full space-y-1.5 text-xs sm:w-1/2">
                {distribution.map((d, i) => (
                  <li key={d.name} className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                    <span className="flex-1 truncate">{d.name}</span>
                    <span className="font-semibold tabular-nums">{brl(d.value)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : <Empty>Nenhuma conta com saldo positivo.</Empty>}
        </Card>

        <Card title={`Despesas por categoria · ${monthLong(ym)}`}>
          {catData.length ? (
            <div className="h-60">
              <ResponsiveContainer>
                <BarChart data={catData} layout="vertical" margin={{ left: 10, right: 12 }}>
                  <CartesianGrid horizontal={false} />
                  <XAxis type="number" tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={110} />
                  <Tooltip content={<MoneyTooltip />} cursor={{ fill: 'rgba(124,58,237,0.06)' }} />
                  <Bar dataKey="value" name="Gasto" radius={[0, 6, 6, 0]}>
                    {catData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <Empty>Nenhuma despesa registrada neste mês.</Empty>}
        </Card>

        <Card title="Evolução das metas financeiras" className="lg:col-span-2">
          {goalData.length ? (
            <div className="grid gap-3 sm:grid-cols-3">
              {goalData.map((g) => (
                <div key={g.name} className="rounded-xl bg-tint/60 p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{g.name}</span>
                    <span className="text-sm font-bold text-brand dark:text-brand-soft">{g.pct}%</span>
                  </div>
                  <div className="my-2"><Progress value={g.pct} /></div>
                  <div className="text-xs text-muted">{brl(g.acumulado)} de {brl(g.meta)}</div>
                </div>
              ))}
            </div>
          ) : <Empty>Cadastre metas para acompanhar o progresso.</Empty>}
        </Card>

        <Card title="Movimentações recentes" action={<button className="text-xs font-semibold text-brand" onClick={() => go('lancamentos')}>Ver todas</button>}>
          {recent.length ? <div className="divide-y divide-line">{recent.map((t) => <TxItem key={t.id} state={state} t={t} compact />)}</div> : <Empty>Sem movimentações.</Empty>}
        </Card>

        <Card title="Contas próximas do vencimento" action={<button className="text-xs font-semibold text-brand" onClick={() => go('dividas')}>Ver dívidas</button>}>
          {dues.length ? (
            <ul className="divide-y divide-line">
              {dues.slice(0, 7).map((d) => (
                <li key={d.key} className="flex items-center gap-3 py-2.5">
                  <span className={`grid h-9 w-9 place-items-center rounded-xl ${d.overdue ? 'bg-bad/10 text-bad' : 'bg-warn/15 text-warn'}`}>{d.overdue ? <AlertTriangle className="h-4 w-4" /> : <CalendarClock className="h-4 w-4" />}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{d.name}</div>
                    <div className="text-xs text-muted">{d.label} · {d.date ? fmtDate(d.date) : 'vencimento não informado'}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold tabular-nums">{brl(d.amount)}</div>
                    {d.overdue ? <Badge tone="bad">Atrasada</Badge> : d.date ? <Badge tone="warn">em {daysDiff(today, d.date)} dias</Badge> : <Badge tone="muted">sem data</Badge>}
                  </div>
                </li>
              ))}
            </ul>
          ) : <Empty>Nenhuma conta a vencer nos próximos 45 dias.</Empty>}
        </Card>
      </div>
    </div>
  );
}
