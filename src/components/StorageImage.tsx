import { useEffect, useState } from 'react';
import { getSignedUrl } from '@/lib/storage';

interface Props extends React.ImgHTMLAttributes<HTMLImageElement> {
  /** Stored bucket path or legacy public URL */
  source: string | null | undefined;
}

/** Renders an image stored in the private trade-images bucket via a signed URL. */
export default function StorageImage({ source, alt = '', ...rest }: Props) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setUrl(null);
    getSignedUrl(source).then(u => { if (active) setUrl(u); });
    return () => { active = false; };
  }, [source]);

  if (!source) return null;
  if (!url) return <div className={rest.className} style={{ minHeight: 80, ...(rest.style ?? {}) }} aria-hidden />;
  return <img src={url} alt={alt} loading="lazy" {...rest} />;
}
