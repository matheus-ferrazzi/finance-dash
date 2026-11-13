'use client';

import { useState } from 'react';
import { GRUPOS_COM_TETO, type GrupoComTeto } from '@/lib/plano';

async function enviar(method: string, corpo?: unknown): Promise<string | null> {
  const r = await fetch('/api/plano', {
    method, headers: { 'Content-Type': 'application/json' }, body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }).catch(() => null);
  if (!r) return 'Sem conexão.';
  if (!r.ok) return ((await r.json().catch(() => ({}))) as { erro?: string }).erro ?? 'Não deu certo.';
  return null;
}

const txt = (v: number | undefined) => (v === undefined ? '' : String(v).replace('.', ','));

/** 13/11 (plano realista): os tetos por grupo e em quantos meses chegar neles. */
export function PlanoForm({ tetos, degraus, temPlano }: { tetos: Partial<Record<GrupoComTeto, number>>; degraus: number; temPlano: boolean }) {
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(GRUPOS_COM_TETO.map((g) => [g, txt(tetos[g])])));
  const [d, setD] = useState(String(degraus));
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function salvar(recomecar: boolean) {
    if (recomecar && !confirm('Recomeçar o plano? O início passa para o mês que vem e os degraus partem da média de agora.')) return;
    setOcupado(true);
    const e = await enviar('POST', { tetos: v, degraus: Number(d), recomecar });
    setOcupado(false);
    if (e) setErro(e); else window.location.reload();
  }
  async function apagar() {
    if (!confirm('Apagar o plano? A meta do mês volta a ser a média dos últimos meses menos 10%.')) return;
    const e = await enviar('DELETE');
    if (e) setErro(e); else window.location.reload();
  }
  const campo = 'min-h-[44px] w-28 rounded-lg border border-border bg-surface-2 px-2 text-sm';
  return (
    <div className="space-y-2 text-sm">
      {GRUPOS_COM_TETO.map((g) => (
        <label key={g} className="flex items-center justify-between gap-2">
          <span>{g}</span>
          <input inputMode="decimal" value={v[g]} onChange={(e) => setV({ ...v, [g]: e.target.value })} aria-label={`Teto de ${g}`} className={campo} />
        </label>
      ))}
      <label className="flex items-center justify-between gap-2">
        <span>Chegar aos tetos em</span>
        <span className="flex items-center gap-2">
          <select value={d} onChange={(e) => setD(e.target.value)} aria-label="Degraus em meses" className="min-h-[44px] rounded-lg border border-border bg-surface-2 px-2 text-sm">
            {[1, 2, 3, 4, 6].map((n) => <option key={n} value={n}>{n === 1 ? 'já (sem degraus)' : `${n} meses`}</option>)}
          </select>
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button type="button" disabled={ocupado} onClick={() => salvar(false)} className="min-h-[44px] rounded-lg bg-accent px-4 text-sm text-base disabled:opacity-60">
          {temPlano ? 'Salvar tetos' : 'Criar o plano'}
        </button>
        {temPlano && <button type="button" disabled={ocupado} onClick={() => salvar(true)} className="min-h-[44px] px-2 text-xs text-muted underline">recomeçar</button>}
        {temPlano && <button type="button" disabled={ocupado} onClick={apagar} className="min-h-[44px] px-2 text-xs text-muted underline">apagar o plano</button>}
      </div>
      {erro && <div className="text-xs text-despesa">{erro}</div>}
    </div>
  );
}
