import { useRef, useState } from 'react';
import { Download, FlaskConical, RotateCcw, ShieldCheck, Upload } from 'lucide-react';
import { useApp } from '../store';
import { exportBackup, normalizeState, updateSettings } from '../lib/ops';
import { createSeedState } from '../lib/seed';
import { runSelfTests, type TestResult } from '../lib/selftests';
import { download, fmtDate } from '../lib/utils';
import { Card, Field, Notice, PageHeader } from '../components/ui';

export default function Settings() {
  const { state, today, commit, replaceState, confirm, toast } = useApp();
  const file = useRef<HTMLInputElement>(null);
  const [tests, setTests] = useState<TestResult[] | null>(null);
  const [sim, setSim] = useState(state.settings.simulatedDate ?? '');

  const backup = () => {
    download(`backup-financas-${today}.json`, exportBackup(state), 'application/json');
    toast('Backup exportado. Guarde o arquivo em local seguro.', 'success');
  };

  const restore = async (f: File | undefined) => {
    if (!f) return;
    try {
      const text = await f.text();
      const next = normalizeState(JSON.parse(text));
      const ok = await confirm({
        title: 'Restaurar backup?',
        message: `O arquivo contém ${next.accounts.length} conta(s), ${next.transactions.length} lançamento(s), ${next.debts.length} dívida(s), ${next.contracts.length} contrato(s) e ${next.goals.length} meta(s).\n\nTODOS os dados atuais deste navegador serão substituídos. Recomendamos exportar um backup antes.`,
        confirmLabel: 'Restaurar', danger: true,
      });
      if (ok) { replaceState(next); toast('Backup restaurado com sucesso.', 'success'); }
    } catch (e) {
      toast(`Não foi possível restaurar: ${(e as Error).message}`, 'error');
    } finally {
      if (file.current) file.current.value = '';
    }
  };

  const reset = async () => {
    const ok = await confirm({ title: 'Voltar aos dados iniciais?', message: 'Todos os lançamentos, contas e metas que você criou serão apagados e os dados iniciais informados no cadastro serão recarregados. Esta ação não pode ser desfeita (exporte um backup antes).', confirmLabel: 'Apagar e recarregar', danger: true });
    if (ok) { replaceState(createSeedState()); toast('Dados iniciais recarregados.', 'success'); }
  };

  return (
    <div>
      <PageHeader title="Configurações e backup" subtitle="Segurança dos dados, backup, restauração e verificação do sistema." />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={<span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-brand" />Onde ficam seus dados</span>} className="lg:col-span-2">
          <p className="text-sm">Seus dados ficam salvos <b>somente neste navegador e neste dispositivo</b> (armazenamento local) e são gravados automaticamente a cada alteração. <b>Não há sincronização entre aparelhos</b> e nada é enviado para a internet.</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
            <li>Não digite senhas, números de cartão ou credenciais bancárias — o sistema não precisa delas e não as armazena.</li>
            <li>Limpar os dados do navegador apaga o sistema. Faça backup com frequência e use-o para levar os dados a outro aparelho.</li>
            <li>A lógica financeira fica separada da interface e do armazenamento, para que um backend seguro possa ser conectado no futuro sem reescrever as regras.</li>
          </ul>
        </Card>

        <Card title="Backup completo (JSON)">
          <p className="mb-3 text-sm text-muted">Contém contas, lançamentos, dívidas, contratos, investimentos, metas, categorias e configurações.</p>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={backup}><Download className="h-4 w-4" />Exportar backup</button>
            <button className="btn-ghost" onClick={() => file.current?.click()}><Upload className="h-4 w-4" />Restaurar backup</button>
            <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void restore(e.target.files?.[0])} />
          </div>
          <div className="mt-4 border-t border-line pt-4">
            <button className="btn-danger" onClick={reset}><RotateCcw className="h-4 w-4" />Voltar aos dados iniciais</button>
          </div>
        </Card>

        <Card title="Data de referência do sistema">
          <p className="mb-3 text-sm text-muted">Hoje: <b>{fmtDate(today)}</b>. O desbloqueio de valores e os vencimentos usam a data do aparelho. Para testar (ex.: o desbloqueio de 03/12/2026), simule uma data — nenhum dado é alterado.</p>
          <Field label="Simular data"><input type="date" className="input" value={sim} onChange={(e) => setSim(e.target.value)} /></Field>
          <div className="mt-3 flex gap-2">
            <button className="btn-soft" onClick={() => commit((s) => updateSettings(s, { simulatedDate: sim || null }), sim ? 'Data simulada ativada.' : 'Usando a data real.')}>Aplicar</button>
            <button className="btn-ghost" onClick={() => { setSim(''); commit((s) => updateSettings(s, { simulatedDate: null }), 'Usando a data real.'); }}>Usar data real</button>
          </div>
        </Card>

        <Card title={<span className="flex items-center gap-2"><FlaskConical className="h-4 w-4 text-brand" />Testes automáticos das regras contábeis</span>} className="lg:col-span-2">
          <p className="mb-3 text-sm text-muted">Executa os testes de despesa, transferência, caixinha bloqueada, parcela, aplicação/resgate, receita prevista, persistência e backup em dados temporários — <b>não altera os seus dados</b>.</p>
          <button className="btn-primary" onClick={() => setTests(runSelfTests())}>Executar testes</button>
          {tests && (
            <div className="mt-4 space-y-1.5">
              <Notice tone={tests.every((t) => t.ok) ? 'ok' : 'bad'}>{tests.filter((t) => t.ok).length} de {tests.length} testes aprovados.</Notice>
              {tests.map((t) => (
                <div key={t.name} className="flex items-start gap-2 text-sm">
                  <span className={`mt-0.5 font-bold ${t.ok ? 'text-ok' : 'text-bad'}`}>{t.ok ? '✓' : '✗'}</span>
                  <span>{t.name}{!t.ok && <span className="block text-xs text-bad">{t.detail}</span>}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Como usar (resumo)" className="lg:col-span-2">
          <ol className="list-decimal space-y-1.5 pl-5 text-sm">
            <li><b>Lançamentos</b>: use “Novo lançamento”. Escolha o tipo (despesa, receita, transferência, aplicação, resgate…) — os saldos se atualizam sozinhos.</li>
            <li><b>Salário</b>: em Receitas e salário, clique em “Confirmar recebimento” quando o dinheiro cair. Antes disso é só previsão.</li>
            <li><b>Parcelas</b>: em Dívidas, clique em “PAGAR PARCELA”. Se errar, use “Desfazer” — o estorno é automático.</li>
            <li><b>A classificar</b>: recebimentos de origem desconhecida ficam marcados até você escolher a categoria.</li>
            <li><b>Divergência de saldo</b>: em Contas, use “Ajustar saldo” — o ajuste fica identificado, nunca escondido.</li>
            <li><b>Backup</b>: exporte o JSON periodicamente e restaure aqui quando precisar.</li>
          </ol>
        </Card>
      </div>
    </div>
  );
}
