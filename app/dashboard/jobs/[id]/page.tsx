import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { formatDate } from "@/lib/utils";

// Server-side job detail. Mirrors the mobile job summary: vessel + customer
// snapshot, schedule, services, assigned tech, notes, latest service report
// + checklist + photos, plus parts-to-order tied to this job. Owner/admin/
// manager/tech/viewer all permitted via existing RLS (location-scoped for
// shop tier, unrestricted for admin/owner).

type RouteParams = Promise<{ id: string }>;

const STATUS_BADGE: Record<string, string> = {
  new: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  in_progress: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  completed: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
};

function StatusBadge({ status }: { status: string | null }) {
  const cls = STATUS_BADGE[status ?? ""] ?? "bg-slate-500/15 text-slate-300 border-slate-500/30";
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider ${cls}`}>
      {status ?? "unknown"}
    </span>
  );
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default async function JobDetailPage({ params }: { params: RouteParams }) {
  const { id } = await params;
  const { supabase } = await requireAdmin();

  const { data: job } = await supabase
    .from("jobs")
    .select(`
      id, status, service_types, notes, created_at,
      scheduled_date, scheduled_start, scheduled_end, location_override,
      customer:customer_id (id, name, email, phone, address),
      boat:boat_id (id, name, make_model, year, hin, engine_make, engine_model, color, home_marina, engine_hours_port, engine_hours_starboard),
      tech:assigned_to (id, full_name, email),
      marina:marina_id (id, name)
    `)
    .eq("id", id)
    .maybeSingle();

  if (!job) notFound();

  // Latest service report (techs may submit zero or one per job — newest wins).
  const { data: report } = await supabase
    .from("service_reports")
    .select(`id, status, work_description, submitted_at, reviewed_at`)
    .eq("job_id", id)
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  const reportId = report?.id;
  const [{ data: checklist }, { data: photos }, { data: parts }] = await Promise.all([
    reportId
      ? supabase.from("checklist_items")
          .select("id, category, item_name, assessment, notes, sort_order")
          .eq("report_id", reportId)
          .order("sort_order", { ascending: true })
      : Promise.resolve({ data: [] as Array<{ id: string; category: string; item_name: string; assessment: string; notes: string | null; sort_order: number }> }),
    reportId
      ? supabase.from("report_photos")
          .select("id, bucket, category, caption, file_path")
          .eq("report_id", reportId)
      : Promise.resolve({ data: [] as Array<{ id: string; bucket: string; category: string; caption: string | null; file_path: string }> }),
    supabase.from("parts")
      .select("id, name, part_number, quantity, supplier, description, ordered, url")
      .eq("job_id", id)
      .order("created_at", { ascending: true }),
  ]);

  // Group checklist by category for display.
  const checklistByCategory = (checklist ?? []).reduce<Record<string, typeof checklist>>((acc, item) => {
    (acc[item.category] = acc[item.category] ?? []).push(item);
    return acc;
  }, {});

  // Helper to handle relation shape — Supabase returns either an object or an array
  // depending on the join. Normalize to object-or-null.
  type Maybe<T> = T | T[] | null;
  function one<T>(v: Maybe<T>): T | null {
    if (!v) return null;
    return Array.isArray(v) ? (v[0] ?? null) : v;
  }
  const customer = one(job.customer);
  const boat = one(job.boat);
  const tech = one(job.tech);
  const marina = one(job.marina);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/dashboard/jobs" className="text-xs uppercase tracking-wider text-text-secondary hover:text-text-primary">
            ← All jobs
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-text-primary">
            {customer?.name ?? "Unassigned customer"}
          </h1>
          <p className="mt-0.5 text-sm text-text-secondary">
            {boat?.name ?? "No boat"}{boat?.make_model ? ` · ${boat.make_model}` : ""}
            {boat?.year ? ` · ${boat.year}` : ""}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatusBadge status={job.status} />
          <span className="text-[11px] text-text-secondary">created {formatDate(job.created_at)}</span>
        </div>
      </div>

      {/* Job snapshot card */}
      <div className="grid grid-cols-1 gap-4 rounded-2xl border border-border-line bg-card-bg p-5 lg:grid-cols-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">Schedule</p>
          <p className="mt-1 text-sm text-text-primary">
            {job.scheduled_start ? fmtTime(job.scheduled_start) : (job.scheduled_date ?? "Unscheduled")}
          </p>
          {job.scheduled_end && (
            <p className="text-xs text-text-secondary">until {fmtTime(job.scheduled_end)}</p>
          )}
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">Assigned tech</p>
          <p className="mt-1 text-sm text-text-primary">{tech?.full_name ?? "Unassigned"}</p>
          {tech?.email && <p className="text-xs text-text-secondary">{tech.email}</p>}
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">Location</p>
          <p className="mt-1 text-sm text-text-primary">{job.location_override || marina?.name || "—"}</p>
          {boat?.home_marina && marina?.name !== boat.home_marina && (
            <p className="text-xs text-text-secondary">home: {boat.home_marina}</p>
          )}
        </div>
      </div>

      {/* Services */}
      {job.service_types && job.service_types.length > 0 && (
        <div className="rounded-2xl border border-border-line bg-card-bg p-5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">Services</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {job.service_types.map((s: string) => (
              <span key={s} className="rounded-full border border-border-line bg-secondary-bg px-2.5 py-0.5 text-xs text-text-primary">{s}</span>
            ))}
          </div>
        </div>
      )}

      {/* Customer + Boat */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border-line bg-card-bg p-5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">Customer</p>
          <p className="mt-1 text-sm font-medium text-text-primary">{customer?.name ?? "—"}</p>
          {customer?.email && <p className="text-xs text-text-secondary">{customer.email}</p>}
          {customer?.phone && <p className="text-xs text-text-secondary">{customer.phone}</p>}
          {customer?.address && <p className="text-xs text-text-secondary">{customer.address}</p>}
        </div>
        <div className="rounded-2xl border border-border-line bg-card-bg p-5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">Boat</p>
          <p className="mt-1 text-sm font-medium text-text-primary">{boat?.name ?? "—"}</p>
          <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-text-secondary">
            {boat?.make_model && <span><b className="text-text-primary">Model:</b> {boat.make_model}</span>}
            {boat?.year && <span><b className="text-text-primary">Year:</b> {boat.year}</span>}
            {boat?.hin && <span className="col-span-2"><b className="text-text-primary">HIN:</b> <span className="font-mono">{boat.hin}</span></span>}
            {boat?.color && <span><b className="text-text-primary">Color:</b> {boat.color}</span>}
            {boat?.engine_make && <span><b className="text-text-primary">Engine:</b> {boat.engine_make} {boat.engine_model}</span>}
            {(boat?.engine_hours_port || boat?.engine_hours_starboard) && (
              <span className="col-span-2">
                <b className="text-text-primary">Hours:</b>{" "}
                {boat?.engine_hours_port ? `port ${boat.engine_hours_port}` : ""}
                {boat?.engine_hours_port && boat?.engine_hours_starboard ? " · " : ""}
                {boat?.engine_hours_starboard ? `stbd ${boat.engine_hours_starboard}` : ""}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Notes */}
      {job.notes && (
        <div className="rounded-2xl border border-border-line bg-card-bg p-5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">Notes</p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-text-primary">{job.notes}</p>
        </div>
      )}

      {/* Service Report + Checklist */}
      {report ? (
        <div className="rounded-2xl border border-border-line bg-card-bg p-5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">Service report</p>
            <span className="text-[11px] text-text-secondary">
              {report.status} · {report.submitted_at ? fmtTime(report.submitted_at) : "draft"}
            </span>
          </div>
          {report.work_description && (
            <p className="mt-2 whitespace-pre-wrap text-sm text-text-primary">{report.work_description}</p>
          )}
          {checklist && checklist.length > 0 && (
            <div className="mt-4 space-y-3">
              {Object.entries(checklistByCategory).map(([cat, items]) => (
                <div key={cat}>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">{cat}</p>
                  <ul className="mt-1 space-y-1">
                    {(items ?? []).map((it) => (
                      <li key={it.id} className="flex items-start gap-2 text-sm">
                        <span className={`mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                          it.assessment === "good" ? "bg-emerald-500/15 text-emerald-400"
                            : it.assessment === "bad" ? "bg-red-500/15 text-red-400"
                            : "bg-slate-500/15 text-slate-400"
                        }`}>{it.assessment?.toUpperCase() ?? "—"}</span>
                        <span className="text-text-primary">{it.item_name}</span>
                        {it.notes && <span className="text-xs text-text-secondary">— {it.notes}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-border-line bg-card-bg p-5 text-sm text-text-secondary">
          No service report submitted yet for this job.
        </div>
      )}

      {/* Photos */}
      {photos && photos.length > 0 && (
        <div className="rounded-2xl border border-border-line bg-card-bg p-5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">Photos ({photos.length})</p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {photos.map((p) => (
              <div key={p.id} className="overflow-hidden rounded-lg border border-border-line bg-secondary-bg">
                <div className="aspect-square bg-secondary-bg" />
                <div className="px-2 py-1.5">
                  <p className="text-[10px] uppercase tracking-wider text-text-secondary">{p.category}</p>
                  {p.caption && <p className="text-xs text-text-primary">{p.caption}</p>}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-text-secondary">
            Image rendering uses the mobile app and reports tabs for now; this view lists the photo records attached to the job.
          </p>
        </div>
      )}

      {/* Parts to order */}
      {parts && parts.length > 0 && (
        <div className="rounded-2xl border border-border-line bg-card-bg p-5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">Parts ({parts.length})</p>
          <ul className="mt-3 space-y-2">
            {parts.map((pt) => (
              <li key={pt.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                <span className="font-medium text-text-primary">{pt.name}</span>
                {pt.quantity && <span className="text-xs text-text-secondary">× {pt.quantity}</span>}
                {pt.part_number && <span className="font-mono text-xs text-text-secondary">{pt.part_number}</span>}
                {pt.supplier && <span className="text-xs text-text-secondary">· {pt.supplier}</span>}
                <span className={`ml-auto rounded px-2 py-0.5 text-[10px] font-semibold ${
                  pt.ordered ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
                }`}>
                  {pt.ordered ? "ordered" : "need to order"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
