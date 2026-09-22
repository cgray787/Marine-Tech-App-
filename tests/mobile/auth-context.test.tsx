import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../../mobile/lib/auth-context';
const mocks = vi.hoisted(() => ({ getSession: vi.fn(), single: vi.fn(), onChange: null as null | ((event: string, session: unknown) => void) }));
vi.mock('../../mobile/lib/supabase', () => ({ supabase: {
  auth: { getSession: mocks.getSession, onAuthStateChange: (cb: typeof mocks.onChange) => { mocks.onChange = cb; return { data: { subscription: { unsubscribe: vi.fn() } } }; }, signOut: async () => ({ error: null }) },
  from: () => ({ select: () => ({ eq: () => ({ single: mocks.single }) }) }),
} }));
function Probe() { const a = useAuth(); return <><span data-testid="state">{a.loading ? 'loading' : 'ready'}:{a.profile?.full_name ?? 'none'}:{a.user?.id ?? 'none'}</span><button onClick={() => a.signOut()}>Logout</button></>; }
beforeEach(() => { cleanup(); mocks.getSession.mockReset(); mocks.single.mockReset(); });
it('releases the splash/loading state if persisted session recovery rejects', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.getSession.mockRejectedValue(new Error('Storage unavailable'));
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('ready:none:none'));
});
it('does not restore a stale admin profile after sign-out', async () => {
  let resolve!: (value: unknown) => void;
  mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'admin' } } } });
  mocks.single.mockReturnValue(new Promise(r => { resolve = r; }));
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(mocks.single).toHaveBeenCalled());
  fireEvent.click(screen.getByText('Logout'));
  await act(async () => { resolve({ data: { full_name: 'Stale admin', role: 'admin' }, error: null }); });
  expect(screen.getByTestId('state')).toHaveTextContent('ready:none:none');
});
