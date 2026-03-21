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

type Boat = { id: string; name: string; make_model: string | null; year: number | null; hin: string | null; color: string | null; customer_id: string };
type Customer = { id: string; name: string };

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

const TOTAL_ITEMS = Object.values(CHECKLIST).flat().length;

type Assessment = "good" | "bad" | null;
type ChecklistState = Record<string, { assessment: Assessment; notes: string }>;

export default function PDIScreen() {
  const { profile } = useAuth();
  const [boats, setBoats] = useState<Boat[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [boatId, setBoatId] = useState("");
  const [activeTab, setActiveTab] = useState<Category>("Engine");
  const [generalNotes, setGeneralNotes] = useState("");
  const [checklist, setChecklist] = useState<ChecklistState>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase.from("boats").select("id, name, make_model, year, hin, color, customer_id").order("name").then(({ data }) => {
      if (data) setBoats(data);
    });
    supabase.from("customers").select("id, name").order("name").then(({ data }) => {
      if (data) setCustomers(data);
    });
  }, []);

  const selectedBoat = boats.find((b) => b.id === boatId);
  const owner = customers.find((c) => c.id === selectedBoat?.customer_id);

  const completedCount = Object.values(checklist).filter((v) => v.assessment !== null).length;
  const flaggedCount = Object.values(checklist).filter((v) => v.assessment === "bad").length;

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
    if (!profile || !boatId) {
      Alert.alert("Error", "Please select a boat before submitting.");
      return;
    }

    setSubmitting(true);

    const { data: report, error: reportError } = await supabase
      .from("pdi_reports")
      .insert({
        tech_id: profile.id,
        boat_id: boatId,
        customer_id: selectedBoat?.customer_id || null,
        boat_name: selectedBoat?.name || "",
        owner_name: owner?.name || "",
        make_model: selectedBoat?.make_model || "",
        year: selectedBoat?.year || null,
        hin: selectedBoat?.hin || "",
        color: selectedBoat?.color || "",
        marina: "",
        total_items: TOTAL_ITEMS,
        completed_items: completedCount,
        flagged_items: flaggedCount,
        general_notes: generalNotes,
      })
      .select("id")
      .single();

    if (reportError || !report) {
      Alert.alert("Error", reportError?.message || "Failed to submit PDI");
      setSubmitting(false);
      return;
    }

    const rows = Object.entries(checklist)
      .filter(([, val]) => val.assessment !== null)
      .map(([itemName, val], i) => {
        const category = Object.entries(CHECKLIST).find(([, items]) =>
          items.includes(itemName)
        )?.[0] || "Engine";
        return {
          pdi_report_id: report.id,
          category: category.toLowerCase(),
          item_name: itemName,
          assessment: val.assessment,
          notes: val.notes || null,
          sort_order: i,
        };
      });

    if (rows.length > 0) {
      await supabase.from("pdi_checklist_items").insert(rows);
    }

    setSubmitting(false);
    Alert.alert("Success", "PDI Report submitted!", [
      {
        text: "OK",
        onPress: () => {
          setBoatId("");
          setGeneralNotes("");
          setChecklist({});
          setActiveTab("Engine");
        },
      },
    ]);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Pre-Delivery Inspection</Text>
        </View>
        <View style={styles.counter}>
          <Text style={styles.counterText}>
            {completedCount} / {TOTAL_ITEMS}
          </Text>
        </View>
      </View>

      {/* Boat Selection */}
      <Text style={styles.label}>Select Vessel</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
        {boats.map((b) => (
          <TouchableOpacity
            key={b.id}
            style={[styles.chip, boatId === b.id && styles.chipActive]}
            onPress={() => setBoatId(b.id)}
          >
            <Text style={[styles.chipText, boatId === b.id && styles.chipTextActive]}>
              {b.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {selectedBoat && (
        <View style={styles.boatBar}>
          <Text style={styles.boatBarText}>
            {selectedBoat.name} — {selectedBoat.year} {selectedBoat.make_model}
          </Text>
          {owner && <Text style={styles.boatBarOwner}>Owner: {owner.name}</Text>}
          {selectedBoat.color && (
            <View style={styles.colorTag}>
              <Text style={styles.colorTagText}>{selectedBoat.color}</Text>
            </View>
          )}
        </View>
      )}

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
                  style={[styles.assessBtn, state?.assessment === "bad" && styles.assessBtnBad]}
                  onPress={() => setAssessment(item, state?.assessment === "bad" ? null : "bad")}
                >
                  <Text style={[styles.assessText, state?.assessment === "bad" && styles.assessTextActive]}>
                    BAD
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.assessBtn, state?.assessment === "good" && styles.assessBtnGood]}
                  onPress={() => setAssessment(item, state?.assessment === "good" ? null : "good")}
                >
                  <Text style={[styles.assessText, state?.assessment === "good" && styles.assessTextActive]}>
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
          <Text style={styles.submitText}>Submit PDI Report</Text>
        )}
      </TouchableOpacity>

      {flaggedCount > 0 && (
        <Text style={styles.flagWarning}>
          {flaggedCount} item{flaggedCount > 1 ? "s" : ""} need attention
        </Text>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 40 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  title: { fontSize: 24, fontWeight: "700", color: colors.textPrimary },
  counter: { backgroundColor: colors.bgSecondary, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 },
  counterText: { color: colors.textSecondary, fontSize: 14, fontWeight: "600" },
  label: { fontSize: 13, color: colors.textSecondary, marginBottom: 6, marginTop: 8 },
  chipScroll: { marginBottom: 8 },
  chip: { backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, marginRight: 8 },
  chipActive: { backgroundColor: colors.goldMuted, borderColor: colors.gold },
  chipText: { color: colors.textSecondary, fontSize: 14 },
  chipTextActive: { color: colors.gold, fontWeight: "600" },
  boatBar: { backgroundColor: colors.bgSecondary, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  boatBarText: { color: colors.textPrimary, fontSize: 15, fontWeight: "600" },
  boatBarOwner: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
  colorTag: { backgroundColor: colors.statusNew + "20", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, alignSelf: "flex-start", marginTop: 6 },
  colorTagText: { color: colors.statusNew, fontSize: 11, fontWeight: "600" },
  tabRow: { flexDirection: "row", marginTop: 20, marginBottom: 4, gap: 6 },
  tab: { backgroundColor: colors.bgSecondary, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: colors.border },
  tabActive: { backgroundColor: colors.gold, borderColor: colors.gold },
  tabText: { color: colors.textSecondary, fontSize: 13, fontWeight: "500" },
  tabTextActive: { color: colors.bgPrimary, fontWeight: "600" },
  sectionTitle: { fontSize: 18, fontWeight: "600", color: colors.gold, marginTop: 20, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: colors.gold, paddingLeft: 12 },
  checklistRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 14, marginTop: 8 },
  checklistLabel: { color: colors.textPrimary, fontSize: 15, flex: 1 },
  assessmentRow: { flexDirection: "row", gap: 6 },
  assessBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border },
  assessBtnBad: { backgroundColor: colors.bad, borderColor: colors.bad },
  assessBtnGood: { backgroundColor: colors.good, borderColor: colors.good },
  assessText: { fontSize: 12, fontWeight: "700", color: colors.textSecondary },
  assessTextActive: { color: colors.white },
  notesInput: { backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10, color: colors.textPrimary, fontSize: 14, marginTop: 4, marginLeft: 8, marginRight: 8 },
  input: { backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 14, color: colors.textPrimary, fontSize: 15 },
  textArea: { minHeight: 100 },
  submitButton: { backgroundColor: colors.gold, borderRadius: 10, paddingVertical: 16, alignItems: "center", marginTop: 32 },
  submitText: { color: colors.bgPrimary, fontSize: 16, fontWeight: "700" },
  flagWarning: { color: colors.bad, fontSize: 13, textAlign: "center", marginTop: 8, fontWeight: "600" },
});
