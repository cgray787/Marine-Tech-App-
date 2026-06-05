export type PartStatus = "need_to_order" | "ordered";

export type PartRow = {
  id: string;
  name: string;
  customer_id: string | null;
  boat_id: string | null;
  customer_name: string | null;
  boat_name: string | null;
  part_number: string | null;
  quantity: number;
  description: string | null;
  supplier: string | null;
  url: string | null;
  photo_url: string | null;
  status: PartStatus;
  ordered_at: string | null;
};

export type BoatGroup = { boatId: string; boatName: string; parts: PartRow[] };
export type CustomerGroup = { customerId: string; customerName: string; boats: BoatGroup[] };

export function groupPartsByCustomerBoat(parts: PartRow[]): CustomerGroup[] {
  const customers = new Map<string, CustomerGroup>();
  for (const p of parts) {
    const cId = p.customer_id ?? "__none__";
    const cName = p.customer_name ?? "Unassigned";
    let c = customers.get(cId);
    if (!c) {
      c = { customerId: cId, customerName: cName, boats: [] };
      customers.set(cId, c);
    }
    const bId = p.boat_id ?? "__none__";
    const bName = p.boat_name ?? "No boat";
    let b = c.boats.find((x) => x.boatId === bId);
    if (!b) {
      b = { boatId: bId, boatName: bName, parts: [] };
      c.boats.push(b);
    }
    b.parts.push(p);
  }
  return Array.from(customers.values());
}
