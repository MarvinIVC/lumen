'use client';

import { useEffect, useRef, useState } from 'react';

import { listAssets } from '@/lib/store/drafts';
import { useDraftStore } from '@/lib/store/draft-store';

/**
 * Object URLs for the page thumbnails and embedded images of a draft.
 *
 * Two sources, one map: assets parsed in this session are already in memory, and assets from a
 * draft that was reloaded come back out of IndexedDB. Both end up as `blob:` URLs, and every one
 * of them is revoked on unmount — an object URL pins its blob in memory for the lifetime of the
 * document, and a review screen for a 40-page scan holds a lot of pixels.
 */
export function useAssetUrls(draftId: string | null): (assetId: string) => string | undefined {
  const sessionAssets = useDraftStore((state) => state.assets);
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const created = useRef<string[]>([]);

  useEffect(() => {
    if (!draftId) return;
    let cancelled = false;

    void (async () => {
      const stored = await listAssets(draftId);
      if (cancelled) return;
      const next = new Map<string, string>();
      for (const asset of stored) {
        const url = URL.createObjectURL(new Blob([asset.bytes], { type: asset.mime }));
        created.current.push(url);
        next.set(asset.id, url);
      }
      for (const [id, asset] of sessionAssets) {
        if (next.has(id)) continue;
        const url = URL.createObjectURL(asset.blob);
        created.current.push(url);
        next.set(id, url);
      }
      setUrls(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [draftId, sessionAssets]);

  useEffect(() => {
    const urlsToRevoke = created;
    return () => {
      for (const url of urlsToRevoke.current) URL.revokeObjectURL(url);
      urlsToRevoke.current = [];
    };
  }, []);

  return (assetId: string) => urls.get(assetId);
}
