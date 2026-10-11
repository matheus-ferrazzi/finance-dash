// jsCode do nó "Monta Mensagem" do n8n (exportado em 11/10/2026), para o teste de equivalência do C2.
const s = $json.st || {};
const probs = [];

// O backup roda 1x/dia as 04h UTC. 30h de folga cobre um atraso sem alarme falso.
const hOk = s.h_desde_ok ?? 9999;
if (hOk > 30) probs.push(`• Postgres (os dados): ultimo OK ${hOk === 9999 ? 'nunca' : 'ha ' + hOk + 'h'}`);

// O n8n guarda a LOGICA: os 12 bots e a ingestao da Pluggy.
const hN8n = s.h_desde_n8n ?? 9999;
if (hN8n > 30) probs.push(`• n8n (os bots): ultimo OK ${hN8n === 9999 ? 'nunca' : 'ha ' + hN8n + 'h'}`);

// A copia no PC depende dele estar ligado, entao 72h aguenta um fim de semana.
const hOff = s.h_desde_offsite ?? 9999;
if (hOff > 72) probs.push(`• Copia no PC: ${hOff === 9999 ? 'nunca foi puxada' : 'ultima ha ' + hOff + 'h'}`);

if ((s.falhas_24h || 0) > 0) {
  const clean = t => String(t || '').replace(/[*_`\[\]]/g, '');
  probs.push(`• ${s.falhas_24h} falha(s) em 24h` + (s.ultimo_erro ? ` — ultima: ${clean(s.ultimo_erro)}` : ''));
}

if (!probs.length) return [];   // tudo certo nao gera mensagem

const mb = s.tamanho ? (s.tamanho / 1048576).toFixed(2) + ' MB' : '?';
const texto = `🗄️ *Backup com problema*\n\n${probs.join('\n')}\n\n` +
  `Ultimo bom: ${mb} / ${s.tabelas || '?'} tabelas, ${s.n8n_workflows || '?'} workflows.\n` +
  `_Conferir:_ \`tail /root/n8n-docker/backups/backup.log\` na VPS, ou o log em 01-financas\backups no PC.`;
return [{ json: { text: texto } }];
