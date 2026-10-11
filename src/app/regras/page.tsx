import { listarAjustesTrilha, listarRegras } from '@/lib/queries';
import { PageTitle } from '../components/ui';
import { ListaRegras } from '../components/ListaRegras';
import { ListaAjustesTrilha } from '../components/AjustesTrilha';

export const dynamic = 'force-dynamic';

export default async function Regras() {
  return (
    <div>
      <PageTitle title="Regras de categoria" subtitle="O que foi corrigido pelo painel. Apagar devolve os lançamentos para a categoria do banco." />
      <ListaRegras regras={await listarRegras()} />
      <h2 className="mb-2 mt-5 text-sm font-medium">Trilha</h2>
      <ListaAjustesTrilha ajustes={await listarAjustesTrilha()} />
    </div>
  );
}
