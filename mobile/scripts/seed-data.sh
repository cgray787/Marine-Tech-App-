#!/bin/bash
# Seed script for Marine Tech App - run with: bash scripts/seed-data.sh
# Inserts sample customers, boats, marinas, jobs, and a completed service report
#
# Usage:
#   SUPABASE_URL=https://... SUPABASE_SERVICE_KEY=... bash scripts/seed-data.sh

if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_KEY" ]; then
  echo "Error: SUPABASE_URL and SUPABASE_SERVICE_KEY env vars are required."
  echo "Usage: SUPABASE_URL=https://... SUPABASE_SERVICE_KEY=... bash scripts/seed-data.sh"
  exit 1
fi

SK="$SUPABASE_SERVICE_KEY"
URL="$SUPABASE_URL/rest/v1"
ADMIN="076a5c35-481f-4ad5-a498-9196989a0215"

# Previously inserted data IDs (from initial seed run)
ROBERT="73c3c290-b9b5-440f-87fd-fabd7d51f369"
MIKE="96079dc6-3568-4b22-a810-835bb38ea63e"
MARINA1="b841f692-cb17-4b1d-a01c-1337c2199fb1"
MARINA2="0b3eaf02-39cc-4c15-8f85-e18377973bbe"
BOAT1="52305f82-7887-41ca-8098-124259434ee7"
BOAT2="9afc3cd4-75fb-444d-84ee-78536f0e5283"
BOAT3="7678ad87-7374-4619-9787-84cb04432dc0"

post() {
  curl -s -X POST "$URL/$1" \
    -H "apikey: $SK" \
    -H "Authorization: Bearer $SK" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=representation" \
    -d "$2"
}

echo "=== Inserting Jobs ==="
JOBS=$(post jobs "[
  {\"assigned_to\":\"$ADMIN\",\"customer_id\":\"$ROBERT\",\"boat_id\":\"$BOAT1\",\"marina_id\":\"$MARINA1\",\"status\":\"new\",\"service_types\":[\"Annual Service\",\"Oil Change\"],\"scheduled_date\":\"2026-03-25\",\"notes\":\"Annual maintenance service for Sea Breeze IV.\",\"created_by\":\"$ADMIN\"},
  {\"assigned_to\":\"$ADMIN\",\"customer_id\":\"$MIKE\",\"boat_id\":\"$BOAT2\",\"marina_id\":\"$MARINA2\",\"status\":\"in_progress\",\"service_types\":[\"Winterization\",\"Electrical\"],\"scheduled_date\":\"2026-03-20\",\"notes\":\"Full winterization service.\",\"created_by\":\"$ADMIN\"},
  {\"assigned_to\":\"$ADMIN\",\"customer_id\":\"$ROBERT\",\"boat_id\":\"$BOAT3\",\"marina_id\":\"$MARINA1\",\"status\":\"completed\",\"service_types\":[\"Engine Service\",\"Hull Inspection\"],\"scheduled_date\":\"2026-03-15\",\"notes\":\"Complete engine service and hull inspection.\",\"created_by\":\"$ADMIN\"}
]")
echo "$JOBS"

JOB3_ID=$(echo "$JOBS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[2]['id'])")
echo "Completed Job ID: $JOB3_ID"

echo ""
echo "=== Inserting Service Report ==="
REPORT=$(post service_reports "{
  \"job_id\":\"$JOB3_ID\",\"tech_id\":\"$ADMIN\",\"boat_id\":\"$BOAT3\",\"customer_id\":\"$ROBERT\",
  \"boat_name\":\"Island Drifter\",\"owner_name\":\"Robert Johnson\",\"make_model\":\"Yellowfin 36\",
  \"year\":2023,\"hin\":\"YFN36001C323\",\"marina\":\"Bay Marina\",
  \"engine_make_model\":\"Yamaha F350 Twin\",\"engine_hours\":342,
  \"work_description\":\"Performed complete 300-hour engine service on twin Yamaha F350s. Changed oil and filters on both engines. Replaced impellers.\",
  \"parts_used\":[\"Oil Filter (x2)\",\"Yamaha 10W-30 Oil (12qt)\",\"Impeller Kit (x2)\",\"Raw Water Hose 1.5in\",\"Zinc Anodes (x6)\",\"Fuel Filter (x2)\"],
  \"general_notes\":\"Vessel in good overall condition. Recommend prop refinishing at next haul-out.\"
}")
echo "$REPORT"

REPORT_ID=$(echo "$REPORT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id'])")
echo "Report ID: $REPORT_ID"

echo ""
echo "=== Inserting Checklist Items ==="
ITEMS=$(post checklist_items "[
  {\"report_id\":\"$REPORT_ID\",\"category\":\"engine\",\"item_name\":\"Oil Pressure\",\"assessment\":\"good\",\"notes\":\"Within normal range both engines\",\"sort_order\":0},
  {\"report_id\":\"$REPORT_ID\",\"category\":\"engine\",\"item_name\":\"Oil Level\",\"assessment\":\"good\",\"notes\":\"Topped off after change\",\"sort_order\":1},
  {\"report_id\":\"$REPORT_ID\",\"category\":\"engine\",\"item_name\":\"Coolant Level\",\"assessment\":\"good\",\"notes\":null,\"sort_order\":2},
  {\"report_id\":\"$REPORT_ID\",\"category\":\"engine\",\"item_name\":\"Fuel System\",\"assessment\":\"good\",\"notes\":\"New filters installed\",\"sort_order\":3},
  {\"report_id\":\"$REPORT_ID\",\"category\":\"engine\",\"item_name\":\"Exhaust System\",\"assessment\":\"good\",\"notes\":null,\"sort_order\":4},
  {\"report_id\":\"$REPORT_ID\",\"category\":\"engine\",\"item_name\":\"Throttle Response\",\"assessment\":\"good\",\"notes\":\"Smooth both engines\",\"sort_order\":5},
  {\"report_id\":\"$REPORT_ID\",\"category\":\"engine\",\"item_name\":\"Steering System\",\"assessment\":\"good\",\"notes\":null,\"sort_order\":6},
  {\"report_id\":\"$REPORT_ID\",\"category\":\"engine\",\"item_name\":\"Propeller Condition\",\"assessment\":\"bad\",\"notes\":\"Minor nicks on port prop - recommend refinishing\",\"sort_order\":7},
  {\"report_id\":\"$REPORT_ID\",\"category\":\"engine\",\"item_name\":\"Trim & Tilt\",\"assessment\":\"good\",\"notes\":null,\"sort_order\":8},
  {\"report_id\":\"$REPORT_ID\",\"category\":\"engine\",\"item_name\":\"Belts & Hoses\",\"assessment\":\"bad\",\"notes\":\"Starboard raw water hose replaced\",\"sort_order\":9},
  {\"report_id\":\"$REPORT_ID\",\"category\":\"electrical\",\"item_name\":\"Battery Voltage\",\"assessment\":\"good\",\"notes\":\"12.8V both banks\",\"sort_order\":10},
  {\"report_id\":\"$REPORT_ID\",\"category\":\"electrical\",\"item_name\":\"Battery Connections\",\"assessment\":\"good\",\"notes\":\"Clean and tight\",\"sort_order\":11},
  {\"report_id\":\"$REPORT_ID\",\"category\":\"electrical\",\"item_name\":\"Navigation Lights\",\"assessment\":\"good\",\"notes\":null,\"sort_order\":12},
  {\"report_id\":\"$REPORT_ID\",\"category\":\"electrical\",\"item_name\":\"Bilge Pump\",\"assessment\":\"good\",\"notes\":\"Auto and manual tested\",\"sort_order\":13},
  {\"report_id\":\"$REPORT_ID\",\"category\":\"hull\",\"item_name\":\"Hull Integrity\",\"assessment\":\"good\",\"notes\":\"No structural issues\",\"sort_order\":14},
  {\"report_id\":\"$REPORT_ID\",\"category\":\"hull\",\"item_name\":\"Gel Coat Finish\",\"assessment\":\"bad\",\"notes\":\"Minor damage on port bow\",\"sort_order\":15},
  {\"report_id\":\"$REPORT_ID\",\"category\":\"hull\",\"item_name\":\"Zinc Anodes\",\"assessment\":\"good\",\"notes\":\"All replaced\",\"sort_order\":16},
  {\"report_id\":\"$REPORT_ID\",\"category\":\"hull\",\"item_name\":\"Through-Hull Fittings\",\"assessment\":\"good\",\"notes\":null,\"sort_order\":17},
  {\"report_id\":\"$REPORT_ID\",\"category\":\"safety\",\"item_name\":\"Life Jackets\",\"assessment\":\"good\",\"notes\":\"6 on board\",\"sort_order\":18},
  {\"report_id\":\"$REPORT_ID\",\"category\":\"safety\",\"item_name\":\"Fire Extinguisher\",\"assessment\":\"good\",\"notes\":\"Charged and current\",\"sort_order\":19}
]")
echo "$ITEMS"

echo ""
echo "=== SEED COMPLETE ==="
