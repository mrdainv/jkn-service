// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { buildSeed } from '../data/seed/buildSeed';
import { DbStore, MemoryBackend } from '../data/store';
import { checkIntegrity } from '../domain/integrity';

// Drives the real screens of two roles against one store.

let store: DbStore;

async function go(path: string) {
  await act(async () => {
    window.location.hash = path;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

beforeEach(async () => {
  window.localStorage.clear();
  window.location.hash = '';
  store = new DbStore(new MemoryBackend(), buildSeed);
  await store.init();
});

afterEach(cleanup);

describe('screens', () => {
  it('verifier publishes, the participant is notified, verifies with FRISTA and answers', async () => {
    const db = () => store.getSnapshot()!.db;
    const claim = db().claims.find((c) => c.status === 'DIAJUKAN' && db().participants.find((p) => p.id === c.participantId)?.name === 'Rahmat Hidayat')!;
    render(<App store={store} pollMs={0} />);

    // Verifier: the claim is in the queue and can be published from its page.
    await go('/verifikator');
    expect(await screen.findByText(claim.id)).toBeTruthy();
    await go(`/verifikator/klaim/${claim.id}`);
    fireEvent.click(await screen.findByRole('button', { name: /Simpan & terbitkan ke peserta/ }));
    await screen.findByText('Pertanyaan diterbitkan');
    expect(db().claims.find((c) => c.id === claim.id)?.status).toBe('MENUNGGU_PESERTA');

    // Participant: signed in as Rahmat, sees the notification and answers.
    window.localStorage.setItem('jkn-service/pref/participant', claim.participantId);
    await go('/peserta/notifikasi');
    fireEvent.click(await screen.findByText('Konfirmasi layanan kesehatan Anda'));
    await waitFor(() => expect(window.location.hash).toBe(`#/peserta/klaim/${claim.id}`));
    fireEvent.click(await screen.findByRole('button', { name: 'Mulai' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Wajah cocok' }));

    // One question per screen: each answer is sent on its own and the next question follows.
    const answered = () => screen.queryByText('Jawaban Anda sudah terkirim');
    let shown = 0;
    for (let i = 1; i <= 8 && !answered(); i += 1) {
      await waitFor(() => expect(screen.queryByText(new RegExp(`^Pertanyaan ke-${i} `)) ?? answered()).toBeTruthy());
      if (answered()) break;
      shown = i;
      expect(screen.getAllByRole('group')).toHaveLength(1);
      fireEvent.click(screen.getAllByRole('radio').find((r) => (r as HTMLInputElement).value === 'TIDAK_INGAT')!);
      fireEvent.click(screen.getByRole('button', { name: 'Kirim jawaban ini' }));
    }
    await screen.findByText('Jawaban Anda sudah terkirim');

    const session = db().sessions.find((s) => s.claimId === claim.id)!;
    expect(session).toMatchObject({ status: 'SELESAI' });
    expect(db().answers.filter((a) => a.sessionId === session.id)).toHaveLength(shown);
    expect(db().claims.find((c) => c.id === claim.id)?.status).toBe('JAWABAN_DITERIMA');
    expect(checkIntegrity(db())).toEqual([]);

    // Back at the verifier: "Tidak ingat" everywhere reads as insufficient evidence, not a rebuttal.
    await go(`/verifikator/klaim/${claim.id}`);
    expect((await screen.findAllByText('Bukti tidak cukup'))[0]).toBeTruthy();
    expect(screen.getAllByText(/Indikasi/).length).toBeGreaterThan(0);

    // The verifier decides; the decision and its basis are stored, and the facility sees the outcome.
    fireEvent.click(screen.getByRole('tab', { name: 'Keputusan' }));
    fireEvent.click(await screen.findByLabelText(/Tidak dapat disimpulkan/));
    fireEvent.change(screen.getByLabelText('Alasan (wajib)'), { target: { value: 'Peserta tidak ingat semua butir yang ditanyakan.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan keputusan' }));
    await screen.findByText('Dasar evaluasi saat diputuskan');
    expect(db().claims.find((c) => c.id === claim.id)?.decision).toMatchObject({ outcome: 'TIDAK_DAPAT_DISIMPULKAN', basis: { sessionId: session.id, evidenceStatus: 'BUKTI_TIDAK_CUKUP', answered: shown } });

    window.localStorage.setItem('jkn-service/pref/facility', claim.facilityId);
    cleanup();
    render(<App store={store} pollMs={0} />);
    await go(`/faskes/klaim/${claim.id}`);
    expect(await screen.findByText('Hasil verifikasi: Tidak dapat disimpulkan')).toBeTruthy();
    expect(screen.queryByText('Peserta tidak ingat semua butir yang ditanyakan.')).toBeNull();
  });

  it('validates the facility claim form before anything is saved', async () => {
    render(<App store={store} pollMs={0} />);
    await go('/faskes/baru');
    const revision = store.getSnapshot()!.revision;
    const form = (await screen.findAllByRole('button', { name: /Ajukan klaim/ })).find((b) => b.getAttribute('type') === 'submit')!;
    fireEvent.click(form);
    expect(await screen.findByText('Pilih peserta JKN yang terdaftar.')).toBeTruthy();
    expect(store.getSnapshot()!.revision).toBe(revision);
    const nav = screen.getByRole('navigation', { name: 'Peran' });
    expect(within(nav).getAllByText(/Faskes/).length).toBeGreaterThan(0);
  });
});
