import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { isOrgWide } from "@/lib/owner";
import { activeLocation } from "@/lib/location/server";
import { OfficePicker } from "./office-picker";

// Post-login landing for org-wide users. Single-office staff never see it.
export default async function ChooseOfficePage() {
  const { profile, supabase } = await requireAdmin();
  if (!isOrgWide(profile)) {
    redirect("/dashboard");
  }
  const [{ data: locations }, current] = await Promise.all([
    supabase.from("locations").select("id, name").order("name"),
    activeLocation(),
  ]);
  return <OfficePicker locations={locations ?? []} current={current} />;
}
