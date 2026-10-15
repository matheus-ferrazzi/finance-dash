/** Seta de comparação com a média (semanal do WhatsApp e grupos da tela Gastos): ⏫ ≥ 2x, ⏬ ≤ metade. */
export function seta(atual: number, media: number): string {
  if (media > 0 && atual >= 2 * media) return '⏫';
  if (media > 0 && atual <= media / 2) return '⏬';
  if (atual > media) return '⬆️';
  if (atual < media) return '⬇️';
  return '➖';
}
