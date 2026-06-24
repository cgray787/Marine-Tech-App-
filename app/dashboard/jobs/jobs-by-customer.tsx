'use client';
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Calendar, AlertCircle, Search } from 'lucide-react';
import { JobStatusActions } from './job-actions';
import { formatDate, statusColor } from '@/lib/utils';
import { formatTime } from '@/lib/calendar/format';

type Job = {
  id: string;
  status: string;
  service_types: string[] | null;
  scheduled_date: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  customer_id: string | null;
  notes: string | null;
  boats: { name: string; make_model: string } | null;
  profiles: { full_name: string } | null;
  customers: { name: string } | null;
};

type Customer = { id: string; name: string };

type Props = {
  customers: Customer[];
  jobs: Job[];
};

export function JobsByCustomer({ customers, jobs }: Props) {
  const grouped = useMemo(() => {
    const byCust: Map<string, Job[]> = new Map();
    const orphans: Job[] = [];
    for (const j of jobs) {
      if (j.customer_id) {
        if (!byCust.has(j.customer_id)) byCust.set(j.customer_id, []);
        byCust.get(j.customer_id)!.push(j);
      } else {
        orphans.push(j);
      }
    }
    return { byCust, orphans };
  }, [jobs]);

  // Default: expand the first 1 customer that has jobs (so the page isn't fully empty-feeling)
  const customersWithJobs = customers.filter((c) => grouped.byCust.has(c.id));
  const defaultExpanded = useMemo(
    () => new Set(customersWithJobs.slice(0, 1).map((c) => c.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [expanded, setExpanded] = useState<Set<string>>(defaultExpanded);

  // Client search — filters the grouped list by customer name. While a query is
  // active, matching clients are force-expanded so their jobs are visible.
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const visibleCustomers = q
    ? customersWithJobs.filter((c) => c.name.toLowerCase().includes(q))
    : customersWithJobs;

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (jobs.length === 0) {
    return (
      <div className="rounded-xl border border-border-line bg-card-bg px-6 py-12 text-center text-sm text-text-secondary">
        No jobs yet — use the form above to create one.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
          aria-hidden
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search clients…"
          aria-label="Search clients"
          className="w-full rounded-xl border border-border-line bg-card-bg py-2.5 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-secondary focus:border-gold focus:outline-none"
        />
      </div>

      <div className="rounded-xl border border-border-line bg-card-bg overflow-hidden">
      {visibleCustomers.length === 0 && (
        <div className="px-6 py-10 text-center text-sm text-text-secondary">
          No clients match “{query.trim()}”.
        </div>
      )}
      {visibleCustomers.map((customer) => {
        const customerJobs = grouped.byCust.get(customer.id) ?? [];
        const scheduled = customerJobs.filter((j) => j.scheduled_start).length;
        const unscheduled = customerJobs.length - scheduled;
        const isOpen = q ? true : expanded.has(customer.id);

        return (
          <div
            key={customer.id}
            className="border-b border-border-line last:border-b-0"
          >
            <button
              onClick={() => toggle(customer.id)}
              className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-3">
                {isOpen ? (
                  <ChevronDown size={18} className="text-gold" />
                ) : (
                  <ChevronRight size={18} className="text-text-secondary" />
                )}
                <span className="text-base font-semibold text-text-primary">
                  {customer.name}
                </span>
                <span className="text-xs text-text-secondary">
                  ({customerJobs.length} {customerJobs.length === 1 ? 'job' : 'jobs'})
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider">
                {scheduled > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#4ade80]/20 px-2 py-0.5 text-[#4ade80]">
                    <Calendar size={10} aria-hidden /> {scheduled} on calendar
                  </span>
                )}
                {unscheduled > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#1a2236] px-2 py-0.5 text-text-secondary">
                    <AlertCircle size={10} aria-hidden /> {unscheduled} unscheduled
                  </span>
                )}
              </div>
            </button>

            {isOpen && (
              <div className="bg-secondary-bg/30">
                <table className="w-full">
                  <thead>
                    <tr className="border-y border-border-line bg-secondary-bg/50">
                      <th className="px-6 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
                        Date · Time
                      </th>
                      <th className="px-6 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
                        Boat
                      </th>
                      <th className="px-6 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
                        Tech
                      </th>
                      <th className="px-6 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
                        Services
                      </th>
                      <th className="px-6 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
                        Status
                      </th>
                      <th className="px-6 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-line">
                    {customerJobs
                      .slice()
                      .sort((a, b) => {
                        // scheduled first, by start time; then unscheduled by created
                        const aS = a.scheduled_start;
                        const bS = b.scheduled_start;
                        if (aS && bS) return aS.localeCompare(bS);
                        if (aS) return -1;
                        if (bS) return 1;
                        return 0;
                      })
                      .map((job) => (
                        <tr key={job.id} className="hover:bg-white/5">
                          <td className="px-6 py-3 text-sm">
                            {job.scheduled_start ? (
                              <div>
                                <div className="text-text-primary tabular-nums">
                                  {formatDate(job.scheduled_start)}
                                </div>
                                <div className="text-xs text-gold tabular-nums">
                                  {formatTime(job.scheduled_start)}
                                </div>
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs text-text-secondary">
                                <AlertCircle size={12} aria-hidden /> Unscheduled
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-3">
                            <div className="text-sm text-text-primary">
                              {job.boats?.name || 'N/A'}
                            </div>
                            {job.boats?.make_model && (
                              <div className="text-xs text-text-secondary">
                                {job.boats.make_model}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-3 text-sm text-text-primary">
                            {job.profiles?.full_name || 'Unassigned'}
                          </td>
                          <td className="px-6 py-3">
                            <div className="flex flex-wrap gap-1">
                              {job.service_types?.map((type) => (
                                <span
                                  key={type}
                                  className="rounded bg-gold-muted px-2 py-0.5 text-xs text-gold"
                                >
                                  {type}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-6 py-3">
                            <span
                              className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusColor(job.status)}`}
                            >
                              {job.status}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-right">
                            <JobStatusActions
                              jobId={job.id}
                              currentStatus={job.status}
                            />
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}

      {!q && grouped.orphans.length > 0 && (
        <div className="border-t border-border-line bg-secondary-bg/30 px-6 py-4">
          <div className="text-xs uppercase tracking-wider text-text-secondary mb-2">
            Jobs without a customer ({grouped.orphans.length})
          </div>
          <ul className="text-sm text-text-secondary">
            {grouped.orphans.map((j) => (
              <li key={j.id} className="py-1">
                {j.scheduled_start
                  ? `${formatDate(j.scheduled_start)} ${formatTime(j.scheduled_start)}`
                  : 'Unscheduled'}{' '}
                · {j.boats?.name ?? 'No boat'}
              </li>
            ))}
          </ul>
        </div>
      )}
      </div>
    </div>
  );
}
