import { useEffect, useState, useCallback } from "react";
import { useLocalSearchParams } from "expo-router";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from "react-native";
import { router } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { colors } from "@/constants/Colors";

type Boat = {
  id: string;
  name: string;
  make_model: string | null;
  year: number | null;
  hin: string | null;
  engine_make: string | null;
  engine_model: string | null;
  engine_hours_port: number | null;
  engine_hours_starboard: number | null;
  color: string | null;
  home_marina: string | null;
};

type Job = {
  id: string;
  status: string;
  service_types: string[] | null;
  scheduled_date: string | null;
  notes: string | null;
  boats: { name: string } | null;
};

type Customer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  salesforce_url: string | null;
};

type PdiReport = {
  id: string;
  boat_name: string | null;
  general_notes: string | null;
  flagged_items: number | null;
  total_items: number | null;
  completed_items: number | null;
  status: string | null;
  submitted_at: string | null;
  boats: { name: string } | null;
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
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Matches migration 027: admin, manager, tech can write; viewer cannot. */
function canWriteRole(role: string | null | undefined): boolean {
  return role === "admin" || role === "manager" || role === "tech";
}

export default function ClientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const canWrite = canWriteRole(profile?.role);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [boats, setBoats] = useState<Boat[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [pdiReports, setPdiReports] = useState<PdiReport[]>([]);

  // Add boat modal
  const [showAddBoat, setShowAddBoat] = useState(false);
  const [addingBoat, setAddingBoat] = useState(false);
  const [newBoatName, setNewBoatName] = useState("");
  const [newBoatMakeModel, setNewBoatMakeModel] = useState("");
  const [newBoatYear, setNewBoatYear] = useState("");
  const [newBoatHin, setNewBoatHin] = useState("");
  const [newBoatEngineMake, setNewBoatEngineMake] = useState("");
  const [newBoatEngineModel, setNewBoatEngineModel] = useState("");
  const [newBoatEngineHoursPort, setNewBoatEngineHoursPort] = useState("");
  const [newBoatEngineHoursStarboard, setNewBoatEngineHoursStarboard] = useState("");
  const [newBoatColor, setNewBoatColor] = useState("");
  const [newBoatHomeMarina, setNewBoatHomeMarina] = useState("");

  // Edit client modal
  const [showEditClient, setShowEditClient] = useState(false);
  const [savingClient, setSavingClient] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editNotes, setEditNotes] = useState("");

  // Edit boat modal
  const [showEditBoat, setShowEditBoat] = useState(false);
  const [savingBoat, setSavingBoat] = useState(false);
  const [editBoatId, setEditBoatId] = useState("");
  const [editBoatName, setEditBoatName] = useState("");
  const [editBoatMakeModel, setEditBoatMakeModel] = useState("");
  const [editBoatYear, setEditBoatYear] = useState("");
  const [editBoatHin, setEditBoatHin] = useState("");
  const [editBoatEngineMake, setEditBoatEngineMake] = useState("");
  const [editBoatEngineModel, setEditBoatEngineModel] = useState("");
  const [editBoatEngineHoursPort, setEditBoatEngineHoursPort] = useState("");
  const [editBoatEngineHoursStarboard, setEditBoatEngineHoursStarboard] = useState("");
  const [editBoatColor, setEditBoatColor] = useState("");
  const [editBoatHomeMarina, setEditBoatHomeMarina] = useState("");

  // Create PDI modal
  const [showCreatePdi, setShowCreatePdi] = useState(false);
  const [creatingPdi, setCreatingPdi] = useState(false);
  const [pdiBoatId, setPdiBoatId] = useState("");
  const [expandedPdiId, setExpandedPdiId] = useState<string | null>(null);
  const [pdiChecklistItems, setPdiChecklistItems] = useState<Record<string, { id: string; item_name: string; assessment: string | null; notes: string | null }[]>>({});

  // New job modal
  const [showNewJob, setShowNewJob] = useState(false);
  const [creatingJob, setCreatingJob] = useState(false);
  const [jobBoatId, setJobBoatId] = useState("");
  const [jobServiceTypes, setJobServiceTypes] = useState("");
  const [jobNotes, setJobNotes] = useState("");
  const [jobDate, setJobDate] = useState<Date | null>(null);
  const [showJobDatePicker, setShowJobDatePicker] = useState(false);

  const fetchData = useCallback(async () => {
    if (!id) return;

    const [custResult, boatsResult, jobsResult, pdiResult] = await Promise.all([
      supabase.from("customers").select("*").eq("id", id).single(),
      supabase
        .from("boats")
        .select("id, name, make_model, year, hin, engine_make, engine_model, engine_hours_port, engine_hours_starboard, color, home_marina")
        .eq("customer_id", id)
        .order("name"),
      supabase
        .from("jobs")
        .select("id, status, service_types, scheduled_date, notes, boats(name)")
        .eq("customer_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("pdi_reports")
        .select("id, boat_name, general_notes, flagged_items, total_items, completed_items, status, submitted_at, boats(name)")
        .eq("customer_id", id)
        .order("submitted_at", { ascending: false }),
    ]);

    if (custResult.data) setCustomer(custResult.data);
    if (boatsResult.data) setBoats(boatsResult.data as Boat[]);
    if (jobsResult.data) setJobs(jobsResult.data as unknown as Job[]);
    if (pdiResult.data) setPdiReports(pdiResult.data as unknown as PdiReport[]);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  function openEditClient() {
    if (!customer) return;
    setEditName(customer.name);
    setEditPhone(customer.phone || "");
    setEditEmail(customer.email || "");
    setEditAddress(customer.address || "");
    setEditNotes(customer.notes || "");
    setShowEditClient(true);
  }

  async function handleUpdateClient() {
    if (!editName.trim()) {
      Alert.alert("Required", "Please enter the customer's name.");
      return;
    }
    setSavingClient(true);

    // .select() makes the UPDATE return the affected rows. A 0-row return
    // with no error means RLS silently filtered the row out — surface that
    // instead of closing the modal and pretending we saved.
    const { data, error } = await supabase
      .from("customers")
      .update({
        name: editName.trim(),
        phone: editPhone.trim() || null,
        email: editEmail.trim() || null,
        address: editAddress.trim() || null,
        notes: editNotes.trim() || null,
      })
      .eq("id", id)
      .select("id");

    setSavingClient(false);
    if (error) {
      Alert.alert("Error", error.message);
      return;
    }
    if (!data || data.length === 0) {
      Alert.alert(
        "Couldn't save",
        "You don't have permission to edit this client (or they belong to a different office). Contact an admin if this is unexpected.",
      );
      return;
    }

    setShowEditClient(false);
    fetchData();
  }

  async function handleCreatePdi() {
    if (!pdiBoatId) {
      Alert.alert("Required", "Please select a boat for this PDI.");
      return;
    }
    setCreatingPdi(true);

    let profileId = profile?.id ?? null;
    if (!profileId) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: p } = await supabase
          .from("profiles")
          .select("id")
          .eq("auth_id", session.user.id)
          .single();
        profileId = p?.id ?? null;
      }
    }

    const selectedBoat = boats.find((b) => b.id === pdiBoatId);

    const { data: pdi, error } = await supabase
      .from("pdi_reports")
      .insert({
        tech_id: profileId,
        boat_id: pdiBoatId,
        customer_id: id,
        boat_name: selectedBoat?.name || "",
        owner_name: customer?.name || "",
        make_model: selectedBoat?.make_model || "",
        year: selectedBoat?.year || null,
        hin: selectedBoat?.hin || "",
        color: selectedBoat?.color || "",
        total_items: 0,
        completed_items: 0,
        flagged_items: 0,
        general_notes: "",
        status: "submitted",
      })
      .select("id")
      .single();

    setCreatingPdi(false);
    if (error || !pdi) {
      Alert.alert("Error", error?.message || "Failed to create PDI.");
      return;
    }

    setShowCreatePdi(false);
    setPdiBoatId("");
    fetchData();
    Alert.alert("PDI Created", "Go to the PDI tab to fill in the checklist.", [
      { text: "OK" },
    ]);
  }

  async function fetchPdiChecklist(pdiId: string) {
    if (pdiChecklistItems[pdiId]) {
      setExpandedPdiId(expandedPdiId === pdiId ? null : pdiId);
      return;
    }
    const { data } = await supabase
      .from("pdi_checklist_items")
      .select("*")
      .eq("pdi_report_id", pdiId)
      .order("sort_order");
    if (data) {
      setPdiChecklistItems((prev) => ({ ...prev, [pdiId]: data }));
    }
    setExpandedPdiId(expandedPdiId === pdiId ? null : pdiId);
  }

  // Engine hours are stored numeric (tenths allowed); blank/garbage → null.
  function parseHours(v: string): number | null {
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
  }

  async function handleAddBoat() {
    if (!newBoatName.trim()) {
      Alert.alert("Required", "Please enter a boat name.");
      return;
    }
    setAddingBoat(true);

    const { error } = await supabase.from("boats").insert({
      customer_id: id,
      name: newBoatName.trim(),
      make_model: newBoatMakeModel.trim() || null,
      year: newBoatYear ? parseInt(newBoatYear, 10) : null,
      hin: newBoatHin.trim() || null,
      engine_make: newBoatEngineMake.trim() || null,
      engine_model: newBoatEngineModel.trim() || null,
      engine_hours_port: parseHours(newBoatEngineHoursPort),
      engine_hours_starboard: parseHours(newBoatEngineHoursStarboard),
      color: newBoatColor.trim() || null,
      home_marina: newBoatHomeMarina.trim() || null,
    });

    setAddingBoat(false);
    if (error) {
      Alert.alert("Error", error.message);
      return;
    }

    setShowAddBoat(false);
    setNewBoatName("");
    setNewBoatMakeModel("");
    setNewBoatYear("");
    setNewBoatHin("");
    setNewBoatEngineMake("");
    setNewBoatEngineModel("");
    setNewBoatEngineHoursPort("");
    setNewBoatEngineHoursStarboard("");
    setNewBoatColor("");
    setNewBoatHomeMarina("");
    fetchData();
  }

  async function handleDeletePdi(pdiId: string) {
    Alert.alert("Delete PDI", "Are you sure you want to delete this PDI report?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await supabase.from("pdi_checklist_items").delete().eq("pdi_report_id", pdiId);
          await supabase.from("pdi_reports").delete().eq("id", pdiId);
          fetchData();
        },
      },
    ]);
  }

  async function handleDeleteClient() {
    if (!customer) return;
    Alert.alert(
      "Delete Client",
      `Permanently delete ${customer.name}, along with their boats, jobs, and reports? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            // jobs/reports reference customers with NO cascade — remove them first.
            // boats cascade automatically on customer delete.
            await supabase.from("service_reports").delete().eq("customer_id", customer.id);
            await supabase.from("pdi_reports").delete().eq("customer_id", customer.id);
            await supabase.from("jobs").delete().eq("customer_id", customer.id);
            const { error } = await supabase.from("customers").delete().eq("id", customer.id);
            if (error) {
              Alert.alert("Delete failed", error.message);
              return;
            }
            router.back();
          },
        },
      ]
    );
  }

  function openEditBoat(boat: Boat) {
    setEditBoatId(boat.id);
    setEditBoatName(boat.name);
    setEditBoatMakeModel(boat.make_model || "");
    setEditBoatYear(boat.year ? String(boat.year) : "");
    setEditBoatHin(boat.hin || "");
    setEditBoatEngineMake(boat.engine_make || "");
    setEditBoatEngineModel(boat.engine_model || "");
    setEditBoatEngineHoursPort(boat.engine_hours_port != null ? String(boat.engine_hours_port) : "");
    setEditBoatEngineHoursStarboard(boat.engine_hours_starboard != null ? String(boat.engine_hours_starboard) : "");
    setEditBoatColor(boat.color || "");
    setEditBoatHomeMarina(boat.home_marina || "");
    setShowEditBoat(true);
  }

  async function handleUpdateBoat() {
    if (!editBoatName.trim()) {
      Alert.alert("Required", "Please enter a boat name.");
      return;
    }
    setSavingBoat(true);

    // See handleUpdateClient — .select() + length check catches the silent
    // RLS-filtered-zero-rows case that would otherwise close the modal as
    // if the edit had saved.
    const { data, error } = await supabase
      .from("boats")
      .update({
        name: editBoatName.trim(),
        make_model: editBoatMakeModel.trim() || null,
        year: editBoatYear ? parseInt(editBoatYear, 10) : null,
        hin: editBoatHin.trim() || null,
        engine_make: editBoatEngineMake.trim() || null,
        engine_model: editBoatEngineModel.trim() || null,
        engine_hours_port: parseHours(editBoatEngineHoursPort),
        engine_hours_starboard: parseHours(editBoatEngineHoursStarboard),
        color: editBoatColor.trim() || null,
        home_marina: editBoatHomeMarina.trim() || null,
      })
      .eq("id", editBoatId)
      .select("id");

    setSavingBoat(false);
    if (error) {
      Alert.alert("Error", error.message);
      return;
    }
    if (!data || data.length === 0) {
      Alert.alert(
        "Couldn't save",
        "You don't have permission to edit this boat (or it belongs to a different office). Contact an admin if this is unexpected.",
      );
      return;
    }

    setShowEditBoat(false);
    fetchData();
  }

  async function handleCreateJob() {
    if (!jobBoatId) {
      Alert.alert("Required", "Please select a boat for this job.");
      return;
    }
    setCreatingJob(true);

    // Get profile ID — use context if available, otherwise fetch directly
    let profileId = profile?.id ?? null;
    if (!profileId) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: p } = await supabase
          .from("profiles")
          .select("id")
          .eq("auth_id", session.user.id)
          .single();
        profileId = p?.id ?? null;
      }
    }

    const serviceTypes = jobServiceTypes
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const { data: job, error } = await supabase
      .from("jobs")
      .insert({
        assigned_to: profileId,
        customer_id: id,
        boat_id: jobBoatId,
        service_types: serviceTypes.length > 0 ? serviceTypes : null,
        // Postgres `date` wants a YYYY-MM-DD string or null. Picker gives a
        // Date object; format it ourselves to avoid timezone drift from
        // toISOString() (which converts to UTC and can roll the date back
        // one day for PT users).
        scheduled_date: jobDate
          ? `${jobDate.getFullYear()}-${String(jobDate.getMonth() + 1).padStart(2, "0")}-${String(jobDate.getDate()).padStart(2, "0")}`
          : null,
        notes: jobNotes.trim() || null,
        status: "new",
        created_by: profileId,
      })
      .select("id")
      .single();

    setCreatingJob(false);
    if (error || !job) {
      Alert.alert("Error", error?.message || "Failed to create job.");
      return;
    }

    setShowNewJob(false);
    setJobBoatId("");
    setJobServiceTypes("");
    setJobNotes("");
    setJobDate(null);
    Alert.alert("Job Created", "The job has been created.", [
      { text: "View Job", onPress: () => router.push(`/job/${job.id}`) },
      { text: "OK", onPress: () => fetchData() },
    ]);
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.gold} />
      </View>
    );
  }

  if (!customer) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>Client not found</Text>
      </View>
    );
  }

  const initials = customer.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.gold}
          />
        }
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backButton}>{"\u2039"} Clients</Text>
          </TouchableOpacity>
          <Text style={styles.headerName}>{customer.name}</Text>
        </View>


        {/* Customer Card */}
        <View style={styles.customerCard}>
          {canWrite && (
            <TouchableOpacity
              style={styles.editButton}
              onPress={openEditClient}
            >
              <Text style={styles.editButtonText}>Edit</Text>
            </TouchableOpacity>
          )}
          <View style={styles.customerAvatar}>
            <Text style={styles.customerAvatarText}>{initials}</Text>
          </View>
          <Text style={styles.customerName}>{customer.name}</Text>
          {customer.phone && (
            <View style={styles.contactActionRow}>
              <TouchableOpacity
                style={styles.contactChip}
                onPress={() =>
                  Linking.openURL(`tel:${customer.phone!.replace(/[^0-9+]/g, "")}`)
                }
              >
                <Text style={styles.contactChipText}>
                  {"\uD83D\uDCDE"}  {customer.phone}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.contactChip}
                onPress={() =>
                  Linking.openURL(`sms:${customer.phone!.replace(/[^0-9+]/g, "")}`)
                }
              >
                <Text style={styles.contactChipText}>{"\uD83D\uDCAC"}  Text</Text>
              </TouchableOpacity>
            </View>
          )}
          {customer.email && (
            <TouchableOpacity
              style={styles.infoRow}
              onPress={() => Linking.openURL(`mailto:${customer.email}`)}
            >
              <Text style={styles.infoIcon}>{"\u2709"}</Text>
              <Text style={[styles.infoText, styles.infoLink]}>{customer.email}</Text>
            </TouchableOpacity>
          )}
          {customer.address && (
            <View style={styles.infoRow}>
              <Text style={styles.infoIcon}>{"\uD83D\uDCCD"}</Text>
              <Text style={styles.infoText}>{customer.address}</Text>
            </View>
          )}
          {customer.notes && (
            <Text style={styles.customerNotes}>{customer.notes}</Text>
          )}
          {customer.salesforce_url ? (
            <TouchableOpacity
              style={styles.salesforceBtn}
              onPress={() => Linking.openURL(customer.salesforce_url!)}
            >
              <Text style={styles.salesforceBtnText}>
                {"\u2601"}  View in Salesforce
              </Text>
            </TouchableOpacity>
          ) : (
            // Not linked yet (didn't auto-sync) \u2014 open Salesforce's blank
            // New Person Account form so the client can be added manually.
            <TouchableOpacity
              style={[styles.salesforceBtn, styles.salesforceBtnAdd]}
              onPress={() =>
                Linking.openURL(
                  "https://jeffbrownyachts.my.salesforce.com/lightning/o/Account/new?recordTypeId=0123h000000ANsqAAG"
                )
              }
            >
              <Text style={[styles.salesforceBtnText, styles.salesforceBtnAddText]}>
                {"\u2795"}  Add to Salesforce
              </Text>
            </TouchableOpacity>
          )}
          {canWrite && (
            <TouchableOpacity style={styles.deleteClientBtn} onPress={handleDeleteClient}>
              <Text style={styles.deleteClientBtnText}>Delete Client</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Boats Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Boats ({boats.length})
          </Text>
          {canWrite && (
            <TouchableOpacity
              style={styles.addSmallButton}
              onPress={() => setShowAddBoat(true)}
            >
              <Text style={styles.addSmallButtonText}>+ Add Boat</Text>
            </TouchableOpacity>
          )}
        </View>

        {boats.length === 0 ? (
          <View style={styles.emptySection}>
            <Text style={styles.emptyText}>
              No boats yet.{canWrite ? " Tap \"+ Add Boat\" to add one." : ""}
            </Text>
          </View>
        ) : (
          boats.map((boat) => (
            <TouchableOpacity
              key={boat.id}
              style={styles.boatCard}
              activeOpacity={canWrite ? 0.7 : 1}
              onPress={canWrite ? () => openEditBoat(boat) : undefined}
            >
              <View style={styles.boatCardAccent} />
              <View style={styles.boatCardContent}>
                <View style={styles.boatCardHeader}>
                  <Text style={styles.boatName}>{boat.name}</Text>
                  {canWrite && <Text style={styles.boatEditHint}>Edit</Text>}
                </View>
                {boat.make_model && (
                  <Text style={styles.boatDetail}>{boat.make_model}</Text>
                )}
                <View style={styles.boatDetailsGrid}>
                  {boat.year && (
                    <View style={styles.boatDetailChip}>
                      <Text style={styles.boatDetailLabel}>Year</Text>
                      <Text style={styles.boatDetailValue}>
                        {boat.year}
                      </Text>
                    </View>
                  )}
                  {boat.color && (
                    <View style={styles.boatDetailChip}>
                      <Text style={styles.boatDetailLabel}>Color</Text>
                      <Text style={styles.boatDetailValue}>
                        {boat.color}
                      </Text>
                    </View>
                  )}
                  {boat.hin && (
                    <View style={styles.boatDetailChip}>
                      <Text style={styles.boatDetailLabel}>HIN</Text>
                      <Text style={styles.boatDetailValue}>{boat.hin}</Text>
                    </View>
                  )}
                  {boat.engine_make && (
                    <View style={styles.boatDetailChip}>
                      <Text style={styles.boatDetailLabel}>Engine</Text>
                      <Text style={styles.boatDetailValue}>
                        {boat.engine_make}
                        {boat.engine_model ? ` ${boat.engine_model}` : ""}
                      </Text>
                    </View>
                  )}
                  {(boat.engine_hours_port != null ||
                    boat.engine_hours_starboard != null) && (
                    <View style={styles.boatDetailChip}>
                      <Text style={styles.boatDetailLabel}>Engine Hours</Text>
                      <Text style={styles.boatDetailValue}>
                        {boat.engine_hours_port != null &&
                        boat.engine_hours_starboard != null
                          ? `Port ${boat.engine_hours_port} · Stbd ${boat.engine_hours_starboard}`
                          : `${boat.engine_hours_port ?? boat.engine_hours_starboard}`}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}

        {/* Jobs Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Jobs ({jobs.length})
          </Text>
          {canWrite && (
            <TouchableOpacity
              style={styles.newJobButton}
              onPress={() => {
                if (boats.length === 0) {
                  Alert.alert(
                    "Add a Boat First",
                    "You need to add at least one boat before creating a job."
                  );
                  return;
                }
                if (boats.length === 1) setJobBoatId(boats[0].id);
                setShowNewJob(true);
              }}
            >
              <Text style={styles.newJobButtonText}>+ New Job</Text>
            </TouchableOpacity>
          )}
        </View>

        {jobs.length === 0 ? (
          <View style={styles.emptySection}>
            <Text style={styles.emptyText}>
              No jobs yet.{canWrite ? " Tap \"+ New Job\" to create one." : ""}
            </Text>
          </View>
        ) : (
          jobs.map((job) => (
            <TouchableOpacity
              key={job.id}
              style={styles.jobCard}
              onPress={() => router.push(`/job/${job.id}`)}
            >
              <View style={styles.jobHeader}>
                <Text style={styles.jobBoatName}>
                  {job.boats?.name || "Unknown"}
                </Text>
                <View
                  style={[
                    styles.statusBadge,
                    {
                      backgroundColor:
                        (STATUS_COLORS[job.status] || colors.statusNew) + "20",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusText,
                      {
                        color:
                          STATUS_COLORS[job.status] || colors.statusNew,
                      },
                    ]}
                  >
                    {STATUS_LABELS[job.status] || job.status}
                  </Text>
                </View>
              </View>
              {job.service_types && job.service_types.length > 0 && (
                <Text style={styles.jobServiceTypes}>
                  {job.service_types.join(", ")}
                </Text>
              )}
              {job.scheduled_date && (
                <Text style={styles.jobDate}>
                  {formatDate(job.scheduled_date)}
                </Text>
              )}
            </TouchableOpacity>
          ))
        )}

        {/* PDI Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            PDI ({pdiReports.length})
          </Text>
          {canWrite && (
            <TouchableOpacity
              style={styles.newJobButton}
              onPress={() => {
                if (boats.length === 0) {
                  Alert.alert(
                    "Add a Boat First",
                    "You need to add at least one boat before creating a PDI."
                  );
                  return;
                }
                router.push("/(tabs)/pdi");
              }}
            >
              <Text style={styles.newJobButtonText}>+ Create PDI</Text>
            </TouchableOpacity>
          )}
        </View>

        {pdiReports.length === 0 ? (
          <View style={styles.emptySection}>
            <Text style={styles.emptyText}>
              No PDI reports yet.{canWrite ? " Tap \"+ Create PDI\" to start one." : ""}
            </Text>
          </View>
        ) : (
          pdiReports.map((pdi) => (
            <View key={pdi.id} style={styles.pdiCard}>
              <View style={styles.pdiCardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pdiBoatName}>
                    {pdi.boats?.name || pdi.boat_name || "Unknown Boat"}
                  </Text>
                  {pdi.submitted_at && (
                    <Text style={styles.pdiDate}>
                      {formatDate(pdi.submitted_at.split("T")[0])}
                    </Text>
                  )}
                </View>
                <View
                  style={[
                    styles.statusBadge,
                    {
                      backgroundColor:
                        (STATUS_COLORS[pdi.status || "new"] || colors.statusNew) + "20",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusText,
                      {
                        color:
                          STATUS_COLORS[pdi.status || "new"] || colors.statusNew,
                      },
                    ]}
                  >
                    {STATUS_LABELS[pdi.status || "new"] || pdi.status}
                  </Text>
                </View>
              </View>

              <View style={styles.pdiStats}>
                <Text style={styles.pdiStat}>
                  {pdi.completed_items || 0}/{pdi.total_items || 0} items checked
                </Text>
                {(pdi.flagged_items ?? 0) > 0 && (
                  <Text style={styles.pdiFlagged}>
                    {pdi.flagged_items} flagged
                  </Text>
                )}
              </View>

              {pdi.general_notes ? (
                <Text style={styles.pdiNotesText}>{pdi.general_notes}</Text>
              ) : null}

              {/* View / Edit toggle */}
              <View style={styles.pdiActions}>
                <TouchableOpacity
                  style={[
                    styles.pdiToggleBtn,
                    expandedPdiId === pdi.id && styles.pdiToggleBtnActive,
                  ]}
                  onPress={() => fetchPdiChecklist(pdi.id)}
                >
                  <Text
                    style={[
                      styles.pdiToggleText,
                      expandedPdiId === pdi.id && styles.pdiToggleTextActive,
                    ]}
                  >
                    {expandedPdiId === pdi.id ? "Hide" : "View"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.pdiEditBtn}
                  onPress={() => {
                    router.push("/(tabs)/pdi");
                  }}
                >
                  <Text style={styles.pdiEditBtnText}>Edit PDI</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.pdiDeleteBtn}
                  onPress={() => handleDeletePdi(pdi.id)}
                >
                  <Text style={styles.pdiDeleteBtnText}>Delete</Text>
                </TouchableOpacity>
              </View>

              {/* Expanded checklist view */}
              {expandedPdiId === pdi.id && pdiChecklistItems[pdi.id] && (
                <View style={styles.pdiExpandedSection}>
                  {pdiChecklistItems[pdi.id].length === 0 ? (
                    <Text style={styles.pdiExpandedEmpty}>
                      No checklist items yet. Tap &quot;Edit PDI&quot; to fill in the inspection.
                    </Text>
                  ) : (
                    pdiChecklistItems[pdi.id].map((item) => (
                      <View key={item.id} style={styles.pdiChecklistRow}>
                        <View
                          style={[
                            styles.pdiAssessmentDot,
                            {
                              backgroundColor:
                                item.assessment === "good"
                                  ? colors.good
                                  : item.assessment === "bad"
                                    ? colors.bad
                                    : colors.textSecondary,
                            },
                          ]}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.pdiChecklistName}>
                            {item.item_name}
                          </Text>
                          {item.notes && (
                            <Text style={styles.pdiChecklistNote}>
                              {item.notes}
                            </Text>
                          )}
                        </View>
                        <Text
                          style={[
                            styles.pdiChecklistAssessment,
                            {
                              color:
                                item.assessment === "good"
                                  ? colors.good
                                  : colors.bad,
                            },
                          ]}
                        >
                          {item.assessment?.toUpperCase()}
                        </Text>
                      </View>
                    ))
                  )}
                </View>
              )}
            </View>
          ))
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Create PDI Modal */}
      <Modal visible={showCreatePdi} transparent animationType="slide">
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <ScrollView keyboardShouldPersistTaps="handled">
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Create PDI</Text>
                  <TouchableOpacity onPress={() => setShowCreatePdi(false)}>
                    <Text style={styles.modalClose}>{"\u2715"}</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.modalLabel}>Client</Text>
                <View style={styles.pdiInfoRow}>
                  <Text style={styles.pdiInfoValue}>{customer?.name}</Text>
                </View>

                <Text style={styles.modalLabel}>
                  Select Boat <Text style={{ color: colors.bad }}>*</Text>
                </Text>
                <View style={styles.boatSelector}>
                  {boats.map((boat) => (
                    <TouchableOpacity
                      key={boat.id}
                      style={[
                        styles.boatOption,
                        pdiBoatId === boat.id && styles.boatOptionSelected,
                      ]}
                      onPress={() => setPdiBoatId(boat.id)}
                    >
                      <Text
                        style={[
                          styles.boatOptionText,
                          pdiBoatId === boat.id && styles.boatOptionTextSelected,
                        ]}
                      >
                        {boat.name}
                      </Text>
                      {boat.make_model && (
                        <Text style={styles.boatOptionSub}>
                          {boat.make_model}
                          {boat.year ? ` (${boat.year})` : ""}
                        </Text>
                      )}
                      {boat.hin && (
                        <Text style={styles.boatOptionSub}>HIN: {boat.hin}</Text>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>

                {pdiBoatId && (
                  <View style={styles.pdiBoatSummary}>
                    {(() => {
                      const b = boats.find((x) => x.id === pdiBoatId);
                      if (!b) return null;
                      return (
                        <>
                          <Text style={styles.pdiSummaryTitle}>PDI for:</Text>
                          <Text style={styles.pdiSummaryText}>
                            {customer?.name} — {b.name}
                          </Text>
                          {b.make_model && (
                            <Text style={styles.pdiSummaryDetail}>
                              {b.make_model}{b.year ? ` (${b.year})` : ""}
                            </Text>
                          )}
                          {b.color && (
                            <Text style={styles.pdiSummaryDetail}>
                              Color: {b.color}
                            </Text>
                          )}
                        </>
                      );
                    })()}
                  </View>
                )}

                <TouchableOpacity
                  style={[
                    styles.modalSubmit,
                    creatingPdi && { opacity: 0.6 },
                  ]}
                  onPress={handleCreatePdi}
                  disabled={creatingPdi}
                >
                  {creatingPdi ? (
                    <ActivityIndicator color={colors.bgPrimary} />
                  ) : (
                    <Text style={styles.modalSubmitText}>Create PDI Report</Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add Boat Modal */}
      <Modal visible={showAddBoat} transparent animationType="slide">
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <ScrollView keyboardShouldPersistTaps="handled">
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Add Boat</Text>
                  <TouchableOpacity onPress={() => setShowAddBoat(false)}>
                    <Text style={styles.modalClose}>{"\u2715"}</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.modalLabel}>
                  Boat Name <Text style={{ color: colors.bad }}>*</Text>
                </Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g. Sea Breeze IV"
                  placeholderTextColor={colors.textSecondary + "80"}
                  value={newBoatName}
                  onChangeText={setNewBoatName}
                />

                <Text style={styles.modalLabel}>Make / Model</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g. Boston Whaler 280"
                  placeholderTextColor={colors.textSecondary + "80"}
                  value={newBoatMakeModel}
                  onChangeText={setNewBoatMakeModel}
                />

                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalLabel}>Year</Text>
                    <TextInput
                      style={styles.modalInput}
                      placeholder="2024"
                      placeholderTextColor={colors.textSecondary + "80"}
                      value={newBoatYear}
                      onChangeText={setNewBoatYear}
                      keyboardType="number-pad"
                      maxLength={4}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalLabel}>Color</Text>
                    <TextInput
                      style={styles.modalInput}
                      placeholder="White"
                      placeholderTextColor={colors.textSecondary + "80"}
                      value={newBoatColor}
                      onChangeText={setNewBoatColor}
                    />
                  </View>
                </View>

                <Text style={styles.modalLabel}>HIN</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="BWC28001A424"
                  placeholderTextColor={colors.textSecondary + "80"}
                  value={newBoatHin}
                  onChangeText={setNewBoatHin}
                  autoCapitalize="characters"
                />

                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalLabel}>Engine Make</Text>
                    <TextInput
                      style={styles.modalInput}
                      placeholder="Mercury"
                      placeholderTextColor={colors.textSecondary + "80"}
                      value={newBoatEngineMake}
                      onChangeText={setNewBoatEngineMake}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalLabel}>Engine Model</Text>
                    <TextInput
                      style={styles.modalInput}
                      placeholder="V8 300hp"
                      placeholderTextColor={colors.textSecondary + "80"}
                      value={newBoatEngineModel}
                      onChangeText={setNewBoatEngineModel}
                    />
                  </View>
                </View>

                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalLabel}>Engine Hours (Port)</Text>
                    <TextInput
                      style={styles.modalInput}
                      placeholder="e.g. 1234.5"
                      placeholderTextColor={colors.textSecondary + "80"}
                      value={newBoatEngineHoursPort}
                      onChangeText={setNewBoatEngineHoursPort}
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalLabel}>Engine Hours (Stbd)</Text>
                    <TextInput
                      style={styles.modalInput}
                      placeholder="twin only"
                      placeholderTextColor={colors.textSecondary + "80"}
                      value={newBoatEngineHoursStarboard}
                      onChangeText={setNewBoatEngineHoursStarboard}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>

                <Text style={styles.modalLabel}>Home Marina</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g. Elliott Bay Marina"
                  placeholderTextColor={colors.textSecondary + "80"}
                  value={newBoatHomeMarina}
                  onChangeText={setNewBoatHomeMarina}
                />

                <TouchableOpacity
                  style={[
                    styles.modalSubmit,
                    addingBoat && { opacity: 0.6 },
                  ]}
                  onPress={handleAddBoat}
                  disabled={addingBoat}
                >
                  {addingBoat ? (
                    <ActivityIndicator color={colors.bgPrimary} />
                  ) : (
                    <Text style={styles.modalSubmitText}>Save Boat</Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Client Modal */}
      <Modal visible={showEditClient} transparent animationType="slide">
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <ScrollView keyboardShouldPersistTaps="handled">
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Edit Client</Text>
                  <TouchableOpacity onPress={() => setShowEditClient(false)}>
                    <Text style={styles.modalClose}>{"\u2715"}</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.modalLabel}>
                  Full Name <Text style={{ color: colors.bad }}>*</Text>
                </Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Full Name"
                  placeholderTextColor={colors.textSecondary + "80"}
                  value={editName}
                  onChangeText={setEditName}
                  autoCapitalize="words"
                />

                <Text style={styles.modalLabel}>Phone Number</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g. 206-555-1234"
                  placeholderTextColor={colors.textSecondary + "80"}
                  value={editPhone}
                  onChangeText={setEditPhone}
                  keyboardType="phone-pad"
                />

                <Text style={styles.modalLabel}>Email Address</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g. john@email.com"
                  placeholderTextColor={colors.textSecondary + "80"}
                  value={editEmail}
                  onChangeText={setEditEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />

                <Text style={styles.modalLabel}>Address</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g. 123 Harbor Dr, Seattle, WA"
                  placeholderTextColor={colors.textSecondary + "80"}
                  value={editAddress}
                  onChangeText={setEditAddress}
                />

                <Text style={styles.modalLabel}>Notes</Text>
                <TextInput
                  style={[styles.modalInput, { minHeight: 80 }]}
                  placeholder="Any additional notes..."
                  placeholderTextColor={colors.textSecondary + "80"}
                  value={editNotes}
                  onChangeText={setEditNotes}
                  multiline
                  textAlignVertical="top"
                />

                <TouchableOpacity
                  style={[
                    styles.modalSubmit,
                    savingClient && { opacity: 0.6 },
                  ]}
                  onPress={handleUpdateClient}
                  disabled={savingClient}
                >
                  {savingClient ? (
                    <ActivityIndicator color={colors.bgPrimary} />
                  ) : (
                    <Text style={styles.modalSubmitText}>Save Changes</Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* New Job Modal */}
      <Modal visible={showNewJob} transparent animationType="slide">
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <ScrollView keyboardShouldPersistTaps="handled">
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>New Job</Text>
                  <TouchableOpacity onPress={() => setShowNewJob(false)}>
                    <Text style={styles.modalClose}>{"\u2715"}</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.modalLabel}>
                  Select Boat <Text style={{ color: colors.bad }}>*</Text>
                </Text>
                <View style={styles.boatSelector}>
                  {boats.map((boat) => (
                    <TouchableOpacity
                      key={boat.id}
                      style={[
                        styles.boatOption,
                        jobBoatId === boat.id && styles.boatOptionSelected,
                      ]}
                      onPress={() => setJobBoatId(boat.id)}
                    >
                      <Text
                        style={[
                          styles.boatOptionText,
                          jobBoatId === boat.id &&
                            styles.boatOptionTextSelected,
                        ]}
                      >
                        {boat.name}
                      </Text>
                      {boat.make_model && (
                        <Text style={styles.boatOptionSub}>
                          {boat.make_model}
                        </Text>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.modalLabel}>Service Types</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g. Oil Change, Annual Service"
                  placeholderTextColor={colors.textSecondary + "80"}
                  value={jobServiceTypes}
                  onChangeText={setJobServiceTypes}
                />
                <Text style={styles.modalHint}>
                  Separate multiple types with commas
                </Text>

                <Text style={styles.modalLabel}>Scheduled Date</Text>
                <View style={styles.dateRow}>
                  <TouchableOpacity
                    style={[styles.modalInput, styles.dateField]}
                    onPress={() => setShowJobDatePicker(true)}
                  >
                    <Text
                      style={[
                        styles.dateText,
                        !jobDate && { color: colors.textSecondary + "80" },
                      ]}
                    >
                      {jobDate
                        ? jobDate.toLocaleDateString(undefined, {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "TBD — tap to schedule"}
                    </Text>
                  </TouchableOpacity>
                  {jobDate && (
                    <TouchableOpacity
                      style={styles.dateClear}
                      onPress={() => setJobDate(null)}
                    >
                      <Text style={styles.dateClearText}>Clear</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {showJobDatePicker && (
                  <DateTimePicker
                    value={jobDate ?? new Date()}
                    mode="date"
                    display={Platform.OS === "ios" ? "inline" : "default"}
                    themeVariant="dark"
                    onChange={(_e, d) => {
                      // Android dismisses on its own; iOS inline stays open.
                      if (Platform.OS === "android") setShowJobDatePicker(false);
                      if (d) setJobDate(d);
                    }}
                  />
                )}
                {Platform.OS === "ios" && showJobDatePicker && (
                  <TouchableOpacity
                    style={styles.dateDone}
                    onPress={() => setShowJobDatePicker(false)}
                  >
                    <Text style={styles.dateDoneText}>Done</Text>
                  </TouchableOpacity>
                )}

                <Text style={styles.modalLabel}>Job Notes</Text>
                <TextInput
                  style={[styles.modalInput, { minHeight: 80 }]}
                  placeholder="Describe the work needed..."
                  placeholderTextColor={colors.textSecondary + "80"}
                  value={jobNotes}
                  onChangeText={setJobNotes}
                  multiline
                  textAlignVertical="top"
                />

                <TouchableOpacity
                  style={[
                    styles.modalSubmit,
                    creatingJob && { opacity: 0.6 },
                  ]}
                  onPress={handleCreateJob}
                  disabled={creatingJob}
                >
                  {creatingJob ? (
                    <ActivityIndicator color={colors.bgPrimary} />
                  ) : (
                    <Text style={styles.modalSubmitText}>Create Job</Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Boat Modal */}
      <Modal visible={showEditBoat} transparent animationType="slide">
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <ScrollView keyboardShouldPersistTaps="handled">
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Edit Boat</Text>
                  <TouchableOpacity onPress={() => setShowEditBoat(false)}>
                    <Text style={styles.modalClose}>{"\u2715"}</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.modalLabel}>
                  Boat Name <Text style={{ color: colors.bad }}>*</Text>
                </Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g. Sea Breeze IV"
                  placeholderTextColor={colors.textSecondary + "80"}
                  value={editBoatName}
                  onChangeText={setEditBoatName}
                />

                <Text style={styles.modalLabel}>Make / Model</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g. Boston Whaler 280"
                  placeholderTextColor={colors.textSecondary + "80"}
                  value={editBoatMakeModel}
                  onChangeText={setEditBoatMakeModel}
                />

                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalLabel}>Year</Text>
                    <TextInput
                      style={styles.modalInput}
                      placeholder="2024"
                      placeholderTextColor={colors.textSecondary + "80"}
                      value={editBoatYear}
                      onChangeText={setEditBoatYear}
                      keyboardType="number-pad"
                      maxLength={4}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalLabel}>Color</Text>
                    <TextInput
                      style={styles.modalInput}
                      placeholder="White"
                      placeholderTextColor={colors.textSecondary + "80"}
                      value={editBoatColor}
                      onChangeText={setEditBoatColor}
                    />
                  </View>
                </View>

                <Text style={styles.modalLabel}>HIN</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="BWC28001A424"
                  placeholderTextColor={colors.textSecondary + "80"}
                  value={editBoatHin}
                  onChangeText={setEditBoatHin}
                  autoCapitalize="characters"
                />

                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalLabel}>Engine Make</Text>
                    <TextInput
                      style={styles.modalInput}
                      placeholder="Mercury"
                      placeholderTextColor={colors.textSecondary + "80"}
                      value={editBoatEngineMake}
                      onChangeText={setEditBoatEngineMake}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalLabel}>Engine Model</Text>
                    <TextInput
                      style={styles.modalInput}
                      placeholder="V8 300hp"
                      placeholderTextColor={colors.textSecondary + "80"}
                      value={editBoatEngineModel}
                      onChangeText={setEditBoatEngineModel}
                    />
                  </View>
                </View>

                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalLabel}>Engine Hours (Port)</Text>
                    <TextInput
                      style={styles.modalInput}
                      placeholder="e.g. 1234.5"
                      placeholderTextColor={colors.textSecondary + "80"}
                      value={editBoatEngineHoursPort}
                      onChangeText={setEditBoatEngineHoursPort}
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalLabel}>Engine Hours (Stbd)</Text>
                    <TextInput
                      style={styles.modalInput}
                      placeholder="twin only"
                      placeholderTextColor={colors.textSecondary + "80"}
                      value={editBoatEngineHoursStarboard}
                      onChangeText={setEditBoatEngineHoursStarboard}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>

                <Text style={styles.modalLabel}>Home Marina</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g. Elliott Bay Marina"
                  placeholderTextColor={colors.textSecondary + "80"}
                  value={editBoatHomeMarina}
                  onChangeText={setEditBoatHomeMarina}
                />

                <TouchableOpacity
                  style={[
                    styles.modalSubmit,
                    savingBoat && { opacity: 0.6 },
                  ]}
                  onPress={handleUpdateBoat}
                  disabled={savingBoat}
                >
                  {savingBoat ? (
                    <ActivityIndicator color={colors.bgPrimary} />
                  ) : (
                    <Text style={styles.modalSubmitText}>Save Changes</Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 40 },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.bgPrimary,
  },
  errorText: { color: colors.textSecondary, fontSize: 16 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  backButton: {
    fontSize: 16,
    color: colors.gold,
  },
  headerName: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  // PDI section
  pdiCard: {
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  pdiCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  pdiBoatName: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  pdiDate: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  pdiStats: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 6,
  },
  pdiStat: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  pdiFlagged: {
    fontSize: 13,
    color: colors.bad,
    fontWeight: "600",
  },
  pdiNotesText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontStyle: "italic",
    marginBottom: 8,
  },
  pdiActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  pdiToggleBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 6,
    flex: 1,
    alignItems: "center",
  },
  pdiToggleBtnActive: {
    borderColor: colors.gold,
    backgroundColor: colors.gold + "15",
  },
  pdiToggleText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  pdiToggleTextActive: {
    color: colors.gold,
  },
  pdiEditBtn: {
    backgroundColor: colors.gold,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 6,
    flex: 1,
    alignItems: "center",
  },
  pdiEditBtnText: {
    color: colors.bgPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  pdiDeleteBtn: {
    borderWidth: 1,
    borderColor: colors.bad,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: "center",
  },
  pdiDeleteBtnText: {
    color: colors.bad,
    fontSize: 13,
    fontWeight: "600",
  },
  deleteClientBtn: {
    marginTop: 18,
    borderWidth: 1,
    borderColor: colors.bad,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: "center",
    alignSelf: "stretch",
  },
  deleteClientBtnText: {
    color: colors.bad,
    fontSize: 15,
    fontWeight: "700",
  },
  pdiExpandedSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  pdiExpandedEmpty: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: "center",
    paddingVertical: 8,
  },
  pdiChecklistRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border + "40",
  },
  pdiAssessmentDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
  },
  pdiChecklistName: {
    fontSize: 14,
    color: colors.textPrimary,
  },
  pdiChecklistNote: {
    fontSize: 12,
    color: colors.textSecondary,
    fontStyle: "italic",
    marginTop: 2,
  },
  pdiChecklistAssessment: {
    fontSize: 11,
    fontWeight: "700",
  },
  pdiInfoRow: {
    backgroundColor: colors.bgCard,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pdiInfoValue: {
    fontSize: 15,
    color: colors.textPrimary,
    fontWeight: "500",
  },
  pdiBoatSummary: {
    backgroundColor: colors.gold + "10",
    borderWidth: 1,
    borderColor: colors.gold + "30",
    borderRadius: 10,
    padding: 12,
    marginTop: 16,
  },
  pdiSummaryTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.gold,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  pdiSummaryText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  pdiSummaryDetail: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  // Customer card
  customerCard: {
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    marginBottom: 24,
    position: "relative" as const,
  },
  editButton: {
    position: "absolute" as const,
    top: 14,
    right: 14,
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  editButtonText: {
    color: colors.gold,
    fontSize: 13,
    fontWeight: "600",
  },
  customerAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.gold,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  customerAvatarText: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.bgPrimary,
  },
  customerName: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 8,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  infoIcon: { fontSize: 16 },
  infoText: {
    fontSize: 15,
    color: colors.textSecondary,
  },
  infoLink: {
    color: colors.gold,
  },
  contactActionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  contactChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.gold + "15",
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  contactChipText: {
    color: colors.gold,
    fontSize: 14,
    fontWeight: "600",
  },
  salesforceBtn: {
    marginTop: 16,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 20,
    alignItems: "center",
    alignSelf: "stretch",
  },
  salesforceBtnText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "600",
  },
  salesforceBtnAdd: {
    borderColor: colors.gold,
    backgroundColor: colors.goldMuted,
  },
  salesforceBtnAddText: {
    color: colors.gold,
  },
  customerNotes: {
    fontSize: 14,
    color: colors.textSecondary,
    fontStyle: "italic",
    marginTop: 12,
    textAlign: "center",
  },
  // Section headers
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.gold,
  },
  addSmallButton: {
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  addSmallButtonText: {
    color: colors.gold,
    fontSize: 12,
    fontWeight: "600",
  },
  newJobButton: {
    backgroundColor: colors.gold,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  newJobButtonText: {
    color: colors.bgPrimary,
    fontSize: 12,
    fontWeight: "700",
  },
  emptySection: {
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 24,
    alignItems: "center",
    marginBottom: 24,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
  },
  // Boat cards
  boatCard: {
    flexDirection: "row",
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    marginBottom: 10,
    overflow: "hidden",
  },
  boatCardAccent: {
    width: 4,
    backgroundColor: colors.gold,
  },
  boatCardContent: {
    flex: 1,
    padding: 14,
  },
  boatCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  boatEditHint: {
    fontSize: 12,
    color: colors.gold,
    fontWeight: "600",
  },
  boatName: {
    fontSize: 17,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  boatDetail: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  boatDetailsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  boatDetailChip: {
    backgroundColor: colors.bgCard,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  boatDetailLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  boatDetailValue: {
    fontSize: 13,
    color: colors.textPrimary,
    fontWeight: "500",
  },
  // Job cards
  jobCard: {
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  jobHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  jobBoatName: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textPrimary,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
  },
  jobServiceTypes: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 4,
  },
  jobDate: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: colors.bgSecondary,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "85%",
    padding: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  modalClose: {
    fontSize: 20,
    color: colors.textSecondary,
    padding: 4,
  },
  modalLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textSecondary,
    marginTop: 12,
    marginBottom: 6,
  },
  modalInput: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.textPrimary,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dateField: {
    flex: 1,
    justifyContent: "center",
  },
  dateText: {
    fontSize: 15,
    color: colors.textPrimary,
  },
  dateClear: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dateClearText: {
    color: colors.gold,
    fontSize: 13,
    fontWeight: "500",
  },
  dateDone: {
    alignSelf: "flex-end",
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginTop: 4,
  },
  dateDoneText: {
    color: colors.gold,
    fontSize: 14,
    fontWeight: "600",
  },
  modalHint: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 4,
  },
  modalSubmit: {
    backgroundColor: colors.gold,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 20,
    marginBottom: 20,
  },
  modalSubmitText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.bgPrimary,
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  // Boat selector
  boatSelector: {
    gap: 8,
  },
  boatOption: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
  },
  boatOptionSelected: {
    borderColor: colors.gold,
    backgroundColor: colors.gold + "15",
  },
  boatOptionText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  boatOptionTextSelected: {
    color: colors.gold,
  },
  boatOptionSub: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
