// Avisos por exceção do diário (Onda 2 da auditoria de 13/10/2026): o que o roadmap pedia ("alerta só por
// exceção: rotativo, cheque especial, gasto fora do padrão") e o que o Bot 06 do Telegram fazia (orçamento).
// Função pura: o painel junta os dados, o worker escreve a frase.

export type Aviso =
  | { tipo: 'negativo'; banco: string; responsavel: string; valor: number }
  | { tipo: 'juros'; banco: string; responsavel: string; valor: number }
  | { tipo: 'orcamento'; item: string; emoji: string; pct: 80 | 100; gasto: number; teto: number }
  | { tipo: 'fora_do_padrao'; descricao: string; valor: number; categoria: string; mediana: number };

export interface DadosAvisos {
  /** saldo das contas correntes */
  saldos: { banco: string; responsavel: string; saldo: number }[];
  /** juros/encargos de atraso ou rotativo lançados nos últimos dias */
  encargos: { banco: string; responsavel: string; valor: number }[];
  /** gasto da categoria do orçamento até anteontem e até ontem (o dia que a mensagem resume) */
  orcamento: { item: string; emoji: string; teto: number; ateAnteontem: number; ateOntem: number }[];
  /** compras de ontem muito acima do normal da categoria (já filtradas pela consulta) */
  foraDoPadrao: { descricao: string; valor: number; categoria: string; mediana: number }[];
}

const r2 = (x: number) => Math.round(x * 100) / 100;

export function avisosDoDia(d: DadosAvisos): Aviso[] {
  const out: Aviso[] = [];
  for (const s of d.saldos) if (s.saldo < -0.005) out.push({ tipo: 'negativo', banco: s.banco, responsavel: s.responsavel, valor: r2(s.saldo) });

  const juros = new Map<string, { banco: string; responsavel: string; valor: number }>();
  for (const e of d.encargos) {
    const k = `${e.banco}|${e.responsavel}`;
    const j = juros.get(k) ?? { banco: e.banco, responsavel: e.responsavel, valor: 0 };
    juros.set(k, { ...j, valor: r2(j.valor + e.valor) });
  }
  for (const j of Array.from(juros.values())) out.push({ tipo: 'juros', ...j });

  // orçamento saiu daqui em 15/10/2026: virou alerta na hora (worker `alerta-meta`, uma vez por limite no mês)

  for (const f of [...d.foraDoPadrao].sort((a, b) => b.valor - a.valor).slice(0, 2)) out.push({ tipo: 'fora_do_padrao', ...f });
  return out;
}
