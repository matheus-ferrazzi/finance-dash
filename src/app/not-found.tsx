import Link from 'next/link';

/** Link velho ou endereço digitado errado: diz o que houve e leva de volta. */
export default function NaoEncontrado() {
  return (
    <div className="card mx-auto mt-8 max-w-md p-5 text-center">
      <p className="text-lg font-semibold">Essa página não existe</p>
      <p className="mt-1 text-sm text-muted">O link pode ser de uma versão antiga do painel.</p>
      <Link href="/" className="mt-4 inline-flex min-h-[44px] items-center rounded-xl bg-accent/15 px-4 text-sm font-medium text-accent">
        Voltar para o início
      </Link>
    </div>
  );
}
