import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { jobDraft, jobEditPatch, type EditableJob } from '../../mobile/lib/jobs/edit';
import { EditJobModal } from '../../mobile/components/EditJobModal';

const mocks = vi.hoisted(() => ({ role: 'admin', update: vi.fn(), single: vi.fn(), onSaved: vi.fn(), onClose: vi.fn() }));
vi.mock('../../mobile/lib/auth-context', () => ({ useAuth: () => ({ profile: { role: mocks.role } }) }));
vi.mock('../../mobile/lib/supabase', () => ({ supabase: { from: (table: string) => {
  expect(table).toBe('jobs');
  return { update: mocks.update };
} } }));
vi.mock('../../mobile/lib/calendar/queries', () => ({
  getCustomersForLocation: async () => [{ id: 'customer-1', name: 'Andrew Shuman' }, { id: 'customer-2', name: 'Other customer' }],
  getBoatsForCustomer: async () => [{ id: 'boat-1', name: 'Axopar 28' }],
}));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: any) => <div>{children}</div> }));
vi.mock('@react-native-community/datetimepicker', () => ({ default: () => null }));
const job: EditableJob = {
  id: 'job-1', kind: 'service', customer_id: 'customer-1', boat_id: 'boat-1',
  notes: 'Inspect engine', service_types: ['Service', 'Inspection'], location_override: 'Seattle',
  scheduled_start: '2026-09-20T16:00:00.000Z', scheduled_end: '2026-09-23T00:00:00.000Z', scheduled_end_date: '2026-09-22',
};
beforeEach(() => {
  cleanup(); vi.restoreAllMocks(); mocks.role = 'admin'; mocks.onSaved.mockReset(); mocks.onClose.mockReset();
  mocks.single.mockReset().mockResolvedValue({ data: { id: job.id }, error: null });
  mocks.update.mockReset().mockReturnValue({ eq: () => ({ select: () => ({ single: mocks.single }) }) });
});
function mount() {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidation = vi.spyOn(cache, 'invalidateQueries');
  render(<QueryClientProvider client={cache}><EditJobModal job={job} onClose={mocks.onClose} onSaved={mocks.onSaved} /></QueryClientProvider>);
  return invalidation;
}
describe('job metadata edit', () => {
  it('preserves status, multi-day schedule, assignment, descriptions and reports for a notes-only edit', () => {
    expect(jobEditPatch(job, { ...jobDraft(job), notes: 'Updated instructions' })).toEqual({ notes: 'Updated instructions' });
  });
  it('makes no write when nothing changed', () => expect(jobEditPatch(job, jobDraft(job))).toEqual({}));
  it('keeps unscheduled jobs unscheduled when editing services', () => {
    const unscheduled = { ...job, scheduled_start: null, scheduled_end: null, scheduled_end_date: null };
    expect(jobEditPatch(unscheduled, { ...jobDraft(unscheduled), services: 'Oil\nInspection' })).toEqual({ service_types: ['Oil', 'Inspection'] });
  });
  it('rejects an end before the start', () => {
    expect(() => jobEditPatch(job, { ...jobDraft(job), end: '2026-09-19T16:00:00Z' })).toThrow('end time after');
  });
  it('updates calendar dates when moving a schedule', () => {
    const patch = jobEditPatch(job, { ...jobDraft(job), start: '2026-09-24T09:00:00', end: '2026-09-24T10:00:00' });
    expect(patch.scheduled_date).toBe('2026-09-24'); expect(patch.scheduled_end_date).toBeNull();
  });
  it('loads current values, saves only the edited notes, and refreshes both calendars', async () => {
    const invalidation = mount();
    expect(await screen.findByText('Andrew Shuman ›')).toBeVisible();
    expect(screen.getByLabelText('Job notes')).toHaveValue('Inspect engine');
    fireEvent.change(screen.getByLabelText('Job notes'), { target: { value: 'Check cooling system' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(mocks.onSaved).toHaveBeenCalledOnce());
    expect(mocks.update).toHaveBeenCalledWith({ notes: 'Check cooling system' });
    expect(invalidation).toHaveBeenCalledWith({ queryKey: ['calendar-mobile'] });
    expect(invalidation).toHaveBeenCalledWith({ queryKey: ['calendar-mobile-unscheduled'] });
  });
  it('cancel makes no write', () => {
    mount(); fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mocks.onClose).toHaveBeenCalledOnce(); expect(mocks.update).not.toHaveBeenCalled();
  });
  it('keeps the editor open and reports a denied update', async () => {
    mocks.single.mockResolvedValue({ data: null, error: { message: 'Permission denied' } });
    const alert = vi.spyOn(Alert, 'alert'); mount();
    fireEvent.change(screen.getByLabelText('Job notes'), { target: { value: 'Changed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Could not save job', 'Permission denied'));
    expect(mocks.onSaved).not.toHaveBeenCalled();
  });
  it('does not expose the editor to viewers', () => {
    mocks.role = 'viewer'; mount(); expect(screen.queryByText('Edit job')).toBeNull();
  });
  it('changing customer clears the old boat', async () => {
    mount(); fireEvent.click(await screen.findByText('Andrew Shuman ›'));
    fireEvent.click(await screen.findByText('Other customer'));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ customer_id: 'customer-2', boat_id: null }));
  });
});
