// Porta literal do nó "Code in JavaScript" do workflow Finance 2.0 (n8n).
// Não "melhorar" aqui: a paridade é conferida contra o original por scripts/equivalencia.ts.
// Mudança de classificação é o projeto B, depois da virada.

export function corrigirCategoria(cat: string | null | undefined, desc: string | null | undefined): string | null | undefined {
  const d = (desc || '').toLowerCase();
  if (d.includes('playstation') || d.includes('sonyplaystatn') || d.includes('ebn *play') || d.includes('ebn*play')) {
    return /\d\/\d/.test(d) ? 'Gaming' : 'Digital services';
  }
  if (d.includes('kaza ribeiro')) return 'Housing';
  if (d.includes('google') && (d.includes('play') || d.includes('pokemon') || d.includes('youtube'))) return 'Digital services';
  if ((d.includes('ifood') || d.includes('ifd*') || d.includes('99food') || d.includes('99 food')) && cat !== 'Groceries' && cat !== 'Pharmacy') return 'Food delivery';
  if (d.includes('drogaria') || d.includes('drogasil') || d.includes('farmacia') || d.includes('farmácia') || d.includes('droga raia')) return 'Pharmacy';
  if (d.includes('auto posto') || d.includes('ipiranga') || d.includes('petrobras')) return 'Gas stations';
  if (d.includes('netflix') || d.includes('spotify') || d.includes('disney') || d.includes('hbomax') || d.includes('prime video') || d.includes('amazon prime') || d.includes('xbox') || d.includes('apple.com') || d.includes('microsoft')) return 'Digital services';
  if (d.includes('darf') || d.includes('secretaria da fazenda') || d.includes('tributo')) return 'Taxes';
  if (d.includes('salao') || d.includes('salão') || d.includes('barbearia') || d.includes('cabele')) return 'Wellness';
  if (d.includes('uber') || d.includes('99app') || d.includes('cabify')) return 'Taxi and ride-hailing';
  if (d.includes('sympla') || d.includes('eventim')) return 'Tickets';
  return cat;
}

export function classificar(cat: string | null | undefined, desc: string | null | undefined, saida: boolean, forma: string, dono: string): string {
  const d = (desc || '').toLowerCase();
  const c = cat || 'Outros';
  const espelhoCartao = d.includes('cart') && d.includes('cred');
  if (c === 'Credit card payment' || c === 'Credit card fees' || d.includes('bradesco adminis') || d.includes('neon pagamen') || d.includes('nu pagamentos') || (d.includes('fatura') && (d.includes('pag') || d.includes('parc'))) || (forma === 'Débito' && espelhoCartao))
    return 'pagamento_fatura';
  if (forma === 'Crédito' && !saida) return d.includes('pagamento') ? 'pagamento_fatura' : 'estorno';
  if (d.includes('rdb')) return 'transferencia_interna';
  if (c === 'Same person transfer') return 'transferencia_interna';
  if (c === 'Investments' || c === 'Automatic investment') return 'aporte';
  if (['Salary', 'Income', 'Government aid', 'Cashback', 'Proceeds interests and dividends'].includes(c)) return 'receita';
  if (c === 'Taxes on investments') return 'despesa';
  if (['Transfers', 'Transfer - PIX', 'Transfer - Bank Slip'].includes(c)) {
    const parc = dono === 'Ariane' ? ['matheus', 'ferrazzi', 'jacob'] : ['ariane', 'bitencourt'];
    if (parc.some((p) => d.includes(p))) return 'transferencia_interna';
    return saida ? 'despesa' : 'receita';
  }
  if (c === 'Outros') return 'estorno';
  return saida ? 'despesa' : 'estorno';
}
