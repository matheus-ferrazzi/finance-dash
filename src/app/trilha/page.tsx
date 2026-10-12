import { getTrilhaDados, listarAjustesTrilha } from '@/lib/queries';
import { avaliarTrilha } from '@/lib/trilha';
import { PageTitle } from '../components/ui';
import { CartaoFase } from '../components/CartaoFase';

export const dynamic = 'force-dynamic';

export default async function TrilhaPagina() {
  const [d, ajustes] = await Promise.all([getTrilhaDados(), listarAjustesTrilha()]);
  const t = avaliarTrilha(d);
  const alteradas = new Set(ajustes.metas.map((m) => m.chave));
  const metasPadrao = { meses: !alteradas.has('meses_reserva'), patrimonio: !alteradas.has('meta_patrimonio') };
  return (
    <div>
      <PageTitle title="Trilha" subtitle="Sair das dívidas, fazer sobrar, montar a reserva e construir patrimônio — sempre do casal." />
      {t.fases.map((f) => (
        <CartaoFase key={f.n} fase={f} trilha={t} dividas={d.dividas} atrasos={d.atrasos} gastoTravado={d.gastoTravado} aplicacaoMensal={d.aplicacaoMensal} metasPadrao={metasPadrao} />
      ))}
    </div>
  );
}
