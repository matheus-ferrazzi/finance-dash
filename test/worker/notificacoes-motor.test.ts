import { describe, expect, it } from 'vitest';
import { CanalTelegram } from '../../src/worker/notificacoes/canal';
import { destinoDe, modoDoBot, rodarNotificacao, type LinhaNotif, type RegistroNotif } from '../../src/worker/notificacoes/motor';

function registroFake() {
  const linhas: LinhaNotif[] = [];
  const reg: RegistroNotif = {
    async ultimoEstado(bot) {
      const l = [...linhas].reverse().find((x) => x.bot === bot && x.estado !== null);
      return l ? l.estado : null;
    },
    async gravar(l) { linhas.push(l); },
  };
  return { reg, linhas };
}
const canalFake = () => {
  const enviados: string[] = [];
  return { enviados, canal: { async enviar(t: string) { enviados.push(t); } } };
};
const fat = [{ banco: 'B1', responsavel: 'X', valor: 100, venc: '15/10', venc_iso: '2026-10-15', dias: 2 }];
const fontes = (over: Record<string, () => Promise<unknown>> = {}) => ({
  ritmo: async () => ({ mesLabel: 'out/26', fechaCom: 1, diasRestantes: 5, ritmoSeguroDia: 10, ritmoAtualDia: 5, receitasAReceber: [] }),
  fatura: async () => fat, gasto: async () => [], saude: async () => ({}), backup: async () => ({}), ...over,
}) as any;

describe('modo por bot', () => {
  it('real só se está na lista e há canal', () => {
    expect(modoDoBot('ritmo', 'ritmo, fatura', true)).toBe('real');
    expect(modoDoBot('gasto', 'ritmo,fatura', true)).toBe('sombra');
    expect(modoDoBot('ritmo', 'ritmo', false)).toBe('sombra');
    expect(modoDoBot('ritmo', undefined, true)).toBe('sombra');
  });
});

describe('motor', () => {
  it('sombra grava sem enviar; o estado da sombra vale quando vira real (não repete o aviso)', async () => {
    const { reg, linhas } = registroFake(); const { canal, enviados } = canalFake();
    expect((await rodarNotificacao('fatura', { fontes: fontes(), registro: reg, canais: { grupo: null, matheus: null, telegram: canal }, modo: 'sombra' })).enviado).toBe(false);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ bot: 'fatura', modo: 'sombra', enviado: false });
    expect(enviados).toEqual([]);
    const r = await rodarNotificacao('fatura', { fontes: fontes(), registro: reg, canais: { grupo: null, matheus: null, telegram: canal }, modo: 'real' });
    expect(r.texto).toBeNull();
    expect(enviados).toEqual([]);
    expect(linhas).toHaveLength(1);
  });
  it('real envia e grava enviado; Telegram recusando grava o erro e não lança', async () => {
    const { reg, linhas } = registroFake(); const { canal, enviados } = canalFake();
    expect((await rodarNotificacao('ritmo', { fontes: fontes(), registro: reg, canais: { grupo: null, matheus: null, telegram: canal }, modo: 'real' })).enviado).toBe(true);
    expect(enviados).toHaveLength(1);
    expect(linhas.at(-1)).toMatchObject({ modo: 'real', enviado: true, erro: null });
    const ruim = { async enviar() { throw new Error('Telegram HTTP 400: Bad Request'); } };
    const r = await rodarNotificacao('ritmo', { fontes: fontes(), registro: reg, canais: { grupo: null, matheus: null, telegram: ruim }, modo: 'real' });
    expect(r).toMatchObject({ enviado: false, erro: 'Telegram HTTP 400: Bad Request' });
    expect(linhas.at(-1)).toMatchObject({ enviado: false, erro: 'Telegram HTTP 400: Bad Request' });
  });
  it('fonte falhando (painel fora): grava o erro, sem texto, sem lançar', async () => {
    const { reg, linhas } = registroFake(); const { canal } = canalFake();
    const r = await rodarNotificacao('ritmo', { fontes: fontes({ ritmo: async () => { throw new Error('fetch failed'); } }), registro: reg, canais: { grupo: null, matheus: null, telegram: canal }, modo: 'real' });
    expect(r).toMatchObject({ texto: null, enviado: false, erro: 'fetch failed' });
    expect(linhas).toHaveLength(1);
  });
  it('gasto: primeira execução só grava a marca; dry-run não grava nem envia', async () => {
    const { reg, linhas } = registroFake(); const { canal, enviados } = canalFake();
    const g = fontes({ gasto: async () => [{ id_transacao: 'a', criado_em: '2026-10-10T10:00:00', valor: 600, descricao: 'X', banco: 'B', responsavel: 'Y', data: '10/10' }] });
    await rodarNotificacao('gasto', { fontes: g, registro: reg, canais: { grupo: null, matheus: null, telegram: canal }, modo: 'real' });
    expect(linhas).toEqual([{ bot: 'gasto', modo: 'real', texto: null, enviado: false, erro: null, estado: { lastCriadoEm: '2026-10-10T10:00:00' } }]);
    const d = await rodarNotificacao('fatura', { fontes: fontes(), registro: reg, canais: { grupo: null, matheus: null, telegram: canal }, modo: 'dry-run' });
    expect(d.texto).not.toBeNull();
    expect(linhas).toHaveLength(1);
    expect(enviados).toEqual([]);
  });
  it('real sem canal configurado: grava como sombra, sem lançar', async () => {
    const { reg, linhas } = registroFake();
    const r = await rodarNotificacao('ritmo', { fontes: fontes(), registro: reg, canais: { grupo: null, matheus: null, telegram: null }, modo: 'real' });
    expect(r.enviado).toBe(false);
    expect(linhas[0]).toMatchObject({ modo: 'sombra' });
  });
});

describe('motor: falhas não perdem aviso (revisão C2)', () => {
  it('envio real falhando NÃO avança o estado: a próxima execução tenta de novo', async () => {
    const { reg, linhas } = registroFake();
    const ruim = { async enviar() { throw new Error('Telegram HTTP 502: Bad Gateway'); } };
    const r1 = await rodarNotificacao('fatura', { fontes: fontes(), registro: reg, canais: { grupo: null, matheus: null, telegram: ruim }, modo: 'real' });
    expect(r1).toMatchObject({ enviado: false, erro: 'Telegram HTTP 502: Bad Gateway' });
    expect(linhas.at(-1)).toMatchObject({ estado: null });
    const { canal, enviados } = canalFake();
    const r2 = await rodarNotificacao('fatura', { fontes: fontes(), registro: reg, canais: { grupo: null, matheus: null, telegram: canal }, modo: 'real' });
    expect(r2.enviado).toBe(true);
    expect(enviados).toHaveLength(1);
  });
  it('dados inesperados (painel responde null) viram erro gravado, sem lançar', async () => {
    const { reg, linhas } = registroFake(); const { canal } = canalFake();
    const r = await rodarNotificacao('ritmo', { fontes: fontes({ ritmo: async () => null }), registro: reg, canais: { grupo: null, matheus: null, telegram: canal }, modo: 'real' });
    expect(r.texto).toBeNull();
    expect(r.erro).toBeTruthy();
    expect(linhas).toHaveLength(1);
  });
});

describe('destinos (D)', () => {
  it('técnico vai para o canal do Matheus; sem esse canal fica em sombra', async () => {
    const { reg } = registroFake(); const grupo = canalFake(); const matheus = canalFake();
    const f = fontes({ tecnico: async () => ({ saude: { h_lancamentos: 5, h_investimentos: 5, h_faturas: 5, h_worker_ok: 30, worker_falhas_24h: 0, ultimo_lancamento: 'x' }, backup: { h_desde_ok: 5, h_desde_n8n: 5, n8n_workflows: 1, h_desde_offsite: 1, tamanho: 1, tabelas: 1, falhas_24h: 0, ultimo_erro: null }, consentimentos: [] }) });
    await rodarNotificacao('tecnico', { fontes: f, registro: reg, canais: { grupo: grupo.canal, matheus: matheus.canal, telegram: null }, modo: 'real' });
    expect(matheus.enviados).toHaveLength(1);
    expect(grupo.enviados).toHaveLength(0);
    const r = await rodarNotificacao('tecnico', { fontes: f, registro: reg, canais: { grupo: grupo.canal, matheus: null, telegram: null }, modo: 'real' });
    expect(r.modo).toBe('sombra');
  });
  it('diário vai para o grupo, com o link do painel', async () => {
    const { reg } = registroFake(); const grupo = canalFake();
    const f = fontes({ diario: async () => ({ mesLabel: 'out/26', fechaCom: 1, diasRestantes: 5, ritmoSeguroDia: 10, ritmoAtualDia: 5, contas: [] }) });
    await rodarNotificacao('diario', { fontes: f, registro: reg, canais: { grupo: grupo.canal, matheus: null, telegram: null }, modo: 'real', painelUrl: 'https://painel.exemplo' });
    expect(grupo.enviados[0].endsWith('https://painel.exemplo/')).toBe(true);
  });
  it('barra no fim do PAINEL_URL não duplica', async () => {
    const { reg } = registroFake(); const grupo = canalFake();
    const f = fontes({ semanal: async () => ({ semana: { inicio: '2026-10-05', fim: '2026-10-11' }, total: 0, mediaTotal: 0, grupos: [], trilha: { fase: 1, titulo: 'T', proximoPasso: 'P' } }) });
    await rodarNotificacao('semanal', { fontes: f, registro: reg, canais: { grupo: grupo.canal, matheus: null, telegram: null }, modo: 'real', painelUrl: 'https://painel.exemplo/' });
    expect(grupo.enviados[0]).toContain('https://painel.exemplo/gastos');
    expect(grupo.enviados[0]).not.toContain('exemplo//');
  });
  it('bots do C2 seguem no Telegram mesmo com o grupo do WhatsApp configurado (até o desligamento)', async () => {
    expect(['ritmo', 'fatura', 'gasto', 'saude', 'backup'].map((b) => destinoDe(b as any))).toEqual(Array(5).fill('telegram'));
    expect(['diario', 'semanal', 'mensal'].map((b) => destinoDe(b as any))).toEqual(Array(3).fill('grupo'));
    const { reg } = registroFake(); const grupo = canalFake(); const tg = canalFake();
    await rodarNotificacao('ritmo', { fontes: fontes(), registro: reg, canais: { grupo: grupo.canal, matheus: null, telegram: tg.canal }, modo: 'real' });
    expect(grupo.enviados).toHaveLength(0);
    expect(tg.enviados).toHaveLength(1);
  });
});

describe('canal Telegram', () => {
  it('manda Markdown para o chat; erro não expõe o token', async () => {
    const chamadas: any[] = [];
    const ok = new CanalTelegram('TOKEN-FALSO', '123', (async (url: string, init: any) => { chamadas.push([url, JSON.parse(init.body)]); return { ok: true, json: async () => ({ ok: true }) }; }) as any);
    await ok.enviar('oi');
    expect(chamadas[0][1]).toEqual({ chat_id: '123', text: 'oi', parse_mode: 'Markdown' });
    const ruim = new CanalTelegram('TOKEN-FALSO', '123', (async () => ({ ok: false, status: 401, json: async () => ({ description: 'Unauthorized' }) })) as any);
    await expect(ruim.enviar('oi')).rejects.toThrow('Telegram HTTP 401: Unauthorized');
    const semToken = await ruim.enviar('oi').catch((e) => String(e));
    expect(semToken).not.toContain('TOKEN-FALSO');
    const quebrado = new CanalTelegram('TOKEN-FALSO', '123', (async () => { throw new Error('connect ECONNREFUSED https://api.telegram.org/botTOKEN-FALSO/sendMessage'); }) as any);
    const msg = await quebrado.enviar('oi').catch((e) => String(e));
    expect(msg).not.toContain('TOKEN-FALSO');
  });
});
