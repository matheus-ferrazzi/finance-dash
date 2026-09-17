import Link from 'next/link';
import {
  getKpis, getSerie, getOrcamento, getFaturas, getRecentes,
  getProjecaoBase, computeProjecao, resolvePeriodo, Resp,
} from '@/lib/queries';
import { brl, pct, dataBR, diasAte, traduzCategoria } from '@/lib/format';
import { PageTitle, KpiCard, SectionTitle, respBadge } from './components/ui';
import { ReceitaDespesaChart } from './components/charts';
import { TrendingUp, TrendingDown, Wallet, PiggyBank, Telescope, ArrowRight } from 'lucide-react';

export const dynamic = 'force-dynamic';

function resolveResp(v?: string): Resp {
  return v === 'Matheus' || v === 'Ariane' ? v : 'casal';
}

export default async function Home({ searchParams }: { searchParams: { resp?: string; mes?: string; p?: string } }) {
  const resp = resolveResp(searchParams.resp);
  const per = resolvePeriodo(searchParams.p, searchParams.mes);

  const [kpis, serie, orc, faturas, recentes, base] = await Promise.all([
    getKpis(resp, per), getSerie(resp, per, 6), getOrcamento(resp, per), getFaturas(resp), getRecentes(resp, per, 8),
    getProjecaoBase(resp),
  ]);
  // primeira linha = mês em andamento, com só o que ainda falta acontecer
  const mesAtual = computeProjecao(base, 1)[0];

  const dRec = kpis.receita_ant ? pct(kpis.receita - kpis.receita_ant, kpis.receita_ant) : null;
  const dDes = kpis.despesa_ant ? pct(kpis.despesa - kpis.despesa_ant, kpis.despesa_ant) : null;
  const cmp = per.kind === 'mes' ? 'vs mês ant.' : 'vs período ant.';

  // Só o que é acionável agora. Orçamento e faturas têm aba própria — não
  // precisam ocupar a home inteira, só avisar quando estoura.
  const insights: { tone: 'danger' | 'warn'; label: string; value?: string }[] = [];
  orc.filter((o) => o.teto > 0 && o.gasto > o.teto).sort((a, b) => b.gasto - a.gasto).slice(0, 1)
    .forEach((o) => insights.push({ tone: 'danger', label: `${o.emoji} ${o.item} passou do teto`, value: `${brl(o.gasto)} / ${brl(o.teto)}` }));
  [...faturas].filter((f) => { const d = diasAte(f.vencimento); return f.valor > 0 && d != null && d >= 0 && d <= 5; })
    .sort((a, b) => (a.vencimento! < b.vencimento! ? -1 : 1)).slice(0, 1)
    .forEach((f) => insights.push({ tone: 'warn', label: `💳 ${f.banco} vence em ${diasAte(f.vencimento)}d`, value: brl(f.valor) }));

  return (
    <div>
      <PageTitle
        title="Visão geral"
        subtitle={`${per.label} · o que você consumiu — a compra no crédito conta no dia da compra.`}
      />

      {insights.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {insights.map((i, k) => (
            <div
              key={k}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs ${
                i.tone === 'danger' ? 'border-despesa/30 bg-despesa/10 text-despesa' : 'border-warn/30 bg-warn/10 text-warn'
              }`}
            >
              <span>{i.label}</span>
              {i.value && <span className="tnum money font-medium">{i.value}</span>}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Receita" value={kpis.receita} tone="up" delta={dRec} deltaLabel={cmp} icon={TrendingUp} />
        <KpiCard label="Despesa" value={kpis.despesa} tone="down" delta={dDes} deltaLabel={cmp} icon={TrendingDown} />
        <KpiCard label="Saldo" value={kpis.saldo} tone={kpis.saldo >= 0 ? 'up' : 'down'} hint={kpis.saldo >= 0 ? 'sobrou' : 'no vermelho'} icon={Wallet} />
        <KpiCard label="Investido" value={kpis.patrimonio} hint="patrimônio atual" icon={PiggyBank} />
      </div>

      {mesAtual && (
        <Link href={`/previsibilidade${searchParams.resp ? `?resp=${searchParams.resp}` : ''}`} className="mt-4 block">
          <div className="card transition-colors hover:bg-surface-2/40">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Telescope size={15} className="text-faint" />
                <SectionTitle>Como {mesAtual.mesLabel} deve fechar</SectionTitle>
              </div>
              <ArrowRight size={15} className="text-faint" />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="card-2 px-3 py-2.5">
                <div className="text-[11px] text-muted">Tenho hoje</div>
                <div className="mt-1 tnum money text-sm font-medium">{brl(base.saldoContasAtual)}</div>
              </div>
              <div className="card-2 px-3 py-2.5">
                <div className="text-[11px] text-muted">Ainda entra</div>
                <div className="mt-1 tnum money text-sm font-medium text-accent">+{brl(mesAtual.receita)}</div>
              </div>
              <div className="card-2 px-3 py-2.5">
                <div className="text-[11px] text-muted">Ainda sai</div>
                <div className="mt-1 tnum money text-sm font-medium text-despesa">
                  −{brl(mesAtual.despesaFixa + mesAtual.despesaManual + mesAtual.despesaCasa + mesAtual.despesaVariavel + mesAtual.fatura)}
                </div>
              </div>
              <div className="card-2 px-3 py-2.5">
                <div className="text-[11px] text-muted">Fecho com</div>
                <div className={`mt-1 tnum money text-sm font-semibold ${mesAtual.saldoProjetado >= 0 ? 'text-accent' : 'text-despesa'}`}>
                  {brl(mesAtual.saldoProjetado)}
                </div>
              </div>
            </div>
          </div>
        </Link>
      )}

      <div className="mt-4 card">
        <SectionTitle>Receita vs. Despesa (6 meses)</SectionTitle>
        <ReceitaDespesaChart data={serie} />
      </div>

      <div className="mt-4 card">
        <SectionTitle>Lançamentos recentes</SectionTitle>
        {recentes.length === 0 && <p className="text-sm text-muted">Nada neste período ainda.</p>}
        <div className="divide-y divide-border/60">
          {recentes.map((l) => (
            <div key={l.id} className="flex items-center justify-between py-2.5 text-sm">
              <div className="min-w-0">
                <div className="truncate">{l.descricao || traduzCategoria(l.categoria)}</div>
                <div className="text-xs text-faint">{dataBR(l.data)} · {traduzCategoria(l.categoria)} · {l.banco}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {respBadge(l.responsavel)}
                <span className={`tnum money font-medium ${l.classe === 'receita' ? 'text-accent' : 'text-despesa'}`}>
                  {l.classe === 'receita' ? '+' : '−'}{brl(l.valor)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
