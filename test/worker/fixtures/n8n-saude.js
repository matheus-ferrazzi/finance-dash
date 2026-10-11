// jsCode do nó "Monta Mensagem" do n8n (exportado em 11/10/2026), para o teste de equivalência do C2.
const s = $json.saude || {};
const LIM = 36;
const probs = [];
if ((s.h_faturas ?? 999) > LIM) probs.push(`• Faturas: sem atualizar há ${s.h_faturas}h`);
if ((s.h_investimentos ?? 999) > LIM) probs.push(`• Investimentos: sem atualizar há ${s.h_investimentos}h`);
if ((s.h_lancamentos ?? 999) > 72) probs.push(`• Lançamentos: nada novo há ${s.h_lancamentos}h (pode ser normal se sem gastos)`);
if ((s.h_worker_ok ?? 999) > 19) probs.push(`• Ingestão (worker): última rodada completa há ${s.h_worker_ok ?? '—'}h`);
if ((s.worker_falhas_24h ?? 0) > 0) probs.push(`• Ingestão (worker): ${s.worker_falhas_24h} rodada(s) com falha nas últimas 24h`);
if (!probs.length) return [];
const texto = `⚠️ *Alerta de sincronização*\n\nAlgo pode ter parado de atualizar:\n${probs.join('\n')}\n\nÚltimo lançamento: ${s.ultimo_lancamento || '—'}`;
return [{ json: { text: texto } }];
