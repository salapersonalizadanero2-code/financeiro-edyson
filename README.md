# Finanças Pessoais — sistema financeiro completo (roxo)

Sistema de controle financeiro pessoal **funcional e automatizado**: contas, lançamentos, transferências,
dívidas e parcelas, consórcios/financiamentos, investimentos, metas, planejamento mensal e relatórios.
Registrando uma movimentação **uma única vez**, saldos, patrimônio, gráficos, dívidas e relatórios são
recalculados automaticamente.

> **Arquivo principal:** [`sistema-financeiro.html`](sistema-financeiro.html) — HTML único, com CSS e
> JavaScript embutidos, pronto para abrir no navegador (sem internet, sem instalação).

---

## 1. Como abrir

### Opção A — arquivo único (recomendado)
1. Baixe o arquivo **`sistema-financeiro.html`**.
2. Dê **duplo clique** (ou arraste para o navegador).
3. Pronto: os dados iniciais já vêm cadastrados. Nada é enviado para a internet.

> Funciona em Chrome, Edge, Firefox, Opera e Safari atuais, no computador ou no celular.
> Se o seu navegador bloquear o armazenamento local em arquivos abertos por `file://`, sirva a pasta
> com um servidor local simples (`npx serve .`) ou publique no GitHub Pages — o comportamento é o mesmo.
>
> **Mantenha o arquivo sempre no mesmo lugar.** Se você mover/copiar o HTML para outra pasta ou outro
> navegador, o armazenamento pode ser outro: use **Configurações → Restaurar backup** para levar os dados.

### Opção B — desenvolvimento
```bash
npm install
npm run dev        # servidor de desenvolvimento
npm test           # testes automáticos das regras contábeis (18 verificações)
npm run build:single  # gera dist/index.html + sistema-financeiro.html
```

O projeto também está pronto para GitHub Pages: o workflow `.github/workflows/deploy.yml` compila a
aplicação e publica em `https://<usuário>.github.io/financeiro-edyson/`.

---

## 2. Onde ficam os dados (leia antes de usar)

* Tudo fica no **armazenamento local do navegador** (`localStorage`), **neste dispositivo**.
* **Não existe sincronização entre aparelhos** e nenhum dado financeiro sai do seu navegador.
* Limpar os dados do navegador apaga o sistema. **Faça backup com frequência.**
* O sistema **não pede nem armazena senhas, tokens ou credenciais bancárias**.
* A lógica financeira fica isolada (`src/lib`) da interface (`src/pages`) e da persistência (`src/store.tsx`),
  de modo que um backend seguro pode ser conectado no futuro sem reescrever as regras.

### Backup e restauração
1. Menu **Configurações e backup** → **Exportar backup** (JSON completo).
2. Guarde o arquivo em local seguro (nuvem, e-mail, pendrive).
3. Para restaurar, use **Restaurar backup** e escolha o arquivo — o sistema mostra um resumo e pede
   confirmação antes de substituir os dados atuais.
4. **Voltar aos dados iniciais** recarrega o cadastro original (também com confirmação).

---

## 3. Módulos

| Módulo | O que faz |
|---|---|
| **Visão geral** | Patrimônio, disponível, bloqueado, contas, guardado, dívidas, parcelas futuras, receitas/despesas/saldo do mês, % da reserva, gráficos (receitas × despesas, evolução do patrimônio, distribuição por conta, despesas por categoria, evolução das metas), movimentações recentes e próximos vencimentos. |
| **Contas e carteiras** | Criar/editar/excluir (arquivar preservando histórico), saldo individual, disponível × bloqueado, histórico, transferências e **ajuste de saldo identificado**. |
| **Lançamentos** | Receitas, despesas, transferências, aplicações, resgates, pagamentos de parcelas e ajustes. Filtros por ano, mês, conta, categoria, tipo e situação. Editar, excluir, classificar e confirmar pendentes. |
| **Receitas e salário** | Salário de R$ 913,00 dividido em 60% no dia 05 e 40% no dia 20 (editável), outras fontes de renda, confirmação de recebimento (previsto ≠ recebido) e desfazer. |
| **Despesas e categorias** | 12 categorias iniciais + subcategorias, limites mensais com alerta em 80% e 100%, referência de gastos R$ 151–300 editável. |
| **Dívidas e parcelas** | Nome, descrição, valor total, parcela, quantidade, pagas/restantes, próximo vencimento, conta, situação e histórico. Botão **PAGAR PARCELA** com confirmação, estorno e bloqueio de pagamento duplicado. Pendências sem direção ficam **A esclarecer**. |
| **Consórcios e financiamentos** | Um único módulo com as duas modalidades: carta de crédito, taxa de administração, fundo de reserva, seguro, lances, contemplação, juros, CET, prazo, amortizações e saldo devedor. Pagamento pelo mesmo sistema de parcelas. |
| **Investimentos** | Caixinhas/cofrinhos, CDB, LCI, LCA, Tesouro Direto e outros: instituição, tipo, aplicado, data, rentabilidade informada, vencimento, liquidez, valor atual, histórico de aplicações/resgates. |
| **Metas** | Reserva de emergência, Yamaha R15 ABS X-Black e aniversário de namoro (editáveis). Valor desejado, acumulado, prazo, prioridade, vínculo com conta/investimento, % concluído, quanto falta e histórico. |
| **Planejamento mensal** | Salário previsto, receitas confirmadas, fixas, variáveis, parcelas futuras, investimentos e metas planejadas, saldo previsto e **alerta de déficit**. |
| **Relatórios** | Mensal/anual: receitas, despesas, investido, resgatado, transferências internas, evolução do patrimônio, dívidas quitadas/restantes, gastos por categoria, comparação entre meses, conferência de extratos, **CSV (lançamentos e contas)**, **JSON** e **imprimir/PDF**. |
| **Configurações** | Tema claro/escuro, backup/restauração, data simulada, testes automáticos e instruções. |

---

## 4. Regras contábeis (não são violadas)

1. Transferência entre contas próprias **não é receita nem despesa** e não altera o patrimônio.
2. Aplicação em investimento **não é despesa de consumo**; resgate **não é receita nova**.
3. Dinheiro **bloqueado faz parte do patrimônio**, mas não do saldo disponível.
4. **Desbloqueio não aumenta o patrimônio** — é apenas mudança de classificação (automático em 03/12/2026).
5. Parcela quitada **não pode ser paga novamente** (nem por lançamento editado).
6. Uma movimentação **não é contabilizada duas vezes** (aviso de duplicidade e bloqueio de receita recorrente repetida).
7. Saldo da conta e saldo do investimento são controlados separadamente.
8. Divergências **não são escondidas**: extratos informados mostram a diferença e o ajuste manual fica identificado.
9. Receitas previstas **não são dinheiro recebido** — só entram no saldo após confirmação.
10. Valores não identificados ficam **A classificar** até você escolher a categoria.
11. Nenhum valor, taxa ou rendimento é inventado. O CDB permanece **pendente de confirmação**; a LCI de
    R$ 263,62 já está dentro do saldo de R$ 312,50 do Inter e não é somada de novo.

### Saldos iniciais conferidos
| Local | Valor |
|---|---:|
| Inter — conta principal | R$ 312,50 |
| Inter — caixinha (R$ 203,76 disponível + R$ 84,14 bloqueado) | R$ 287,90 |
| Mercado Pago — cofrinho | R$ 200,94 |
| Mercado Pago — conta | R$ 0,00 |
| Nubank — conta | R$ 0,00 |
| Dinheiro em espécie | R$ 0,00 |
| **Patrimônio conhecido** | **R$ 801,34** |
| **Disponível conhecido** | **R$ 717,20** |
| **Bloqueado** | **R$ 84,14** |

Dívidas iniciais: celular (10 × R$ 163,66, 6 pagas / 4 restantes), terno (3 × R$ 50,00, evento 06/12/2026)
e as pendências de R$ 50,00 do irmão e do padrinho, marcadas **A esclarecer** (você escolhe a direção).

---

## 5. Verificações executadas

* `npm test` — 18 testes de regras contábeis: despesa, transferência, aplicação/resgate, bloqueio e
  desbloqueio da caixinha, dados iniciais, registros históricos, parcela (pagamento, duplicidade, estorno),
  receita prevista, pendente, investimento sem posição confirmada, classificação, persistência e backup.
* Os mesmos testes estão disponíveis no app: **Configurações → Testes automáticos** (não alteram seus dados).
* Testes de interface (jsdom) cobrem navegação nas 12 telas, cadastro de despesa/transferência, pagamento e
  estorno de parcela, bloqueio de gasto do valor bloqueado, confirmação de pendente, metas, resgate bloqueado,
  relatórios, backup e data simulada.

---

## 6. Estrutura do projeto

```
index.html                  entrada do app (Vite)
sistema-financeiro.html     ★ entrega: HTML único com CSS/JS embutidos
src/
  App.tsx, main.tsx         composição e roteamento por hash
  store.tsx                 estado, salvamento automático, toasts e confirmações
  lib/
    types.ts                modelo de dados
    seed.ts                 dados iniciais conferidos
    selectors.ts            cálculos derivados (saldos, patrimônio, dívidas, séries, planejamento)
    ops.ts                  operações validadas (lançamentos, contas, parcelas, metas, backup)
    selftests.ts            testes das regras contábeis
    utils.ts                dinheiro, datas, CSV, download
  components/               layout, formulários, modais, gráficos e itens de lançamento
  pages/                    uma tela por módulo
scripts/                    testes em Node e geração do HTML único
```

Saldos **nunca são digitados diretamente**: são sempre derivados de `saldo de referência + efeitos dos
lançamentos efetivos`. Por isso editar/excluir um lançamento recalcula tudo com segurança.
