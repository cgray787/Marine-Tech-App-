import { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { colors } from "@/constants/Colors";

type Boat = {
  id: string;
  name: string;
  make_model: string | null;
  year: number | null;
};

type Job = {
  id: string;
  status: string;
  service_types: string[] | null;
  scheduled_date: string | null;
  created_at: string | null;
  boats: { name: string } | null;
  marinas: { name: string } | null;
};

type Client = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  boats: Boat[];
  jobs: Job[];
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

export default function ClientsScreen() {
  const { profile } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchClients = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase
      .from("customers")
      .select(
        "id, name, email, phone, boats(id, name, make_model, year), jobs(id, status, service_types, scheduled_date, created_at, boats(name), marinas(name))"
      )
      .order("name");
    if (data) setClients(data as unknown as Client[]);
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      fetchClients();
    }, [fetchClients])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchClients();
    setRefreshing(false);
  }, [fetchClients]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Clients</Text>
          <Text style={styles.subtitle}>
            {clients.length} client{clients.length !== 1 ? "s" : ""}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => router.push("/client/new")}
        >
          <Text style={styles.addButtonText}>+ Add Client</Text>
        </TouchableOpacity>
      </View>

      {/* Client List */}
      <FlatList
        data={clients}
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
            <Text style={styles.emptyIcon}>{"\uD83D\uDC64"}</Text>
            <Text style={styles.emptyTitle}>No Clients Yet</Text>
            <Text style={styles.emptyText}>
              Tap "+ Add Client" to add your first customer.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const latestJob = item.jobs && item.jobs.length > 0 ? item.jobs[0] : null;
          const primaryBoat = item.boats && item.boats.length > 0 ? item.boats[0] : null;
          const jobStatus = latestJob?.status || null;

          return (
            <TouchableOpacity
              style={styles.clientCard}
              onPress={() => router.push(`/client/${item.id}`)}
              activeOpacity={0.7}
            >
              {/* Gold accent bar */}
              <View style={styles.cardAccent} />

              <View style={styles.cardContent}>
                {/* Row 1: Boat name + status badge */}
                <View style={styles.row1}>
                  <Text style={styles.boatName}>
                    {primaryBoat?.name || item.name}
                  </Text>
                  {jobStatus && (
                    <View
                      style={[
                        styles.statusBadge,
                        {
                          backgroundColor:
                            (STATUS_COLORS[jobStatus] || colors.statusNew) + "20",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusText,
                          {
                            color:
                              STATUS_COLORS[jobStatus] || colors.statusNew,
                          },
                        ]}
                      >
                        {STATUS_LABELS[jobStatus] || jobStatus}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Row 2: Client name */}
                <View style={styles.infoRow}>
                  <Text style={styles.infoIcon}>{"\uD83D\uDC64"}</Text>
                  <Text style={styles.infoText}>{item.name}</Text>
                </View>

                {/* Row 3: Boat make/model + year */}
                {primaryBoat && (primaryBoat.make_model || primaryBoat.year) && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoIcon}>{"\u2693"}</Text>
                    <Text style={styles.infoText}>
                      {primaryBoat.make_model || ""}
                      {primaryBoat.make_model && primaryBoat.year ? "  \u2022  " : ""}
                      {primaryBoat.year || ""}
                    </Text>
                  </View>
                )}

                {/* Row 4: Service types from latest job */}
                {latestJob?.service_types && latestJob.service_types.length > 0 && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoIcon}>{"\uD83D\uDD27"}</Text>
                    <Text style={styles.serviceText}>
                      {latestJob.service_types.join(", ")}
                    </Text>
                  </View>
                )}

                {/* Row 5: Marina + date */}
                {latestJob && (
                  <View style={styles.bottomRow}>
                    {latestJob.marinas?.name ? (
                      <View style={styles.infoRow}>
                        <Text style={styles.infoIcon}>{"\uD83D\uDCCD"}</Text>
                        <Text style={styles.infoText}>
                          {latestJob.marinas.name}
                        </Text>
                      </View>
                    ) : (
                      <View />
                    )}
                    <Text style={styles.dateText}>
                      {formatDate(
                        latestJob.scheduled_date || latestJob.created_at
                      )}
                    </Text>
                  </View>
                )}

                {/* Additional boats */}
                {item.boats && item.boats.length > 1 && (
                  <Text style={styles.moreBoats}>
                    +{item.boats.length - 1} more boat
                    {item.boats.length - 1 > 1 ? "s" : ""}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          );
        }}
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
    paddingTop: 16,
    paddingBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  addButton: {
    backgroundColor: colors.gold,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  addButtonText: {
    color: colors.bgPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  clientCard: {
    flexDirection: "row",
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    marginBottom: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardAccent: {
    width: 4,
    backgroundColor: colors.gold,
  },
  cardContent: {
    flex: 1,
    padding: 14,
    gap: 6,
  },
  row1: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  boatName: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
    flex: 1,
  },
  statusBadge: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginLeft: 8,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  infoIcon: {
    fontSize: 13,
    width: 18,
  },
  infoText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  serviceText: {
    fontSize: 14,
    color: colors.gold,
    flex: 1,
  },
  bottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 2,
  },
  dateText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  moreBoats: {
    fontSize: 12,
    color: colors.textSecondary,
    fontStyle: "italic",
    marginTop: 2,
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
