import { Bell, History, Home } from 'lucide-react';
import { useApp } from '../../application/context';
import { participantActor } from '../../application/commands';
import { currentAssignment } from '../../domain/queries';
import { href } from '../../lib/router';
import { usePref } from '../../lib/viewer';
import { cx, inputCls } from '../styles';
import { ConfirmationFlow } from './ConfirmationFlow';
import { ParticipantHistory } from './ParticipantHistory';
import { ParticipantHome } from './ParticipantHome';
import { ParticipantNotifications } from './ParticipantNotifications';

/** The participant's Mobile JKN-style screens. Only this participant's own records are read. */
export function ParticipantApp({ route }: { route: string[] }) {
  const { db } = useApp();
  const unreadBy = new Map<string, number>();
  for (const n of db.notifications) if (!n.readAt) unreadBy.set(n.participantId, (unreadBy.get(n.participantId) ?? 0) + 1);
  const withClaims = new Set(db.claims.map((c) => c.participantId));
  const fallback = [...unreadBy.keys()].sort().reverse()[0] ?? db.participants[0].id;
  const [participantId, setParticipantId] = usePref('participant', fallback);
  const participant = db.participants.find((p) => p.id === participantId) ?? db.participants[0];
  const actor = participantActor(db, participant.id);
  const unread = unreadBy.get(participant.id) ?? 0;
  const [page, id] = route;
  const options = [...db.participants].sort((a, b) => (unreadBy.get(b.id) ?? 0) - (unreadBy.get(a.id) ?? 0) || Number(withClaims.has(b.id)) - Number(withClaims.has(a.id)) || b.id.localeCompare(a.id));

  const tabs = [
    { path: '/peserta', label: 'Beranda', icon: Home, active: !page },
    { path: '/peserta/notifikasi', label: 'Notifikasi', icon: Bell, active: page === 'notifikasi', badge: unread },
    { path: '/peserta/riwayat', label: 'Riwayat', icon: History, active: page === 'riwayat' },
  ];

  return (
    <div className="px-4 py-6">
      <div className="mx-auto mb-3 flex max-w-sm flex-col gap-1">
        <label htmlFor="peserta" className="text-xs text-slate-500">
          Masuk sebagai peserta (simulasi login Mobile JKN)
        </label>
        <select id="peserta" className={inputCls} value={participant.id} onChange={(e) => setParticipantId(e.target.value)}>
          {options.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p.cardNumber}
              {unreadBy.get(p.id) ? ` · ${unreadBy.get(p.id)} notifikasi baru` : ''}
            </option>
          ))}
        </select>
      </div>
      <div className="mx-auto flex min-h-[640px] max-w-sm flex-col overflow-hidden rounded-[28px] border-8 border-slate-900 bg-white shadow-xl">
        <header className="flex items-center justify-between bg-emerald-700 px-4 py-3 text-white">
          <div>
            <div className="text-[11px] opacity-80">Mobile JKN (simulasi)</div>
            <div className="text-sm font-semibold">{participant.name}</div>
          </div>
          <a href={href('/peserta/notifikasi')} className="relative rounded-full p-2 hover:bg-emerald-800" aria-label={`Notifikasi, ${unread} belum dibaca`}>
            <Bell className="h-5 w-5" aria-hidden />
            {unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-amber-400 px-1 text-[11px] font-bold text-slate-900">{unread}</span>}
          </a>
        </header>
        <div className="flex-1 overflow-y-auto bg-slate-50">
          {page === 'klaim' && id ? (
            <ConfirmationFlow key={`${id}-${currentAssignment(db, id)?.id ?? ''}`} claimId={id} actor={actor} />
          ) : page === 'notifikasi' ? (
            <ParticipantNotifications participantId={participant.id} actor={actor} />
          ) : page === 'riwayat' ? (
            <ParticipantHistory participantId={participant.id} />
          ) : (
            <ParticipantHome participant={participant} />
          )}
        </div>
        <nav className="grid grid-cols-3 border-t border-slate-200 bg-white" aria-label="Menu peserta">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <a key={t.path} href={href(t.path)} aria-current={t.active ? 'page' : undefined} className={cx('relative flex flex-col items-center gap-0.5 py-2 text-[11px]', t.active ? 'text-emerald-700' : 'text-slate-500')}>
                <Icon className="h-5 w-5" aria-hidden />
                {t.label}
                {!!t.badge && <span className="absolute right-8 top-1 h-2 w-2 rounded-full bg-amber-500" aria-hidden />}
              </a>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
