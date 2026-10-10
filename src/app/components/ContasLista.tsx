'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Circle, Clock, MoreVertical, Plus, X } from 'lucide-react';
import { brl, parseValorBR } from '@/lib/format';
import type { ItemConta, Tirada } from '@/lib/contas';
import { respBadge } from './ui';

function mesAnterior(mes: string): string {
  const t = Number(mes.slice(0, 4)) * 12 + Number(mes.slice(5, 7)) - 2;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

/**
 * Lista do caderno da Ariane, no celular: um toque marca/desmarca; o ⋯ abre tirar/remover.
 * Conta confirmada pelo banco não tem toque — quem manda é o extrato.
 */
export function ContasLista({ mes, resp, itens, tiradas }: { mes: string; resp: string; itens: ItemConta[]; tiradas: Tirada[] }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [nova, setNova] = useState<{ nome: string; valor: string; responsavel: string } | null>(null);

  async function chamar(url: string, init: RequestInit) {
    setOcupado(true);
    setErro(null);
    try {
      const res = await fetch(url, init);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).erro || 'não deu para salvar');
      setAberto(null);
      router.refresh();
      return true;
    } catch (e: any) {
      setErro(e.message);
      return false;
    } finally {
      setOcupado(false);
    }
  }
  const post = (body: object) => chamar('/api/contas/marcas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mes, ...body }) });
  const apagarMarca = (id: number) => chamar(`/api/contas/marcas/${id}`, { method: 'DELETE' });

  async function tocar(i: ItemConta) {
    if (i.status === 'pago' || i.avulsa || ocupado) return;
    if (i.marcaId !== null) await apagarMarca(i.marcaId);
    else if (i.contaId !== null) await post({ contaId: i.contaId, responsavel: i.responsavel });
  }

  async function removerDeVez(i: ItemConta) {
    // paga neste mês fica no mês (o banco mostra); senão some já a partir deste mês
    const pago = i.status === 'pago';
    if (!confirm(`Remover "${i.nome}" de vez? Ela para de aparecer ${pago ? 'a partir do mês que vem' : 'a partir deste mês'}; os meses anteriores continuam.`)) return;
    await chamar(`/api/contas/fixas/${i.contaId}?ultimoMes=${pago ? mes : mesAnterior(mes)}`, { method: 'DELETE' });
  }

  async function removerAvulsa(i: ItemConta) {
    if (i.marcaId === null || !confirm(`Remover "${i.nome}" deste mês?`)) return;
    await apagarMarca(i.marcaId);
  }

  async function salvarNova() {
    if (!nova) return;
    const valor = parseValorBR(nova.valor);
    if (await post({ nome: nova.nome, valor, responsavel: nova.responsavel })) setNova(null);
  }

  const acao = 'rounded-lg border border-border px-3 py-2 text-xs disabled:opacity-50';

  return (
    <div>
      <div className="card divide-y divide-border/60">
        {itens.length === 0 && <p className="py-2 text-sm text-muted">Nenhuma conta cadastrada para este mês.</p>}
        {itens.map((i) => {
          const chave = `${i.contaId ?? 'a'}-${i.marcaId ?? ''}-${i.nome}`;
          const Icone = i.status === 'pago' ? CheckCircle2 : i.status === 'a_confirmar' ? Clock : Circle;
          const cor = i.status === 'pago' ? 'text-accent' : i.status === 'a_confirmar' ? 'text-warn' : 'text-faint';
          const valor = i.pago ?? i.previsto;
          const difere = i.pago !== null && Math.abs(i.pago - i.previsto) > i.previsto * 0.05; // centavos de Vivo/Sabesp não poluem
          return (
            <div key={chave} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => tocar(i)}
                  disabled={i.status === 'pago' || i.avulsa || ocupado}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
                >
                  <Icone size={24} className={`shrink-0 ${cor}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{i.nome}</span>
                      {i.parcela && <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[10px] text-muted">{i.parcela}</span>}
                      {resp === 'casal' && respBadge(i.responsavel)}
                    </div>
                    <div className="mt-0.5 text-xs text-faint">
                      {i.status === 'pago' && `pago dia ${i.dia} · no banco`}
                      {i.status === 'a_confirmar' && 'marcado · esperando o banco'}
                      {i.status === 'falta' && (i.avulsa ? 'avulsa' : 'toque para marcar como pago')}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className={`tnum money text-sm font-medium ${i.status === 'pago' ? '' : 'text-muted'}`}>{brl(valor)}</div>
                    {difere && <div className="text-[10px] text-faint">previsto {brl(i.previsto)}</div>}
                  </div>
                </button>
                <button
                  onClick={() => setAberto(aberto === chave ? null : chave)}
                  className="grid h-9 w-8 shrink-0 place-items-center rounded-lg text-faint hover:text-text"
                  aria-label={`Opções de ${i.nome}`}
                >
                  <MoreVertical size={18} />
                </button>
              </div>
              {aberto === chave && (
                <div className="mt-2 flex flex-wrap items-center gap-2 pl-9">
                  {!i.avulsa && i.status !== 'pago' && (
                    <button disabled={ocupado} className={`${acao} text-muted`}
                      onClick={() => post({ contaId: i.contaId, responsavel: i.responsavel, pago: false })}>
                      Tirar deste mês
                    </button>
                  )}
                  {!i.avulsa && (
                    <button disabled={ocupado} className={`${acao} text-despesa`} onClick={() => removerDeVez(i)}>
                      Remover de vez
                    </button>
                  )}
                  {i.avulsa && (
                    <button disabled={ocupado} className={`${acao} text-despesa`} onClick={() => removerAvulsa(i)}>
                      Remover
                    </button>
                  )}
                  {!i.avulsa && i.status === 'pago' && <span className="text-[11px] text-faint">paga no banco: fica neste mês</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {tiradas.length > 0 && (
        <div className="mt-2 px-1 text-xs text-faint">
          Tiradas deste mês:{' '}
          {tiradas.map((t, k) => (
            <span key={t.marcaId}>
              {k > 0 && ' · '}
              {t.nome}{' '}
              <button disabled={ocupado} onClick={() => apagarMarca(t.marcaId)} className="text-accent hover:underline">voltar</button>
            </span>
          ))}
        </div>
      )}

      {erro && <p className="mt-2 text-xs text-despesa">{erro}</p>}

      {nova ? (
        <div className="card mt-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Conta avulsa deste mês</span>
            <button onClick={() => setNova(null)} aria-label="Fechar"><X size={18} className="text-faint" /></button>
          </div>
          <input
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-base"
            placeholder="Nome (ex.: IPVA, presente)" value={nova.nome} maxLength={120}
            onChange={(e) => setNova({ ...nova, nome: e.target.value })}
          />
          <input
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-base tnum"
            placeholder="Valor (ex.: 261,30)" inputMode="decimal" value={nova.valor}
            onChange={(e) => setNova({ ...nova, valor: e.target.value })}
          />
          {resp === 'casal' && (
            <select
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-base"
              value={nova.responsavel} onChange={(e) => setNova({ ...nova, responsavel: e.target.value })}
            >
              <option value="Ariane">Ariane</option>
              <option value="Matheus">Matheus</option>
            </select>
          )}
          <p className="text-[11px] text-faint">Fica esperando até aparecer no banco um pagamento seu deste mês com o mesmo valor.</p>
          <button
            onClick={salvarNova} disabled={ocupado || !nova.nome.trim() || !nova.valor.trim()}
            className="w-full rounded-lg bg-accent px-3 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Adicionar
          </button>
        </div>
      ) : (
        <button
          onClick={() => setNova({ nome: '', valor: '', responsavel: resp === 'Matheus' ? 'Matheus' : 'Ariane' })}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-3 text-sm text-muted hover:text-text"
        >
          <Plus size={16} /> Conta avulsa
        </button>
      )}
    </div>
  );
}
