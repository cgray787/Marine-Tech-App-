'use client';
import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { PendingJobsPanel } from './pending-jobs-panel';
import { JobsByCustomer } from './jobs-by-customer';
import { jobMatchesQuery } from './job-search';

type Customer = { id: string; name: string };

type Props = {
  customers: Customer[];
  jobs: Parameters<typeof JobsByCustomer>[0]['jobs'];
  pendingJobs: Parameters<typeof PendingJobsPanel>[0]['jobs'];
};

/**
 * Client wrapper that puts one search bar at the top of the Jobs page and
 * filters BOTH the pending panel and the grouped-by-customer list by it
 * (client name, boat, tech, status, service type). Replaces the old
 * client-name-only search that lived inside JobsByCustomer.
 */
export function JobsWorkspace({ customers, jobs, pendingJobs }: Props) {
  const [query, setQuery] = useState('');
  const active = query.trim().length > 0;

  const filteredJobs = useMemo(
    () => (active ? jobs.filter((j) => jobMatchesQuery(j, query)) : jobs),
    [jobs, query, active],
  );
  const filteredPending = useMemo(
    () => (active ? pendingJobs.filter((j) => jobMatchesQuery(j, query)) : pendingJobs),
    [pendingJobs, query, active],
  );

  return (
    <div>
      <div className="relative mb-6">
        <Search
          size={18}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-secondary"
          aria-hidden
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search clients, boats, techs, or jobs…"
          aria-label="Search clients and jobs"
          className="w-full rounded-xl border border-border-line bg-card-bg py-3 pl-11 pr-10 text-sm text-text-primary placeholder:text-text-secondary focus:border-gold focus:outline-none"
        />
        {active && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Clear search"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-text-secondary transition-colors hover:text-text-primary"
          >
            <X size={16} />
          </button>
        )}
      </div>

      <PendingJobsPanel jobs={filteredPending} searchActive={active} />

      <JobsByCustomer
        customers={customers}
        jobs={filteredJobs}
        searchActive={active}
        query={query.trim()}
      />
    </div>
  );
}
