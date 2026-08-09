import TradeForm from '@/components/TradeForm';

export default function TradeNew({ asWidget, initialFile }: { asWidget?: boolean; initialFile?: File | null }) {
  return <TradeForm asWidget={asWidget} initialFile={initialFile} />;
}
