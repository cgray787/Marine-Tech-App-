import { requireAdmin } from "@/lib/admin";
import { formatDateTime } from "@/lib/utils";
import Link from "next/link";
import { PhotoGallery } from "@/components/photo-gallery";

type Params = Promise<{ id: string }>;

export default async function PdiDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const { supabase } = await requireAdmin();

  const { data: pdi } = await supabase
    .from("pdi_reports")
    .select("*, profiles:tech_id(full_name, email)")
    .eq("id", id)
    .single();

  if (!pdi) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-text-secondary">PDI Report not found</p>
      </div>
    );
  }

  const { data: checklistItems } = await supabase
    .from("pdi_checklist_items")
    .select("*")
    .eq("pdi_report_id", id)
    .order("category")
    .order("sort_order");

  const { data: photos } = await supabase
    .from("report_photos")
    .select("*")
    .eq("pdi_report_id", id)
    .order("created_at");

  const tech = (pdi.profiles as unknown) as { full_name: string; email: string } | null;

  // Group by category
  const categories = (checklistItems || []).reduce(
    (acc: Record<string, typeof checklistItems>, item) => {
      const cat = item.category || "Other";
      if (!acc[cat]) acc[cat] = [];
      acc[cat]!.push(item);
      return acc;
    },
    {}
  );

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/dashboard/pdi-reports"
          className="mb-2 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-gold"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to PDI Reports
        </Link>
        <h1 className="text-2xl font-bold text-text-primary">
          PDI: {pdi.boat_name || "Pre-Delivery Inspection"}
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Submitted {formatDateTime(pdi.submitted_at)} by{" "}
          {tech?.full_name || "Unknown"}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Vessel Info */}
          <div className="rounded-xl border border-border-line bg-card-bg p-6">
            <h2 className="mb-4 text-lg font-semibold text-text-primary">
              Vessel Information
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <InfoField label="Boat Name" value={pdi.boat_name} />
              <InfoField label="Owner" value={pdi.owner_name} />
              <InfoField label="Make/Model" value={pdi.make_model} />
              <InfoField label="Year" value={pdi.year?.toString()} />
              <InfoField label="HIN" value={pdi.hin} />
              <InfoField label="Color" value={pdi.color} />
              <InfoField label="Marina" value={pdi.marina} />
            </div>
          </div>

          {/* Checklist */}
          {Object.keys(categories).length > 0 && (
            <div className="rounded-xl border border-border-line bg-card-bg p-6">
              <h2 className="mb-4 text-lg font-semibold text-text-primary">
                Inspection Checklist
              </h2>
              <div className="space-y-6">
                {Object.entries(categories).map(([category, items]) => (
                  <div key={category}>
                    <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gold">
                      {category}
                    </h3>
                    <div className="space-y-2">
                      {items?.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between rounded-lg border border-border-line bg-secondary-bg px-4 py-3"
                        >
                          <div>
                            <p className="text-sm font-medium text-text-primary">
                              {item.item_name}
                            </p>
                            {item.notes && (
                              <p className="mt-0.5 text-xs text-text-secondary">
                                {item.notes}
                              </p>
                            )}
                          </div>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-bold ${
                              item.assessment === "good"
                                ? "bg-emerald-500/15 text-emerald-400"
                                : item.assessment === "bad"
                                  ? "bg-red-500/15 text-red-400"
                                  : "bg-slate-500/15 text-slate-400"
                            }`}
                          >
                            {item.assessment?.toUpperCase() || "N/A"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* General Notes */}
          {pdi.general_notes && (
            <div className="rounded-xl border border-border-line bg-card-bg p-6">
              <h2 className="mb-3 text-lg font-semibold text-text-primary">
                General Notes
              </h2>
              <p className="whitespace-pre-wrap text-sm text-text-primary">
                {pdi.general_notes}
              </p>
            </div>
          )}

          {/* Photo Gallery */}
          {photos && photos.length > 0 && (
            <PhotoGallery photos={photos} storageBucket="pdi-photos" />
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="rounded-xl border border-border-line bg-card-bg p-6">
            <h3 className="mb-3 text-sm font-semibold text-text-secondary">
              Summary
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-secondary">Total Items</span>
                <span className="text-sm font-medium text-text-primary">
                  {pdi.total_items}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-secondary">Completed</span>
                <span className="text-sm font-medium text-emerald-400">
                  {pdi.completed_items}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-secondary">Flagged</span>
                <span className="text-sm font-medium text-red-400">
                  {pdi.flagged_items}
                </span>
              </div>
              {pdi.total_items > 0 && (
                <div className="pt-2">
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-border-line">
                    <div
                      className="h-full rounded-full bg-gold"
                      style={{
                        width: `${Math.round((pdi.completed_items / pdi.total_items) * 100)}%`,
                      }}
                    />
                  </div>
                  <p className="mt-1 text-right text-xs text-text-secondary">
                    {Math.round((pdi.completed_items / pdi.total_items) * 100)}%
                    complete
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border-line bg-card-bg p-6">
            <h3 className="mb-3 text-sm font-semibold text-text-secondary">
              Technician
            </h3>
            <p className="text-sm font-medium text-text-primary">
              {tech?.full_name || "Unknown"}
            </p>
            <p className="text-xs text-text-secondary">{tech?.email || ""}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoField({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-text-secondary">{label}</p>
      <p className="mt-0.5 text-sm text-text-primary">{value || "N/A"}</p>
    </div>
  );
}
