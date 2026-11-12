// Gera o arquivo único (HTML + CSS + JS embutidos) pronto para abrir no navegador.
// Uso: npm run build:single  → gera dist/index.html e sistema-financeiro.html
import { build } from 'vite';
import { copyFileSync, statSync } from 'node:fs';

await build({ logLevel: 'info' });
copyFileSync('dist/index.html', 'sistema-financeiro.html');
const kb = (statSync('sistema-financeiro.html').size / 1024).toFixed(1);
console.log(`\n✔ sistema-financeiro.html gerado (${kb} kB) — abra com duplo clique no navegador.`);
