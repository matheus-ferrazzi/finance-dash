'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { brl, dataBR, traduzCategoria, CATEGORIAS_PAINEL } from '@/lib/format';
import { GRUPOS_GASTO } from '@/lib/grupos';
import type { LancCorrigir } from '@/lib/queries';

const ORIGEM = { banco: 'do banco', doc: 'regra por pessoa', texto: 'regra por texto', lancamento: 'corrigido à mão' } as const;
type Tipo = 'lancamento' | 'doc' | 'texto';
export interface Salvo { id: number; afetados: number; categoria: string }

/** O formulário de "Mudar categoria" (F4): categoria, alcance, prévia do servidor e salvar. */
export function FormCategoria({ lanc, onSalvo }: { lanc: LancCorrigir; onSalvo: (r: Salvo) => void }) {
  const [categoria, setCategoria] = useState('');
  const [busca, setBusca] = useState('');
  const [tipo, setTipo] = useState<Tipo>('lancamento');
  const [texto, setTexto] = useState(lanc.sugestaoTexto);
  const [previa, setPrevia] = useState<{ afetados: number; porCategoria: Record<string, number> } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [divida, setDivida] = useState<string | null>(null);

  const grupos = useMemo(() => {
    const b = busca.trim().toLowerCase();
    const pode = new Set(CATEGORIAS_PAINEL); // sem as vagas, que não ficariam
    const nos = (c: string) => pode.has(c) && (!b || traduzCategoria(c).toLowerCase().includes(b));
    const agrupadas = new Set(GRUPOS_GASTO.flatMap((g) => g.cats));
    return [
      { nome: 'Mais usadas', cats: lanc.maisUsadas.filter(nos) },
      ...GRUPOS_GASTO.map((g) => ({ nome: `${g.emoji} ${g.nome}`, cats: g.cats.filter(nos) })),
      { nome: 'Outras', cats: CATEGORIAS_PAINEL.filter((c) => !agrupadas.has(c)).filter(nos) },
    ].filter((g) => g.cats.length > 0);
  }, [busca, lanc.maisUsadas]);

  const pedido = { tipo, idTransacao: lanc.id, texto: tipo === 'texto' ? texto : undefined, categoria };
  useEffect(() => {
    if (!categoria) { setPrevia(null); return; }
    const ctl = new AbortController();
    fetch('/api/categorias/previa', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pedido), signal: ctl.signal,
    })
      .then(async (r) => {
        const j = await r.json();
        if (r.ok) { setErro(null); setPrevia(j); } else { setErro(j.erro ?? 'Erro na prévia.'); setPrevia(null); }
      })
      .catch(() => {});
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoria, tipo, texto]);

  async function salvar() {
    setSalvando(true);
    try {
      const r = await fetch('/api/categorias', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pedido) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(j.erro ?? 'Erro ao salvar.'); return; }
      onSalvo({ id: j.id, afetados: j.afetados, categoria });
    } catch {
      setErro('Sem conexão: não salvou.');
    } finally {
      setSalvando(false);
    }
  }

  // F4b: um parcelamento que a regra não reconhece como dívida entra na trilha
  async function marcarDivida() {
    const r = await fetch('/api/trilha/divida', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo: 'divida', idTransacao: lanc.id }) }).catch(() => null);
    if (!r) { setDivida('Sem conexão.'); return; }
    setDivida(r.ok ? 'Marcado como dívida: entra na trilha (desfaz na tela Regras).' : (((await r.json().catch(() => ({}))) as { erro?: string }).erro ?? 'Não deu certo.'));
  }

  const opcao = (t: Tipo, rotulo: string) => (
    <label key={t} className={`flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm ${tipo === t ? 'border-accent' : 'border-border'}`}>
      <input type="radio" name="alcance" checked={tipo === t} onChange={() => setTipo(t)} />
      <span>{rotulo}</span>
    </label>
  );

  return (
    <div className="space-y-3">
      <div>
        <div className="text-sm">{lanc.descricao || '—'}</div>
        <div className="text-xs text-muted">{`${dataBR(lanc.data)} · `}<span className="tnum money">{brl(lanc.valor)}</span></div>
        <div className="mt-1 text-xs text-faint">{`Agora: ${traduzCategoria(lanc.categoria)} (${ORIGEM[lanc.origem]})`}</div>
      </div>

      <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar categoria" aria-label="Buscar categoria"
        className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent/50" />
      <div className="max-h-56 space-y-2 overflow-y-auto">
        {grupos.map((g) => (
          <div key={g.nome}>
            <div className="text-[11px] text-muted">{g.nome}</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {g.cats.map((c) => (
                <button key={`${g.nome}-${c}`} type="button" onClick={() => setCategoria(c)}
                  className={`min-h-[36px] rounded-lg px-2.5 text-xs ${categoria === c ? 'bg-accent text-base' : 'bg-surface-2 text-muted'}`}>
                  {traduzCategoria(c)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        {opcao('lancamento', 'Só este lançamento')}
        {lanc.temDoc && lanc.nomeContraparte && opcao('doc', `Todos de ${lanc.nomeContraparte}`)}
        {opcao('texto', 'Todos com o texto')}
        {tipo === 'texto' && (
          <input value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Texto da regra"
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent/50" />
        )}
      </div>

      {previa && categoria && (
        <p className="text-xs text-muted">
          {`Muda ${previa.afetados} lançamento${previa.afetados === 1 ? '' : 's'}`
            + (previa.afetados > 0 ? ` (${Object.entries(previa.porCategoria).map(([c, n]) => `${n} de ${traduzCategoria(c)}`).join(', ')})` : '')
            + ` → ${traduzCategoria(categoria)}`}
        </p>
      )}
      {erro && <p className="text-xs text-despesa">{erro}</p>}

      <button type="button" disabled={!categoria || salvando || !!erro} onClick={salvar}
        className="min-h-[44px] w-full rounded-lg bg-accent text-sm font-medium text-base disabled:opacity-50">
        {salvando ? 'Salvando…' : 'Salvar'}
      </button>
      <button type="button" onClick={marcarDivida} className="min-h-[44px] w-full text-xs text-muted underline">Isto é dívida (entra na trilha)</button>
      {divida && <p className="text-xs text-muted">{divida}</p>}
    </div>
  );
}

/** Folha que sobe do rodapé no celular (janela no computador): busca o lançamento e mostra o formulário. */
export function FolhaCategoria({ id, onFechar: fechar }: { id: string; onFechar: () => void }) {
  const router = useRouter();
  const [lanc, setLanc] = useState<LancCorrigir | null>(null);
  const [falhou, setFalhou] = useState(false);
  const [feito, setFeito] = useState<Salvo | null>(null);

  useEffect(() => {
    fetch(`/api/lancamentos/${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setLanc)
      .catch(() => setFalhou(true));
  }, [id]);

  // a lista só é atualizada ao fechar: atualizar ao salvar tira o item do grupo aberto e desmonta a folha
  // (com ela, o "Feito · Desfazer")
  const [mudou, setMudou] = useState(false);
  const onFechar = () => { if (mudou) router.refresh(); fechar(); };

  // desfazer apaga a regra recém-criada (se ela substituiu outra da mesma chave, não restaura a antiga)
  async function desfazer() {
    if (!feito) return;
    const r = await fetch(`/api/categorias/${feito.id}`, { method: 'DELETE' }).catch(() => null);
    if (!r?.ok) { alert('Não deu para desfazer. Apague a regra na tela Regras.'); return; }
    router.refresh();
    fechar();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 md:items-center" onClick={onFechar}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-surface p-4 md:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <b className="text-sm">Mudar categoria</b>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="grid h-11 w-11 place-items-center text-faint"><X size={18} /></button>
        </div>
        {feito ? (
          <div className="space-y-3 text-sm">
            <p>{`Feito: ${feito.afetados} lançamento${feito.afetados === 1 ? '' : 's'} agora em ${traduzCategoria(feito.categoria)}.`}</p>
            <div className="flex gap-2">
              <button type="button" onClick={desfazer} className="min-h-[44px] flex-1 rounded-lg bg-surface-2 text-sm">Desfazer</button>
              <button type="button" onClick={onFechar} className="min-h-[44px] flex-1 rounded-lg bg-accent text-sm text-base">Ok</button>
            </div>
          </div>
        ) : lanc ? (
          <FormCategoria lanc={lanc} onSalvo={(r) => { setFeito(r); setMudou(true); }} />
        ) : (
          <p className="text-sm text-muted">{falhou ? 'Não deu para abrir este lançamento.' : 'Carregando…'}</p>
        )}
      </div>
    </div>
  );
}
