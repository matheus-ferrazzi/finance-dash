import { NextRequest, NextResponse } from 'next/server';
import { getPrevisaoResumo, Resp } from '@/lib/queries';

export const dynamic = 'force-dynamic';

function resolveResp(v: string | null): Resp {
  return v === 'Matheus' || v === 'Ariane' ? v : 'casal';
}

/**
 * Previsão do mês em JSON. Existe pros bots do Telegram consumirem em vez de
 * reimplementar a conta em SQL dentro do n8n — uma lógica só, num lugar só.
 * Externamente fica atrás do Cloudflare Access como o resto do site; os bots
 * chamam por dentro da rede do Docker.
 */
export async function GET(req: NextRequest) {
  const resp = resolveResp(req.nextUrl.searchParams.get('resp'));
  const resumo = await getPrevisaoResumo(resp);
  return NextResponse.json(resumo);
}
