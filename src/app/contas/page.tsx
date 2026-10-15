import { getContasDoMes, getFaturas, getPrevisaoResumo, getRealizado, Resp } from '@/lib/queries';
import { brl, currentDateSP, mesLabel, normalizeMes } from '@/lib/format';
import { destaqueDoTopo } from '@/lib/contas';
import { linkPara } from '@/lib/links';
import { CardResposta } from '../components/CardResposta';
import { ContasLista } from '../components/ContasLista';
import { Elo } from '../components/Elo';

export const dynamic = 'force-dynamic';

function resolveResp(v?: string): Resp {
  return v === 'Matheus' || v === 'Ariane' ? v : 'casal';
}

// Onda 5: "O que ainda falta pagar este mês?" — o mês vem do seletor do topo (?mes=), como nas outras telas
export default async function Contas({ searchParams }: { searchParams: { resp?: string; mes?: string } }) {
  const resp = resolveResp(searchParams.resp);
  const mes = normalizeMes(searchParams.mes);
  const [r, faturas] = await Promise.all([getContasDoMes(resp, mes), getFaturas(resp).catch(() => [])]);
  // N6: no casal o número do elo vem da previsão (mês atual) ou do realizado (mês passado)
  const atual = currentDateSP().slice(0, 7);
  const quando = mes === atual ? 'atual' : mes < atual ? 'passado' : 'futuro';
  const fecha = resp !== 'casal' || quando === 'futuro' ? null
    : quando === 'atual' ? (await getPrevisaoResumo('casal')).fechaCom : (await getRealizado(mes)).saldo;
  const topo = destaqueDoTopo(resp, r, fecha, quando);

  const pagasN = r.itens.filter((i) => i.status === 'pago').length;
  const faltam = r.itens.length - pagasN;
  const pctPagas = r.itens.length ? Math.round((pagasN / r.itens.length) * 100) : 0;

  return (
    <div>
      <CardResposta pergunta={`Falta pagar em ${mesLabel(mes)}`} valor={r.falta > 0 ? brl(r.falta) : 'Tudo pago'} dinheiro={r.falta > 0}
        tom={r.falta > 0 ? 'atencao' : 'bom'}
        apoio={r.itens.length ? `${faltam} conta(s) · ${pagasN} de ${r.itens.length} já pagas` : 'Nenhuma conta cadastrada para este mês'}>
        {r.itens.length > 0 && (
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3">
            <div className="h-full rounded-full bg-accent" style={{ width: `${pctPagas}%` }} />
          </div>
        )}
      </CardResposta>

      <ContasLista mes={mes} resp={resp} itens={r.itens} tiradas={r.tiradas}
        cartoes={faturas.map((f) => ({ banco: f.banco, responsavel: f.responsavel }))} />

      {topo.valor !== null && (
        <div className="mt-3">
          <Elo href={linkPara('previsao', { resp })} acao="previsão">
            Entrou <span className="money">{brl(r.entrou)}</span> · {topo.label.toLowerCase()}{' '}
            <span className={`money ${topo.valor < 0 ? 'text-despesa' : 'text-accent'}`}>{brl(topo.valor)}</span>
          </Elo>
        </div>
      )}
    </div>
  );
}
