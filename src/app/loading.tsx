/** Enquanto a tela consulta o banco: o esqueleto do card-resposta e de dois blocos (antes a tela ficava parada). */
export default function Carregando() {
  const bloco = 'rounded-lg bg-surface-3/70';
  return (
    <div aria-busy="true" aria-live="polite" className="animate-pulse">
      <span className="sr-only">Carregando…</span>
      <div className="card mb-3 p-3.5">
        <div className={`${bloco} h-3 w-40`} />
        <div className={`${bloco} mt-3 h-7 w-48`} />
        <div className={`${bloco} mt-3 h-2 w-full`} />
        <div className={`${bloco} mt-2 h-3 w-56`} />
      </div>
      <div className="card mb-3 space-y-3 p-3.5">
        {[0, 1, 2, 3].map((i) => <div key={i} className={`${bloco} h-9`} />)}
      </div>
      <div className={`${bloco} h-11`} />
    </div>
  );
}
