import { Bell } from 'lucide-react';
import { useAction, useApp } from '../../application/context';
import type { ActorRef } from '../../domain/types';
import { formatDateTime } from '../../lib/format';
import { navigate } from '../../lib/router';
import { cx } from '../styles';

export function ParticipantNotifications({ participantId, actor }: { participantId: string; actor: ActorRef }) {
  const { db, actions } = useApp();
  const [markRead] = useAction(actions.markNotificationRead);
  const items = db.notifications.filter((n) => n.participantId === participantId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (items.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-slate-500">
        <Bell className="mx-auto h-8 w-8 text-slate-300" aria-hidden />
        <p className="mt-2">Belum ada notifikasi.</p>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-slate-200">
      {items.map((n) => (
        <li key={n.id}>
          <button
            type="button"
            className={cx('w-full px-4 py-3 text-left', n.readAt ? 'bg-white' : 'bg-emerald-50')}
            onClick={async () => {
              if (!n.readAt) await markRead(n.id, actor);
              navigate(`/peserta/klaim/${n.claimId}`);
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <span className={cx('text-sm', n.readAt ? 'text-slate-800' : 'font-semibold text-slate-900')}>{n.title}</span>
              {!n.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-600" aria-label="Belum dibaca" />}
            </div>
            <p className="mt-0.5 text-xs text-slate-600">{n.body}</p>
            <p className="mt-1 text-[11px] text-slate-400">{formatDateTime(n.createdAt)}</p>
          </button>
        </li>
      ))}
    </ul>
  );
}
