// jsCode do nó "Monta Mensagem" do n8n (exportado em 11/10/2026), para o teste de equivalência do C2.
const p = $json;
const brl = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Sem dias restantes nao ha o que distribuir: no ultimo dia do mes a conta
// "quanto por dia" nao diz nada.
if (!p.diasRestantes || p.diasRestantes <= 0) return [];

const seguro = p.ritmoSeguroDia || 0;
const atual  = p.ritmoAtualDia  || 0;
const acima  = atual > seguro;
const pct    = seguro > 0 ? Math.round(((atual - seguro) / seguro) * 100) : 0;

const entra = (p.receitasAReceber || [])
  .reduce((s, r) => s + Number(r.valor || 0), 0);

const linhas = [
  `🎯 *Ritmo de hoje*`,
  ``,
  `Da pra gastar *${brl(seguro)}* hoje.`,
  `Voce vem gastando ${brl(atual)}/dia` + (acima ? ` — *${pct}% acima*.` : ` — dentro do que cabe.`),
  ``,
  `Nesse ritmo ${p.mesLabel} fecha em *${brl(p.fechaCom)}*.`,
  `Faltam ${p.diasRestantes} dias` + (entra > 0 ? ` e ainda entram ${brl(entra)}.` : `.`),
];
return [{ json: { text: linhas.join('\n') } }];
