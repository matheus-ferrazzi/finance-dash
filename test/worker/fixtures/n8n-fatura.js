// jsCode do nó "Monta Mensagem" do n8n (exportado em 11/10/2026), para o teste de equivalência do C2.
const fats = $json.faturas || [];
if (!fats.length) return [];
const store = $getWorkflowStaticData('global');
let done = store.alertados || [];
const key = f => `${f.banco}|${f.responsavel}|${f.venc_iso}`;
// alerta cada fatura só uma vez por ciclo (quando entra na janela de 0-3 dias)
const novos = fats.filter(f => !done.includes(key(f)));
if (!novos.length) return [];
store.alertados = done.concat(novos.map(key)).slice(-100);
const brl = v => Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const linhas = novos.map(f => {
  const q = f.dias===0 ? 'vence *hoje*' : f.dias===1 ? 'vence *amanhã*' : `vence em *${f.dias} dias*`;
  return `• ${f.banco} (${f.responsavel}): ${brl(f.valor)} — ${q} (${f.venc})`;
});
const texto = `📅 *Vencimento de fatura*\n\n${linhas.join('\n')}\n\n_Programe o pagamento pra não pagar juros._`;
return [{ json: { text: texto } }];
