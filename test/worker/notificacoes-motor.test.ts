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
    // N19: o link do semanal abre a semana da mensagem
    expect(grupo.enviados[0]).toContain('https://painel.exemplo/gastos?p=sem-2026-10-05');
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
  // D-M8: nome com _ ou * (grupo, conta) fazia o Telegram recusar a mensagem inteira
  it('D-M8: 400 "can\'t parse entities" reenvia sem Markdown; outro 400 não', async () => {
    const enviados: any[] = [];
    const tg = new CanalTelegram('T', '1', (async (_u: string, init: any) => {
      const b = JSON.parse(init.body); enviados.push(b);
      return b.parse_mode ? { ok: false, status: 400, json: async () => ({ description: "Bad Request: can't parse entities: Can't find end of the entity" }) } : { ok: true, json: async () => ({}) };
    }) as any);
    await tg.enviar('conta_com_traço *x');
    expect(enviados.map((b) => b.parse_mode ?? null)).toEqual(['Markdown', null]);
    const outro = new CanalTelegram('T', '1', (async () => ({ ok: false, status: 400, json: async () => ({ description: 'Bad Request: chat not found' }) })) as any);
    await expect(outro.enviar('oi')).rejects.toThrow('chat not found');
  });
});

function canalComImagem(falhaImagem = false) {
  const textos: string[] = []; const imagens: [Buffer, string][] = [];
  const canal = {
    enviar: async (t: string) => { textos.push(t); },
    enviarImagem: async (p: Buffer, l: string) => { if (falhaImagem) throw new Error('WhatsApp HTTP 400: media'); imagens.push([p, l]); },
  };
  return { canal, textos, imagens };
}
const diarioComSerie = async () => ({ mesLabel: 'out/26', fechaCom: 1, diasRestantes: 5, ritmoSeguroDia: 10, ritmoAtualDia: 5, contas: [],
  serie: [{ dia: 1, acumulado: 5 }], cabeNoMes: 100, diasNoMes: 31 });
const png = () => Buffer.from('PNG');

describe('imagem (D2)', () => {
  it('canal com imagem: um envio com legenda = texto; nada de texto separado', async () => {
    const { reg } = registroFake(); const c = canalComImagem();
    const r = await rodarNotificacao('diario', { fontes: fontes({ diario: diarioComSerie }), registro: reg, canais: { grupo: c.canal, matheus: null, telegram: null }, modo: 'real', renderizar: png });
    expect(r.enviado).toBe(true);
    expect(c.imagens).toHaveLength(1);
    expect(c.imagens[0][1]).toBe(r.texto);
    expect(c.textos).toHaveLength(0);
  });
  it('imagem recusada: vai o texto e o erro fica com "imagem:"', async () => {
    const { reg, linhas } = registroFake(); const c = canalComImagem(true);
    const r = await rodarNotificacao('diario', { fontes: fontes({ diario: diarioComSerie }), registro: reg, canais: { grupo: c.canal, matheus: null, telegram: null }, modo: 'real', renderizar: png });
    expect(c.textos).toHaveLength(1);
    expect(r.enviado).toBe(true);
    expect(r.erro).toMatch(/^imagem: WhatsApp HTTP 400/);
    expect(linhas.at(-1)!.erro).toMatch(/^imagem:/);
  });
  // D2 (spec l.52) / D2-M1: tempo esgotado no sendMedia — o texto vai (perder o diário é pior que uma duplicata rara)
  it('D2-M1: sendMedia com tempo esgotado: o texto vai e o erro registra "imagem: … timeout"', async () => {
    const { reg } = registroFake();
    const textos: string[] = [];
    const canal = { enviar: async (t: string) => { textos.push(t); }, enviarImagem: async () => { throw new Error('WhatsApp: The operation was aborted due to timeout'); } };
    const r = await rodarNotificacao('diario', { fontes: fontes({ diario: diarioComSerie }), registro: reg, canais: { grupo: canal, matheus: null, telegram: null }, modo: 'real', renderizar: png });
    expect(textos).toHaveLength(1);
    expect(r.enviado).toBe(true);
    expect(r.erro).toMatch(/^imagem: .*timeout/);
  });
  // D2-M2: legenda longa demais — antes ia a imagem sem legenda e depois o texto; o texto falhando, sobrava
  // uma imagem órfã. Agora o texto (o que importa) vai primeiro e a imagem depois, opcional.
  it('D2-M2: texto longo: texto primeiro, imagem depois; imagem falhando não derruba o envio', async () => {
    const { reg } = registroFake(); const ordem: string[] = [];
    const longo = async () => ({ ...(await diarioComSerie()), contas: Array.from({ length: 40 }, (_, i) => ({ nome: `Conta ${i} com nome comprido`, valor: 10, quando: 'hoje' as const })) });
    const canal = { enviar: async () => { ordem.push('texto'); }, enviarImagem: async (_p: Buffer, l: string) => { ordem.push(`imagem:${l}`); throw new Error('falhou'); } };
    const r = await rodarNotificacao('diario', { fontes: fontes({ diario: longo }), registro: reg, canais: { grupo: canal, matheus: null, telegram: null }, modo: 'real', renderizar: png });
    expect(ordem).toEqual(['texto', 'imagem:']);
    expect(r.enviado).toBe(true);
    expect(r.erro).toBe('imagem: falhou');
  });
  // D2-M8: em sombra o PNG nunca era gerado — um gráfico quebrado só apareceria no primeiro envio real
  it('D2-M8: sombra também gera o PNG (sem enviar) e registra a falha como "imagem: …"', async () => {
    const { reg, linhas } = registroFake(); let gerou = 0;
    await rodarNotificacao('diario', { fontes: fontes({ diario: diarioComSerie }), registro: reg, canais: { grupo: null, matheus: null, telegram: null }, modo: 'sombra', renderizar: () => { gerou++; return Buffer.from('P'); } });
    expect(gerou).toBe(1);
    expect(linhas.at(-1)!.erro).toBeNull();
    const r2 = registroFake();
    await rodarNotificacao('diario', { fontes: fontes({ diario: diarioComSerie }), registro: r2.reg, canais: { grupo: null, matheus: null, telegram: null }, modo: 'sombra', renderizar: () => { throw new Error('resvg'); } });
    expect(r2.linhas.at(-1)).toMatchObject({ modo: 'sombra', enviado: false, erro: 'imagem: resvg' });
  });
  it('gerar o PNG falhou: vai o texto', async () => {
    const c = canalComImagem(); const { reg } = registroFake();
    const r = await rodarNotificacao('diario', { fontes: fontes({ diario: diarioComSerie }), registro: reg, canais: { grupo: c.canal, matheus: null, telegram: null }, modo: 'real', renderizar: () => { throw new Error('resvg'); } });
    expect(c.textos).toHaveLength(1);
    expect(r.erro).toBe('imagem: resvg');
  });
  it('painel sem série (sem gráfico) ou canal sem imagem (Telegram): só texto', async () => {
    const c = canalComImagem(); const { reg } = registroFake();
    await rodarNotificacao('diario', { fontes: fontes({ diario: async () => ({ ...(await diarioComSerie()), serie: undefined }) }), registro: reg, canais: { grupo: c.canal, matheus: null, telegram: null }, modo: 'real', renderizar: png });
    expect(c.textos).toHaveLength(1);
    const t = canalFake();
    await rodarNotificacao('diario', { fontes: fontes({ diario: diarioComSerie }), registro: reg, canais: { grupo: t.canal, matheus: null, telegram: null }, modo: 'real', renderizar: png });
    expect(t.enviados).toHaveLength(1);
  });
  it('legenda acima de 1000 caracteres: imagem sem legenda e o texto em seguida', async () => {
    const c = canalComImagem(); const { reg } = registroFake();
    const muitas = Array.from({ length: 40 }, (_, i) => ({ nome: `Conta numero ${i}`, valor: 10, quando: 'hoje' as const }));
    await rodarNotificacao('diario', { fontes: fontes({ diario: async () => ({ ...(await diarioComSerie()), contas: muitas }) }), registro: reg, canais: { grupo: c.canal, matheus: null, telegram: null }, modo: 'real', renderizar: png });
    expect(c.imagens[0][1]).toBe('');
    expect(c.textos).toHaveLength(1);
  });
  it('dry-run devolve o SVG e não renderiza', async () => {
    const { reg } = registroFake(); let chamou = false;
    const r = await rodarNotificacao('diario', { fontes: fontes({ diario: diarioComSerie }), registro: reg, canais: { grupo: null, matheus: null, telegram: null }, modo: 'dry-run', renderizar: () => { chamou = true; return png(); } });
    expect(r.svg).toContain('<svg');
    expect(chamou).toBe(false);
  });
});

describe('resvg carregado sob demanda (revisão D2)', () => {
  it('renderizar assíncrono que falha (biblioteca nativa não carregou): vai o texto', async () => {
    const c = canalComImagem(); const { reg } = registroFake();
    const r = await rodarNotificacao('diario', { fontes: fontes({ diario: diarioComSerie }), registro: reg, canais: { grupo: c.canal, matheus: null, telegram: null }, modo: 'real',
      renderizar: async () => { throw new Error('Failed to load native binding'); } });
    expect(c.imagens).toHaveLength(0);
    expect(c.textos).toHaveLength(1);
    expect(r.erro).toBe('imagem: Failed to load native binding');
  });
  it('o módulo do PNG não carrega o resvg ao ser importado', async () => {
    const fonte = (await import('node:fs')).readFileSync('src/worker/notificacoes/png.ts', 'utf8');
    expect(fonte).not.toMatch(/^import .*@resvg\/resvg-js/m);
  });
});
