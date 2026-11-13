#!/usr/bin/env node
// Inventário de uma conexão da Pluggy, só leitura (13/11/2026). Serve para ver o que uma chave nova devolve antes
// de ligá-la no worker: contas, investimentos e empréstimos de um item.
//
// A chave vem do 1Password na hora, pelo `op` (que pede a sua confirmação); nada é gravado nem impresso da chave.
//   node scripts/pluggy-inventario.mjs "api inter pluggy" [item-id]
// O item do 1Password precisa de dois campos cujo rótulo contenha "client id" e "secret". O item-id (o da conexão,
// que aparece no Meu Pluggy) pode estar num campo com "item" no rótulo ou vir como segundo argumento.
import { execFileSync } from 'node:child_process';

const [, , nomeItem, itemIdArg] = process.argv;
if (!nomeItem) {
  console.error('uso: node scripts/pluggy-inventario.mjs NOME_DO_ITEM_NO_COFRE [ITEM_ID_DA_PLUGGY]');
  process.exit(1);
}

function lerItem(nome) {
  let json;
  try {
    json = execFileSync('op', ['item', 'get', nome, '--format', 'json'], { encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'] });
  } catch {
    console.error(`não consegui ler "${nome}" no 1Password (o op está logado? o nome do item está certo?)`);
    process.exit(1);
  }
  const campos = (JSON.parse(json).fields ?? []).filter((f) => f.value);
  const achar = (re) => campos.find((f) => re.test(`${f.label ?? ''} ${f.id ?? ''}`))?.value;
  const clientId = achar(/client.?id/i);
  const clientSecret = achar(/secret/i);
  if (!clientId || !clientSecret) {
    // só os rótulos, nunca os valores
    console.error(`não achei os campos. Rótulos que existem no item: ${campos.map((f) => f.label).join(', ')}`);
    console.error('preciso de um com "client id" e outro com "secret" no rótulo');
    process.exit(1);
  }
  return { clientId, clientSecret, itemId: itemIdArg ?? achar(/item/i) };
}

const base = 'https://api.pluggy.ai';
async function pluggy(caminho, apiKey) {
  const r = await fetch(base + caminho, { headers: { 'X-API-KEY': apiKey } });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${caminho.split('?')[0]}: HTTP ${r.status} ${corpo.message ?? ''}`.trim());
  return corpo;
}
const brl = (v) => (typeof v === 'number' ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—');
const dia = (s) => (s ? String(s).slice(0, 10) : '—');

const { clientId, clientSecret, itemId } = lerItem(nomeItem);
const auth = await fetch(`${base}/auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, clientSecret }) });
if (!auth.ok) { console.error(`a Pluggy recusou a chave (HTTP ${auth.status})`); process.exit(1); }
const { apiKey } = await auth.json();
console.log('chave aceita pela Pluggy');
if (!itemId) {
  console.error('falta o item-id da conexão: copie do Meu Pluggy e passe como segundo argumento');
  process.exit(1);
}

const item = await pluggy(`/items/${itemId}`, apiKey);
console.log(`\n== conexão: ${item.connector?.name ?? '?'}`);
console.log(`estado ${item.status} / ${item.executionStatus} · atualizada em ${dia(item.lastUpdatedAt)} · próxima automática ${dia(item.nextAutoSyncAt)} · consentimento até ${dia(item.consentExpiresAt)}`);
console.log(`produtos: ${(item.products ?? item.connector?.products ?? []).join(', ') || '—'}`);

const contas = (await pluggy(`/accounts?itemId=${itemId}`, apiKey)).results ?? [];
console.log(`\n== contas (${contas.length})`);
for (const c of contas) console.log(`${c.type}/${c.subtype} · ${c.name} · saldo ${brl(c.balance)} · id ${c.id}`);

// os campos variam por banco e por produto: mostra todos os simples (texto, número, data), sem adivinhar nomes
const campos = (o) => Object.entries(o)
  .filter(([k, v]) => v !== null && v !== '' && typeof v !== 'object' && !/^(id|itemId|code|isin|number|owner)$/i.test(k))
  .map(([k, v]) => `${k}=${typeof v === 'number' ? Math.round(v * 100) / 100 : String(v).slice(0, 40)}`).join(' · ');

const inv = (await pluggy(`/investments?itemId=${itemId}&pageSize=100`, apiKey)).results ?? [];
console.log(`\n== investimentos (${inv.length})`);
for (const i of inv) console.log(`- ${campos(i)}`);
console.log(`soma de balance: ${brl(inv.reduce((s, i) => s + (i.balance ?? 0), 0))}`);

let emprestimos = [];
try {
  emprestimos = (await pluggy(`/loans?itemId=${itemId}`, apiKey)).results ?? [];
} catch (e) {
  console.log(`\n== empréstimos: a consulta falhou (${e.message})`);
}
console.log(`\n== empréstimos (${emprestimos.length})`);
for (const l of emprestimos) {
  console.log(`- ${campos(l)}`);
  for (const [k, v] of Object.entries(l)) if (v && typeof v === 'object' && !Array.isArray(v)) console.log(`    ${k}: ${campos(v)}`);
}
if (!emprestimos.length) console.log('nenhum contrato devolvido para esta conexão');
