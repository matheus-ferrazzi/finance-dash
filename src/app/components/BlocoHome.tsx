import Link from 'next/link';

/**
 * Um quadrado da grade da home: título, número, linha de apoio. Com `href`, o quadrado inteiro é o
 * link; sem `href`, os links ficam nos filhos (ex.: um por grupo — link dentro de link não vale no HTML).
 */
export function BlocoHome({ titulo, valor, valorEhDinheiro = true, detalhe, tom = 'neutro', href, children }: {
  titulo: string; valor: string;
  /** só dinheiro leva a classe "money" (o olho de esconder valores borra o que tem ela) */
  valorEhDinheiro?: boolean;
  detalhe?: React.ReactNode; tom?: 'neutro' | 'bom' | 'atencao' | 'ruim'; href?: string; children?: React.ReactNode;
}) {
  const cor = { neutro: 'text-muted', bom: 'text-accent', atencao: 'text-warn', ruim: 'text-despesa' }[tom];
  const classe = 'card flex min-h-[96px] flex-col justify-between p-3.5';
  const corpo = (
    <>
      <div className="text-[11px] text-muted">{titulo}</div>
      <div className={`mt-1.5 text-lg font-semibold tnum${valorEhDinheiro ? ' money' : ''}`}>{valor}</div>
      {children}
      {detalhe && <div className={`mt-1 text-[11px] ${cor}`}>{detalhe}</div>}
    </>
  );
  return href
    ? <Link href={href} className={`${classe} transition-colors hover:bg-surface-2/40`}>{corpo}</Link>
    : <div className={classe}>{corpo}</div>;
}
