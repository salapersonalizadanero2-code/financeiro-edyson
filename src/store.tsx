import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AppState } from './lib/types';
import { createSeedState } from './lib/seed';
import { normalizeState } from './lib/ops';
import { todayISO } from './lib/utils';
import { AlertTriangle, CheckCircle2, X, XCircle } from 'lucide-react';

const KEY = 'financas-pessoais-roxo:v1';

function load(): { state: AppState; notice: string | null } {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { state: createSeedState(), notice: null };
    return { state: normalizeState(JSON.parse(raw)), notice: null };
  } catch (e) {
    return {
      state: createSeedState(),
      notice: 'Não foi possível ler os dados salvos neste navegador (' + (e as Error).message + '). Dados iniciais carregados — se você tem um backup, restaure em Configurações.',
    };
  }
}

type ToastKind = 'success' | 'error' | 'info';
interface ToastItem { id: number; kind: ToastKind; text: string }
interface ConfirmOpts { title: string; message: string; confirmLabel?: string; danger?: boolean }

interface Ctx {
  state: AppState;
  today: string;
  ym: string;
  setYm: (ym: string) => void;
  page: string;
  go: (page: string) => void;
  /** Aplica uma operação pura; trata erros e exibe mensagens. Retorna true se aplicou. */
  commit: (fn: (s: AppState) => AppState, okMsg?: string) => boolean;
  replaceState: (s: AppState) => void;
  toast: (text: string, kind?: ToastKind) => void;
  confirm: (o: ConfirmOpts) => Promise<boolean>;
  storageNotice: string | null;
}

const AppCtx = createContext<Ctx | null>(null);

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp fora do Provider');
  return c;
}

const PAGES = ['dashboard', 'contas', 'lancamentos', 'receitas', 'categorias', 'dividas', 'contratos', 'investimentos', 'metas', 'planejamento', 'relatorios', 'configuracoes'];

export function AppProvider({ children }: { children: ReactNode }) {
  const initial = useRef(load());
  const [state, setState] = useState<AppState>(initial.current.state);
  const stateRef = useRef(state);
  const [clock, setClock] = useState(todayISO());
  const [ym, setYm] = useState(() => todayISO().slice(0, 7));
  const [page, setPage] = useState(() => {
    const h = window.location.hash.replace('#/', '').replace('#', '');
    return PAGES.includes(h) ? h : 'dashboard';
  });
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [dialog, setDialog] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const saveFailed = useRef(false);
  const tid = useRef(0);

  const toast = useCallback((text: string, kind: ToastKind = 'info') => {
    const id = ++tid.current;
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 3500);
  }, []);

  const commit = useCallback(
    (fn: (s: AppState) => AppState, okMsg?: string) => {
      try {
        const next = fn(stateRef.current);
        stateRef.current = next;
        setState(next);
        if (okMsg) toast(okMsg, 'success');
        return true;
      } catch (e) {
        toast((e as Error).message || 'Não foi possível concluir a operação.', 'error');
        return false;
      }
    },
    [toast],
  );

  const replaceState = useCallback((s: AppState) => {
    stateRef.current = s;
    setState(s);
  }, []);

  // Salvamento automático no navegador
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      saveFailed.current = false;
    } catch {
      if (!saveFailed.current) {
        saveFailed.current = true;
        toast('Não foi possível salvar no navegador (armazenamento cheio ou bloqueado). Faça um backup agora!', 'error');
      }
    }
  }, [state, toast]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', state.settings.theme === 'dark');
  }, [state.settings.theme]);

  useEffect(() => {
    const i = setInterval(() => setClock(todayISO()), 60000);
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    if (initial.current.notice) toast(initial.current.notice, 'error');
  }, [toast]);

  const go = useCallback((p: string) => {
    setPage(p);
    window.location.hash = '#/' + p;
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    const onHash = () => {
      const h = window.location.hash.replace('#/', '').replace('#', '');
      if (PAGES.includes(h)) setPage(h);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const confirm = useCallback(
    (o: ConfirmOpts) => new Promise<boolean>((resolve) => setDialog({ ...o, resolve })),
    [],
  );

  const today = state.settings.simulatedDate ?? clock;

  const value = useMemo<Ctx>(
    () => ({ state, today, ym, setYm, page, go, commit, replaceState, toast, confirm, storageNotice: initial.current.notice }),
    [state, today, ym, page, go, commit, replaceState, toast, confirm],
  );

  const close = (v: boolean) => {
    dialog?.resolve(v);
    setDialog(null);
  };

  return (
    <AppCtx.Provider value={value}>
      {children}
      <div className="no-print pointer-events-none fixed right-4 bottom-20 z-[100] flex w-[min(92vw,380px)] flex-col gap-2 lg:bottom-4">
        {toasts.map((t) => (
          <div key={t.id} className="pop pointer-events-auto flex items-start gap-2 rounded-xl border border-line bg-card p-3 text-sm shadow-lg">
            {t.kind === 'success' && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" />}
            {t.kind === 'error' && <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-bad" />}
            {t.kind === 'info' && <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />}
            <span className="flex-1">{t.text}</span>
            <button onClick={() => setToasts((l) => l.filter((x) => x.id !== t.id))} className="text-muted"><X className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
      {dialog && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4" onClick={() => close(false)}>
          <div className="pop card w-full max-w-md p-5" onClick={(e) => e.stopPropagation()} role="alertdialog">
            <h3 className="text-lg font-bold">{dialog.title}</h3>
            <p className="mt-2 text-sm whitespace-pre-line text-muted">{dialog.message}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => close(false)}>Cancelar</button>
              <button className={dialog.danger ? 'btn bg-bad text-white hover:opacity-90' : 'btn-primary'} onClick={() => close(true)} autoFocus>
                {dialog.confirmLabel ?? 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppCtx.Provider>
  );
}
