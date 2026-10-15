import { NextResponse, type NextRequest } from 'next/server';
import { acessoInterno } from './lib/interno';

// Auditoria 13/10 (D): /api/bot/* e /api/resumo/* são só para o worker (rede interna do Docker). Pelo endereço
// público eles ficavam atrás só do Cloudflare Access; com PAINEL_TOKEN_INTERNO definido, exigem o cabeçalho.
export function middleware(req: NextRequest) {
  if (!acessoInterno(process.env.PAINEL_TOKEN_INTERNO, req.headers.get('x-interno'))) {
    return NextResponse.json({ erro: 'rota interna' }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = { matcher: ['/api/bot/:path*', '/api/resumo/:path*'] };
