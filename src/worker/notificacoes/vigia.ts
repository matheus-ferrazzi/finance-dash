// Vigia da sessão do WhatsApp (Onda 2 / S1, auditoria 13/10/2026). O aviso técnico sai pelo próprio WhatsApp:
// se a sessão cair, ninguém fica sabendo. A cada 6 h o worker pergunta o estado à Evolution e, fora de "open",
// avisa por outro canal (Telegram).

type Fetcher = (url: string, init: { method: string; headers: Record<string, string>; signal?: AbortSignal }) => Promise<{
  ok: boolean; status?: number; json: () => Promise<any>;
}>;

/** Estado da instância na Evolution ('open', 'close', 'connecting'…). A chave nunca entra no texto do erro. */
export async function estadoDaSessao(baseUrl: string, apiKey: string, instancia: string, fetcher: Fetcher = fetch as unknown as Fetcher): Promise<string> {
  const r = await fetcher(`${baseUrl}/instance/connectionState/${instancia}`, {
    method: 'GET', headers: { apikey: apiKey }, signal: AbortSignal.timeout(15000),
  }).catch((e: unknown) => { throw new Error(String(e instanceof Error ? e.message : e).split(apiKey).join('***')); });
  if (!r.ok) throw new Error(`Evolution HTTP ${r.status}`);
  const j = await r.json().catch(() => ({}));
  return String(j?.instance?.state ?? j?.state ?? 'desconhecido');
}

/** Pergunta o estado; fora de "open" (ou erro), manda o aviso pelo canal reserva. Devolve o estado (ou 'erro'). */
export async function vigiarWhatsApp(
  estado: () => Promise<string>, reserva: { enviar: (t: string) => Promise<void> } | null,
): Promise<string> {
  let e: string, detalhe = '';
  try { e = await estado(); } catch (x) { e = 'erro'; detalhe = ` — ${x instanceof Error ? x.message : String(x)}`; }
  if (e !== 'open' && reserva) {
    await reserva.enviar([
      `⚠️ A sessão do WhatsApp do Finanças não está conectada (estado: ${e}${detalhe}).`,
      'As mensagens do grupo e o aviso técnico não estão saindo.',
      'Para reconectar, na VPS: bash /root/finance-worker-src/scripts/d-whatsapp-conectar.sh',
    ].join('\n'));
  }
  return e;
}
