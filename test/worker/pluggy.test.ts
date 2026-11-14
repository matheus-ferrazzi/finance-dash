import { describe, expect, it } from 'vitest';
import { PluggyClient, PluggyErro } from '../../src/worker/pluggy';

type Resp = { status: number; body?: unknown };

/** fetch falso: responde /auth sempre; o resto sai da fila, na ordem */
function fetchFalso(fila: Resp[]) {
  const chamadas: string[] = [];
  let auths = 0;
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    chamadas.push(`${init?.method ?? 'GET'} ${u.replace('https://api.pluggy.ai', '')}`);
    if (u.endsWith('/auth')) {
      auths++;
      return new Response(JSON.stringify({ apiKey: ` chave${auths} ` }), { status: 200 });
    }
    const r = fila.shift();
    if (!r) throw new Error('fila vazia');
    if (r.status === 0) throw new TypeError('fetch failed');
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status });
  }) as typeof fetch;
  return { fn, chamadas, auths: () => auths };
}

const semEspera = async () => {};
const creds = { clientId: 'id', clientSecret: 'segredo' };

describe('PluggyClient', () => {
  it('autentica uma vez e manda a chave sem espaço', async () => {
    const f = fetchFalso([{ status: 200, body: { id: 'item-1' } }, { status: 200, body: { id: 'item-2' } }]);
    const c = new PluggyClient(creds, f.fn, semEspera);
    await c.item('item-1');
    await c.item('item-2');
    expect(f.auths()).toBe(1);
  });

  it('percorre todas as páginas', async () => {
    const f = fetchFalso([
      { status: 200, body: { results: [{ id: 'a' }], page: 1, totalPages: 2 } },
      { status: 200, body: { results: [{ id: 'b' }], page: 2, totalPages: 2 } },
    ]);
    const c = new PluggyClient(creds, f.fn, semEspera);
    const r = await c.faturas('acc-1');
    expect(r.map((x) => x.id)).toEqual(['a', 'b']);
    expect(f.chamadas[1]).toBe('GET /bills?accountId=acc-1&pageSize=100&page=1');
    expect(f.chamadas[2]).toBe('GET /bills?accountId=acc-1&pageSize=100&page=2');
  });

  it('página do meio vazia é erro, não lista incompleta', async () => {
    const f = fetchFalso([
      { status: 200, body: { results: [{ id: 'a' }], totalPages: 3 } },
      { status: 200, body: { results: [], totalPages: 3 } },
    ]);
    const c = new PluggyClient(creds, f.fn, semEspera);
    await expect(c.faturas('acc-1')).rejects.toThrow(/vazia/);
  });
});

// 14/11: /transactions antigo responde 410 na conta nova da Pluggy e sai de vez em 31/12/2026 → /v2/transactions (cursor)
describe('transacoes por cursor (/v2/transactions)', () => {
  it('segue o "after" do next (query relativa ou URL inteira) até next = null', async () => {
    const f = fetchFalso([
      { status: 200, body: { results: [{ id: 'a' }], next: '?accountId=acc-1&after=c1' } },
      { status: 200, body: { results: [{ id: 'b' }], next: 'https://api.pluggy.ai/v2/transactions?accountId=acc-1&after=c%2B2' } },
      { status: 200, body: { results: [{ id: 'c' }], next: null } },
    ]);
    const c = new PluggyClient(creds, f.fn, semEspera);
    const r = await c.transacoes('acc-1', '2026-08-01');
    expect(r.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(f.chamadas.slice(1)).toEqual([
      'GET /v2/transactions?accountId=acc-1&dateFrom=2026-08-01',
      'GET /v2/transactions?accountId=acc-1&dateFrom=2026-08-01&after=c1',
      'GET /v2/transactions?accountId=acc-1&dateFrom=2026-08-01&after=c%2B2',
    ]);
  });

  it('cursor repetido é erro, não laço infinito', async () => {
    const f = fetchFalso([
      { status: 200, body: { results: [{ id: 'a' }], next: '?after=x' } },
      { status: 200, body: { results: [{ id: 'b' }], next: '?after=x' } },
    ]);
    const c = new PluggyClient(creds, f.fn, semEspera);
    await expect(c.transacoes('acc-1', '2026-08-01')).rejects.toThrow(/cursor repetido/);
  });

  it('next sem "after" é erro, não lista incompleta', async () => {
    const f = fetchFalso([{ status: 200, body: { results: [{ id: 'a' }], next: '?accountId=acc-1' } }]);
    const c = new PluggyClient(creds, f.fn, semEspera);
    await expect(c.transacoes('acc-1', '2026-08-01')).rejects.toThrow(/sem "after"/);
  });

  it('repete em 503 e em erro de rede, até 3 tentativas', async () => {
    const f = fetchFalso([{ status: 503 }, { status: 0 }, { status: 200, body: { id: 'item-1' } }]);
    const c = new PluggyClient(creds, f.fn, semEspera);
    expect((await c.item('item-1')).id).toBe('item-1');
  });

  it('desiste depois de 3 tentativas', async () => {
    const f = fetchFalso([{ status: 503 }, { status: 503 }, { status: 503 }]);
    const c = new PluggyClient(creds, f.fn, semEspera);
    await expect(c.item('item-1')).rejects.toBeInstanceOf(PluggyErro);
  });

  it('404 não repete', async () => {
    const f = fetchFalso([{ status: 404 }, { status: 200, body: {} }]);
    const c = new PluggyClient(creds, f.fn, semEspera);
    await expect(c.item('x')).rejects.toMatchObject({ status: 404, caminho: '/items/x' });
    expect(f.chamadas.length).toBe(2); // auth + 1 tentativa
  });

  it('401 re-autentica uma vez e segue (chave expirada no meio da recarga)', async () => {
    const f = fetchFalso([{ status: 401 }, { status: 200, body: { id: 'item-1' } }]);
    const c = new PluggyClient(creds, f.fn, semEspera);
    expect((await c.item('item-1')).id).toBe('item-1');
    expect(f.auths()).toBe(2);
  });

  it('403 com chave vencida re-autentica uma vez e segue (a Pluggy responde 403, não 401)', async () => {
    const f = fetchFalso([{ status: 403 }, { status: 200, body: { id: 'item-1' } }]);
    const c = new PluggyClient(creds, f.fn, semEspera);
    expect((await c.item('item-1')).id).toBe('item-1');
    expect(f.auths()).toBe(2);
  });

  it('403 que persiste depois de re-autenticar é erro de verdade', async () => {
    const f = fetchFalso([{ status: 403 }, { status: 403 }]);
    const c = new PluggyClient(creds, f.fn, semEspera);
    await expect(c.item('item-1')).rejects.toMatchObject({ status: 403 });
    expect(f.auths()).toBe(2);
  });

  it('documentoTitular devolve só dígitos', async () => {
    const f = fetchFalso([{ status: 200, body: { document: '123.456.789-00' } }]);
    const c = new PluggyClient(creds, f.fn, semEspera);
    expect(await c.documentoTitular('item-1')).toBe('12345678900');
  });
});

// Onda 2 / S2 (auditoria 13/10): o 400 da Pluggy não dizia por quê (era o PATCH do Inter, que saiu em 17/10)
describe('erro da Pluggy com o motivo', () => {
  it('400 traz o code/message do corpo (curto), sem repetir', async () => {
    const f = fetchFalso([{ status: 400, body: { code: 400, message: 'Item is in an invalid state', codeDescription: 'ITEM_ERROR' } }]);
    const c = new PluggyClient(creds, f.fn, semEspera);
    await expect(c.item('item-1')).rejects.toThrow('Pluggy HTTP 400 em /items/item-1: ITEM_ERROR Item is in an invalid state');
  });
  it('corpo sem JSON: só o status', async () => {
    const f = fetchFalso([{ status: 400 }]);
    const c = new PluggyClient(creds, f.fn, semEspera);
    await expect(c.item('item-1')).rejects.toThrow(/^Pluggy HTTP 400 em \/items\/item-1$/);
  });
});
