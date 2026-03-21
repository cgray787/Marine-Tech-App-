# Marine Tech App

## Project Overview

Field service app for marine technicians to document boat service jobs and pre-delivery inspections. Structured checklists with BAD/GOOD assessments, photo capture (HIN plates, engine hours, damage), and report submission. Admin web dashboard for reviewing reports, assigning jobs, and managing technicians.

## Architecture

Two codebases, one Supabase backend:

- **Mobile App** (`/mobile`) — React Native + Expo (technician-facing, iOS + Android)
- **Admin Dashboard** (root `/`) — Next.js 16 web app (owner-facing, deployed to Cloudflare Workers)
- **Backend** — Supabase (auth, Postgres database, file storage, push notifications)

## Tech Stack

### Mobile App
- **Framework:** React Native with Expo SDK 55
- **Navigation:** Expo Router (file-based, 3-tab layout)
- **Camera:** expo-camera + expo-image-picker
- **Auth Storage:** expo-secure-store
- **Offline:** expo-sqlite (planned)
- **Notifications:** expo-notifications (planned)

### Admin Dashboard
- **Framework:** Next.js 16 (App Router) with TypeScript
- **Styling:** Tailwind CSS v4
- **Deployment:** Cloudflare Workers via OpenNext

## Design Scheme

- **Primary BG:** `#060a12`
- **Secondary BG:** `#0c1220`
- **Card BG:** `#111827`
- **Gold Accent:** `#C9A96E` (hover: `#d4b87e`, muted: `rgba(201,169,110,0.15)`)
- **Borders:** `#1e293b`
- **Text Primary:** `#f1f5f9`
- **Text Secondary:** `#8892A5`
- **Status — Good:** `#22c55e` (green)
- **Status — Bad:** `#ef4444` (red)
- **Status — New:** `#3b82f6` (blue)
- **Status — In Progress:** `#f59e0b` (amber)
- **Status — Complete:** `#22c55e` (green)

## Commands

```bash
# Mobile App (from /mobile)
npm start              # Start Expo dev server
npm run ios            # Run on iOS simulator
npm run android        # Run on Android emulator
npx eas build --platform ios     # Build for TestFlight
npx eas build --platform android # Build APK

# Admin Dashboard (from root /)
npm run dev            # Start Next.js dev server
npx opennextjs-cloudflare build && npx wrangler deploy  # Deploy to CF Workers

# Type check
npx tsc --noEmit
```

## GitHub Repo

https://github.com/cgray787/Marine-Tech-App-.git

## Supabase

- **Project:** Marine Tech App
- **Project ID:** `jwedhavnxqwkczefjifs`
- **URL:** `https://jwedhavnxqwkczefjifs.supabase.co`
- **Region:** West US (Oregon)
- **Admin email:** connorgray41@gmail.com
- **Env vars:** `.env.local` (gitignored)

## Database Schema

**Tables:**
- `profiles` — User accounts (role: admin/tech, invite-based registration)
- `customers` — Boat owner contacts
- `boats` — Vessels linked to customers (name, make/model, year, HIN, engine, color)
- `marinas` — Marina locations
- `jobs` — Assigned work orders (status: new/in_progress/completed)
- `service_reports` — Completed service report data (vessel snapshot, engine data, work description)
- `checklist_items` — Individual BAD/GOOD assessments per report (category: engine/electrical/hull/safety/nav)
- `report_photos` — Photos attached to reports (category: hin_plate/engine_hours/before/after/damage)
- `pdi_reports` — Pre-Delivery Inspection reports
- `pdi_checklist_items` — PDI checklist assessments
- `invites` — Tech invite tokens (7-day expiry)
- `notifications` — Push notification records

## Project Structure

```
marine-tech-app/
├── mobile/                    # React Native + Expo (technician app)
│   ├── app/
│   │   ├── _layout.tsx        # Root layout (AuthProvider, StatusBar)
│   │   ├── login/index.tsx    # Login screen
│   │   ├── job/[id].tsx       # Job detail / summary
│   │   └── (tabs)/
│   │       ├── _layout.tsx    # 3-tab layout (My Jobs, Service, PDI)
│   │       ├── index.tsx      # My Jobs — job list with status badges
│   │       ├── service.tsx    # Service form — checklist + vessel info
│   │       └── pdi.tsx        # Pre-Delivery Inspection form
│   ├── lib/
│   │   ├── supabase.ts        # Supabase client (SecureStore auth)
│   │   └── auth-context.tsx   # Auth context provider
│   └── constants/
│       └── Colors.ts          # Design scheme colors
├── app/                       # Next.js Admin Dashboard (planned)
├── docs/superpowers/specs/    # Design specifications
└── CLAUDE.md                  # This file
```

## Mobile App Screens

1. **Login** — Email/password, gold anchor icon, "MARINE TECH" branding
2. **My Jobs** (Tab 1) — Job cards with status badges (New/In Progress/Complete), pull-to-refresh
3. **Service** (Tab 2) — New job form with customer/boat dropdowns, category tabs (Engine/Electrical/Hull/Safety/Nav), BAD/GOOD checklist, general notes
4. **PDI** (Tab 3) — Pre-Delivery Inspection with progress counter, same checklist pattern, "items need attention" warning
5. **Job Summary** — Read-only report view, photo gallery, Export PDF + Share buttons

## Checklist Categories & Items

**Engine:** Oil Pressure, Oil Level, Coolant Level, Fuel System, Exhaust System, Throttle Response, Steering System, Propeller Condition, Trim & Tilt, Belts & Hoses

**Electrical:** Battery Voltage, Battery Connections, Navigation Lights, Bilge Pump, Horn, Gauges & Instruments, Switch Panel, Shore Power

**Hull:** Hull Integrity, Gel Coat Finish, Zinc Anodes, Through-Hull Fittings, Rub Rail & Hardware

**Safety:** Life Jackets, Fire Extinguisher, Flares & Signals, First Aid Kit, Anchor & Line

**Nav:** GPS / Chartplotter, Depth Finder, VHF Radio, Compass

## Authentication Flow

1. Admin creates tech account via invite (sends email with token)
2. Tech opens invite link → sets password → account activated
3. Tech signs in with email/password on mobile app
4. Session persisted in SecureStore (survives app restarts)
5. Auth state managed via React Context (AuthProvider)
6. Unauthenticated users redirected to login screen

## Related Projects

- **grayyachts.com** — Yacht management platform (`/Users/connorgray/Desktop/grayyachts.com`)
- **grayyachts.media** — Media production site (`/Users/connorgray/Desktop/grayyachts.media`)
