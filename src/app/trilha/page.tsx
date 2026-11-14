import { getDividasExternas, getTrilhaDados, getUltimasConsultas, listarAjustesTrilha } from '@/lib/queries';
import { avaliarTrilha } from '@/lib/trilha';
import { PageTitle } from '../components/ui';
import { CartaoFase, DividasEmDia, type ConsultaTrilha } from '../components/CartaoFase';

export const dynamic = 'force-dynamic';

export default async function TrilhaPagina() {
  const [d, ajustes, externas, ultimas] = await Promise.all([getTrilhaDados(), listarAjustesTrilha(), getDividasExternas(), getUltimasConsultas()]);
  const t = avaliarTrilha(d);
  const alteradas = new Set(ajustes.metas.map((m) => m.chave));
  const metasPadrao = { meses: !alteradas.has('meses_reserva'), patrimonio: !alteradas.has('meta_patrimonio') };
  // 14/11: só o "tem ou não tem" do CPF sai do servidor; o número fica no ambiente do painel
  const comToken = Boolean(process.env.APIBRASIL_TOKEN);
  const consulta: ConsultaTrilha = {
    cpfs: { Matheus: comToken && Boolean(process.env.APIBRASIL_CPF_MATHEUS), Ariane: comToken && Boolean(process.env.APIBRASIL_CPF_ARIANE) },
    ultimas,
  };
  return (
    <div>
      <PageTitle title="Trilha" subtitle="Parar de criar dívida, limpar o nome, montar a reserva e construir patrimônio — sempre do casal." />
      {t.fases.map((f) => (
        <div key={f.n}>
          <CartaoFase fase={f} trilha={t} atrasos={d.atrasos} gastoTravado={d.gastoTravado} aplicacaoMensal={d.aplicacaoMensal} metasPadrao={metasPadrao} externas={externas.abertas} consulta={consulta} />
          {/* as parcelas em dia ficam logo depois da fase 1, sem travar nenhuma */}
          {f.n === 1 && <DividasEmDia dividas={d.dividas} />}
        </div>
      ))}
    </div>
  );
}
