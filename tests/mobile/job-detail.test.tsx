import { beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import JobDetailScreen from '../../mobile/app/job/[id]';
const mocks = vi.hoisted(() => ({ profile: { role: 'admin' } as { role: string } | null, refresh: vi.fn() }));
vi.mock('../../mobile/lib/auth-context', () => ({ useAuth: () => ({ profile: mocks.profile, refreshProfile: mocks.refresh }) }));
vi.mock('../../mobile/components/JobPhotos', () => ({ JobPhotos: () => null }));
vi.mock('../../mobile/components/JobCampaigns', () => ({ JobCampaigns: () => null }));
vi.mock('../../mobile/components/EditJobModal', () => ({ EditJobModal: ({ job }: any) => <div>Editing {job.id}</div> }));
vi.mock('../../mobile/lib/supabase', () => ({ supabase: { from: (table: string) => ({ select: () => ({ eq: () => ({ single: async () => ({ data: table === 'jobs' ? {
  id: 'job-1', status: 'new', kind: 'service', boat_id: null, customers: { id: 'customer-1', name: 'Andrew Shuman' }, boats: null,
  service_types: [], notes: null, scheduled_date: '2026-09-20',
} : null }) }) }) }) } }));
beforeEach(() => { cleanup(); mocks.profile = { role: 'admin' }; mocks.refresh.mockReset(); });
it('opens the correct job editor from the page body even without a native header', async () => {
  render(<JobDetailScreen />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit job details' }));
  expect(screen.getByText('Editing job-1')).toBeVisible();
});
it('keeps viewers read-only', async () => {
  mocks.profile = { role: 'viewer' }; render(<JobDetailScreen />);
  await screen.findByText('Andrew Shuman');
  expect(screen.queryByRole('button', { name: 'Edit job details' })).toBeNull();
});
it('offers recovery instead of silently hiding editing when profile fetch fails', async () => {
  mocks.profile = null; render(<JobDetailScreen />);
  fireEvent.click(await screen.findByText('Account access could not load. Tap to retry editing.'));
  expect(mocks.refresh).toHaveBeenCalledOnce();
});
