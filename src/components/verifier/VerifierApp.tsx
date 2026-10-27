import { BarChart3, BookOpen, History, Inbox, Settings2, Sparkles } from 'lucide-react';
import { lazy, Suspense, type ComponentType } from 'react';
import { useDb } from '../../application/context';
import { href } from '../../lib/router';
import { cx } from '../styles';
import { AiConfigView } from './AiConfigView';
import { AuditLogView } from './AuditLogView';
import { ClaimQueue } from './ClaimQueue';
import { ClaimWorkspace } from './ClaimWorkspace';
import { DictionaryView } from './DictionaryView';
import { DraftsView } from './DraftsView';

// The analytics page and its chart library load only when opened.
const AnalyticsView = lazy(() => import('./analytics/AnalyticsView').then((m) => ({ default: m.AnalyticsView })));

interface NavItem {
  page: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  badge?: number;
}

export function VerifierApp({ route }: { route: string[] }) {
  const db = useDb();
  const [page = 'klaim', id] = route;
  const toPrepare = db.claims.filter((c) => c.status === 'DIAJUKAN').length;
  const toReview = db.claims.filter((c) => ['JAWABAN_DITERIMA', 'PERLU_KONTAK', 'DITOLAK_PESERTA', 'TIDAK_DIJAWAB'].includes(c.status)).length;
  const openDrafts = db.drafts.filter((d) => d.status === 'DRAF').length;
  const groups: { title: string; items: NavItem[] }[] = [
    { title: 'Operasional', items: [{ page: 'klaim', label: 'Klaim masuk', icon: Inbox, badge: toPrepare + toReview || undefined }] },
    {
      title: 'Pertanyaan',
      items: [
        { page: 'kamus', label: 'Kamus pengalaman', icon: BookOpen },
        { page: 'draf', label: 'Draf AI', icon: Sparkles, badge: openDrafts || undefined },
      ],
    },
    {
      title: 'AI & mutu',
      items: [
        { page: 'analitik', label: 'Analitik AI', icon: BarChart3 },
        { page: 'konfigurasi', label: 'Konfigurasi AI', icon: Settings2 },
        { page: 'audit', label: 'Log audit', icon: History },
      ],
    },
  ];
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-4 py-4 lg:flex-row">
      <aside className="shrink-0 lg:w-52">
        <nav aria-label="Menu verifikator" className="flex gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-white p-2 lg:sticky lg:top-16 lg:block lg:space-y-4">
          {groups.map((g) => (
            <div key={g.title} className="contents lg:block">
              <div className="hidden px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 lg:block">{g.title}</div>
              {g.items.map((item) => {
                const Icon = item.icon;
                const active = page === item.page;
                return (
                  <a
                    key={item.page}
                    href={href(`/verifikator/${item.page}`)}
                    aria-current={active ? 'page' : undefined}
                    className={cx(
                      'flex shrink-0 items-center justify-between gap-2 rounded-md px-2.5 py-2 text-sm lg:w-full',
                      active ? 'bg-emerald-50 font-medium text-emerald-900' : 'text-slate-600 hover:bg-slate-50',
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <Icon className={cx('h-4 w-4', active ? 'text-emerald-700' : 'text-slate-400')} aria-hidden />
                      {item.label}
                    </span>
                    {item.badge !== undefined && <span className="tabular rounded-full bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-900">{item.badge}</span>}
                  </a>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>
      <main className="min-w-0 flex-1">
        {page === 'klaim' && id ? (
          <ClaimWorkspace claimId={id} />
        ) : page === 'kamus' ? (
          <DictionaryView entryId={id} />
        ) : page === 'draf' ? (
          <DraftsView draftId={id} />
        ) : page === 'analitik' ? (
          <Suspense fallback={<p className="p-4 text-sm text-slate-500">Memuat analitik…</p>}>
            <AnalyticsView />
          </Suspense>
        ) : page === 'konfigurasi' ? (
          <AiConfigView />
        ) : page === 'audit' ? (
          <AuditLogView />
        ) : (
          <ClaimQueue />
        )}
      </main>
    </div>
  );
}
