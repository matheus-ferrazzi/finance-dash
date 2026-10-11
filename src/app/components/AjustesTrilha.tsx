'use client';

import { useState } from 'react';
import type { AjustesTrilha } from '@/lib/queries';
import type { ChaveMeta } from '@/lib/trilha';

/** Envia e devolve a mensagem de erro (ou null se deu certo). */
async function enviar(url: string, method: string, corpo?: unknown): Promise<string | null> {
  const r = await fetch(url, {
    method, headers: { 'Content-Type': 'application/json' }, body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }).catch(() => null);
  if (!r) return 'Sem conexão.';
  if (!r.ok) return ((await r.json().catch(() => ({}))) as { erro?: string }).erro ?? 'Não deu certo.';
  return null;
}

/** F4b: tirar da trilha um grupo que a regra tomou por dívida (desfaz na tela Regras). */
export function BotaoNaoDivida({ chave, nome }: { chave: string; nome: string }) {
  async function tirar() {
    if (!confirm(`Tirar ${nome} da trilha? Dá para desfazer na tela Regras.`)) return;
    const erro = await enviar('/api/trilha/divida', 'POST', { tipo: 'nao_divida', chave, nome });
    if (erro) alert(erro); else window.location.reload();
  }
  return <button type="button" onClick={tirar} className="min-h-[44px] px-2 text-[11px] text-muted underline">não é dívida</button>;
}

/** F4b: ajustar a meta da reserva (meses) ou do patrimônio (%). */
export function AjustarMeta({ chave, valorTela, padrao }: { chave: ChaveMeta; valorTela: number; padrao: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [v, setV] = useState(String(valorTela).replace('.', ','));
  const [erro, setErro] = useState<string | null>(null);
  const unidade = chave === 'meses_reserva' ? 'meses' : '%';
  async function salvar() {
    const e = await enviar('/api/trilha/meta', 'POST', { chave, valor: v });
    if (e) setErro(e); else window.location.reload();
  }
  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} className="min-h-[44px] px-1 text-[11px] text-accent">
        {`ajustar meta${padrao ? ' (padrão)' : ''}`}
      </button>
    );
  }
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      <input inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} aria-label={`Meta em ${unidade}`}
        className="min-h-[44px] w-20 rounded-lg border border-border bg-surface-2 px-2 text-sm" />
      <span className="text-xs text-muted">{unidade}</span>
      <button type="button" onClick={salvar} className="min-h-[44px] rounded-lg bg-accent px-3 text-xs text-base">Salvar</button>
      <button type="button" onClick={() => { setAberto(false); setErro(null); }} className="min-h-[44px] px-2 text-xs text-muted">Cancelar</button>
      {erro && <span className="w-full text-xs text-despesa">{erro}</span>}
    </div>
  );
}

const rotuloMeta = (c: ChaveMeta, v: number) => (c === 'meses_reserva' ? `Reserva: ${v} meses` : `Patrimônio: ${Math.round(v * 1000) / 10}% da renda`);

/** Tela Regras, seção Trilha: marcações de dívida e metas alteradas; apagar volta ao automático/padrão. */
export function ListaAjustesTrilha({ ajustes }: { ajustes: AjustesTrilha }) {
  async function apagar(url: string) {
    const e = await enviar(url, 'DELETE');
    if (e) alert(e); else window.location.reload();
  }
  if (ajustes.marcacoes.length === 0 && ajustes.metas.length === 0) {
    return <div className="card text-sm text-muted">Nenhum ajuste da trilha. Dá para ajustar as metas e marcar dívidas na tela Trilha.</div>;
  }
  return (
    <div className="card divide-y divide-border/60 p-0">
      {ajustes.metas.map((m) => (
        <div key={m.chave} className="flex min-h-[56px] items-center justify-between gap-3 px-3.5 py-2">
          <span className="text-sm">{rotuloMeta(m.chave, m.valor)}</span>
          <button type="button" onClick={() => apagar(`/api/trilha/meta/${m.chave}`)} className="min-h-[44px] px-2 text-xs text-despesa">Apagar</button>
        </div>
      ))}
      {ajustes.marcacoes.map((m) => (
        <div key={m.id} className="flex min-h-[56px] items-center justify-between gap-3 px-3.5 py-2">
          <div className="min-w-0">
            <div className="truncate text-sm first-letter:uppercase">{m.nome}</div>
            <div className="text-[11px] text-muted">{`${m.tipo === 'nao_divida' ? 'Não é dívida' : 'É dívida'} · ${m.criadoEm}`}</div>
          </div>
          <button type="button" onClick={() => apagar(`/api/trilha/divida/${m.id}`)} className="min-h-[44px] px-2 text-xs text-despesa">Apagar</button>
        </div>
      ))}
    </div>
  );
}
