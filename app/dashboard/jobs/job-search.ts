// Shared client/job lookup used by the Jobs page search bar. Kept as a pure,
// dependency-free function so it can be unit-tested and reused by both the
// Pending panel and the grouped-by-customer list.

export type SearchableJob = {
  status?: string | null;
  service_types?: string[] | null;
  boats?: { name?: string | null; make_model?: string | null } | null;
  profiles?: { full_name?: string | null } | null;
  customers?: { name?: string | null } | null;
};

/**
 * Case-insensitive substring match across the fields an operator would search
 * for on the Jobs page: client name, boat name + make/model, assigned tech,
 * status, and service types. An empty / whitespace-only query matches every
 * job (so the unfiltered list renders unchanged).
 */
export function jobMatchesQuery(job: SearchableJob, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const fields: (string | null | undefined)[] = [
    job.customers?.name,
    job.boats?.name,
    job.boats?.make_model,
    job.profiles?.full_name,
    job.status,
    ...(job.service_types ?? []),
  ];
  return fields.some((f) => typeof f === 'string' && f.toLowerCase().includes(needle));
}
