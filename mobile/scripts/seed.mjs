/**
 * Seed script for Marine Tech App
 * Run from mobile directory: node scripts/seed.mjs
 *
 * ALREADY RUN -- data is in Supabase. Re-running will create duplicates.
 *
 * Usage:
 *   SUPABASE_URL=https://... SUPABASE_SERVICE_KEY=... node scripts/seed.mjs
 *
 * Created data:
 * - Customers: Robert Johnson, Mike Thompson
 * - Marinas: Bay Marina, Sunset Harbor
 * - Boats: Sea Breeze IV, Lucky Tide, Island Drifter
 * - Jobs: 1 new (Sea Breeze IV), 1 in_progress (Lucky Tide), 1 completed (Island Drifter)
 * - Service Report for completed job with 20 checklist items
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Error: SUPABASE_URL and SUPABASE_SERVICE_KEY env vars are required.");
  console.error("Usage: SUPABASE_URL=https://... SUPABASE_SERVICE_KEY=... node scripts/seed.mjs");
  process.exit(1);
}

const ADMIN_PROFILE_ID = "076a5c35-481f-4ad5-a498-9196989a0215";

async function post(table, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error(`Error inserting into ${table}:`, data);
    throw new Error(data.message || "Insert failed");
  }
  return data;
}

async function main() {
  // Step 1: Customers
  console.log("=== Inserting Customers ===");
  const customers = await post("customers", [
    { name: "Robert Johnson", email: "robert.johnson@email.com", phone: "206-555-1234" },
    { name: "Mike Thompson", email: "mike.thompson@email.com", phone: "206-555-5678" },
  ]);
  const [robert, mike] = customers;
  console.log("Robert:", robert.id, "Mike:", mike.id);

  // Step 2: Marinas
  console.log("\n=== Inserting Marinas ===");
  const marinas = await post("marinas", [
    { name: "Bay Marina", address: "1200 Harbor Blvd, Seattle, WA 98101" },
    { name: "Sunset Harbor", address: "450 Waterfront Dr, Tacoma, WA 98402" },
  ]);
  const [marina1, marina2] = marinas;
  console.log("Bay Marina:", marina1.id, "Sunset Harbor:", marina2.id);

  // Step 3: Boats
  console.log("\n=== Inserting Boats ===");
  const boats = await post("boats", [
    { name: "Sea Breeze IV", make_model: "Boston Whaler 280", year: 2024, hin: "BWC28001A424", customer_id: robert.id, engine_make: "Mercury", engine_model: "V8 300hp", color: "White" },
    { name: "Lucky Tide", make_model: "Grady-White 271", year: 2022, hin: "GWB27001B222", customer_id: mike.id, engine_make: "Yamaha", engine_model: "F300", color: "Blue/White" },
    { name: "Island Drifter", make_model: "Yellowfin 36", year: 2023, hin: "YFN36001C323", customer_id: robert.id, engine_make: "Yamaha", engine_model: "F350 Twin", color: "White/Tan" },
  ]);
  console.log("Boats:", boats.map((b) => `${b.name}: ${b.id}`));

  // Step 4: Jobs
  console.log("\n=== Inserting Jobs ===");
  const jobs = await post("jobs", [
    {
      assigned_to: ADMIN_PROFILE_ID, customer_id: robert.id, boat_id: boats[0].id,
      marina_id: marina1.id, status: "new", service_types: ["Annual Service", "Oil Change"],
      scheduled_date: "2026-03-25", notes: "Annual maintenance service for Sea Breeze IV.",
      created_by: ADMIN_PROFILE_ID,
    },
    {
      assigned_to: ADMIN_PROFILE_ID, customer_id: mike.id, boat_id: boats[1].id,
      marina_id: marina2.id, status: "in_progress", service_types: ["Winterization", "Electrical"],
      scheduled_date: "2026-03-20", notes: "Full winterization service.",
      created_by: ADMIN_PROFILE_ID,
    },
    {
      assigned_to: ADMIN_PROFILE_ID, customer_id: robert.id, boat_id: boats[2].id,
      marina_id: marina1.id, status: "completed", service_types: ["Engine Service", "Hull Inspection"],
      scheduled_date: "2026-03-15", notes: "Complete engine service and hull inspection.",
      created_by: ADMIN_PROFILE_ID,
    },
  ]);
  console.log("Jobs:", jobs.map((j) => `${j.status}: ${j.id}`));

  // Step 5: Service Report
  console.log("\n=== Inserting Service Report ===");
  const [report] = await post("service_reports", {
    job_id: jobs[2].id,
    tech_id: ADMIN_PROFILE_ID,
    boat_id: boats[2].id,
    customer_id: robert.id,
    boat_name: "Island Drifter",
    owner_name: "Robert Johnson",
    make_model: "Yellowfin 36",
    year: 2023,
    hin: "YFN36001C323",
    marina: "Bay Marina",
    engine_make_model: "Yamaha F350 Twin",
    engine_hours: 342,
    work_description: "Performed complete 300-hour engine service on twin Yamaha F350s. Changed oil and filters on both engines. Replaced impellers.",
    parts_used: ["Oil Filter (x2)", "Yamaha 10W-30 Oil (12qt)", "Impeller Kit (x2)", "Raw Water Hose 1.5in", "Zinc Anodes (x6)", "Fuel Filter (x2)"],
    general_notes: "Vessel in good overall condition. Recommend prop refinishing at next haul-out.",
  });
  console.log("Report:", report.id);

  // Step 6: Checklist Items
  console.log("\n=== Inserting Checklist Items ===");
  const items = await post("checklist_items", [
    { report_id: report.id, category: "engine", item_name: "Oil Pressure", assessment: "good", notes: "Within normal range", sort_order: 0 },
    { report_id: report.id, category: "engine", item_name: "Oil Level", assessment: "good", notes: "Topped off", sort_order: 1 },
    { report_id: report.id, category: "engine", item_name: "Coolant Level", assessment: "good", notes: null, sort_order: 2 },
    { report_id: report.id, category: "engine", item_name: "Fuel System", assessment: "good", notes: "New filters", sort_order: 3 },
    { report_id: report.id, category: "engine", item_name: "Propeller Condition", assessment: "bad", notes: "Minor nicks - recommend refinishing", sort_order: 7 },
    { report_id: report.id, category: "engine", item_name: "Belts & Hoses", assessment: "bad", notes: "Starboard raw water hose replaced", sort_order: 9 },
    { report_id: report.id, category: "electrical", item_name: "Battery Voltage", assessment: "good", notes: "12.8V both banks", sort_order: 10 },
    { report_id: report.id, category: "hull", item_name: "Hull Integrity", assessment: "good", notes: "No structural issues", sort_order: 14 },
    { report_id: report.id, category: "hull", item_name: "Gel Coat Finish", assessment: "bad", notes: "Minor damage on port bow", sort_order: 15 },
    { report_id: report.id, category: "hull", item_name: "Zinc Anodes", assessment: "good", notes: "All replaced", sort_order: 16 },
    { report_id: report.id, category: "safety", item_name: "Life Jackets", assessment: "good", notes: "6 on board", sort_order: 18 },
    { report_id: report.id, category: "safety", item_name: "Fire Extinguisher", assessment: "good", notes: "Charged", sort_order: 19 },
  ]);
  console.log(`Created ${items.length} checklist items`);

  console.log("\n=== SEED COMPLETE ===");
}

main().catch(console.error);
