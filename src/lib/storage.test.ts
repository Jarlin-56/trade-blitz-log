import { beforeEach, describe, expect, it, vi } from 'vitest';
const { query, remove } = vi.hoisted(() => ({ query: vi.fn(), remove: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  from: () => ({ select: () => ({ in: query }) }),
  storage: { from: () => ({ remove, getPublicUrl: (path: string) => ({ data: { publicUrl: `https://example.supabase.co/storage/v1/object/public/trade-images/${path}` } }) }) },
} }));
import { removeStorageImages, toStoragePath } from './storage';
beforeEach(() => { query.mockReset(); remove.mockReset(); });
describe('storage cleanup after database commit', () => {
  it('accepts legacy URLs and handles malformed encoded paths', () => {
    expect(toStoragePath('https://example.supabase.co/storage/v1/object/public/trade-images/user/a%20b.png')).toBe('user/a b.png');
    expect(toStoragePath('https://example.supabase.co/storage/v1/object/public/trade-images/%ZZ')).toBeNull();
  });
  it('retains an image still referenced by a converted note', async () => {
    query.mockResolvedValueOnce({ data: [], error: null }).mockResolvedValueOnce({ data: [{ image_url: 'user/image.png' }], error: null });
    await removeStorageImages(['user/image.png']);
    expect(remove).not.toHaveBeenCalled();
  });
  it('only removes an unreferenced object, and logs cleanup failures', async () => {
    query.mockResolvedValue({ data: [], error: null });
    remove.mockResolvedValue({ error: { message: 'Storage unavailable' } });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(removeStorageImages(['user/image.png'])).resolves.toBeUndefined();
      expect(remove).toHaveBeenCalledExactlyOnceWith(['user/image.png']);
      expect(log).toHaveBeenCalled();
    } finally { log.mockRestore(); }
  });
});
