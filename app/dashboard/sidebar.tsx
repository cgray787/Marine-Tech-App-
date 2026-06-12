"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

import { isOwner } from "@/lib/owner";

type Profile = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  avatar_url: string | null;
  auth_id?: string | null;
};

type SidebarProps = {
  profile: Profile;
  pendingJobCount?: number;
};

interface NavItem {
  label: string;
  href: string;
  icon: string;
  ownerOnly?: boolean;
}

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: "grid" },
  { label: "Reports", href: "/dashboard/reports", icon: "file-text" },
  { label: "Jobs", href: "/dashboard/jobs", icon: "briefcase" },
  { label: "Work Orders", href: "/dashboard/work-orders", icon: "wrench" },
  { label: "Calendar", href: "/dashboard/calendar", icon: "calendar" },
  // Users & Access page — hidden from everyone except the operator (Connor).
  // Admins like Darik still manage data everywhere else; they just can't see
  // or change role assignments here.
  { label: "Technicians", href: "/dashboard/technicians", icon: "users", ownerOnly: true },
  { label: "Clients", href: "/dashboard/customers", icon: "anchor" },
  { label: "PDI Reports", href: "/dashboard/pdi-reports", icon: "clipboard" },
];

function NavIcon({ icon }: { icon: string }) {
  switch (icon) {
    case "grid":
      return (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
        </svg>
      );
    case "file-text":
      return (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      );
    case "briefcase":
      return (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.073c0 1.078-.882 1.952-1.969 1.952H5.719c-1.087 0-1.969-.874-1.969-1.952V14.15M12 12.75V21m0-8.25c-3.314 0-6-1.343-6-3V6.375c0-1.036.844-1.875 1.875-1.875h8.25c1.036 0 1.875.84 1.875 1.875V9.75c0 1.657-2.686 3-6 3z" />
        </svg>
      );
    case "calendar":
      return (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
        </svg>
      );
    case "users":
      return (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
        </svg>
      );
    case "anchor":
      return (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 2a3 3 0 100 6 3 3 0 000-6zM12 8v13M5 12H2a10 10 0 0020 0h-3" />
        </svg>
      );
    case "clipboard":
      return (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      );
    case "wrench":
      return (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085" />
        </svg>
      );
    default:
      return null;
  }
}

export function Sidebar({ profile, pendingJobCount = 0 }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex w-64 flex-col border-r border-border-line bg-secondary-bg">
      {/* Logo */}
      <div className="flex items-center gap-3 border-b border-border-line px-6 py-5">
        <span className="anchor-bob text-2xl text-gold">&#9875;</span>
        <div>
          <h1 className="text-lg font-bold tracking-wider text-text-primary">
            MARINE TECH
          </h1>
          <p className="text-[10px] uppercase tracking-widest text-text-secondary">
            Admin Portal
          </p>
        </div>
      </div>

      {/* Navigation — ownerOnly entries get filtered out for non-owner users. */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.filter((item) => !item.ownerOnly || isOwner(profile)).map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);

          const showPendingBadge =
            item.href === "/dashboard/jobs" && pendingJobCount > 0;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-gold-muted text-gold"
                  : "text-text-secondary hover:bg-white/5 hover:text-text-primary"
              )}
            >
              <NavIcon icon={item.icon} />
              <span className="flex-1">{item.label}</span>
              {showPendingBadge && (
                <span className="inline-flex items-center justify-center rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold leading-none text-amber-300">
                  {pendingJobCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User info */}
      <div className="border-t border-border-line p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gold/20 text-sm font-semibold text-gold">
            {profile.full_name
              ?.split(" ")
              .map((n: string) => n[0])
              .join("")
              .toUpperCase() || "A"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium text-text-primary">
              {profile.full_name}
            </p>
            <p className="truncate text-xs text-text-secondary">
              {profile.email}
            </p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="mt-3 w-full rounded-lg border border-border-line px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:border-red-500/30 hover:text-red-400"
        >
          Sign Out
        </button>
      </div>
    </aside>
  );
}
