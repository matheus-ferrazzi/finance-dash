import { getContasDoMes, Resp } from '@/lib/queries';
import { brl, normalizeMes } from '@/lib/format';
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

  return (
    <div>
      <PageTitle title="Contas do mês" subtitle="O que tem que pagar e o que já foi pago. Só o banco confirma: o ✓ na mão fica esperando até o pagamento aparecer." />

      <StatStrip stats={[
        { label: 'Entrou', value: brl(r.entrou), tone: 'up' },
        { label: 'Contas do mês', value: brl(r.total) },
        { label: 'Pago', value: brl(r.pago), hint: 'confirmado no banco' },
        { label: 'Falta pagar', value: brl(r.falta), tone: r.falta > 0 ? 'warn' : 'muted',
          hint: r.aConfirmar > 0 ? `${brl(r.aConfirmar)} marcado, esperando o banco` : undefined },
        // mês sem entrada ainda (o que vem, ou antes do salário cair): sobra negativa assustaria à toa
        r.entrou > 0
          ? { label: 'Sobra', value: brl(r.sobra), tone: r.sobra >= 0 ? 'up' : 'down', hint: 'entrou − contas' }
          : { label: 'Sobra', value: '—', tone: 'muted', hint: 'quando o salário cair' },
      ]} />

      <ContasLista mes={mes} resp={resp} itens={r.itens} tiradas={r.tiradas} />
    </div>
  );
}
