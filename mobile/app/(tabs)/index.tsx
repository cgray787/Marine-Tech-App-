import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { useNotifications } from "@/lib/notification-context";
import { supabase } from "@/lib/supabase";
import { colors } from "@/constants/Colors";

type Job = {
  id: string;
  status: string;
  scheduled_date: string | null;
  service_types: string[] | null;
  notes: string | null;
  boats: { name: string; make_model: string | null; year: number | null } | null;
  customers: { name: string } | null;
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
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function MyJobsScreen() {
  const { profile, signOut } = useAuth();
  const { notification } = useNotifications();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchJobs = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase
      .from("jobs")
      .select("id, status, scheduled_date, service_types, notes, boats(name, make_model, year), customers(name), marinas(name)")
      .eq("assigned_to", profile.id)
      .order("scheduled_date", { ascending: false });
    if (data) setJobs(data as unknown as Job[]);
  }, [profile]);

  // Re-fetch jobs when a push notification arrives (new job assigned)
  useEffect(() => {
    if (notification) {
      fetchJobs();
    }
  }, [notification, fetchJobs]);

  // Count of unread / new jobs
  const newJobCount = jobs.filter((j) => j.status === "new").length;

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchJobs();
    setRefreshing(false);
  }, [fetchJobs]);

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <View style={styles.titleRow}>
            <Text style={styles.title}>My Jobs</Text>
            {newJobCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{newJobCount}</Text>
              </View>
            )}
          </View>
          <Text style={styles.date}>{today}</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.newJobButton}
            onPress={() => router.push("/(tabs)/service")}
          >
            <Text style={styles.newJobText}>+ New Job</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Job List */}
      <FlatList
        data={jobs}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.gold}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>{"\uD83D\uDEE5"}</Text>
            <Text style={styles.emptyTitle}>No Jobs Yet</Text>
            <Text style={styles.emptyText}>
              Jobs assigned to you will appear here.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.jobCard}
            onPress={() => router.push(`/job/${item.id}`)}
            activeOpacity={0.7}
          >
            <View style={styles.jobHeader}>
              <Text style={styles.boatName}>
                {item.boats?.name || "Unknown Vessel"}
              </Text>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: (STATUS_COLORS[item.status] || colors.statusNew) + "20" },
                ]}
              >
                <Text
                  style={[
                    styles.statusText,
                    { color: STATUS_COLORS[item.status] || colors.statusNew },
                  ]}
                >
                  {STATUS_LABELS[item.status] || item.status}
                </Text>
              </View>
            </View>

            {item.customers?.name && (
              <View style={styles.jobRow}>
                <Text style={styles.jobIcon}>{"\uD83D\uDC64"}</Text>
                <Text style={styles.jobDetail}>{item.customers.name}</Text>
              </View>
            )}

            <View style={styles.jobRow}>
              <Text style={styles.jobIcon}>{"\u26F5"}</Text>
              <Text style={styles.jobDetail}>
                {item.boats?.make_model || "—"}
                {item.boats?.year ? `  \uD83D\uDCC5 ${item.boats.year}` : ""}
              </Text>
            </View>

            {item.service_types && item.service_types.length > 0 && (
              <View style={styles.jobRow}>
                <Text style={styles.jobIcon}>{"\uD83D\uDD27"}</Text>
                <Text style={styles.jobDetail}>
                  {item.service_types.join(", ")}
                </Text>
              </View>
            )}

            <View style={styles.jobRow}>
              <Text style={styles.jobIcon}>{"\uD83D\uDCCD"}</Text>
              <Text style={styles.jobDetail}>
                {item.marinas?.name || "—"}
              </Text>
              {item.scheduled_date && (
                <Text style={styles.jobDate}>
                  {formatDate(item.scheduled_date)}
                </Text>
              )}
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  badge: {
    backgroundColor: colors.statusNew,
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 7,
  },
  badgeText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: "700",
  },
  date: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  newJobButton: {
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  newJobText: {
    color: colors.gold,
    fontSize: 13,
    fontWeight: "600",
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  jobCard: {
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  jobHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  boatName: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.textPrimary,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  jobRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  jobIcon: {
    fontSize: 14,
    width: 24,
  },
  jobDetail: {
    fontSize: 14,
    color: colors.textSecondary,
    flex: 1,
  },
  jobDate: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  emptyContainer: {
    alignItems: "center",
    paddingTop: 80,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
  },
});
