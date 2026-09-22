import { render, screen } from '@testing-library/react';
import { vi, it, expect } from 'vitest';
import { CreateJobForm } from '@/app/dashboard/jobs/create-job-form';
const state = vi.hoisted(() => ({ writable: false }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/lib/role-context', () => ({ useCanWrite: () => state.writable }));
vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn() }));
vi.mock('@/components/campaigns/CampaignDrawer', () => ({ CampaignDrawer: () => null }));
it('handles permissions becoming available without changing hook order', () => {
  state.writable = false;
  const props = { customers: [], boats: [], techs: [], marinas: [] };
  const view = render(<CreateJobForm {...props} />);
  state.writable = true;
  expect(() => view.rerender(<CreateJobForm {...props} />)).not.toThrow();
  expect(screen.getByRole('button', { name: /create job/i })).toBeVisible();
});
