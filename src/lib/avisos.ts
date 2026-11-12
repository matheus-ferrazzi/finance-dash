// Avisos por exceção do diário (Onda 2 da auditoria de 13/10/2026): o que o roadmap pedia ("alerta só por
// exceção: rotativo, cheque especial, gasto fora do padrão") e o que o Bot 06 do Telegram fazia (orçamento).
// Função pura: o painel junta os dados, o worker escreve a frase.

export type Aviso =
  | { tipo: 'negativo'; banco: string; responsavel: string; valor: number }
  | { tipo: 'juros'; banco: string; responsavel: string; valor: number }
  | { tipo: 'orcamento'; item: string; emoji: string; pct: 80 | 100; gasto: number; teto: number }
  | { tipo: 'fora_do_padrao'; descricao: string; valor: number; categoria: string; mediana: number }
  /** auditoria 11/11: fatura com saldo em aberto perto do vencimento — enquanto ainda dá para completar */
  | { tipo: 'fatura_parcial'; banco: string; responsavel: string; total: number; pago: number; falta: number; vencimento: string; venceu: boolean }
  | { tipo: 'limite'; banco: string; responsavel: string; usado: number; limite: number }
  /** fatura fechada a vencer que não cabe no saldo + o que entra até o vencimento (antes de decidir parcelar) */
  | { tipo: 'fatura_nao_cabe'; banco: string; responsavel: string; fatura: number; vencimento: string; disponivel: number; falta: number };

/** A última fatura fechada de um cartão e o limite, para os avisos. */
export interface CartaoAviso {
  banco: string; responsavel: string; total: number; pago: number;
  /** "Crédito de parcelamento": o banco já transformou o resto em parcelas (não há mais o que completar) */
  parcelado: number;
  vencimento: string; usado: number; limite: number;
}

export interface DadosAvisos {
  /** saldo das contas correntes */
  saldos: { banco: string; responsavel: string; saldo: number }[];
  /** juros/encargos de atraso ou rotativo lançados nos últimos dias */
  encargos: { banco: string; responsavel: string; valor: number }[];
  /** gasto da categoria do orçamento até anteontem e até ontem (o dia que a mensagem resume) */
  orcamento: { item: string; emoji: string; teto: number; ateAnteontem: number; ateOntem: number }[];
  /** compras de ontem muito acima do normal da categoria (já filtradas pela consulta) */
  foraDoPadrao: { descricao: string; valor: number; categoria: string; mediana: number }[];
  /** cartões com a última fatura fechada; com `hoje` (AAAA-MM-DD), ligam os avisos de fatura e de limite */
  cartoes?: CartaoAviso[];
  hoje?: string;
  /** saldo das contas hoje e as receitas previstas que ainda entram neste mês (dia típico) */
  caixa?: { saldo: number; aReceber: { dia: number; valor: number }[] };
}

const DIAS_NAO_CABE = 7; // a fatura fecha cerca de uma semana antes de vencer

const DIAS_ANTES = 10; // janela do aviso de fatura: do pagamento parcial até o vencimento
const DIAS_DEPOIS = 5; // e uns dias depois dele, enquanto o banco ainda não parcelou
const diasEntre = (de: string, ate: string) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86400000);

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

  if (d.hoje) {
    const segunda = new Date(`${d.hoje}T00:00:00Z`).getUTCDay() === 1;
    for (const c of d.cartoes ?? []) {
      const falta = r2(c.total - c.pago);
      const ate = diasEntre(d.hoje, c.vencimento); // negativo = já venceu
      const venceu = ate < 0;
      // antes do vencimento só avisa se já houve pagamento (a fatura inteira a vencer é uma conta do dia, não aviso)
      if (falta > 0.01 && c.parcelado <= 0 && ate <= DIAS_ANTES && ate >= -DIAS_DEPOIS && (venceu || c.pago > 0.01)) {
        out.push({ tipo: 'fatura_parcial', banco: c.banco, responsavel: c.responsavel, total: c.total, pago: c.pago, falta, vencimento: c.vencimento, venceu });
      }
      // estado que dura semanas: uma vez por semana, não todo dia
      if (segunda && c.limite > 0 && c.usado > c.limite + 0.005) out.push({ tipo: 'limite', banco: c.banco, responsavel: c.responsavel, usado: c.usado, limite: c.limite });
    }
  }

  if (d.hoje && d.caixa) {
    // em ordem de vencimento: cada fatura conta com o que sobra depois das anteriores
    const aVencer = (d.cartoes ?? [])
      .map((c) => ({ c, ate: diasEntre(d.hoje!, c.vencimento), devido: r2(c.total - c.pago) }))
      .filter((x) => x.ate >= 0 && x.ate <= DIAS_NAO_CABE && x.devido > 0.01 && x.c.parcelado <= 0)
      .sort((a, b) => a.c.vencimento.localeCompare(b.c.vencimento));
    let usado = 0;
    for (const { c, devido } of aVencer) {
      const mesmoMes = c.vencimento.slice(0, 7) === d.hoje.slice(0, 7);
      const entra = d.caixa.aReceber.filter((x) => !mesmoMes || x.dia <= Number(c.vencimento.slice(8, 10))).reduce((s, x) => s + x.valor, 0);
      const disponivel = r2(Math.max(0, d.caixa.saldo + entra - usado));
      if (devido > disponivel + 0.005) out.push({ tipo: 'fatura_nao_cabe', banco: c.banco, responsavel: c.responsavel, fatura: devido, vencimento: c.vencimento, disponivel, falta: r2(devido - disponivel) });
      usado += Math.min(devido, disponivel);
    }
  }

  for (const f of [...d.foraDoPadrao].sort((a, b) => b.valor - a.valor).slice(0, 2)) out.push({ tipo: 'fora_do_padrao', ...f });
  return out;
}
