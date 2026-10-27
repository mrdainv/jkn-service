import { useSyncExternalStore } from 'react';

// Hash routing (`#/verifikator/klaim/KLM-000101`): works on static hosting and survives a reload.

function current(): string {
  const hash = typeof window === 'undefined' ? '' : window.location.hash;
  const path = hash.replace(/^#/, '') || '/';
  return path.startsWith('/') ? path : `/${path}`;
}

function subscribe(listener: () => void): () => void {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
}

export function useRoute(): string[] {
  const path = useSyncExternalStore(subscribe, current, () => '/');
  return path.split('?')[0].split('/').filter(Boolean).map(decodeURIComponent);
}

export function navigate(path: string): void {
  window.location.hash = path;
}

export function href(path: string): string {
  return `#${path}`;
}
