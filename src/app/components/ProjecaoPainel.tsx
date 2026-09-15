'use client';

import { Info } from 'lucide-react';
import { brl } from '@/lib/format';
import { SectionTitle } from './ui';
import { ProjecaoChart } from './charts';
import type { ProjecaoMes, SaldoConta } from '@/lib/queries';

type LinhaProjecao = ProjecaoMes & { saldoComCompra?: number };

export function ProjecaoPainel({
  linhas, temSimulacao, saldoContas, receitaBase, variavelBase, casaBase, faturaBase, patrimonioAtual,
}: {
  linhas: LinhaProjecao[];
  temSimulacao: boolean;
  saldoContas: { total: number; contas: SaldoConta[] };
  receitaBase: number;
  variavelBase: number;
  casaBase: number;
  faturaBase: number;
  patrimonioAtual: number;
}) {
  return (
    <div className="mt-4 card">
      <SectionTitle>Projeção mês a mês</SectionTitle>
      <ProjecaoChart data={linhas} temSimulacao={temSimulacao} />

      <div className="mt-4 rounded-lg bg-surface-2 px-3 py-2.5">
        <div className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted">
          <Info size={13} className="mt-0.5 shrink-0 text-faint" />
          <span>
            Conta em <b className="text-text">base caixa</b>: só sai da conta o que realmente é debitado —
            gasto no débito, contas da casa e a <b className="text-text">fatura do cartão</b>. Compra no
            crédito não desconta no dia da compra, ela entra na fatura. Mês futuro nunca fica vazio:
            já nasce com as parcelas conhecidas, os fixos cadastrados e suas médias reais.
          </span>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-2 text-[11px]">
          <span className="rounded-lg bg-surface-3 px-2 py-1 text-muted">
            parte de <b className="tnum money text-text">{brl(saldoContas.total)}</b> em conta hoje
          </span>
          <span className="rounded-lg bg-surface-3 px-2 py-1 text-muted">
            receita média <b className="tnum money text-accent">{brl(receitaBase)}</b>
          </span>
          <span className="rounded-lg bg-surface-3 px-2 py-1 text-muted">
            casa (aluguel, luz, água…) <b className="tnum money text-despesa">{brl(casaBase)}</b>
          </span>
          <span className="rounded-lg bg-surface-3 px-2 py-1 text-muted">
            gasto no débito <b className="tnum money text-despesa">{brl(variavelBase)}</b>
          </span>
          <span className="rounded-lg bg-surface-3 px-2 py-1 text-muted">
            fatura de cartão <b className="tnum money text-warn">{brl(faturaBase)}</b>
          </span>
          <span className="rounded-lg bg-surface-3 px-2 py-1 text-faint">base: últimos 3 meses fechados</span>
        </div>

        {saldoContas.contas.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-faint">
            {saldoContas.contas.map((c, i) => (
              <span key={i} className="rounded bg-surface-3/60 px-1.5 py-0.5">
                {c.banco} ({c.responsavel}) <span className="tnum money">{brl(c.saldo)}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-faint">
              <th className="py-1.5 pr-3 font-medium">Mês</th>
              <th className="py-1.5 pr-3 font-medium text-right">Receita</th>
              <th className="py-1.5 pr-3 font-medium text-right">Fixos</th>
              <th className="py-1.5 pr-3 font-medium text-right">Casa</th>
              <th className="py-1.5 pr-3 font-medium text-right">Débito</th>
              <th className="py-1.5 pr-3 font-medium text-right">Fatura</th>
              <th className="py-1.5 pr-3 font-medium text-right">Sobra do mês</th>
              <th className="py-1.5 pr-3 font-medium text-right">Em conta</th>
              {temSimulacao && <th className="py-1.5 font-medium text-right text-warn">Com a compra</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {linhas.map((m) => (
              <tr key={m.mes}>
                <td className="py-1.5 pr-3 whitespace-nowrap">
                  {m.mesLabel}
                  {m.emAndamento && <span className="ml-1 rounded bg-surface-3 px-1 py-0.5 text-[9px] text-muted">falta</span>}
                </td>
                <td className="py-1.5 pr-3 text-right tnum money text-accent">{brl(m.receita)}</td>
                <td className="py-1.5 pr-3 text-right tnum money text-muted">{brl(m.despesaFixa + m.despesaManual)}</td>
                <td className="py-1.5 pr-3 text-right tnum money text-muted">{brl(m.despesaCasa)}</td>
                <td className="py-1.5 pr-3 text-right tnum money text-muted">{brl(m.despesaVariavel)}</td>
                <td className="py-1.5 pr-3 text-right tnum money text-warn">{brl(m.fatura)}</td>
                <td className={`py-1.5 pr-3 text-right tnum money font-medium ${m.saldo >= 0 ? 'text-accent' : 'text-despesa'}`}>{brl(m.saldo)}</td>
                <td className={`py-1.5 pr-3 text-right tnum money font-medium ${m.saldoProjetado >= 0 ? 'text-text' : 'text-despesa'}`}>{brl(m.saldoProjetado)}</td>
                {temSimulacao && (
                  <td className={`py-1.5 text-right tnum money font-medium ${(m.saldoComCompra ?? 0) >= 0 ? 'text-warn' : 'text-despesa'}`}>
                    {brl(m.saldoComCompra ?? 0)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-xs text-faint">
        "Em conta" parte do saldo real das contas (Pluggy) e vai somando o fluxo de cada mês.
        A primeira linha é o mês em andamento e mostra só o que <b>ainda falta</b> acontecer nele
        (marcada com "falta"), porque o saldo de hoje já reflete o que passou.
        Não inclui o patrimônio investido (<span className="tnum money">{brl(patrimonioAtual)}</span>, que fica separado).
      </p>
    </div>
  );
}
