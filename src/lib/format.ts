export function brl(v: number | string | null | undefined): string {
  const n = typeof v === 'string' ? Number(v) : v ?? 0;
  return (n ?? 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 2,
  });
}

export function brlCompact(v: number | string | null | undefined): string {
  const n = Number(v ?? 0);
  const abs = Math.abs(n);
  if (abs >= 1000) return 'R$ ' + (n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'k';
  return brl(n);
}

export function pct(part: number, total: number): number {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_LONG = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

/** '2026-07' -> 'jul/26' ; Date -> idem */
export function mesLabel(ym: string): string {
  const [y, m] = ym.split('-');
  return `${MESES[Number(m) - 1]}/${y.slice(2)}`;
}

/** '2026-07' -> 'Julho 2026' */
export function mesLongo(ym: string): string {
  const [y, m] = ym.split('-');
  return `${MESES_LONG[Number(m) - 1]} ${y}`;
}

/** Mês atual no fuso do Brasil (evita virar de mês pelo UTC do servidor). */
export function currentMonthSP(): string {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit',
  }).formatToParts(new Date());
  const y = p.find((x) => x.type === 'year')!.value;
  const m = p.find((x) => x.type === 'month')!.value;
  return `${y}-${m}`;
}

export function normalizeMes(mes?: string): string {
  return mes && /^\d{4}-\d{2}$/.test(mes) ? mes : currentMonthSP();
}

export function dataBR(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const dt = typeof d === 'string' ? new Date(d + (d.length <= 10 ? 'T00:00:00' : '')) : d;
  return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ---- tradução de categorias (Pluggy EN -> PT) ----
const CAT_PT: Record<string, string> = {
  Accomodation: 'Hospedagem', 'Automatic investment': 'Investimento automático', Automotive: 'Automotivo',
  'Bank fees': 'Tarifas bancárias', Bookstore: 'Livraria', 'Car rental': 'Aluguel de carro', Cashback: 'Cashback',
  'Cinema, theater and concerts': 'Cinema e shows', Clothing: 'Roupas', 'Credit card fees': 'Encargos do cartão',
  'Credit card payment': 'Pagamento de fatura', 'Digital services': 'Serviços digitais', 'Eating out': 'Restaurante',
  Electricity: 'Energia', Electronics: 'Eletrônicos', 'Food and drinks': 'Alimentação', 'Food delivery': 'Delivery',
  Gaming: 'Games', Gas: 'Gás', 'Gas stations': 'Posto de gasolina', 'Government aid': 'Auxílio do governo',
  Groceries: 'Mercado', Healthcare: 'Saúde', 'Hospital clinics and labs': 'Clínicas e laboratórios',
  Houseware: 'Utensílios domésticos', Housing: 'Moradia', Income: 'Renda', Insurance: 'Seguro',
  'Interests charged': 'Juros cobrados', Internet: 'Internet', Investments: 'Investimentos',
  'Kids and toys': 'Crianças e brinquedos', 'Late payment and overdraft costs': 'Juros de atraso',
  Loans: 'Empréstimos', 'Loans and financing': 'Empréstimos e financiamentos', 'Mileage programs': 'Programas de milhas',
  'Mutual funds': 'Fundos', 'Non-recurring income': 'Renda extra', 'Online Courses': 'Cursos online',
  'Online shopping': 'Compras online', Optometry: 'Ótica', Outros: 'Outros', Parking: 'Estacionamento',
  'Pet supplies and vet': 'Pet e veterinário', Pharmacy: 'Farmácia', 'Proceeds interests and dividends': 'Juros e dividendos',
  'Public transportation': 'Transporte público', Salary: 'Salário', 'Same person transfer': 'Transferência própria',
  Services: 'Serviços', Shopping: 'Compras', TV: 'TV', 'Tax on financial operations': 'IOF', Taxes: 'Impostos',
  'Taxes on investments': 'Impostos s/ investimentos', 'Taxi and ride-hailing': 'Táxi e apps',
  Telecommunications: 'Telecom', 'Third party transfer - Debit Card': 'Transferência (débito)', Tickets: 'Ingressos',
  'Tolls and in vehicle payment': 'Pedágios', 'Transfer - Bank Slip': 'Boleto', 'Transfer - Internal': 'Transferência interna',
  'Transfer - PIX': 'PIX', Transfers: 'Transferências', Transportation: 'Transporte', Travel: 'Viagem',
  'Vehicle maintenance': 'Manutenção do veículo', 'Vehicle ownership taxes and fees': 'IPVA e taxas',
  Water: 'Água', Wellness: 'Bem-estar', 'Wellness and fitness': 'Bem-estar e fitness',
};

export function traduzCategoria(cat: string): string {
  return CAT_PT[cat] ?? cat;
}

const INV_PT: Record<string, string> = {
  FIXED_INCOME: 'Renda Fixa', TREASURY: 'Tesouro Direto', CDB: 'CDB', LCI: 'LCI', LCA: 'LCA',
  MUTUAL_FUND: 'Fundo', MUTUAL_FUNDS: 'Fundo', STOCK: 'Ações', ETF: 'ETF', SECURITY: 'Título',
  PENSION: 'Previdência', COE: 'COE', SAVINGS: 'Poupança', DEBENTURES: 'Debêntures',
};

export function traduzInvest(t: string): string {
  return INV_PT[t?.toUpperCase?.()] ?? t;
}

export function diasAte(d: string | Date | null | undefined): number | null {
  if (!d) return null;
  const dt = typeof d === 'string' ? new Date(d + 'T00:00:00') : d;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.round((dt.getTime() - hoje.getTime()) / 86_400_000);
}
