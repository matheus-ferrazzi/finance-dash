// Sem import de servidor: usado também pelo componente do navegador (VersaoAviso).
export function versaoMudou(carregada: string, servidor: string | null): boolean {
  return !!servidor && carregada !== 'desconhecida' && servidor !== 'desconhecida' && carregada !== servidor;
}
