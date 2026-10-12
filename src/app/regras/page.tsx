import { listarRegras } from '@/lib/queries';
import { PageTitle } from '../components/ui';
import { ListaRegras } from '../components/ListaRegras';

export const dynamic = 'force-dynamic';

export default async function Regras() {
  return (
    <div>
      <PageTitle title="Regras de categoria" subtitle="O que foi corrigido pelo painel. Apagar devolve os lançamentos para a categoria do banco." />
      <ListaRegras regras={await listarRegras()} />
    </div>
  );
}
