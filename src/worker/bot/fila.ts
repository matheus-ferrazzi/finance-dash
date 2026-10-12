// E1: uma pergunta por vez, na ordem de chegada. Mais de `max` esperando → avisa e descarta.
export class FilaBot<T> {
  private espera: T[] = [];
  private rodando = false;
  constructor(private readonly processar: (x: T) => Promise<void>, private readonly max: number, private readonly cheia: (x: T) => void) {}

  tamanho(): number { return this.espera.length + (this.rodando ? 1 : 0); }

  colocar(x: T): void {
    if (this.espera.length >= this.max) { this.cheia(x); return; }
    this.espera.push(x);
    void this.drenar();
  }

  private async drenar(): Promise<void> {
    if (this.rodando) return;
    this.rodando = true;
    while (this.espera.length) {
      const x = this.espera.shift()!;
      try { await this.processar(x); } catch { /* o processar registra o próprio erro */ }
    }
    this.rodando = false;
  }
}
