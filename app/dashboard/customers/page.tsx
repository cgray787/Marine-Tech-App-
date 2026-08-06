import { requireAdmin } from "@/lib/admin";
import { locationFilterFor } from "@/lib/location/server";
import { CustomerList } from "./customer-list";

export default async function CustomersPage() {
  const { supabase, profile } = await requireAdmin();
  const loc = await locationFilterFor(profile);

  let customersQuery = supabase.from("customers").select("*");
  if (loc) customersQuery = customersQuery.eq("location_id", loc);

  // Boats follow their parent customer's office.
  let boatsQuery = supabase
    .from("boats")
    .select(loc ? "*, customers:customer_id!inner(location_id)" : "*");
  if (loc) boatsQuery = boatsQuery.eq("customers.location_id", loc);

  // Fetch both in parallel — these are independent, so awaiting them
  // sequentially was two serial round-trips for no reason.
  const [{ data: customers }, { data: boats }] = await Promise.all([
    customersQuery.order("name"),
    boatsQuery.order("name"),
  ]);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text-primary">
          Clients
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Manage clients and their vessels
        </p>
      </div>

      <CustomerList
        initialCustomers={customers || []}
        initialBoats={(boats as unknown as Parameters<typeof CustomerList>[0]['initialBoats']) || []}
      />
    </div>
  );
}
