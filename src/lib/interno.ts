// Acesso às rotas que só o worker usa (auditoria 13/10). Sem token configurado, passa (a troca é em duas
// etapas: o script grava o token nos dois containers e eles sobem de novo); com token, o cabeçalho tem que bater.
export function acessoInterno(tokenConfigurado: string | undefined, cabecalho: string | null): boolean {
  if (!tokenConfigurado) return true;
  if (!cabecalho || cabecalho.length !== tokenConfigurado.length) return false;
  // comparação em tempo constante (não vaza o token por tempo de resposta)
  let dif = 0;
  for (let i = 0; i < cabecalho.length; i++) dif |= cabecalho.charCodeAt(i) ^ tokenConfigurado.charCodeAt(i);
  return dif === 0;
}
