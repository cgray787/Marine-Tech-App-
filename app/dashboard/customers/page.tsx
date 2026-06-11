import { requireAdmin } from "@/lib/admin";
import { CustomerList } from "./customer-list";

export default async function CustomersPage() {
  const { supabase } = await requireAdmin();

  const { data: customers } = await supabase
    .from("customers")
    .select("*")
    .order("name");

  const { data: boats } = await supabase
    .from("boats")
    .select("*")
    .order("name");

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
        initialBoats={boats || []}
      />
    </div>
  );
}
