import { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  TextInput,
} from "react-native";
import { router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { colors } from "@/constants/Colors";
import { ScheduleSheet, ScheduleSheetHandle } from "@/components/ScheduleSheet";

type JobRow = {
  id: string;
  status: string;
  service_types: string[] | null;
  scheduled_date: string | null;
  scheduled_start: string | null;
  created_at: string | null;
  customers: { name: string } | null;
  boats: { name: string; make_model: string | null } | null;
  marinas: { name: string } | null;
};

const STATUS_COLORS: Record<string, string> = {
  new: colors.statusNew,
  in_progress: colors.statusInProgress,
  completed: colors.statusComplete,
};

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  in_progress: "In Progress",
  completed: "Complete",
};

function formatDate(dateStr: string | null) {
  if (!dateStr) return "";
  const d = new Date(dateStr.includes("T") ? dateStr : dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

export default function JobsScreen() {
  const { profile } = useAuth();
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "new" | "in_progress" | "completed">(
    "all"
  );

  const scheduleSheetRef = useRef<ScheduleSheetHandle>(null);

  const fetchJobs = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase
      .from("jobs")
      .select(
        "id, status, service_types, scheduled_date, scheduled_start, created_at, customers(name), boats(name, make_model), marinas(name)"
      )
      .order("created_at", { ascending: false });
    if (data) setJobs(data as unknown as JobRow[]);
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      fetchJobs();
    }, [fetchJobs])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchJobs();
    setRefreshing(false);
  }, [fetchJobs]);

  async function updateStatus(id: string, newStatus: string) {
    const { error } = await supabase
      .from("jobs")
      .update({ status: newStatus })
      .eq("id", id);
    if (error) {
      Alert.alert("Error", error.message);
    } else {
      fetchJobs();
    }
  }

  function cycleStatus(id: string, current: string) {
    Alert.alert(
      "Change Status",
      "Set status for this job:",
      [
        { text: "New", onPress: () => updateStatus(id, "new") },
        { text: "In Progress", onPress: () => updateStatus(id, "in_progress") },
        { text: "Completed", onPress: () => updateStatus(id, "completed") },
        { text: "Cancel", style: "cancel" },
      ],
      { cancelable: true }
    );
  }

  const byStatus = filter === "all" ? jobs : jobs.filter((j) => j.status === filter);
  const filtered = byStatus.filter((j) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase().trim();
    const customer = j.customers?.name?.toLowerCase() || "";
    const boat = j.boats?.name?.toLowerCase() || "";
    const makeModel = j.boats?.make_model?.toLowerCase() || "";
    const marina = j.marinas?.name?.toLowerCase() || "";
    const types = (j.service_types || []).join(" ").toLowerCase();
    return (
      customer.includes(q) ||
      boat.includes(q) ||
      makeModel.includes(q) ||
      marina.includes(q) ||
      types.includes(q)
    );
  });
  const counts = {
    all: jobs.length,
    new: jobs.filter((j) => j.status === "new").length,
    in_progress: jobs.filter((j) => j.status === "in_progress").length,
    completed: jobs.filter((j) => j.status === "completed").length,
  };

  // Group filtered jobs by customer for the SectionList accordion.
  const sections = useMemo(() => {
    const byCust = new Map<
      string,
      { title: string; customerId: string; allJobs: JobRow[] }
    >();
    for (const j of filtered) {
      const cid = j.customers?.name ? j.customers.name : "__no_customer__";
      const title = j.customers?.name || "No customer";
      if (!byCust.has(cid)) {
        byCust.set(cid, { title, customerId: cid, allJobs: [] });
      }
      byCust.get(cid)!.allJobs.push(j);
    }
    // Sort each customer's jobs: scheduled first by start time, then unscheduled by created
    for (const sec of byCust.values()) {
      sec.allJobs.sort((a, b) => {
        if (a.scheduled_start && b.scheduled_start) {
          return a.scheduled_start.localeCompare(b.scheduled_start);
        }
        if (a.scheduled_start) return -1;
        if (b.scheduled_start) return 1;
        return 0;
      });
    }
    // SectionList needs `data` per section
    return Array.from(byCust.values()).map((sec) => ({
      ...sec,
      data: sec.allJobs,
    }));
  }, [filtered]);

  // Expand the first customer by default
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const expandedInitialized = useRef(false);
  if (!expandedInitialized.current && sections.length > 0) {
    expanded.add(sections[0].customerId);
    expandedInitialized.current = true;
  }
  const toggleCustomer = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Jobs</Text>
        <Text style={styles.subtitle}>
          {filtered.length} {filter === "all" ? "total" : STATUS_LABELS[filter]?.toLowerCase()}
        </Text>
      </View>

      {/* Search bar */}
      <View style={styles.searchWrapper}>
        <Text style={styles.searchIcon}>{"\uD83D\uDD0D"}</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by client, boat, marina..."
          placeholderTextColor={colors.textSecondary}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch("")} style={styles.searchClear}>
            <Text style={styles.searchClearText}>×</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Filter pills */}
      <View style={styles.filterRow}>
        {(["all", "new", "in_progress", "completed"] as const).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterPill, filter === f && styles.filterPillActive]}
            onPress={() => setFilter(f)}
          >
            <Text
              style={[
                styles.filterPillText,
                filter === f && styles.filterPillTextActive,
              ]}
            >
              {f === "all" ? "All" : STATUS_LABELS[f]} ({counts[f]})
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.gold}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {filter === "all"
                ? "No jobs yet."
                : `No ${STATUS_LABELS[filter]?.toLowerCase()} jobs.`}
            </Text>
            <Text style={styles.emptyHint}>
              Go to the Service tab to create one.
            </Text>
          </View>
        }
        renderSectionHeader={({ section }) => {
          const isOpen = expanded.has(section.customerId);
          const scheduledCount = section.allJobs.filter((j) => j.scheduled_start).length;
          const unscheduledCount = section.allJobs.length - scheduledCount;
          return (
            <TouchableOpacity
              style={styles.customerHeader}
              onPress={() => toggleCustomer(section.customerId)}
              activeOpacity={0.7}
            >
              <View style={styles.customerHeaderLeft}>
                <Text style={styles.chevron}>{isOpen ? "▾" : "▸"}</Text>
                <Text style={styles.customerHeaderName} numberOfLines={1}>
                  {section.title}
                </Text>
                <Text style={styles.customerHeaderCount}>
                  ({section.allJobs.length})
                </Text>
              </View>
              <View style={styles.customerHeaderBadges}>
                {scheduledCount > 0 && (
                  <View style={[styles.headerBadge, styles.headerBadgeScheduled]}>
                    <Text style={styles.headerBadgeTextScheduled}>
                      {scheduledCount} on cal
                    </Text>
                  </View>
                )}
                {unscheduledCount > 0 && (
                  <View style={[styles.headerBadge, styles.headerBadgeUnscheduled]}>
                    <Text style={styles.headerBadgeTextUnscheduled}>
                      {unscheduledCount} unsched
                    </Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        }}
        renderItem={({ item, section }) => {
          if (!expanded.has(section.customerId)) return null;
          const scheduled = !!item.scheduled_start;
          return (
            <TouchableOpacity
              style={styles.jobRow}
              onPress={() => router.push(`/job/${item.id}` as never)}
              onLongPress={() =>
                scheduleSheetRef.current?.present({
                  id: item.id,
                  customerName: item.customers?.name || "Unknown client",
                  boatName: item.boats?.name || null,
                  currentScheduledStart: item.scheduled_start,
                })
              }
              delayLongPress={350}
            >
              <View
                style={[
                  styles.jobRowSideTab,
                  {
                    backgroundColor: scheduled
                      ? STATUS_COLORS[item.status] || colors.gold
                      : colors.border,
                  },
                ]}
              />
              <View style={styles.jobRowBody}>
                <View style={styles.jobRowTopLine}>
                  <Text style={styles.jobRowDate}>
                    {scheduled
                      ? formatDateTime(item.scheduled_start!)
                      : "Unscheduled"}
                  </Text>
                  <View
                    style={[
                      styles.miniBadge,
                      scheduled ? styles.miniBadgeScheduled : styles.miniBadgeUnscheduled,
                    ]}
                  >
                    <Text
                      style={[
                        styles.miniBadgeText,
                        scheduled
                          ? styles.miniBadgeTextScheduled
                          : styles.miniBadgeTextUnscheduled,
                      ]}
                    >
                      {scheduled ? "On cal" : "Schedule"}
                    </Text>
                  </View>
                </View>
                <Text style={styles.jobRowBoat} numberOfLines={1}>
                  {item.boats?.name || "No boat"}
                  {item.boats?.make_model ? ` · ${item.boats.make_model}` : ""}
                </Text>
                {item.service_types && item.service_types.length > 0 && (
                  <Text style={styles.jobRowMeta} numberOfLines={1}>
                    🔧 {item.service_types.join(", ")}
                  </Text>
                )}
                <View style={styles.jobRowFooter}>
                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation();
                      cycleStatus(item.id, item.status);
                    }}
                    style={[
                      styles.statusButton,
                      {
                        backgroundColor: STATUS_COLORS[item.status] + "20",
                        borderColor: STATUS_COLORS[item.status],
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusButtonText,
                        { color: STATUS_COLORS[item.status] },
                      ]}
                    >
                      {STATUS_LABELS[item.status] || item.status}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />

      <ScheduleSheet ref={scheduleSheetRef} onScheduled={fetchJobs} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  header: {
    paddingTop: 20,
    paddingBottom: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { fontSize: 24, fontWeight: "700", color: colors.textPrimary },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexWrap: "wrap",
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterPillActive: {
    backgroundColor: colors.gold + "20",
    borderColor: colors.gold,
  },
  filterPillText: { fontSize: 12, color: colors.textSecondary, fontWeight: "600" },
  filterPillTextActive: { color: colors.gold },
  listContent: { padding: 16, gap: 12 },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  customerName: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  statusText: { fontSize: 11, fontWeight: "700" },
  boatName: { fontSize: 14, color: colors.gold, marginBottom: 4 },
  meta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  dateText: { fontSize: 12, color: colors.textSecondary },
  statusButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusButtonText: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  searchWrapper: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    marginTop: 12,
    paddingHorizontal: 12,
    backgroundColor: colors.bgCard,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: 14,
  },
  searchClear: {
    paddingHorizontal: 8,
  },
  searchClearText: {
    color: colors.textSecondary,
    fontSize: 22,
    lineHeight: 22,
  },
  empty: { alignItems: "center", marginTop: 60 },
  emptyText: { fontSize: 16, color: colors.textSecondary, fontWeight: "600" },
  emptyHint: { fontSize: 13, color: colors.textSecondary, marginTop: 6 },

  // Customer accordion header
  customerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.bgSecondary,
    marginHorizontal: 16,
    marginTop: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  customerHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  customerHeaderName: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
    flexShrink: 1,
  },
  customerHeaderCount: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  chevron: {
    color: colors.gold,
    fontSize: 14,
    width: 14,
    textAlign: "center",
  },
  customerHeaderBadges: {
    flexDirection: "row",
    gap: 4,
  },
  headerBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  headerBadgeScheduled: { backgroundColor: "#4ade8033" },
  headerBadgeUnscheduled: { backgroundColor: colors.bgPrimary },
  headerBadgeTextScheduled: {
    color: "#4ade80",
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  headerBadgeTextUnscheduled: {
    color: colors.textSecondary,
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  // Job row inside an expanded customer
  jobRow: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginVertical: 3,
    backgroundColor: colors.bgCard,
    borderRadius: 6,
    overflow: "hidden",
  },
  jobRowSideTab: { width: 4 },
  jobRowBody: {
    flex: 1,
    padding: 10,
    gap: 4,
  },
  jobRowTopLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  jobRowDate: {
    color: colors.gold,
    fontSize: 13,
    fontWeight: "600",
  },
  jobRowBoat: {
    color: colors.textPrimary,
    fontSize: 14,
  },
  jobRowMeta: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  jobRowFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 4,
  },
  miniBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  miniBadgeScheduled: { backgroundColor: "#4ade8033" },
  miniBadgeUnscheduled: { backgroundColor: colors.bgSecondary },
  miniBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  miniBadgeTextScheduled: { color: "#4ade80" },
  miniBadgeTextUnscheduled: { color: colors.textSecondary },
});
