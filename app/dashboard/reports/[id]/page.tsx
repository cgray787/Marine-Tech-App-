import { requireAdmin } from "@/lib/admin";
import { formatDateTime } from "@/lib/utils";
import Link from "next/link";
import { ReportDetailActions } from "./report-detail-actions";
import { PhotoGallery } from "@/components/photo-gallery";
import { PrintButton } from "@/components/print-button";

type Params = Promise<{ id: string }>;

export default async function ReportDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const { supabase } = await requireAdmin();

  const { data: report } = await supabase
    .from("service_reports")
    .select("*, profiles:tech_id(full_name, email)")
    .eq("id", id)
    .single();

  if (!report) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-text-secondary">Report not found</p>
      </div>
    );
  }

  const { data: checklistItems } = await supabase
    .from("checklist_items")
    .select("*")
    .eq("report_id", id)
    .order("category")
    .order("sort_order");

  const { data: photos } = await supabase
    .from("report_photos")
    .select("*")
    .eq("report_id", id)
    .order("created_at");

  const tech = (report.profiles as unknown) as { full_name: string; email: string } | null;

  // Group checklist items by category
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
      <div className="mb-8 flex items-start justify-between">
        <div>
          <Link
            href="/dashboard/reports"
            className="mb-2 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-gold"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Back to Reports
          </Link>
          <h1 className="text-2xl font-bold text-text-primary">
            {report.boat_name || "Service Report"}
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Submitted {formatDateTime(report.submitted_at)} by{" "}
            {tech?.full_name || "Unknown"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <PrintButton />
          <ReportDetailActions reportId={id} currentStatus={report.status} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main content */}
        <div className="space-y-6 lg:col-span-2">
          {/* Vessel Information */}
          <div className="rounded-xl border border-border-line bg-card-bg p-6">
            <h2 className="mb-4 text-lg font-semibold text-text-primary">
              Vessel Information
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <InfoField label="Boat Name" value={report.boat_name} />
              <InfoField label="Owner" value={report.owner_name} />
              <InfoField label="Make/Model" value={report.make_model} />
              <InfoField label="Year" value={report.year?.toString()} />
              <InfoField label="HIN" value={report.hin} />
              <InfoField label="Marina" value={report.marina} />
            </div>
          </div>

          {/* Engine Data */}
          <div className="rounded-xl border border-border-line bg-card-bg p-6">
            <h2 className="mb-4 text-lg font-semibold text-text-primary">
              Engine Data
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <InfoField
                label="Engine"
                value={report.engine_make_model}
              />
              <InfoField
                label="Engine Hours"
                value={report.engine_hours?.toString()}
              />
              <InfoField
                label="Battery Voltage"
                value={
                  report.battery_voltage
                    ? `${report.battery_voltage}V`
                    : null
                }
              />
            </div>
          </div>

          {/* Systems Assessment */}
          {Object.keys(categories).length > 0 && (
            <div className="rounded-xl border border-border-line bg-card-bg p-6">
              <h2 className="mb-4 text-lg font-semibold text-text-primary">
                Systems Assessment
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

          {/* Work Description */}
          {(report.work_description || report.parts_used || report.concerns) && (
            <div className="rounded-xl border border-border-line bg-card-bg p-6">
              <h2 className="mb-4 text-lg font-semibold text-text-primary">
                Work Details
              </h2>
              {report.work_description && (
                <div className="mb-4">
                  <h3 className="mb-1 text-sm font-medium text-text-secondary">
                    Work Description
                  </h3>
                  <p className="text-sm text-text-primary whitespace-pre-wrap">
                    {report.work_description}
                  </p>
                </div>
              )}
              {report.parts_used && (
                <div className="mb-4">
                  <h3 className="mb-1 text-sm font-medium text-text-secondary">
                    Parts Used
                  </h3>
                  <p className="text-sm text-text-primary whitespace-pre-wrap">
                    {report.parts_used}
                  </p>
                </div>
              )}
              {report.concerns && (
                <div>
                  <h3 className="mb-1 text-sm font-medium text-text-secondary">
                    Concerns
                  </h3>
                  <p className="text-sm text-text-primary whitespace-pre-wrap">
                    {report.concerns}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Photo Gallery */}
          {photos && photos.length > 0 && (
            <PhotoGallery photos={photos} storageBucket="report-photos" />
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Status Card */}
          <div className="rounded-xl border border-border-line bg-card-bg p-6">
            <h3 className="mb-3 text-sm font-semibold text-text-secondary">
              Report Status
            </h3>
            <div className="space-y-3">
              <StatusStep
                label="Submitted"
                date={report.submitted_at}
                done={true}
              />
              <StatusStep
                label="Reviewed"
                date={report.reviewed_at}
                done={["reviewed", "approved"].includes(report.status)}
              />
              <StatusStep
                label="Approved"
                date={
                  report.status === "approved" ? report.reviewed_at : null
                }
                done={report.status === "approved"}
              />
            </div>
          </div>

          {/* Service Types */}
          {report.service_types && report.service_types.length > 0 && (
            <div className="rounded-xl border border-border-line bg-card-bg p-6">
              <h3 className="mb-3 text-sm font-semibold text-text-secondary">
                Service Types
              </h3>
              <div className="flex flex-wrap gap-2">
                {report.service_types.map((type: string) => (
                  <span
                    key={type}
                    className="rounded-lg bg-gold-muted px-3 py-1.5 text-xs font-medium text-gold"
                  >
                    {type}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* General Notes */}
          {report.general_notes && (
            <div className="rounded-xl border border-border-line bg-card-bg p-6">
              <h3 className="mb-3 text-sm font-semibold text-text-secondary">
                General Notes
              </h3>
              <p className="text-sm text-text-primary whitespace-pre-wrap">
                {report.general_notes}
              </p>
            </div>
          )}

          {/* Technician Info */}
          <div className="rounded-xl border border-border-line bg-card-bg p-6">
            <h3 className="mb-3 text-sm font-semibold text-text-secondary">
              Technician
            </h3>
            <p className="text-sm font-medium text-text-primary">
              {tech?.full_name || "Unknown"}
            </p>
            <p className="text-xs text-text-secondary">
              {tech?.email || ""}
            </p>
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

function StatusStep({
  label,
  date,
  done,
}: {
  label: string;
  date: string | null;
  done: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`flex h-6 w-6 items-center justify-center rounded-full ${
          done ? "bg-emerald-500/20 text-emerald-400" : "bg-border-line text-text-secondary"
        }`}
      >
        {done ? (
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <div className="h-2 w-2 rounded-full bg-current" />
        )}
      </div>
      <div>
        <p className={`text-sm ${done ? "text-text-primary" : "text-text-secondary"}`}>
          {label}
        </p>
        {date && (
          <p className="text-xs text-text-secondary">
            {formatDateTime(date)}
          </p>
        )}
      </div>
    </div>
  );
}
