import { AppProvider, useApp } from './store';
import { Layout } from './components/Layout';
import Dashboard from './pages/Dashboard';
import Accounts from './pages/Accounts';
import Transactions from './pages/Transactions';
import Income from './pages/Income';
import Categories from './pages/Categories';
import Debts from './pages/Debts';
import Contracts from './pages/Contracts';
import Investments from './pages/Investments';
import Goals from './pages/Goals';
import Planning from './pages/Planning';
import Reports from './pages/Reports';
import Settings from './pages/Settings';

function Router() {
  const { page } = useApp();
  switch (page) {
    case 'contas': return <Accounts />;
    case 'lancamentos': return <Transactions />;
    case 'receitas': return <Income />;
    case 'categorias': return <Categories />;
    case 'dividas': return <Debts />;
    case 'contratos': return <Contracts />;
    case 'investimentos': return <Investments />;
    case 'metas': return <Goals />;
    case 'planejamento': return <Planning />;
    case 'relatorios': return <Reports />;
    case 'configuracoes': return <Settings />;
    default: return <Dashboard />;
  }
}

export default function App() {
  return (
    <AppProvider>
      <Layout>
        <Router />
      </Layout>
    </AppProvider>
  );
}
