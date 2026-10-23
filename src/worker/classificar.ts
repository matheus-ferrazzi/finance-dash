// Nasceu como porta literal do nó "Code in JavaScript" do workflow Finance 2.0 (n8n), conferida por
// scripts/equivalencia.ts. Depois da virada (o n8n não ingere mais), as correções do projeto B entram
// aqui, cada uma com teste e data.

export function corrigirCategoria(cat: string | null | undefined, desc: string | null | undefined): string | null | undefined {
  const d = (desc || '').toLowerCase();
  if (d.includes('playstation') || d.includes('sonyplaystatn') || d.includes('ebn *play') || d.includes('ebn*play')) {
    return /\d\/\d/.test(d) ? 'Gaming' : 'Digital services';
  }
  if (d.includes('kaza ribeiro')) return 'Housing';
  // L7 (23/10): juros, multa ou encargo cobrados sobre o parcelamento de fatura ("ENC ATRASO PARC FATURA", a Pluggy
  // manda "Automotive"): é atraso. A mesma regra está em classificar (as funções são lidas sozinhas pela equivalência)
  if (d.includes('fatura') && /juros|multa|\benc\b|encargo|\bmora\b|\biof\b/.test(d)) return 'Late payment and overdraft costs';
  // B 10/10/2026: "BRADESCO ADMINISTRADORA D(e consórcios)" — o n8n tratava como fatura de cartão
  if (d.includes('bradesco adminis') || d.includes('consorcio') || d.includes('consórcio')) return 'Consortium';
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
  // B 10/10/2026: fatura do cartão Santander paga por PIX QR no Itaú (o cartão registra "PAGAMENTO DE FATURA")
  const faturaPorQr = d.includes('qr code') && d.includes('banco santander');
  // W4 (23/10): encargo cobrado no cartão sobre o parcelamento de fatura é custo — antes do "parc"+"fatura" abaixo
  if (saida && forma === 'Crédito' && d.includes('fatura') && /juros|multa|\benc\b|encargo|\bmora\b|\biof\b/.test(d)) return 'despesa';
  if (c === 'Credit card payment' || c === 'Credit card fees' || d.includes('neon pagamen') || d.includes('nu pagamentos') || (d.includes('fatura') && (d.includes('pag') || d.includes('parc'))) || (forma === 'Débito' && espelhoCartao) || faturaPorQr)
    return 'pagamento_fatura';
  if (forma === 'Crédito' && !saida) return d.includes('pagamento') ? 'pagamento_fatura' : 'estorno';
  if (d.includes('rdb')) return 'transferencia_interna';
  if (c === 'Same person transfer') return 'transferencia_interna';
  if (c === 'Investments' || c === 'Automatic investment') return 'aporte';
  if (['Salary', 'Income', 'Government aid', 'Cashback', 'Proceeds interests and dividends'].includes(c)) return 'receita';
  if (c === 'Taxes on investments') return 'despesa';
  if (['Transfers', 'Transfer - PIX', 'Transfer - Bank Slip'].includes(c)) {
    // L8 (22/10): Pix que volta (devolvido/devolução) abate o gasto — antes virava receita
    if (!saida && /devolvid|devolu[cç][aã]o|dev pix/.test(d)) return 'estorno';
    // L6 (22/10): só o primeiro nome do parceiro — o sobrenome sozinho pegava a família dele (Pix para a irmã sumia
    // do gasto como transferência do casal)
    const parc = dono === 'Ariane' ? ['matheus'] : ['ariane'];
    if (parc.some((p) => d.includes(p))) return 'transferencia_interna';
    return saida ? 'despesa' : 'receita';
  }
  if (c === 'Outros') return 'estorno';
  return saida ? 'despesa' : 'estorno';
}
