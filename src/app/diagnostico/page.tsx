import { getDiagnostico, Resp } from '@/lib/queries';
import { brl, traduzCategoria } from '@/lib/format';
import { PageTitle, SectionTitle } from '../components/ui';
import { SimuladorCorte } from '../components/SimuladorCorte';
import { TrendingUp, TrendingDown, HelpCircle } from 'lucide-react';

export const dynamic = 'force-dynamic';

function resolveResp(v?: string): Resp {
  return v === 'Matheus' || v === 'Ariane' ? v : 'casal';
}

export default async function Diagnostico({ searchParams }: { searchParams: { resp?: string } }) {
  const resp = resolveResp(searchParams.resp);
  const d = await getDiagnostico(resp);

  const estourou = d.pctGastoDaRenda > 100;
  const maiorGrupo = d.grupos[0];
  const subiu = d.variacoes.filter((v) => v.delta > 0).slice(0, 5);
  const caiu = d.variacoes.filter((v) => v.delta < 0).slice(-3).reverse();
  const maxGrupo = Math.max(...d.grupos.map((g) => g.total), 1);

  return (
    <div>
      <PageTitle
        title="Diagnóstico"
        subtitle={`Baseado em ${d.mesRefLabel}, o último mês fechado — o mês atual ainda está correndo.`}
      />

      {/* veredito: uma frase, não um painel */}
      <div className={`card mb-4 border-l-2 ${estourou ? 'border-l-despesa' : 'border-l-accent'}`}>
        <div className="text-sm text-muted">Em {d.mesRefLabel} você gastou</div>
        <div className={`mt-1 text-3xl font-semibold tnum money ${estourou ? 'text-despesa' : 'text-accent'}`}>
          {d.pctGastoDaRenda.toFixed(0)}%
        </div>
        <div className="mt-1 text-sm text-muted">
          do que entrou — <span className="tnum money">{brl(d.gasto)}</span> de{' '}
          <span className="tnum money">{brl(d.renda)}</span>
          {maiorGrupo && (
            <> · maior bloco: <b className="text-text">{maiorGrupo.emoji} {maiorGrupo.nome}</b>{' '}
            <span className="tnum money">{brl(maiorGrupo.total)}</span></>
          )}
        </div>
      </div>

      {/* para onde vai cada R$100 */}
      <div className="card mb-4">
        <SectionTitle>Para onde vai o que entra</SectionTitle>
        <div className="space-y-2.5">
          {d.grupos.map((g) => (
            <div key={g.nome}>
              <div className="flex items-baseline justify-between text-sm">
                <span>
                  {g.emoji} {g.nome}
                  {g.travado && <span className="ml-1.5 rounded bg-surface-3 px-1.5 py-0.5 text-[10px] text-faint">fixo</span>}
                </span>
                <span className="tnum text-muted">
                  <span className="money">{brl(g.total)}</span>
                  <span className="ml-2 text-faint">{g.pctRenda.toFixed(0)}%</span>
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full rounded-full bg-surface-3 overflow-hidden">
                <div
                  className={`h-full rounded-full ${g.travado ? 'bg-muted/50' : 'bg-warn'}`}
                  style={{ width: `${(g.total / maxGrupo) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-faint">
          Cinza = fixo (já comprometido). Âmbar = onde você tem escolha.
          Travado: <span className="tnum money">{brl(d.travado)}</span> · sobra pra decidir:{' '}
          <span className="tnum money">{brl(d.livre)}</span>
        </p>
      </div>

      {/* o que mudou */}
      <div className="card mb-4">
        <SectionTitle>O que mudou (dia 1 ao {d.diaComparacao}, vs mês passado)</SectionTitle>
        {subiu.length === 0 && caiu.length === 0 ? (
          <p className="text-sm text-muted">Nada mudou de forma relevante até agora.</p>
        ) : (
          <div className="space-y-2">
            {subiu.map((v) => (
              <div key={v.categoria} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5">
                  <TrendingUp size={13} className="text-despesa" />
                  {traduzCategoria(v.categoria)}
                </span>
                <span className="tnum text-despesa">
                  <span className="money">+{brl(v.delta)}</span>
                  {v.pct != null && <span className="ml-1.5 text-faint">{v.pct > 0 ? '+' : ''}{v.pct.toFixed(0)}%</span>}
                </span>
              </div>
            ))}
            {caiu.map((v) => (
              <div key={v.categoria} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5">
                  <TrendingDown size={13} className="text-accent" />
                  {traduzCategoria(v.categoria)}
                </span>
                <span className="tnum money text-accent">{brl(v.delta)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <SimuladorCorte
        grupos={d.grupos.filter((g) => !g.travado).map((g) => ({ nome: g.nome, emoji: g.emoji, total: g.total }))}
        sobraMensal={d.sobraMensalProjetada}
        saldoProjetado={d.saldoProjetadoFim}
      />

      {/* o que não dá pra explicar */}
      {d.semClassificacao.itens.length > 0 && (
        <div className="card mt-4">
          <div className="flex items-center gap-2 mb-3">
            <HelpCircle size={15} className="text-faint" />
            <SectionTitle>Gasto sem categoria clara</SectionTitle>
          </div>
          <p className="mb-3 text-xs text-muted">
            <span className="tnum money">{brl(d.semClassificacao.total)}</span> em {d.mesRefLabel} que a Pluggy
            não soube classificar — PIX e transferências soltas. Se tiver algo grande aqui que você reconhece,
            vale categorizar pra parar de aparecer como buraco.
          </p>
          <div className="divide-y divide-border/60">
            {d.semClassificacao.itens.map((it, i) => (
              <div key={i} className="flex items-center justify-between py-2 text-sm">
                <span className="truncate pr-3 text-muted">{it.descricao}</span>
                <span className="tnum money shrink-0">{brl(it.valor)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
