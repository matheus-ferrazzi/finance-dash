/** Onda 5: o topo de cada tela — a pergunta pequena, o número grande colorido, uma linha de apoio. */
export function CardResposta({ pergunta, valor, dinheiro = true, tom = 'neutro', complemento, apoio, children }: {
  pergunta: string; valor: string;
  /** só dinheiro leva a classe "money" (o olho de esconder valores borra o que tem ela) */
  dinheiro?: boolean;
  tom?: 'bom' | 'atencao' | 'ruim' | 'neutro';
  complemento?: React.ReactNode; apoio?: React.ReactNode; children?: React.ReactNode;
}) {
  const cor = { neutro: 'text-text', bom: 'text-accent', atencao: 'text-warn', ruim: 'text-despesa' }[tom];
  return (
    <div className="card mb-3 p-3.5">
      <div className="text-xs text-muted">{pergunta}</div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <span className={`text-2xl font-semibold tnum ${dinheiro ? 'money ' : ''}${cor}`}>{valor}</span>
        {complemento && <span className="text-sm text-muted">{complemento}</span>}
      </div>
      {children}
      {apoio && <div className="mt-1.5 text-xs leading-relaxed text-muted">{apoio}</div>}
    </div>
  );
}
