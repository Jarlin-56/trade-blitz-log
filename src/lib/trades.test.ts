import { beforeEach, describe, expect, it, vi } from 'vitest';
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
import { importTradesWithRelations, saveTradeWithRelations } from './trades';

const trade = { asset: 'XAUUSD', direction: 'Long' as const, result: 'Win' as const, earned_r: 2, entry_date: '2026-10-29T00:00:00Z' };
const input = { profileId: 'profile', trade, conditionIds: ['condition'], tagIds: ['tag'], metricValues: [{ metric_id: 'metric', value: 3 }] };
beforeEach(() => rpc.mockReset());
describe('trade service boundary', () => {
  it('sends a single create request containing all relations', async () => {
    rpc.mockResolvedValue({ data: 'id', error: null });
    expect(await saveTradeWithRelations(input)).toBe('id');
    expect(rpc).toHaveBeenCalledExactlyOnceWith('create_trade_with_relations', {
      p_profile_id: 'profile', p_trade: trade, p_condition_ids: ['condition'], p_tag_ids: ['tag'], p_metric_values: input.metricValues,
    });
  });
  it('uses the update endpoint and surfaces failure without retrying partial writes', async () => {
    const error = { message: 'Permission denied' };
    rpc.mockResolvedValue({ data: null, error });
    await expect(saveTradeWithRelations({ ...input, tradeId: 'id' })).rejects.toBe(error);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe('update_trade_with_relations');
  });
  it('imports the entire batch in one request and rejects missing identifiers', async () => {
    const rows = [{ trade, metric_values: input.metricValues }, { trade, metric_values: [] }];
    rpc.mockResolvedValue({ data: ['one', 'two'], error: null });
    expect(await importTradesWithRelations('profile', rows)).toEqual(['one', 'two']);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('import_trades_with_relations', { p_profile_id: 'profile', p_rows: rows });
    rpc.mockResolvedValue({ data: ['one'], error: null });
    await expect(importTradesWithRelations('profile', rows)).rejects.toThrow('all trade identifiers');
  });
});
