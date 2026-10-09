// Gera db/seed_contas.local.sql a partir do export dos workflows do n8n (fora do repo).
// Uso: node scripts/gerar_seed_contas.mjs "<pasta do export>"
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const pasta = process.argv[2];
if (!pasta) { console.error('uso: node scripts/gerar_seed_contas.mjs <pasta-do-export>'); process.exit(2); }

const canonico = (b) => (b === 'Itau' ? 'Itaú' : b);
function contasDoWorkflow(arquivo) {
  const wf = JSON.parse(readFileSync(join(pasta, arquivo), 'utf8'));
  const codigo = wf.nodes.filter((n) => n.parameters?.jsCode).map((n) => n.parameters.jsCode).join('\n');
  const re = /accountId:\s*"([0-9a-f-]{36})",\s*dono:\s*"(\w+)",\s*banco:\s*"([^"]+)"(?:,\s*tipo:\s*"([^"]+)")?/g;
  const out = new Map();
  for (const m of codigo.matchAll(re)) out.set(m[1], { dono: m[2], banco: canonico(m[3]), forma: m[4] ?? null });
  return out;
}

const tx = contasDoWorkflow('Finance 2.0.json');
const saldo = contasDoWorkflow('Pluggy - Saldos das Contas.json');
const fatura = contasDoWorkflow('Pluggy - Faturas Carto de Crdito.json');
const inv = contasDoWorkflow('Pluggy - Investimentos.json');

const linhas = [...tx].map(([id, c]) => {
  if (c.forma !== 'Crédito' && c.forma !== 'Débito') throw new Error(`forma desconhecida em ${c.banco}/${c.dono}`);
  return `  ('${id}', '${c.banco}', '${c.dono}', '${c.forma}', true, ${saldo.has(id)}, ${fatura.has(id)}, ${inv.has(id)})`;
});
const sql = `-- GERADO por scripts/gerar_seed_contas.mjs em ${new Date().toISOString()}. NAO COMMITAR.
INSERT INTO pluggy_contas (account_id, banco, responsavel, forma, coleta_transacoes, coleta_saldo, coleta_faturas, coleta_investimentos)
VALUES
${linhas.join(',\n')}
ON CONFLICT (account_id) DO NOTHING;
`;
writeFileSync('db/seed_contas.local.sql', sql);
console.log(`contas: ${linhas.length} | saldo: ${saldo.size} | faturas: ${fatura.size} | investimentos: ${inv.size}`);
