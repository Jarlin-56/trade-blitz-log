import { useParams } from 'react-router-dom';
import TradeForm from '@/components/TradeForm';

export default function TradeEdit() {
  const { id } = useParams<{ id: string }>();
  return <TradeForm tradeId={id} />;
}
