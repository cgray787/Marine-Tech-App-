import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { colors } from "@/constants/Colors";

type Customer = { id: string; name: string };
type Boat = { id: string; name: string; make_model: string | null; year: number | null; hin: string | null; customer_id: string };
type Marina = { id: string; name: string };

const CATEGORIES = ["Engine", "Electrical", "Hull", "Safety", "Nav"] as const;
type Category = (typeof CATEGORIES)[number];

const CHECKLIST: Record<Category, string[]> = {
  Engine: [
    "Oil Pressure", "Oil Level", "Coolant Level", "Fuel System",
    "Exhaust System", "Throttle Response", "Steering System",
    "Propeller Condition", "Trim & Tilt", "Belts & Hoses",
  ],
  Electrical: [
    "Battery Voltage", "Battery Connections", "Navigation Lights",
    "Bilge Pump", "Horn", "Gauges & Instruments", "Switch Panel", "Shore Power",
  ],
  Hull: [
    "Hull Integrity", "Gel Coat Finish", "Zinc Anodes",
    "Through-Hull Fittings", "Rub Rail & Hardware",
  ],
  Safety: [
    "Life Jackets", "Fire Extinguisher", "Flares & Signals",
    "First Aid Kit", "Anchor & Line",
  ],
  Nav: ["GPS / Chartplotter", "Depth Finder", "VHF Radio", "Compass"],
};

type Assessment = "good" | "bad" | null;
type ChecklistState = Record<string, { assessment: Assessment; notes: string }>;

export default function ServiceScreen() {
  const { profile } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [boats, setBoats] = useState<Boat[]>([]);
  const [marinas, setMarinas] = useState<Marina[]>([]);
  const [activeTab, setActiveTab] = useState<Category>("Engine");
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [customerId, setCustomerId] = useState("");
  const [boatId, setBoatId] = useState("");
  const [hin, setHin] = useState("");
  const [marinaId, setMarinaId] = useState("");
  const [generalNotes, setGeneralNotes] = useState("");
  const [checklist, setChecklist] = useState<ChecklistState>({});

  useEffect(() => {
    supabase.from("customers").select("id, name").order("name").then(({ data }) => {
      if (data) setCustomers(data);
    });
    supabase.from("boats").select("id, name, make_model, year, hin, customer_id").order("name").then(({ data }) => {
      if (data) setBoats(data);
    });
    supabase.from("marinas").select("id, name").order("name").then(({ data }) => {
      if (data) setMarinas(data);
    });
  }, []);

  const filteredBoats = customerId
    ? boats.filter((b) => b.customer_id === customerId)
    : boats;

  const selectedBoat = boats.find((b) => b.id === boatId);

  function setAssessment(item: string, assessment: Assessment) {
    setChecklist((prev) => ({
      ...prev,
      [item]: { ...prev[item], assessment, notes: prev[item]?.notes || "" },
    }));
  }

  function setItemNotes(item: string, notes: string) {
    setChecklist((prev) => ({
      ...prev,
      [item]: { ...prev[item], notes, assessment: prev[item]?.assessment || null },
    }));
  }

  async function handleSubmit() {
    if (!profile) return;

    const customer = customers.find((c) => c.id === customerId);

    setSubmitting(true);

    // Create job
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .insert({
        assigned_to: profile.id,
        customer_id: customerId || null,
        boat_id: boatId || null,
        marina_id: marinaId || null,
        service_types: [],
        status: "completed",
        created_by: profile.id,
      })
      .select("id")
      .single();

    if (jobError || !job) {
      Alert.alert("Error", jobError?.message || "Failed to create job");
      setSubmitting(false);
      return;
    }

    // Create service report
    const { data: report, error: reportError } = await supabase
      .from("service_reports")
      .insert({
        job_id: job.id,
        tech_id: profile.id,
        boat_id: boatId || null,
        customer_id: customerId || null,
        boat_name: selectedBoat?.name || "",
        owner_name: customer?.name || "",
        make_model: selectedBoat?.make_model || "",
        year: selectedBoat?.year || null,
        hin: hin || selectedBoat?.hin || "",
        marina: marinas.find((m) => m.id === marinaId)?.name || "",
        general_notes: generalNotes,
      })
      .select("id")
      .single();

    if (reportError || !report) {
      Alert.alert("Error", reportError?.message || "Failed to create report");
      setSubmitting(false);
      return;
    }

    // Insert checklist items
    const checklistRows = Object.entries(checklist)
      .filter(([, val]) => val.assessment !== null)
      .map(([itemName, val], i) => {
        const category = Object.entries(CHECKLIST).find(([, items]) =>
          items.includes(itemName)
        )?.[0] || "Engine";
        return {
          report_id: report.id,
          category: category.toLowerCase(),
          item_name: itemName,
          assessment: val.assessment,
          notes: val.notes || null,
          sort_order: i,
        };
      });

    if (checklistRows.length > 0) {
      await supabase.from("checklist_items").insert(checklistRows);
    }

    setSubmitting(false);
    Alert.alert("Success", "Service report submitted!", [
      { text: "OK", onPress: resetForm },
    ]);
  }

  function resetForm() {
    setCustomerId("");
    setBoatId("");
    setHin("");
    setMarinaId("");
    setGeneralNotes("");
    setChecklist({});
    setActiveTab("Engine");
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>New Job</Text>
      </View>

      {/* Customer & Vessel Section */}
      <Text style={styles.sectionTitle}>Customer & Vessel</Text>

      <Text style={styles.label}>Customer Name</Text>
      <View style={styles.pickerWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {customers.map((c) => (
            <TouchableOpacity
              key={c.id}
              style={[styles.chip, customerId === c.id && styles.chipActive]}
              onPress={() => { setCustomerId(c.id); setBoatId(""); }}
            >
              <Text style={[styles.chipText, customerId === c.id && styles.chipTextActive]}>
                {c.name}
              </Text>
            </TouchableOpacity>
          ))}
          {customers.length === 0 && <Text style={styles.placeholder}>No customers yet</Text>}
        </ScrollView>
      </View>

      <Text style={styles.label}>Boat Name</Text>
      <View style={styles.pickerWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {filteredBoats.map((b) => (
            <TouchableOpacity
              key={b.id}
              style={[styles.chip, boatId === b.id && styles.chipActive]}
              onPress={() => { setBoatId(b.id); setHin(b.hin || ""); }}
            >
              <Text style={[styles.chipText, boatId === b.id && styles.chipTextActive]}>
                {b.name}
              </Text>
            </TouchableOpacity>
          ))}
          {filteredBoats.length === 0 && <Text style={styles.placeholder}>No boats</Text>}
        </ScrollView>
      </View>

      {selectedBoat && (
        <View style={styles.boatInfo}>
          <Text style={styles.boatInfoText}>
            {selectedBoat.make_model} {selectedBoat.year ? `• ${selectedBoat.year}` : ""}
          </Text>
        </View>
      )}

      <Text style={styles.label}>Hull ID / HIN</Text>
      <TextInput
        style={styles.input}
        value={hin}
        onChangeText={setHin}
        placeholder="Enter HIN..."
        placeholderTextColor={colors.textSecondary + "80"}
      />

      <Text style={styles.label}>Location / Marina</Text>
      <View style={styles.pickerWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {marinas.map((m) => (
            <TouchableOpacity
              key={m.id}
              style={[styles.chip, marinaId === m.id && styles.chipActive]}
              onPress={() => setMarinaId(m.id)}
            >
              <Text style={[styles.chipText, marinaId === m.id && styles.chipTextActive]}>
                {m.name}
              </Text>
            </TouchableOpacity>
          ))}
          {marinas.length === 0 && <Text style={styles.placeholder}>No marinas yet</Text>}
        </ScrollView>
      </View>

      {/* Category Tabs */}
      <View style={styles.tabRow}>
        {CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat}
            style={[styles.tab, activeTab === cat && styles.tabActive]}
            onPress={() => setActiveTab(cat)}
          >
            <Text style={[styles.tabText, activeTab === cat && styles.tabTextActive]}>
              {cat}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Checklist */}
      <Text style={styles.sectionTitle}>{activeTab} Systems</Text>

      {CHECKLIST[activeTab].map((item) => {
        const state = checklist[item];
        return (
          <View key={item}>
            <View style={styles.checklistRow}>
              <Text style={styles.checklistLabel}>{item}</Text>
              <View style={styles.assessmentRow}>
                <TouchableOpacity
                  style={[
                    styles.assessBtn,
                    state?.assessment === "bad" && styles.assessBtnBad,
                  ]}
                  onPress={() => setAssessment(item, state?.assessment === "bad" ? null : "bad")}
                >
                  <Text
                    style={[
                      styles.assessText,
                      state?.assessment === "bad" && styles.assessTextBadActive,
                    ]}
                  >
                    BAD
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.assessBtn,
                    state?.assessment === "good" && styles.assessBtnGood,
                  ]}
                  onPress={() => setAssessment(item, state?.assessment === "good" ? null : "good")}
                >
                  <Text
                    style={[
                      styles.assessText,
                      state?.assessment === "good" && styles.assessTextGoodActive,
                    ]}
                  >
                    GOOD
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
            {state?.assessment === "bad" && (
              <TextInput
                style={styles.notesInput}
                placeholder="Describe the issue..."
                placeholderTextColor={colors.textSecondary + "80"}
                value={state.notes}
                onChangeText={(text) => setItemNotes(item, text)}
              />
            )}
          </View>
        );
      })}

      {/* General Notes */}
      <Text style={styles.sectionTitle}>General Notes</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        placeholder="Additional notes or observations..."
        placeholderTextColor={colors.textSecondary + "80"}
        value={generalNotes}
        onChangeText={setGeneralNotes}
        multiline
        numberOfLines={4}
        textAlignVertical="top"
      />

      {/* Submit */}
      <TouchableOpacity
        style={[styles.submitButton, submitting && { opacity: 0.6 }]}
        onPress={handleSubmit}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color={colors.bgPrimary} />
        ) : (
          <Text style={styles.submitText}>Create Job</Text>
        )}
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 40 },
  header: { marginBottom: 24 },
  title: { fontSize: 28, fontWeight: "700", color: colors.textPrimary },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.gold,
    marginTop: 28,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: colors.gold,
    paddingLeft: 12,
  },
  label: { fontSize: 13, color: colors.textSecondary, marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: colors.textPrimary,
    fontSize: 15,
  },
  textArea: { minHeight: 100 },
  pickerWrap: { marginBottom: 4 },
  chip: {
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
  },
  chipActive: {
    backgroundColor: colors.goldMuted,
    borderColor: colors.gold,
  },
  chipText: { color: colors.textSecondary, fontSize: 14 },
  chipTextActive: { color: colors.gold, fontWeight: "600" },
  placeholder: { color: colors.textSecondary, fontSize: 14, paddingVertical: 8 },
  boatInfo: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
  },
  boatInfoText: { color: colors.textSecondary, fontSize: 13 },
  tabRow: {
    flexDirection: "row",
    marginTop: 28,
    marginBottom: 4,
    gap: 6,
  },
  tab: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: {
    backgroundColor: colors.gold,
    borderColor: colors.gold,
  },
  tabText: { color: colors.textSecondary, fontSize: 13, fontWeight: "500" },
  tabTextActive: { color: colors.bgPrimary, fontWeight: "600" },
  checklistRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 8,
  },
  checklistLabel: { color: colors.textPrimary, fontSize: 15, flex: 1 },
  assessmentRow: { flexDirection: "row", gap: 6 },
  assessBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  assessBtnBad: { backgroundColor: colors.bad, borderColor: colors.bad },
  assessBtnGood: { backgroundColor: colors.good, borderColor: colors.good },
  assessText: { fontSize: 12, fontWeight: "700", color: colors.textSecondary },
  assessTextBadActive: { color: colors.white },
  assessTextGoodActive: { color: colors.white },
  notesInput: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: 14,
    marginTop: 4,
    marginLeft: 8,
    marginRight: 8,
  },
  submitButton: {
    backgroundColor: colors.gold,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 32,
  },
  submitText: { color: colors.bgPrimary, fontSize: 16, fontWeight: "700" },
});
