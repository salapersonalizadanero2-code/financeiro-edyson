import { useState, type ReactNode } from 'react';
import {
  Banknote, CalendarRange, ChevronLeft, ChevronRight, CreditCard, FileBarChart, Landmark, LayoutDashboard, Menu, Moon,
  Plus, Settings as SettingsIcon, Sun, Tags, Target, TrendingUp, ArrowLeftRight, Wallet, X, Wallet2,
} from 'lucide-react';
import { useApp } from '../store';
import { addMonthsYM, monthLong } from '../lib/utils';
import { updateSettings } from '../lib/ops';
import { TransactionForm } from './TransactionForm';

export const NAV = [
  { id: 'dashboard', label: 'Visão geral', icon: LayoutDashboard },
  { id: 'contas', label: 'Contas e carteiras', icon: Wallet },
  { id: 'lancamentos', label: 'Lançamentos', icon: ArrowLeftRight },
  { id: 'receitas', label: 'Receitas e salário', icon: Banknote },
  { id: 'categorias', label: 'Despesas e categorias', icon: Tags },
  { id: 'dividas', label: 'Dívidas e parcelas', icon: CreditCard },
  { id: 'contratos', label: 'Consórcios e financiamentos', icon: Landmark },
  { id: 'investimentos', label: 'Investimentos', icon: TrendingUp },
  { id: 'metas', label: 'Metas', icon: Target },
  { id: 'planejamento', label: 'Planejamento mensal', icon: CalendarRange },
  { id: 'relatorios', label: 'Relatórios', icon: FileBarChart },
  { id: 'configuracoes', label: 'Configurações e backup', icon: SettingsIcon },
] as const;

const MOBILE = ['dashboard', 'lancamentos', 'contas', 'dividas'];

export function Layout({ children }: { children: ReactNode }) {
  const { page, go, state, commit, ym, setYm, today } = useApp();
  const [drawer, setDrawer] = useState(false);
  const [newTx, setNewTx] = useState(false);
  const dark = state.settings.theme === 'dark';
  const sim = state.settings.simulatedDate;

  const NavList = ({ onPick }: { onPick?: () => void }) => (
    <nav className="flex flex-col gap-0.5">
      {NAV.map((n) => {
        const Icon = n.icon;
        const active = page === n.id;
        return (
          <button
            key={n.id}
            onClick={() => { go(n.id); onPick?.(); }}
            className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${active ? 'bg-brand text-white shadow-sm' : 'text-ink/80 hover:bg-tint'}`}
          >
            <Icon className="h-[18px] w-[18px] shrink-0" />
            {n.label}
          </button>
        );
      })}
    </nav>
  );

  const Brand = () => (
    <div className="flex items-center gap-2.5 px-2">
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand to-brand-dark text-white"><Wallet2 className="h-5 w-5" /></div>
      <div>
        <div className="text-sm leading-tight font-bold">Finanças Pessoais</div>
        <div className="text-[11px] text-muted">dados salvos neste navegador</div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:flex">
      {/* Menu lateral (computador) */}
      <aside className="no-print sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-5 overflow-y-auto border-r border-line bg-card p-4 lg:flex">
        <Brand />
        <NavList />
      </aside>

      {/* Gaveta (celular/tablet) */}
      {drawer && (
        <div className="no-print fixed inset-0 z-[80] lg:hidden" onClick={() => setDrawer(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="pop absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-4 overflow-y-auto bg-card p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <Brand />
              <button onClick={() => setDrawer(false)} className="rounded-lg p-1.5 hover:bg-tint"><X className="h-5 w-5" /></button>
            </div>
            <NavList onPick={() => setDrawer(false)} />
          </div>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <header className="no-print sticky top-0 z-40 flex items-center gap-2 border-b border-line bg-app/85 px-3 py-2.5 backdrop-blur sm:px-6">
          <button onClick={() => setDrawer(true)} className="rounded-xl p-2 hover:bg-tint lg:hidden" aria-label="Menu"><Menu className="h-5 w-5" /></button>
          <div className="flex items-center rounded-xl border border-line bg-card">
            <button onClick={() => setYm(addMonthsYM(ym, -1))} className="cursor-pointer rounded-l-xl p-2 hover:bg-tint" aria-label="Mês anterior"><ChevronLeft className="h-4 w-4" /></button>
            <button onClick={() => setYm(today.slice(0, 7))} title="Voltar ao mês atual" className="min-w-[8.5rem] cursor-pointer px-2 text-center text-xs font-semibold capitalize sm:min-w-[10rem] sm:text-sm">{monthLong(ym)}</button>
            <button onClick={() => setYm(addMonthsYM(ym, 1))} className="cursor-pointer rounded-r-xl p-2 hover:bg-tint" aria-label="Próximo mês"><ChevronRight className="h-4 w-4" /></button>
          </div>
          {sim && <span className="badge hidden bg-warn/15 text-warn sm:inline-flex">Data simulada: {sim.split('-').reverse().join('/')}</span>}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => commit((s) => updateSettings(s, { theme: dark ? 'light' : 'dark' }))}
              className="cursor-pointer rounded-xl border border-line bg-card p-2 hover:bg-tint"
              aria-label="Alternar tema"
              title={dark ? 'Tema claro' : 'Tema escuro'}
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button className="btn-primary" onClick={() => setNewTx(true)}><Plus className="h-4 w-4" /><span className="hidden sm:inline">Novo lançamento</span><span className="sm:hidden">Novo</span></button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl px-3 py-5 pb-28 sm:px-6 lg:pb-10">{children}</main>
      </div>

      {/* Navegação inferior (celular) */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-line bg-card/95 backdrop-blur lg:hidden">
        {MOBILE.map((id) => {
          const n = NAV.find((x) => x.id === id)!;
          const Icon = n.icon;
          const active = page === id;
          return (
            <button key={id} onClick={() => go(id)} className={`flex cursor-pointer flex-col items-center gap-0.5 py-2 text-[10px] font-semibold ${active ? 'text-brand' : 'text-muted'}`}>
              <Icon className="h-5 w-5" />
              {n.label.split(' ')[0]}
            </button>
          );
        })}
        <button onClick={() => setDrawer(true)} className="flex cursor-pointer flex-col items-center gap-0.5 py-2 text-[10px] font-semibold text-muted">
          <Menu className="h-5 w-5" />
          Mais
        </button>
      </nav>

      {newTx && <TransactionForm onClose={() => setNewTx(false)} />}
    </div>
  );
}
