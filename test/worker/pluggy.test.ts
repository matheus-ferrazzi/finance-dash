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
    const r = await c.transacoes('acc-1', '2026-08-01');
    expect(r.map((x) => x.id)).toEqual(['a', 'b']);
    expect(f.chamadas[1]).toBe('GET /transactions?accountId=acc-1&from=2026-08-01&pageSize=500&page=1');
    expect(f.chamadas[2]).toBe('GET /transactions?accountId=acc-1&from=2026-08-01&pageSize=500&page=2');
  });

  it('página do meio vazia é erro, não lista incompleta', async () => {
    const f = fetchFalso([
      { status: 200, body: { results: [{ id: 'a' }], totalPages: 3 } },
      { status: 200, body: { results: [], totalPages: 3 } },
    ]);
    const c = new PluggyClient(creds, f.fn, semEspera);
    await expect(c.transacoes('acc-1', '2026-08-01')).rejects.toThrow(/vazia/);
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

  it('documentoTitular devolve só dígitos; atualizarItem usa PATCH', async () => {
    const f = fetchFalso([{ status: 200, body: { document: '123.456.789-00' } }, { status: 200, body: {} }]);
    const c = new PluggyClient(creds, f.fn, semEspera);
    expect(await c.documentoTitular('item-1')).toBe('12345678900');
    await c.atualizarItem('item-1');
    expect(f.chamadas[2]).toBe('PATCH /items/item-1');
  });
});
