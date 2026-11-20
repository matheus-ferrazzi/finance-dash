/**
 * 20/11/2026: a VPS saiu da Hostinger para a Serverspace, que cobra por hora de um crédito pré-pago — sem saldo, a
 * máquina para. O aviso técnico lê o saldo do projeto pela API pública (`GET /api/v1/project`, cabeçalho X-API-KEY).
 */
type Fetcher = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>;

export async function lerSaldoServerspace(o: { url: string; chave: string; fetcher?: Fetcher }): Promise<{ saldo: number; moeda: string }> {
  const f = o.fetcher ?? (fetch as unknown as Fetcher);
  const r = await f(`${o.url.replace(/\/+$/, '')}/api/v1/project`, { headers: { 'X-API-KEY': o.chave }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const p = (await r.json())?.project;
  const saldo = Number(p?.balance);
  // sem saldo numérico é erro, nunca "saldo zero" (avisaria máquina parando por resposta estranha)
  if (p?.balance === undefined || p?.balance === null || !Number.isFinite(saldo)) throw new Error('resposta sem saldo');
  return { saldo, moeda: String(p.currency ?? 'BRL') };
}
