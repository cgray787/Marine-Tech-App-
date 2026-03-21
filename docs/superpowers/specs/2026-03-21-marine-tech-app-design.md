# Marine Tech App — Design Specification

## Overview

A mobile field service app for marine technicians to document boat service jobs and pre-delivery inspections. Technicians fill out structured checklists with BAD/GOOD assessments, capture photos (HIN plates, engine hours, damage), and submit reports. An admin web dashboard lets the owner (Connor Gray) review reports, assign jobs, and manage technicians.

**Two codebases:**
- **Mobile App** — React Native + Expo (technician-facing, iOS + Android)
- **Admin Dashboard** — Next.js web app (owner-facing, deployed to Cloudflare Workers)
- **Shared Backend** — Supabase (auth, Postgres database, file storage, push notifications)

## Tech Stack

### Mobile App
- **Framework:** React Native with Expo SDK 52+
- **Navigation:** Expo Router (file-based routing)
- **UI:** React Native StyleSheet (dark navy theme matching designs)
- **Camera:** expo-camera + expo-image-picker
- **Offline:** expo-sqlite for local queue + Supabase sync on reconnect
- **Notifications:** expo-notifications + Supabase Edge Functions
- **Signature:** react-native-signature-canvas
- **Distribution:** EAS Build → TestFlight (iOS) + APK/Play Store (Android)

### Admin Dashboard
- **Framework:** Next.js 16 (App Router) — existing project at `/Users/connorgray/Desktop/marine-tech-app`
- **Styling:** Tailwind CSS v4
- **Deployment:** Cloudflare Workers via OpenNext
- **PDF Export:** @react-pdf/renderer or html-to-pdf for report generation

### Backend (Supabase)
- **Auth:** Email/password with invite-based registration
- **Database:** PostgreSQL with RLS
- **Storage:** Buckets for photos and signatures
- **Edge Functions:** Push notification delivery
- **Realtime:** Live job status updates on admin dashboard

## Design Scheme

All values derived from user's Pencil screenshots:

- **Background:** `#060a12` (primary), `#0c1220` (cards/inputs), `#111827` (elevated surfaces)
- **Gold Accent:** `#C9A96E` (buttons, active tabs, highlights)
- **Borders:** `#1e293b`
- **Text:** `#f1f5f9` (primary), `#8892A5` (secondary/muted)
- **Status — Good:** `#22c55e` (green badge)
- **Status — Bad:** `#ef4444` (red badge)
- **Status — New:** `#3b82f6` (blue badge)
- **Status — In Progress:** `#f59e0b` (amber badge)
- **Fonts:** Sans-serif body, serif heading for "MARINE TECH" branding

## Mobile App Screens

### 1. Login

- Gold anchor icon centered in rounded square container
- "MARINE TECH" in serif font, "Service Management" subtitle below
- Email field (dark input, rounded, placeholder "you@company.com")
- Password field (dark input, rounded, placeholder "Enter password")
- Full-width gold "Sign In" button
- "Forgot Password?" link in gold below
- No self-signup — accounts created by admin via invite

### 2. My Jobs (Tab 1: Home)

**Header:**
- "My Jobs" title (large, bold) with current date below (e.g. "Thursday, March 20")
- "+ New Job" button (gold outlined, top right)
- Notification bell icon with red dot for unread

**Job Cards (scrollable list):**
Each card displays:
- Boat name (bold, left) + status badge (right): New (blue), In Progress (amber), Complete (green)
- Owner name (with person icon)
- Make/Model + Year (with boat icon + calendar icon)
- Service types comma-separated (with wrench icon)
- Marina, slip/dock + scheduled date (with location pin icon)

Tapping a card opens:
- If status is New/In Progress → opens the Service form for that job
- If status is Complete → opens the Job Summary (read-only)

### 3. Service Form (Tab 2: Service)

Accessed by tapping "+ New Job" or tapping an assigned job card.

**Top Section — Customer & Vessel:**
- Customer Name (dropdown — pre-loaded from customer database)
- Boat Name (dropdown — filtered by selected customer)
- Make / Model (dropdown — auto-fills from boat record)
- Year (dropdown — auto-fills from boat record)
- Hull ID / HIN (text input + camera button to photograph HIN plate)
- Location / Marina (dropdown — pre-loaded marina list)

**Category Tabs (horizontal scroll):**
- Engine (gold when active, dark when inactive)
- Electrical
- Hull
- Safety
- Nav

Each tab reveals its section of the checklist. All sections scroll vertically within the active tab.

**Inspection Checklist Items:**

Every item follows this pattern:
```
[Item Name] [📷] [💬] [BAD] [GOOD]
```
- **Item name** — text label (e.g. "Oil Pressure")
- **Camera icon** — tap to capture a photo tagged to this specific item
- **Comment icon** — tap to add a text note for this item
- **BAD button** — red when selected, gray when not
- **GOOD button** — green when selected, gray when not
- When **BAD** is selected, a text input appears below the row for required notes (e.g. "Low coolant — needs top-up")

**Section header** has a checkbox to mark the entire section as reviewed/complete.

**Engine Systems checklist:**
- Oil Pressure
- Oil Level
- Coolant Level
- Fuel System
- Exhaust System
- Throttle Response
- Steering System
- Propeller Condition
- Trim & Tilt
- Belts & Hoses

**Electrical Systems checklist:**
- Battery Voltage
- Battery Connections
- Navigation Lights
- Bilge Pump
- Horn
- Gauges & Instruments
- Switch Panel
- Shore Power

**Hull & Exterior checklist:**
- Hull Integrity
- Gel Coat Finish
- Zinc Anodes
- Through-Hull Fittings
- Rub Rail & Hardware

**Safety Equipment checklist:**
- Life Jackets
- Fire Extinguisher
- Flares & Signals
- First Aid Kit
- Anchor & Line

**Navigation & Electronics checklist:**
- GPS / Chartplotter
- Depth Finder
- VHF Radio
- Compass

**Bottom of form:**
- General Notes (large text area — "Additional notes or observations...")
- "Create Job" button (full-width, gold)

### 4. Pre-Delivery Inspection — PDI (Tab 3)

Separate workflow for new boat deliveries. Same checklist UI pattern as Service but:

**Header:**
- "Pre-Delivery Inspection" title
- Progress counter: "0 / 34" (completed items out of total)
- Back arrow for navigation

**Vessel Info Bar:**
- Boat name + year + make/model inline (e.g. "Sea Breeze IV — 2024 Boston Whaler 280")
- Owner name below
- Color tag badge (e.g. "Navy Blue")

**Same category tabs and checklist as Service form** (Engine, Electrical, Hull, Safety, Nav)

**Bottom:**
- General Notes text area
- "Submit PDI Report" button (full-width, gold)
- Warning text when BAD items exist: "2 items need attention" in red

### 5. Job Summary (Read-Only)

Displayed after a job is completed or when reviewing submitted reports.

**Header:** "Job Summary" + status badge (Approved/green)

**Vessel Info Card** (gold left-border accent):
- Boat Name, Owner, Make/Model, Year, HIN, Marina — label/value pairs

**Systems Card** (gold left-border accent):
- Engine make/model, Engine Hours (e.g. "1,250 hrs"), Oil Condition, Fuel System, Battery Voltage, Bilge Pump
- Values color-coded: Good (green), Bad (red), numeric values in white

**Service Section** (gold left-border accent):
- Service type chips/tags (e.g. "Oil Change", "Filter Replacement")
- Work Description (free text block)
- Parts Used (itemized list with quantities)

**Photos Section** (gold left-border accent):
- Horizontal scrolling gallery of captured photos with category labels

**Action Buttons:**
- "Export PDF" — full-width gold button
- "Share" — full-width gold outlined button

### 6. Bottom Tab Bar

Three tabs, always visible:
1. **My Jobs** — building/home icon (gold when active)
2. **Service** — wrench icon
3. **PDI** — clipboard/checklist icon

## Admin Dashboard Screens (Web)

### 1. Login
- Same style as mobile but web-formatted
- Email/password, "MARINE TECH" branding

### 2. Dashboard Home
- Summary stats: Total jobs this week, Pending reviews, Active techs, Open PDIs
- Recent submissions feed
- Quick actions: Assign Job, Invite Tech, View Reports

### 3. All Reports
- Filterable table: date, tech name, boat, service type, status
- Click to open full report detail (same data as mobile Job Summary)
- Status workflow: Submitted → Reviewed → Approved
- Bulk actions: approve, request correction

### 4. Assign Jobs
- Create new job: select customer, boat, tech, service types, scheduled date, marina
- Calendar view of upcoming jobs
- Drag-and-drop job reassignment

### 5. Manage Technicians
- List of techs: name, email, status (active/invited/disabled), jobs completed
- Invite new tech: enter email → sends invite link
- Approve/disable accounts

### 6. Customers & Boats
- Customer list: name, email, phone, boats owned
- Boat records: name, make/model, year, HIN, marina, service history
- Add/edit customers and boats (pre-loads dropdowns in mobile app)

### 7. PDI Reports
- Separate view for pre-delivery inspections
- Filter by boat, date, tech
- Progress indicators (items passed vs flagged)

## Database Schema

### profiles
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
auth_id         uuid REFERENCES auth.users(id)
email           text NOT NULL UNIQUE
full_name       text NOT NULL
phone           text
role            text NOT NULL CHECK (role IN ('admin', 'tech'))
avatar_url      text
status          text DEFAULT 'active' CHECK (status IN ('active', 'invited', 'disabled'))
invited_by      uuid REFERENCES profiles(id)
push_token      text  -- expo push notification token
created_at      timestamptz DEFAULT now()
```

### customers
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
name            text NOT NULL
email           text
phone           text
address         text
notes           text
created_by      uuid REFERENCES profiles(id)
created_at      timestamptz DEFAULT now()
```

### boats
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
customer_id     uuid REFERENCES customers(id) ON DELETE CASCADE
name            text NOT NULL
make_model      text
year            integer
hin             text
engine_make     text
engine_model    text
color           text
home_marina     text
created_at      timestamptz DEFAULT now()
```

### marinas
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
name            text NOT NULL
address         text
city            text
state           text
created_at      timestamptz DEFAULT now()
```

### jobs
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
assigned_to     uuid REFERENCES profiles(id)
customer_id     uuid REFERENCES customers(id)
boat_id         uuid REFERENCES boats(id)
marina_id       uuid REFERENCES marinas(id)
service_types   text[]  -- array: ['Oil Change', 'Filter Replacement', ...]
scheduled_date  date
status          text DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'completed'))
notes           text
created_by      uuid REFERENCES profiles(id)
created_at      timestamptz DEFAULT now()
updated_at      timestamptz DEFAULT now()
```

### service_reports
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
job_id          uuid REFERENCES jobs(id)
tech_id         uuid REFERENCES profiles(id)
boat_id         uuid REFERENCES boats(id)
customer_id     uuid REFERENCES customers(id)

-- vessel info (snapshot at time of report)
boat_name       text
owner_name      text
make_model      text
year            integer
hin             text
marina          text

-- engine & systems
engine_make_model   text
engine_hours        numeric
battery_voltage     numeric

-- work performed
service_types       text[]
work_description    text
parts_used          text

-- general
concerns            text
general_notes       text
signature_url       text

-- status
status          text DEFAULT 'submitted' CHECK (status IN ('submitted', 'reviewed', 'approved', 'correction_needed'))
submitted_at    timestamptz DEFAULT now()
reviewed_at     timestamptz
reviewed_by     uuid REFERENCES profiles(id)
```

### checklist_items
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
report_id       uuid REFERENCES service_reports(id) ON DELETE CASCADE
category        text NOT NULL  -- 'engine', 'electrical', 'hull', 'safety', 'nav'
item_name       text NOT NULL  -- 'Oil Pressure', 'Battery Voltage', etc.
assessment      text CHECK (assessment IN ('good', 'bad', null))
notes           text           -- required when assessment = 'bad'
photo_url       text           -- photo specific to this item
sort_order      integer
```

### report_photos
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
report_id       uuid REFERENCES service_reports(id) ON DELETE CASCADE
photo_url       text NOT NULL
category        text  -- 'hin_plate', 'engine_hours', 'before', 'after', 'damage', 'other'
caption         text
item_id         uuid REFERENCES checklist_items(id)  -- links photo to specific checklist item
created_at      timestamptz DEFAULT now()
```

### pdi_reports
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
tech_id         uuid REFERENCES profiles(id)
boat_id         uuid REFERENCES boats(id)
customer_id     uuid REFERENCES customers(id)
boat_name       text
owner_name      text
make_model      text
year            integer
hin             text
color           text
marina          text
total_items     integer DEFAULT 0
completed_items integer DEFAULT 0
flagged_items   integer DEFAULT 0
general_notes   text
status          text DEFAULT 'submitted' CHECK (status IN ('submitted', 'reviewed', 'approved'))
submitted_at    timestamptz DEFAULT now()
```

### pdi_checklist_items
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
pdi_report_id   uuid REFERENCES pdi_reports(id) ON DELETE CASCADE
category        text NOT NULL
item_name       text NOT NULL
assessment      text CHECK (assessment IN ('good', 'bad', null))
notes           text
photo_url       text
sort_order      integer
```

### invites
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
email           text NOT NULL
invited_by      uuid REFERENCES profiles(id)
token           text NOT NULL UNIQUE
used            boolean DEFAULT false
created_at      timestamptz DEFAULT now()
expires_at      timestamptz DEFAULT (now() + interval '7 days')
```

### notifications
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
user_id         uuid REFERENCES profiles(id)
title           text NOT NULL
body            text
type            text NOT NULL  -- 'job_assigned', 'report_reviewed', 'correction_needed', 'pdi_assigned'
read            boolean DEFAULT false
data_json       jsonb  -- additional context (job_id, report_id, etc.)
created_at      timestamptz DEFAULT now()
```

## Supabase Storage Buckets

- **report-photos** — service report photos (public read, authenticated upload)
- **pdi-photos** — PDI report photos
- **signatures** — signature pad captures
- **hin-plates** — HIN plate photographs

## Offline Strategy

### Local Storage (expo-sqlite)
- Cache assigned jobs list for offline viewing
- Store in-progress form data (auto-save on every field change)
- Queue completed reports with photos for sync

### Sync Flow
1. Tech fills out form + takes photos → saved to local SQLite + local file system
2. App checks connectivity periodically
3. When online: upload queued photos to Supabase Storage → insert report rows → mark synced
4. Conflict resolution: server timestamp wins, but local drafts are never deleted until confirmed synced
5. Pull new job assignments on each sync

## Push Notifications

### Triggers (via Supabase Edge Functions)
- **Tech receives:** Job assigned, report approved, correction requested
- **Admin receives:** Report submitted, new tech signup

### Implementation
- Expo Push Notifications (expo-notifications)
- Store push tokens in `profiles.push_token`
- Supabase Edge Function calls Expo Push API on database triggers

## Build & Distribution

### Mobile App (Expo EAS)
```bash
# Install EAS CLI
npm install -g eas-cli

# Configure
eas init
eas build:configure

# Build for iOS (creates .ipa → uploads to TestFlight)
eas build --platform ios --profile production
eas submit --platform ios

# Build for Android (creates .apk or .aab)
eas build --platform android --profile production
eas submit --platform android  # Play Store
# OR share APK directly with techs

# Development builds for testing
eas build --platform ios --profile development
```

### Admin Dashboard (Cloudflare Workers)
```bash
npx opennextjs-cloudflare build
npx wrangler deploy
```

## Step-by-Step Build Order

### Phase 1: Foundation
1. Create new Expo project for mobile app
2. Set up Supabase project (or new schema in existing project)
3. Run all database migrations (tables, RLS policies, storage buckets)
4. Configure Supabase auth with email/password
5. Set up Expo Router with 3-tab layout

### Phase 2: Mobile Core
6. Build Login screen
7. Build My Jobs tab (job list with status badges)
8. Build Service form — vessel info section with customer/boat dropdowns
9. Build Service form — category tabs + checklist UI (BAD/GOOD toggles)
10. Build inline camera capture per checklist item
11. Build inline comment/notes per checklist item
12. Build General Notes + Create Job submission
13. Connect form submission to Supabase (insert report + checklist items + upload photos)

### Phase 3: PDI
14. Build PDI tab — same checklist UI, different header with progress counter
15. Build PDI submission flow with "items need attention" warning
16. PDI-specific database writes

### Phase 4: Job Summary
17. Build read-only Job Summary screen
18. Build photo gallery view
19. Build Export PDF functionality
20. Build Share functionality

### Phase 5: Offline + Notifications
21. Implement expo-sqlite local storage + auto-save
22. Build sync queue for offline submissions
23. Set up Expo Push Notifications
24. Create Supabase Edge Functions for notification triggers

### Phase 6: Admin Dashboard
25. Build admin login + auth guard
26. Build dashboard home with stats
27. Build reports list + detail view
28. Build job assignment UI
29. Build tech management + invite flow
30. Build customers & boats management
31. Build PDI reports view
32. Deploy to Cloudflare Workers

### Phase 7: Distribution
33. Configure EAS Build profiles
34. Build iOS → submit to TestFlight → invite techs
35. Build Android → generate APK → share with techs
36. Set up OTA updates via EAS Update for future changes
