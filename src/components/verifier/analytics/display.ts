import type { Strength } from '../../../domain/types';
import { formatNumber } from '../../../lib/format';

export const pct = (x: number | null, digits = 0) => (x === null ? '–' : `${formatNumber(x * 100, digits)}%`);

/** Answer-strength colours: a diverging scale (supports ↔ contradicts) with a neutral midpoint. */
export const STRENGTH_FILL: Record<Strength, string> = {
  KUAT: 'var(--seq-450)',
  SEBAGIAN: 'var(--seq-250)',
  NETRAL: 'var(--neutral-mid)',
  BERTENTANGAN: '#e34948',
};
