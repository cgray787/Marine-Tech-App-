import { describe, it, expect } from "vitest";
import { groupPartsByCustomerBoat, type PartRow } from "@/lib/dashboard/parts";

const base: Omit<PartRow, "id" | "name"> = {
  customer_id: "c1", boat_id: "b1", customer_name: "Ron Wood", boat_name: "Axopar 28",
  part_number: null, quantity: 1, description: null, supplier: null, url: null,
  photo_url: null, status: "need_to_order", ordered_at: null,
};

describe("groupPartsByCustomerBoat", () => {
  it("groups parts under customer then boat", () => {
    const groups = groupPartsByCustomerBoat([
      { ...base, id: "p1", name: "Impeller" },
      { ...base, id: "p2", name: "Zinc" },
      { ...base, id: "p3", name: "Filter", boat_id: "b2", boat_name: "Tender" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].customerName).toBe("Ron Wood");
    expect(groups[0].boats).toHaveLength(2);
    expect(groups[0].boats[0].parts.map((p) => p.name)).toEqual(["Impeller", "Zinc"]);
  });

  it("buckets a missing customer under 'Unassigned'", () => {
    const groups = groupPartsByCustomerBoat([
      { ...base, id: "p1", name: "Bolt", customer_id: null, customer_name: null },
    ]);
    expect(groups[0].customerName).toBe("Unassigned");
  });
});
