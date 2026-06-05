import { requireAdmin } from "@/lib/admin";
import { formatDate } from "@/lib/utils";
import { InviteTechForm } from "./invite-tech-form";
import { ManageUserControls } from "./manage-user-controls";

export default async function TechniciansPage() {
  const { supabase } = await requireAdmin();

  // Techs + viewers are the manageable staff. Admins (including you) are hidden
  // so you can't change or delete your own / another admin's access from here.
  const { data: techs } = await supabase
    .from("profiles")
    .select("*")
    .in("role", ["tech", "viewer"])
    .order("created_at", { ascending: false });

  // Get job counts per tech
  const techIds = (techs || []).map((t) => t.id);
  const { data: jobCounts } = await supabase
    .from("jobs")
    .select("assigned_to, status")
    .in("assigned_to", techIds.length > 0 ? techIds : ["none"]);

  const countMap: Record<string, { total: number; completed: number }> = {};
  (jobCounts || []).forEach((j) => {
    const key = j.assigned_to;
    if (!key) return;
    if (!countMap[key]) countMap[key] = { total: 0, completed: 0 };
    countMap[key].total++;
    if (j.status === "completed") countMap[key].completed++;
  });

  function statusBadge(status: string) {
    switch (status) {
      case "active":
        return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
      case "invited":
        return "bg-amber-500/15 text-amber-400 border-amber-500/30";
      case "disabled":
        return "bg-red-500/15 text-red-400 border-red-500/30";
      default:
        return "bg-slate-500/15 text-slate-400 border-slate-500/30";
    }
  }

  return (
    <div>
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Users &amp; Access</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Manage your team&apos;s roles and access (Admin / Edit / Read-only), or remove a user
          </p>
        </div>
      </div>

      {/* Invite Tech */}
      <InviteTechForm />

      {/* Tech List */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {techs && techs.length > 0 ? (
          techs.map((tech) => {
            const counts = countMap[tech.id] || { total: 0, completed: 0 };
            return (
              <div
                key={tech.id}
                className="rounded-xl border border-border-line bg-card-bg p-5"
              >
                <div className="mb-4 flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gold/20 text-sm font-semibold text-gold">
                      {tech.full_name
                        ?.split(" ")
                        .map((n: string) => n[0])
                        .join("")
                        .toUpperCase() || "?"}
                    </div>
                    <div>
                      <p className="font-medium text-text-primary">
                        {tech.full_name}
                      </p>
                      <p className="text-xs text-text-secondary">
                        {tech.email}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusBadge(tech.status)}`}
                  >
                    {tech.status}
                  </span>
                </div>

                {tech.phone && (
                  <p className="mb-3 text-xs text-text-secondary">
                    Phone: {tech.phone}
                  </p>
                )}

                <div className="grid grid-cols-3 gap-3 border-t border-border-line pt-4">
                  <div className="text-center">
                    <p className="text-lg font-bold text-text-primary">
                      {counts.total}
                    </p>
                    <p className="text-xs text-text-secondary">Total Jobs</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-emerald-400">
                      {counts.completed}
                    </p>
                    <p className="text-xs text-text-secondary">Completed</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-text-secondary">
                      {counts.total - counts.completed}
                    </p>
                    <p className="text-xs text-text-secondary">Active</p>
                  </div>
                </div>

                <p className="mt-3 text-xs text-text-secondary">
                  Joined {formatDate(tech.created_at)}
                </p>

                <ManageUserControls
                  profileId={tech.id}
                  currentRole={tech.role}
                  name={tech.full_name || tech.email || "this user"}
                />
              </div>
            );
          })
        ) : (
          <div className="col-span-full rounded-xl border border-border-line bg-card-bg p-12 text-center">
            <p className="text-sm text-text-secondary">
              No users yet. Invite one to get started.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
