import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type TradeInsert = Database['public']['Tables']['trades']['Insert'];

export type TradeWrite = Pick<TradeInsert,
  'asset' | 'direction' | 'entry_date' | 'result' | 'earned_r' | 'missed_r' | 'duration_minutes' | 'recap_text' | 'image_url'
> & { quick_note_id?: string };

export type MetricValueInput = { metric_id: string; value: number };

export async function importTradesWithRelations(profileId: string, rows: { trade: TradeWrite; metric_values: MetricValueInput[] }[]) {
  if (rows.length < 1 || rows.length > 1000) throw new Error('นำเข้าได้ครั้งละ 1 ถึง 1000 รายการ');
  const { data, error } = await supabase.rpc('import_trades_with_relations', { p_profile_id: profileId, p_rows: rows });
  if (error) throw error;
  if (!data || data.length !== rows.length) throw new Error('Import did not return all trade identifiers');
  return data;
}

export async function saveTradeWithRelations({
  tradeId,
  profileId,
  trade,
  conditionIds,
  tagIds,
  metricValues,
}: {
  tradeId?: string;
  profileId: string;
  trade: TradeWrite;
  conditionIds: string[];
  tagIds: string[];
  metricValues: MetricValueInput[];
}) {
  const rpc = tradeId ? 'update_trade_with_relations' : 'create_trade_with_relations';
  const args = tradeId
    ? { p_trade_id: tradeId, p_profile_id: profileId, p_trade: trade, p_condition_ids: conditionIds, p_tag_ids: tagIds, p_metric_values: metricValues }
    : { p_profile_id: profileId, p_trade: trade, p_condition_ids: conditionIds, p_tag_ids: tagIds, p_metric_values: metricValues };
  const { data, error } = await supabase.rpc(rpc, args);
  if (error) throw error;
  if (!data) throw new Error('Trade save did not return an identifier');
  return data;
}
