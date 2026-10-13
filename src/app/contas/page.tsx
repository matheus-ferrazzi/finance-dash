import { getContasDoMes, getPrevisaoResumo, getRealizado, Resp } from '@/lib/queries';
import { brl, currentDateSP, normalizeMes } from '@/lib/format';
import { destaqueDoTopo } from '@/lib/contas';
import { PageTitle, StatStrip } from '../components/ui';
import { ContasLista } from '../components/ContasLista';

export const dynamic = 'force-dynamic';

function resolveResp(v?: string): Resp {
  return v === 'Matheus' || v === 'Ariane' ? v : 'casal';
}

// o mês vem do seletor do topo (?mes=), como nas outras telas
export default async function Contas({ searchParams }: { searchParams: { resp?: string; mes?: string } }) {
  const resp = resolveResp(searchParams.resp);
  const mes = normalizeMes(searchParams.mes);
  const r = await getContasDoMes(resp, mes);
  // N6: no casal o número do topo vem da previsão (mês atual) ou do realizado (mês passado)
  const atual = currentDateSP().slice(0, 7);
  const quando = mes === atual ? 'atual' : mes < atual ? 'passado' : 'futuro';
  const fecha = resp !== 'casal' || quando === 'futuro' ? null
    : quando === 'atual' ? (await getPrevisaoResumo('casal')).fechaCom : (await getRealizado(mes)).saldo;
  const topo = destaqueDoTopo(resp, r, fecha, quando);

  return (
    <div>
      <PageTitle title="Contas do mês" subtitle="O que tem que pagar e o que já foi pago. Só o banco confirma: o ✓ na mão fica esperando até o pagamento aparecer." />

      <StatStrip stats={[
        { label: 'Entrou', value: brl(r.entrou), tone: 'up' },
        { label: 'Contas do mês', value: brl(r.total) },
        { label: 'Pago', value: brl(r.pago), hint: 'confirmado no banco' },
        { label: 'Falta pagar', value: brl(r.falta), tone: r.falta > 0 ? 'warn' : 'muted',
          hint: r.aConfirmar > 0 ? `${brl(r.aConfirmar)} marcado, esperando o banco` : undefined },
        topo.valor === null
          ? { label: topo.label, value: '—', tone: 'muted', hint: topo.hint }
          : { label: topo.label, value: brl(topo.valor), tone: topo.valor >= 0 ? 'up' : 'down', hint: topo.hint },
      ]} />

      <ContasLista mes={mes} resp={resp} itens={r.itens} tiradas={r.tiradas} />
    </div>
  );
}
