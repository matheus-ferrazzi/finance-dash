import { NextRequest, NextResponse } from 'next/server';
import { consultarCredito, ErroConsulta } from '@/lib/apiBrasil';
import { horasDesdeConsulta, registrarConsulta, relerConsulta } from '@/lib/queries';

/** Uma consulta real por pessoa a cada 20 h: clique duplo ou recarga não pagam duas vezes. */
const HORAS_ENTRE_CONSULTAS = 20;

/**
 * 14/11: consulta de crédito sob demanda (fase "nome limpo"). Corpo: { responsavel, homolog? }.
 * O token e os CPFs ficam no ambiente do painel (/root/n8n-docker/.env.apibrasil, gravado por
 * scripts/f-credenciais-env.sh); nada disso passa pelo navegador. `homolog: true` testa de graça e não grava nada.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  // { reler: id }: relê o dossiê já pago com o leitor atual (sem cobrança)
  if (body?.reler !== undefined) {
    const id = Number(body.reler);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ erro: 'Consulta inválida.' }, { status: 400 });
    try {
      const r = await relerConsulta(id);
      return r ? NextResponse.json(r) : NextResponse.json({ erro: 'Consulta não encontrada.' }, { status: 404 });
    } catch (e) {
      return NextResponse.json({ erro: e instanceof Error ? e.message : 'Não deu para reler.' }, { status: 400 });
    }
  }
  const resp = body?.responsavel;
  if (resp !== 'Matheus' && resp !== 'Ariane') return NextResponse.json({ erro: 'A consulta é do Matheus ou da Ariane.' }, { status: 400 });
  const homolog = body?.homolog === true;
  const token = process.env.APIBRASIL_TOKEN;
  const cpf = process.env[resp === 'Matheus' ? 'APIBRASIL_CPF_MATHEUS' : 'APIBRASIL_CPF_ARIANE'];
  if (!token) return NextResponse.json({ erro: 'Token da API Brasil não configurado no painel.' }, { status: 503 });
  if (!cpf) return NextResponse.json({ erro: `CPF ${resp === 'Matheus' ? 'do Matheus' : 'da Ariane'} não configurado.` }, { status: 503 });

  // soScr: só o endividamento (R$ 4,80); repetir: passa a trava de 20 h (usado à mão, nunca pela tela)
  const soScr = body?.soScr === true;
  if (!homolog && body?.repetir !== true) {
    const h = await horasDesdeConsulta(resp);
    if (h !== null && h < HORAS_ENTRE_CONSULTAS) {
      return NextResponse.json({ erro: `Já houve consulta ${resp === 'Matheus' ? 'do Matheus' : 'da Ariane'} há ${Math.max(1, Math.round(h))} h. Espere ${HORAS_ENTRE_CONSULTAS} h entre uma e outra.` }, { status: 429 });
    }
  }

  try {
    const r = await consultarCredito({ cpf, token, homolog, soScr });
    if (homolog) {
      // amostra fictícia: devolve para conferir o formato, sem gravar
      return NextResponse.json({ homolog: true, score: r.score, faixa: r.faixa, scr: r.scr, dividas: r.dividas.length, naoLidas: r.naoLidas, avisos: r.avisos });
    }
    const g = await registrarConsulta(resp, r);
    return NextResponse.json({ id: g.id, custo: r.custo, score: r.score, faixa: r.faixa, dividas: r.dividas.length, novas: g.novas, limpas: g.limpas, naoLidas: r.naoLidas, avisos: r.avisos });
  } catch (e) {
    if (e instanceof ErroConsulta) return NextResponse.json({ erro: e.message }, { status: e.status === 402 ? 402 : 502 });
    console.error('consulta de crédito:', e instanceof Error ? e.message : e);
    return NextResponse.json({ erro: 'A consulta falhou. Nada foi gravado.' }, { status: 500 });
  }
}
