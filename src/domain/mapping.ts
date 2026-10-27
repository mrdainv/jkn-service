import type { Claim, ClaimProcedure, DictionaryEntry, EpisodeTopic, MappingStatus, MatchType } from './types';

/**
 * Experience mapping: matches the claim's attributes against the dictionary. Deterministic and
 * explainable; relevance says how closely the entry fits the claim line, not whether the claim is valid.
 */

export interface MatchResult {
  entryId: string | null;
  matchType: MatchType;
  relevance: number;
}

const STOPWORDS = new Set(['dan', 'atau', 'di', 'ke', 'dari', 'yang', 'dengan', '&', 'untuk', 'pada', 'sesi', 'reguler']);

export function nameTokens(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .replace(/\(.*?\)/g, ' ')
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2 && !STOPWORDS.has(t)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/** Relevance of one dictionary entry to one procedure line, with the reason it matched. */
export function scoreEntry(line: Pick<ClaimProcedure, 'code' | 'name'>, entry: DictionaryEntry): MatchResult {
  if (entry.scope !== 'PROSEDUR' || entry.status !== 'AKTIF' || !entry.code) {
    return { entryId: null, matchType: 'TIDAK_ADA', relevance: 0 };
  }
  if (entry.code === line.code) return { entryId: entry.id, matchType: 'KODE_TEPAT', relevance: 1 };
  // ICD-9-CM: "87.44" and "87.41" share the subcategory "87.4"; "87.03" only the category "87".
  const [lineCat, lineSub = ''] = line.code.split('.');
  const [entryCat, entrySub = ''] = entry.code.split('.');
  const lexical = jaccard(nameTokens(line.name), nameTokens(entry.name));
  let best: MatchResult = { entryId: null, matchType: 'TIDAK_ADA', relevance: 0 };
  if (lineCat === entryCat && lineSub[0] !== undefined && lineSub[0] === entrySub[0]) {
    best = { entryId: entry.id, matchType: 'KODE_INDUK', relevance: 0.7 };
  } else if (lineCat === entryCat) {
    best = { entryId: entry.id, matchType: 'KODE_INDUK', relevance: 0.45 };
  }
  const byName = lexical > 0 ? Math.min(0.8, 0.3 + 0.6 * lexical) : 0;
  if (byName > best.relevance) best = { entryId: entry.id, matchType: 'KATA_KUNCI', relevance: round2(byName) };
  return best;
}

export function bestMatch(line: Pick<ClaimProcedure, 'code' | 'name'>, entries: readonly DictionaryEntry[]): MatchResult {
  let best: MatchResult = { entryId: null, matchType: 'TIDAK_ADA', relevance: 0 };
  for (const entry of entries) {
    const m = scoreEntry(line, entry);
    if (m.relevance > best.relevance) best = m;
  }
  return best;
}

export function mappingStatus(match: MatchResult, threshold: number): MappingStatus {
  if (match.entryId === null) return 'TIDAK_TERPETAKAN';
  return match.relevance >= threshold ? 'TERPETAKAN' : 'DI_BAWAH_AMBANG';
}

export function episodeEntry(entries: readonly DictionaryEntry[], topic: EpisodeTopic): DictionaryEntry | undefined {
  return entries.find((e) => e.scope === 'EPISODE' && e.topic === topic && e.status === 'AKTIF');
}

/** Episode questions apply to every inpatient claim (stay first, then nights). */
export function episodeTopicsFor(claim: Pick<Claim, 'careType'>): EpisodeTopic[] {
  return claim.careType === 'RAWAT_INAP' ? ['KEBERADAAN', 'LAMA_RAWAT'] : [];
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
