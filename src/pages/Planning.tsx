import { useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useApp } from '../store';
import { planFor } from '../lib/selectors';
import { setPlan } from '../lib/ops';
import { brl, fmtDate, monthLong, numToInput, parseMoney } from '../lib/utils';
import { Card, Field, MoneyInput, Notice, PageHeader } from '../components/ui';

export default function Planning() {
  const { state, today, ym } = useApp();
  const r = planFor(state, ym, today);
  return (
    <div key={ym}>
      <PageHeader title="Planejamento mensal" subtitle={`Quanto entra, quanto já está comprometido e quanto sobra em ${monthLong(ym)}.`} />

      {r.deficit ? (
        <div className="mb-4"><Notice tone="bad"><AlertTriangle className="mr-1 inline h-4 w-4" /><b>Alerta:</b> as despesas e compromissos previstos ({brl(r.expenseForecast + r.invRemaining + r.goalsRemaining)}) são maiores que as receitas previstas ({brl(r.incomeForecast)}). Revise gastos variáveis, investimentos ou metas.</Notice></div>
      ) : (
        <div className="mb-4"><Notice tone="ok"><CheckCircle2 className="mr-1 inline h-4 w-4" />As receitas previstas cobrem as despesas e compromissos previstos do mês.</Notice></div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <div className="text-xs font-semibold text-muted">Posso gastar sem comprometer as contas futuras</div>
          <div className={`mt-1 text-3xl font-bold tabular-nums ${r.freeToSpend < 0 ? 'text-bad' : 'text-ok'}`}>{brl(r.freeToSpend)}</div>
          <p className="mt-2 text-xs text-muted">= saldo disponível agora ({brl(r.availableNow)}) + receitas ainda previstas ({brl(r.pendingSalary + r.pendingIncomeTx)}) − despesas pendentes ({brl(r.pendingFixed + r.pendingVariable)}) − parcelas a pagar ({brl(r.instDue)}) − investimentos e metas planejados ({brl(r.invRemaining + r.goalsRemaining)}).</p>
          <div className="mt-4 rounded-xl bg-tint/60 p-3">
            <div className="text-xs font-semibold text-muted">Saldo disponível previsto ao fim do mês</div>
            <div className={`text-xl font-bold tabular-nums ${r.endBalance < 0 ? 'text-bad' : ''}`}>{brl(r.endBalance)}</div>
            <p className="mt-1 text-[11px] text-muted">Considera também o orçamento de gastos variáveis restante.</p>
          </div>
        </Card>

        <Card title="Resumo do mês" className="lg:col-span-2">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-line">
              <Row k="Salário previsto (mensal)" v={r.salaryPlanned} />
              <Row k="Receitas confirmadas" v={r.stats.income - r.stats.toClassify} tone="ok" />
              {r.stats.toClassify > 0 && <Row k="Receitas a classificar" v={r.stats.toClassify} tone="ok" />}
              <Row k="Receitas ainda previstas (não recebidas)" v={r.pendingSalary + r.pendingIncomeTx} tone="warn" hint={r.pendingSources.length ? r.pendingSources.map((s) => s.name).join(', ') : undefined} />
              <Row k="Receitas previstas totais" v={r.incomeForecast} strong />
              <Row k="Despesas fixas (realizadas + pendentes)" v={-(r.fixedRealized + r.pendingFixed)} />
              <Row k={`Despesas variáveis (previsão: ${brl(r.variableBudget)} ou o gasto real, se maior)`} v={-r.variableForecast} hint={`Já gasto: ${brl(r.variableRealized)}`} />
              <Row k="Parcelas pagas no mês" v={-r.instPaid} />
              <Row k="Parcelas futuras a pagar neste mês" v={-r.instDue} tone="warn" />
              <Row k="Despesas previstas totais" v={-r.expenseForecast} strong />
              <Row k="Investimentos planejados (restante)" v={-r.invRemaining} />
              <Row k="Valor destinado às metas (restante)" v={-r.goalsRemaining} />
              <Row k="Resultado previsto do mês" v={r.result} strong />
            </tbody>
          </table>
        </Card>

        <Card title="Ajustar o planejamento deste mês" className="lg:col-span-2">
          <PlanForm ym={ym} />
        </Card>

        <Card title="Parcelas a pagar neste mês" className="lg:col-span-1">
          {r.instUnpaid.length === 0 ? <p className="text-sm text-muted">Nenhuma parcela em aberto com vencimento neste mês.</p> : (
            <ul className="divide-y divide-line text-sm">
              {r.instUnpaid.map((i) => <li key={i.key} className="flex justify-between gap-2 py-2"><span className="min-w-0 truncate">{i.name} · {i.no}ª<span className="block text-xs text-muted">{i.date ? fmtDate(i.date) : 'sem data de vencimento'}</span></span><b className="tabular-nums">{brl(i.amount)}</b></li>)}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function Row({ k, v, tone, strong, hint }: { k: string; v: number; tone?: 'ok' | 'warn'; strong?: boolean; hint?: string }) {
  return (
    <tr className={strong ? 'bg-tint/50 font-bold' : ''}>
      <td className="px-2 py-2">{k}{hint && <span className="block text-[11px] font-normal text-muted">{hint}</span>}</td>
      <td className={`px-2 py-2 text-right tabular-nums ${tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : v < 0 && strong ? 'text-bad' : ''}`}>{brl(v)}</td>
    </tr>
  );
}

function PlanForm({ ym }: { ym: string }) {
  const { state, commit } = useApp();
  const plan = state.planning[ym];
  const [inv, setInv] = useState(plan?.investments ? numToInput(plan.investments) : '');
  const [goals, setGoals] = useState(plan?.goals ? numToInput(plan.goals) : '');
  const [variable, setVariable] = useState(plan?.variable != null ? numToInput(plan.variable) : '');
  const parse = (s: string) => (s.trim() ? parseMoney(s) : 0);
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label="Investimentos planejados (R$)"><MoneyInput value={inv} onChange={setInv} /></Field>
      <Field label="Destinado às metas (R$)"><MoneyInput value={goals} onChange={setGoals} /></Field>
      <Field label="Gastos variáveis previstos (R$)" hint={`Vazio = referência (${brl(state.settings.spendEstimateMax)})`}><MoneyInput value={variable} onChange={setVariable} /></Field>
      <div className="sm:col-span-3">
        <button className="btn-primary" onClick={() => commit((s) => setPlan(s, ym, { investments: parse(inv), goals: parse(goals), variable: variable.trim() ? parseMoney(variable) : null }), 'Planejamento salvo.')}>Salvar planejamento</button>
        <p className="mt-2 text-xs text-muted">Estes valores são apenas intenções do mês: não movimentam saldos. Para investir de verdade, registre uma “Aplicação”.</p>
      </div>
    </div>
  );
}
