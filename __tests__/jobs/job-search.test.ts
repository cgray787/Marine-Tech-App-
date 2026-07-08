import { describe, it, expect } from 'vitest';
import { jobMatchesQuery, type SearchableJob } from '@/app/dashboard/jobs/job-search';

const job: SearchableJob = {
  status: 'in_progress',
  service_types: ['Engine Service', 'Bottom Paint'],
  boats: { name: 'Sea Ray 32', make_model: 'Sea Ray Sundancer' },
  profiles: { full_name: 'Darik Swenson' },
  customers: { name: 'Itai Vishnia' },
};

describe('jobMatchesQuery', () => {
  it('matches everything for an empty / whitespace query', () => {
    expect(jobMatchesQuery(job, '')).toBe(true);
    expect(jobMatchesQuery(job, '   ')).toBe(true);
  });

  it('matches on client name (case-insensitive, partial)', () => {
    expect(jobMatchesQuery(job, 'vishnia')).toBe(true);
    expect(jobMatchesQuery(job, 'ITAI')).toBe(true);
  });

  it('matches on boat name and make/model', () => {
    expect(jobMatchesQuery(job, 'sea ray')).toBe(true);
    expect(jobMatchesQuery(job, 'sundancer')).toBe(true);
  });

  it('matches on assigned tech, status, and service type', () => {
    expect(jobMatchesQuery(job, 'darik')).toBe(true);
    expect(jobMatchesQuery(job, 'in_progress')).toBe(true);
    expect(jobMatchesQuery(job, 'bottom paint')).toBe(true);
  });

  it('returns false when nothing matches', () => {
    expect(jobMatchesQuery(job, 'zzz-no-match')).toBe(false);
  });

  it('does not throw on null / missing relations', () => {
    const sparse: SearchableJob = { status: 'new', customers: null, boats: null, profiles: null };
    expect(jobMatchesQuery(sparse, 'new')).toBe(true);
    expect(jobMatchesQuery(sparse, 'anything else')).toBe(false);
    expect(() => jobMatchesQuery({}, 'x')).not.toThrow();
  });
});
