'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, X, Infinity as InfinityIcon, CreditCard, PiggyBank } from 'lucide-react';
import { brl, mesLabel, currentMonthSP, traduzCategoria } from '@/lib/format';
import { SectionTitle, KpiCard, Progress, respBadge, catIcon } from './ui';
import { ProjecaoPainel } from './ProjecaoPainel';
import { SimuladorCompra, simularCompra } from './SimuladorCompra';
import { CATEGORIAS_COMPROMISSO } from '@/lib/validation';
import type { Resp, ProjecaoMes, CompromissoParcelado, CompromissoManual, SaldoConta } from '@/lib/queries';

const HORIZONTES = [3, 6, 12, 24] as const;

const RESPS = [
  { key: 'casal', label: 'Casal', dot: 'bg-accent' },
  { key: 'Matheus', label: 'Matheus', dot: 'bg-matheus' },
  { key: 'Ariane', label: 'Ariane', dot: 'bg-ariane' },
] as const;

function formatChave(chave: string): string {
  return chave
    .replace(/\s*\/\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function mesesEntre(inicioYYYYMM: string, atualYYYYMM: string): number {
  const [iy, im] = inicioYYYYMM.split('-').map(Number);
  const [ay, am] = atualYYYYMM.split('-').map(Number);
  return (ay - iy) * 12 + (am - im) + 1;
}

interface ItemLista {
  key: string;
  nome: string;
  categoria: string;
  valor: number;
  responsavel: string;
  tipo: 'parcelado' | 'manual';
  dataFim: string | null;
  progresso: { atual: number; total: number } | null;
  restanteLabel: string;
  manual?: CompromissoManual;
}

interface FormState {
  id: number | null;
  nome: string; categoria: string; valor: string; responsavel: 'casal' | 'Matheus' | 'Ariane';
  dataInicio: string; mesesTotais: string; observacao: string;
}

const FORM_VAZIO: FormState = {
  id: null, nome: '', categoria: 'Housing', valor: '', responsavel: 'casal',
  dataInicio: new Date().toISOString().slice(0, 10), mesesTotais: '', observacao: '',
};

export function PrevisibilidadeClient({
  resp, patrimonioAtual, saldoContas, projecao, parcelados, manuais,
}: {
  resp: Resp;
  patrimonioAtual: number;
  saldoContas: { total: number; contas: SaldoConta[] };
  projecao: ProjecaoMes[];
  parcelados: CompromissoParcelado[];
  manuais: CompromissoManual[];
}) {
  const router = useRouter();
  const [horizonte, setHorizonte] = useState<number>(6);
  const [form, setForm] = useState<FormState | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // estado do simulador fica aqui em cima pra alimentar o gráfico também
  const [valorSim, setValorSim] = useState('');
  const [parcelasSim, setParcelasSim] = useState('1');

  const simulacao = useMemo(
    () => simularCompra(valorSim, parcelasSim, saldoContas.total, projecao),
    [valorSim, parcelasSim, saldoContas.total, projecao],
  );

  const sliced = useMemo(() => {
    const base = projecao.slice(0, horizonte);
    if (!simulacao) return base;
    return base.map((m, i) => ({ ...m, saldoComCompra: simulacao.saldoComCompra[i] }));
  }, [projecao, horizonte, simulacao]);
  const comprometido = useMemo(
    () => sliced.reduce((s, m) => s + m.despesaFixa + m.despesaManual, 0),
    [sliced],
  );
  const sobraMedia = useMemo(
    () => (sliced.length ? sliced.reduce((s, m) => s + m.saldo, 0) / sliced.length : 0),
    [sliced],
  );
  const saldoFuturo = sliced.length ? sliced[sliced.length - 1].saldoProjetado : saldoContas.total;
  const primeiroMesNegativo = sliced.find((m) => m.saldoProjetado < 0);
  const receitaBase = projecao[0]?.receita ?? 0;
  const variavelBase = projecao[0]?.despesaVariavel ?? 0;
  const casaBase = projecao[0]?.despesaCasa ?? 0;

  const itens: ItemLista[] = useMemo(() => {
    const hojeYM = currentMonthSP();
    const doParcelados: ItemLista[] = parcelados.map((p) => ({
      key: `p-${p.chave}`,
      nome: formatChave(p.chave),
      categoria: p.categoria,
      valor: p.valorParcela,
      responsavel: p.responsavel,
      tipo: 'parcelado',
      dataFim: p.dataFim,
      progresso: p.parcelaAtual && p.parcelaTotal ? { atual: p.parcelaAtual, total: p.parcelaTotal } : null,
      restanteLabel: p.parcelaTotal
        ? `parcela ${p.parcelaAtual}/${p.parcelaTotal}`
        : `faltam ${p.restantes} mês${p.restantes > 1 ? 'es' : ''}`,
    }));
    const doManuais: ItemLista[] = manuais.map((m) => {
      const progresso = m.mesesTotais
        ? { atual: Math.min(Math.max(mesesEntre(m.dataInicio.slice(0, 7), hojeYM), 0), m.mesesTotais), total: m.mesesTotais }
        : null;
      return {
        key: `m-${m.id}`,
        nome: m.nome,
        categoria: m.categoria,
        valor: m.valor,
        responsavel: m.responsavel,
        tipo: 'manual',
        dataFim: m.dataFim,
        progresso,
        restanteLabel: m.mesesTotais ? `${progresso!.atual}/${m.mesesTotais} meses` : 'contínuo, sem fim definido',
        manual: m,
      };
    });
    return [...doParcelados, ...doManuais].sort((a, b) => {
      if (!a.dataFim && !b.dataFim) return 0;
      if (!a.dataFim) return 1;
      if (!b.dataFim) return -1;
      return a.dataFim < b.dataFim ? -1 : 1;
    });
  }, [parcelados, manuais]);

  const compromissoMaisLongo = itens.filter((i) => i.dataFim).sort((a, b) => (a.dataFim! < b.dataFim! ? 1 : -1))[0];

  async function salvar() {
    if (!form) return;
    setSalvando(true);
    setErro(null);
    const payload = {
      nome: form.nome.trim(),
      categoria: form.categoria,
      valor: Number(form.valor.replace(',', '.')),
      responsavel: form.responsavel,
      dataInicio: form.dataInicio,
      mesesTotais: form.mesesTotais.trim() === '' ? null : Number(form.mesesTotais),
      observacao: form.observacao.trim() || null,
    };
    try {
      const url = form.id ? `/api/compromissos/${form.id}` : '/api/compromissos';
      const method = form.id ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.erro || 'erro ao salvar');
      }
      setForm(null);
      router.refresh();
    } catch (e: any) {
      setErro(e.message || 'erro ao salvar');
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(id: number) {
    if (!confirm('Excluir este compromisso?')) return;
    setSalvando(true);
    try {
      await fetch(`/api/compromissos/${id}`, { method: 'DELETE' });
      router.refresh();
    } finally {
      setSalvando(false);
    }
  }

  function abrirEdicao(m: CompromissoManual) {
    setErro(null);
    setForm({
      id: m.id, nome: m.nome, categoria: m.categoria, valor: String(m.valor),
      responsavel: m.responsavel as any, dataInicio: m.dataInicio,
      mesesTotais: m.mesesTotais ? String(m.mesesTotais) : '', observacao: m.observacao ?? '',
    });
  }

  return (
    <div>
      {/* seletor de horizonte */}
      <div className="mb-4 inline-flex rounded-xl border border-border bg-surface p-1">
        {HORIZONTES.map((h) => (
          <button
            key={h}
            onClick={() => setHorizonte(h)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              horizonte === h ? 'bg-surface-3 text-text' : 'text-muted hover:text-text'
            }`}
          >
            {h}m
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label={`Comprometido (${horizonte}m)`} value={comprometido} tone="down" icon={CreditCard} />
        <KpiCard label="Sobra média/mês" value={sobraMedia} tone={sobraMedia >= 0 ? 'up' : 'down'} />
        <KpiCard
          label={`Vou ter em ${horizonte}m`}
          value={saldoFuturo}
          tone={saldoFuturo >= 0 ? 'up' : 'down'}
          hint={primeiroMesNegativo ? `no vermelho em ${primeiroMesNegativo.mesLabel}` : 'segue no azul'}
          icon={PiggyBank}
        />
        <div className="card">
          <div className="text-xs text-muted">Compromisso mais longo</div>
          <div className="mt-2 text-sm font-medium truncate">{compromissoMaisLongo?.nome ?? '—'}</div>
          <div className="mt-1 text-xs text-faint">
            {compromissoMaisLongo?.dataFim ? `até ${mesLabel(compromissoMaisLongo.dataFim.slice(0, 7))}` : 'nenhum com fim definido'}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <SectionTitle>Compromissos ativos</SectionTitle>
            <button
              onClick={() => { setErro(null); setForm(FORM_VAZIO); }}
              className="flex items-center gap-1 rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs text-muted hover:text-text hover:bg-surface-3 transition-colors"
            >
              <Plus size={14} /> Adicionar
            </button>
          </div>

          {itens.length === 0 && <p className="text-sm text-muted">Nenhum compromisso ativo — nem parcelamento nem cadastro manual.</p>}

          <div className="divide-y divide-border/60">
            {itens.map((it) => {
              const { Icon, color } = catIcon(it.categoria);
              return (
                <div key={it.key} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-3 ${color}`}>
                    <Icon size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm">{it.nome}</span>
                      {it.tipo === 'parcelado' && <span className="shrink-0 rounded bg-surface-3 px-1.5 py-0.5 text-[10px] text-muted">cartão</span>}
                      {!it.dataFim && <InfinityIcon size={12} className="shrink-0 text-faint" />}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-faint">
                      <span>{traduzCategoria(it.categoria)}</span>
                      <span>·</span>
                      <span>{it.restanteLabel}</span>
                    </div>
                    {it.progresso && (
                      <div className="mt-1.5 max-w-[160px]">
                        <Progress value={it.progresso.atual} teto={it.progresso.total} />
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <div className="flex items-center gap-1.5">
                      {respBadge(it.responsavel)}
                      <span className="tnum money text-sm font-medium">{brl(it.valor)}</span>
                    </div>
                    {it.tipo === 'manual' && (
                      <div className="flex gap-1">
                        <button onClick={() => abrirEdicao(it.manual!)} className="rounded p-1 text-faint hover:text-text hover:bg-surface-3">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => excluir(it.manual!.id)} className="rounded p-1 text-faint hover:text-despesa hover:bg-surface-3">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="mt-3 text-xs text-faint">
            "Cartão" é detectado automaticamente pela Pluggy (parcelas futuras já lançadas). O resto você cadastra — aluguel, luz, água, financiamentos.
          </p>
        </div>

        <SimuladorCompra
          valorStr={valorSim} setValorStr={setValorSim}
          parcelasStr={parcelasSim} setParcelasStr={setParcelasSim}
          resultado={simulacao}
        />
      </div>

      {form && (
        <div className="fadein mt-4 card">
          <div className="flex items-center justify-between mb-3">
            <SectionTitle>{form.id ? 'Editar compromisso' : 'Novo compromisso'}</SectionTitle>
            <button onClick={() => setForm(null)} className="rounded p-1 text-faint hover:text-text">
              <X size={16} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block sm:col-span-2">
              <span className="text-xs text-muted">Nome</span>
              <input
                value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Ex: Aluguel, Financiamento do carro"
                className="mt-1 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent/50"
              />
            </label>

            <label className="block">
              <span className="text-xs text-muted">Categoria</span>
              <select
                value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                className="mt-1 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent/50"
              >
                {CATEGORIAS_COMPROMISSO.map((c) => <option key={c} value={c}>{traduzCategoria(c)}</option>)}
              </select>
            </label>

            <label className="block">
              <span className="text-xs text-muted">Valor mensal</span>
              <input
                inputMode="decimal" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })}
                placeholder="Ex: 1500"
                className="mt-1 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent/50"
              />
            </label>

            <label className="block">
              <span className="text-xs text-muted">Início</span>
              <input
                type="date" value={form.dataInicio} onChange={(e) => setForm({ ...form, dataInicio: e.target.value })}
                className="mt-1 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent/50"
              />
            </label>

            <label className="block">
              <span className="text-xs text-muted">Duração (meses, vazio = contínuo)</span>
              <input
                type="number" min={1} max={360} value={form.mesesTotais}
                onChange={(e) => setForm({ ...form, mesesTotais: e.target.value })}
                placeholder="Ex: 24 (vazio = sem fim)"
                className="mt-1 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent/50"
              />
            </label>

            <label className="block sm:col-span-2">
              <span className="text-xs text-muted">Responsável</span>
              <div className="mt-1 inline-flex rounded-xl border border-border bg-surface p-1">
                {RESPS.map((r) => (
                  <button
                    key={r.key} type="button"
                    onClick={() => setForm({ ...form, responsavel: r.key as any })}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                      form.responsavel === r.key ? 'bg-surface-3 text-text' : 'text-muted hover:text-text'
                    }`}
                  >
                    <span className={`h-2 w-2 rounded-full ${r.dot}`} /> {r.label}
                  </button>
                ))}
              </div>
            </label>

            <label className="block sm:col-span-2">
              <span className="text-xs text-muted">Observação (opcional)</span>
              <input
                value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })}
                className="mt-1 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent/50"
              />
            </label>
          </div>

          {erro && <p className="mt-3 text-xs text-despesa">{erro}</p>}

          <div className="mt-4 flex gap-2">
            <button
              disabled={salvando || !form.nome.trim() || !form.valor}
              onClick={salvar}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-base disabled:opacity-50"
            >
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
            <button onClick={() => setForm(null)} className="rounded-lg bg-surface-2 px-4 py-2 text-sm text-muted hover:text-text">
              Cancelar
            </button>
          </div>
        </div>
      )}

      <ProjecaoPainel
        linhas={sliced}
        temSimulacao={!!simulacao}
        saldoContas={saldoContas}
        receitaBase={receitaBase}
        variavelBase={variavelBase}
        casaBase={casaBase}
        patrimonioAtual={patrimonioAtual}
      />
    </div>
  );
}
