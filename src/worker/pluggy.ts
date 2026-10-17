import { soDigitos } from './linha';
import type { PluggyConta, PluggyFatura, PluggyInvestimento, PluggyItem, PluggyTransacao } from './tipos';

export class PluggyErro extends Error {
  /** `motivo`: codeDescription + message do corpo da Pluggy (curto) — diz se é consentimento, MFA, item em erro… */
  constructor(public readonly status: number, public readonly caminho: string, motivo?: string) {
    super(`Pluggy HTTP ${status} em ${caminho}${motivo ? `: ${motivo}` : ''}`);
  }
}

/** code/message do corpo de erro da Pluggy, sem nada além disso (nunca o corpo inteiro no log). */
async function motivoDoErro(r: Response): Promise<string | undefined> {
  try {
    const j = (await r.json()) as { codeDescription?: unknown; message?: unknown };
    const m = [j.codeDescription, j.message].filter((x) => typeof x === 'string' && x).join(' ');
    return m ? m.slice(0, 200) : undefined;
  } catch {
    return undefined;
  }
}

export interface PluggyApi {
  conta(accountId: string): Promise<PluggyConta>;
  contasDoItem(itemId: string): Promise<PluggyConta[]>;
  transacoes(accountId: string, desde: string): Promise<PluggyTransacao[]>;
  faturas(accountId: string): Promise<PluggyFatura[]>;
  investimentos(itemId: string): Promise<PluggyInvestimento[]>;
  item(itemId: string): Promise<PluggyItem>;
  documentoTitular(itemId: string): Promise<string | null>;
}

type Pagina<T> = { results: T[]; totalPages?: number };
const TENTATIVAS = 3;

export class PluggyClient implements PluggyApi {
  private apiKey: string | null = null;

  constructor(
    private readonly creds: { clientId: string; clientSecret: string },
    private readonly fetchFn: typeof fetch = fetch,
    private readonly esperar: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
    private readonly base = 'https://api.pluggy.ai',
  ) {}

  private async autenticar(): Promise<string> {
    const r = await this.fetchFn(`${this.base}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.creds),
    });
    if (!r.ok) throw new PluggyErro(r.status, '/auth');
    const j = (await r.json()) as { apiKey: string };
    this.apiKey = j.apiKey.trim();
    return this.apiKey;
  }

  private async req<T>(method: 'GET' | 'PATCH', caminho: string, body?: unknown): Promise<T> {
    const semQuery = caminho.split('?')[0];
    let reautenticou = false;
    for (let tentativa = 1; ; tentativa++) {
      const chave = this.apiKey ?? (await this.autenticar());
      let r: Response;
      try {
        r = await this.fetchFn(`${this.base}${caminho}`, {
          method,
          headers: { 'X-API-KEY': chave, 'Content-Type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch (e) {
        if (tentativa >= TENTATIVAS) throw e;
        await this.esperar(1000 * 2 ** (tentativa - 1));
        continue;
      }
      if (r.ok) return (await r.json()) as T;
      if ((r.status === 401 || r.status === 403) && !reautenticou) {
        // a chave dura ~2h; vencida, a Pluggy responde 403 (não 401) — medido em 09/10/2026
        this.apiKey = null;
        reautenticou = true;
        tentativa--;
        continue;
      }
      if (!(r.status === 429 || r.status >= 500) || tentativa >= TENTATIVAS) throw new PluggyErro(r.status, semQuery, await motivoDoErro(r));
      await this.esperar(1000 * 2 ** (tentativa - 1));
    }
  }

  /** Todas as páginas, ou erro. Nunca devolve lista incompleta em silêncio. */
  private async todasPaginas<T>(caminho: string, tamanho: number): Promise<T[]> {
    const sep = caminho.includes('?') ? '&' : '?';
    const out: T[] = [];
    for (let page = 1; ; page++) {
      const p = await this.req<Pagina<T>>('GET', `${caminho}${sep}pageSize=${tamanho}&page=${page}`);
      const total = p.totalPages ?? 1;
      if (page < total && p.results.length === 0) {
        throw new Error(`página ${page} de ${total} veio vazia em ${caminho.split('?')[0]}`);
      }
      out.push(...p.results);
      if (page >= total) return out;
    }
  }

  conta(accountId: string) {
    return this.req<PluggyConta>('GET', `/accounts/${accountId}`);
  }
  async contasDoItem(itemId: string) {
    return (await this.req<Pagina<PluggyConta>>('GET', `/accounts?itemId=${itemId}`)).results;
  }
  transacoes(accountId: string, desde: string) {
    return this.todasPaginas<PluggyTransacao>(`/transactions?accountId=${accountId}&from=${desde}`, 500);
  }
  faturas(accountId: string) {
    return this.todasPaginas<PluggyFatura>(`/bills?accountId=${accountId}`, 100);
  }
  investimentos(itemId: string) {
    return this.todasPaginas<PluggyInvestimento>(`/investments?itemId=${itemId}`, 100);
  }
  item(itemId: string) {
    return this.req<PluggyItem>('GET', `/items/${itemId}`);
  }
  async documentoTitular(itemId: string) {
    const r = await this.req<{ document?: string | null }>('GET', `/identity?itemId=${itemId}`);
    return soDigitos(r.document);
  }
}
