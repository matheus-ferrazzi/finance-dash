// E1: servidor HTTP do webhook (rede interna, sem porta publicada). Responde já e entrega o corpo; não loga corpo.
import { createServer, type Server } from 'node:http';
import { timingSafeEqual } from 'node:crypto';

const LIMITE = 1_000_000;
const igual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function criarServidor(token: string, aoReceber: (corpo: unknown) => void): Server {
  return createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (req.method === 'GET' && url.pathname === '/saude') { res.writeHead(200).end('ok'); return; }
    if (req.method !== 'POST' || url.pathname !== '/whatsapp') { res.writeHead(404).end(); return; }
    if (!igual(url.searchParams.get('t') ?? '', token)) { res.writeHead(403).end(); req.resume(); return; }
    const partes: Buffer[] = []; let tam = 0;
    req.on('data', (b: Buffer) => { tam += b.length; if (tam <= LIMITE) partes.push(b); });
    req.on('end', () => {
      res.writeHead(200).end('ok');
      if (tam > LIMITE) return;
      let corpo: unknown;
      try { corpo = JSON.parse(Buffer.concat(partes).toString('utf8')); } catch { return; }
      try { aoReceber(corpo); } catch { /* o processamento tem o próprio tratamento */ }
    });
  });
}
