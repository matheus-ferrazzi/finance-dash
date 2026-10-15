// S6 (auditoria 13/10/2026): resumo da carteira para o bot e o mensal (o Bot 04 do Telegram fazia isso).
const TIPOS: Record<string, string> = {
  FIXED_INCOME: 'Renda fixa', EQUITY: 'Ações', MUTUAL_FUND: 'Fundos', SECURITY: 'Previdência', ETF: 'ETF', COE: 'COE', OTHER: 'Outros',
};
const r2 = (x: number) => Math.round(x * 100) / 100;

export function resumoCarteira(itens: readonly { nome: string; tipo: string; atual: number }[]) {
  const porTipo = new Map<string, number>();
  for (const i of itens) {
    const t = TIPOS[i.tipo] ?? 'Outros';
    porTipo.set(t, (porTipo.get(t) ?? 0) + i.atual);
  }
  return {
    total: r2(itens.reduce((s, i) => s + i.atual, 0)),
    porTipo: Array.from(porTipo, ([tipo, total]) => ({ tipo, total: r2(total) })).sort((a, b) => b.total - a.total),
    maiores: [...itens].sort((a, b) => b.atual - a.atual).slice(0, 5).map((i) => ({ nome: i.nome, valor: r2(i.atual) })),
  };
}
