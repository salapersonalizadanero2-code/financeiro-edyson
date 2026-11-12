// Executa as mesmas verificações contábeis disponíveis em Configurações → Testes automáticos,
// sem precisar abrir o navegador. Uso: npm test
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(path.join(tmpdir(), 'financas-testes-'));
const outfile = path.join(dir, 'selftests.mjs');
try {
  await build({
    stdin: {
      contents: "import { runSelfTests } from './src/lib/selftests';\nexport { runSelfTests };",
      resolveDir: process.cwd(),
      loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile,
    logLevel: 'error',
  });
  const { runSelfTests } = await import(pathToFileURL(outfile).href);
  const results = runSelfTests();
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'} | ${r.name}${r.ok ? '' : ' | ' + r.detail}`);
  }
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} testes aprovados.`);
  process.exitCode = passed === results.length ? 0 : 1;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
