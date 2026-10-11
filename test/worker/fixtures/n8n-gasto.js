// jsCode do nó "Monta Mensagem" do n8n (exportado em 11/10/2026), para o teste de equivalência do C2.
const LIMITE = 500;
const txs = $json.txs || [];
const store = $getWorkflowStaticData('global');
const last = store.lastCriadoEm || '';
const novos = last ? txs.filter(t => t.criado_em > last) : [];
if (txs.length) store.lastCriadoEm = txs.reduce((m,t)=> t.criado_em>m ? t.criado_em : m, last);
// primeira execução: só define baseline, não alerta histórico
if (!last || !novos.length) return [];
const clean = s => String(s).replace(/[*_`\[\]]/g,'');
const brl = v => Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const linhas = novos.map(t => `• ${brl(t.valor)} — ${clean(t.descricao)} (${t.banco}, ${t.responsavel}, ${t.data})`);
const texto = `💸 *Gasto acima de ${brl(LIMITE)}*\n\n${linhas.join('\n')}\n\n_Se não reconhece, confira no app do banco._`;
return [{ json: { text: texto } }];
