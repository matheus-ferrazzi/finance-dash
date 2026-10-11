import { Fragment } from 'react';
import { brl } from '@/lib/format';
import { partesDoTexto } from '@/lib/trilha';

/** Frase com valores marcados ({{n}}): o texto sai normal e cada valor com "money" (o olho esconde). */
export function TextoComValores({ texto }: { texto: string }) {
  return (
    <>
      {partesDoTexto(texto).map((p, i) => (typeof p === 'number'
        ? <span key={i} className="tnum money">{brl(p)}</span>
        : <Fragment key={i}>{p}</Fragment>))}
    </>
  );
}
