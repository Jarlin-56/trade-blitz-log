import { supabase } from '@/integrations/supabase/client';

const BUCKET = 'trade-images';

/** Accepts a stored value that is either a bucket path or an old public URL. */
export function toStoragePath(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith('http')) return value.replace(/^\/+/, '');
  const marker = `/${BUCKET}/`;
  const idx = value.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(value.slice(idx + marker.length).split('?')[0]);
}

const cache = new Map<string, { url: string; exp: number }>();

export async function getSignedUrl(value: string | null | undefined, expiresIn = 3600) {
  const path = toStoragePath(value);
  if (!path) return null;
  const hit = cache.get(path);
  if (hit && hit.exp > Date.now()) return hit.url;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) return null;
  cache.set(path, { url: data.signedUrl, exp: Date.now() + (expiresIn - 60) * 1000 });
  return data.signedUrl;
}

/** Remove one or many stored images (paths or legacy URLs). Never throws. */
export async function removeStorageImages(values: (string | null | undefined)[]) {
  const paths = values.map(toStoragePath).filter((p): p is string => !!p);
  if (paths.length === 0) return;
  try {
    await supabase.storage.from(BUCKET).remove(paths);
    paths.forEach(p => cache.delete(p));
  } catch {
    /* ignore cleanup failures */
  }
}

export async function uploadImage(file: File, userId: string, folder?: string) {
  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  const path = `${userId}/${folder ? `${folder}/` : ''}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file);
  if (error) throw error;
  return path;
}
