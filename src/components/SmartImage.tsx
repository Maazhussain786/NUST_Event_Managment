'use client';

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

type ImgLikeProps = Omit<
  React.ImgHTMLAttributes<HTMLImageElement>,
  'src' | 'alt'
>;

export interface SmartImageProps extends ImgLikeProps {
  src?: string | null;
  alt?: string;
  fallbackSrc?: string;
  fallbackAlt?: string;
}

const DEFAULT_FALLBACK_SRC = '/images/placeholders/media.svg';

function normalizeSource(raw: string): string {
  return raw.trim().replace(/\\/g, '/');
}

function stripQueryAndHash(raw: string): string {
  return raw.split('?')[0].split('#')[0];
}

function buildCandidates(src?: string | null): string[] {
  if (!src || typeof src !== 'string') return [];

  const normalized = normalizeSource(src);
  if (!normalized) return [];

  const candidates = [normalized];
  const withoutQuery = stripQueryAndHash(normalized);

  if (withoutQuery && withoutQuery !== normalized) {
    candidates.push(withoutQuery);
  }

  if (typeof window !== 'undefined' && normalized.includes('://')) {
    try {
      const parsed = new URL(normalized);
      const currentOrigin = window.location.origin;
      if (parsed.origin !== currentOrigin && parsed.hostname === 'localhost') {
        candidates.push(`${currentOrigin}${parsed.pathname}${parsed.search}${parsed.hash}`);
      }
    } catch {
      // Leave malformed input to fallback handling.
    }
  }

  return Array.from(new Set(candidates.filter(Boolean)));
}

export function SmartImage({
  src,
  alt = '',
  fallbackSrc = DEFAULT_FALLBACK_SRC,
  fallbackAlt,
  className,
  loading,
  onError,
  ...rest
}: SmartImageProps) {
  const candidates = useMemo(() => buildCandidates(src), [src]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [src, fallbackSrc]);

  const usingFallback = index >= candidates.length;
  const activeSrc = usingFallback ? fallbackSrc : candidates[index];

  return (
    <img
      {...rest}
      src={activeSrc}
      alt={usingFallback ? (fallbackAlt ?? alt) : alt}
      loading={loading || 'lazy'}
      decoding="async"
      className={cn(className)}
      onError={(event) => {
        if (!usingFallback) {
          setIndex((prev) => prev + 1);
        }
        onError?.(event);
      }}
    />
  );
}


