import { NextResponse } from 'next/server';
import { linkDoPeriodo } from '@/lib/botRotas';
import { agregarConsulta, lerPedidoConsulta } from '@/lib/consulta';
import { currentDateSP } from '@/lib/format';
import { getLinhasConsulta } from '@/lib/queries';

export const dynamic = 'force-dynamic';

// 28/10 (Zeca fase 3): a consulta livre do Zeca — o modelo escolhe os parâmetros, o código aplica as regras do painel
export async function GET(req: Request) {
  const hoje = currentDateSP();
  const r = lerPedidoConsulta(new URL(req.url).searchParams, hoje);
  if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: 400 });
  try {
    const res = agregarConsulta(await getLinhasConsulta(r.v), r.v);
    // o link só abre um recorte que o painel tem: um mês ou uma semana inteira
    const p = r.v.periodo;
    const link = r.v.oQue === 'entradas' ? undefined : linkDoPeriodo(p, r.v.pessoa, r.v.grupo, hoje.slice(0, 7));
    return NextResponse.json({ ...res, ...(link ? { link } : {}) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: /timeout|cancel/i.test(msg) ? 'consulta demorou demais: use um período menor' : 'falha na consulta' }, { status: 500 });
  }
}
