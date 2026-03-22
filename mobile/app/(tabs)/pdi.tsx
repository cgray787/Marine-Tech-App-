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
  Image,
  Dimensions,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "@/lib/auth-context";
import { useOffline } from "@/lib/offline-context";
import { supabase } from "@/lib/supabase";
import { savePendingPDIReport } from "@/lib/offline-db";
import { colors } from "@/constants/Colors";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const THUMB_SIZE = (SCREEN_WIDTH - 40 - 24) / 3;

type Boat = {
  id: string;
  name: string;
  make_model: string | null;
  year: number | null;
  hin: string | null;
  color: string | null;
  customer_id: string;
};
type Customer = { id: string; name: string };

const CATEGORIES = ["Engine", "Electrical", "Hull", "Safety", "Nav"] as const;
type Category = (typeof CATEGORIES)[number];

const CHECKLIST: Record<Category, string[]> = {
  Engine: [
    "Oil Pressure",
    "Oil Level",
    "Coolant Level",
    "Fuel System",
    "Exhaust System",
    "Throttle Response",
    "Steering System",
    "Propeller Condition",
    "Trim & Tilt",
    "Belts & Hoses",
  ],
  Electrical: [
    "Battery Voltage",
    "Battery Connections",
    "Navigation Lights",
    "Bilge Pump",
    "Horn",
    "Gauges & Instruments",
    "Switch Panel",
    "Shore Power",
  ],
  Hull: [
    "Hull Integrity",
    "Gel Coat Finish",
    "Zinc Anodes",
    "Through-Hull Fittings",
    "Rub Rail & Hardware",
  ],
  Safety: [
    "Life Jackets",
    "Fire Extinguisher",
    "Flares & Signals",
    "First Aid Kit",
    "Anchor & Line",
  ],
  Nav: ["GPS / Chartplotter", "Depth Finder", "VHF Radio", "Compass"],
};

const TOTAL_ITEMS = Object.values(CHECKLIST).flat().length;

const PHOTO_CATEGORIES = [
  "HIN Plate",
  "Engine Hours",
  "Before",
  "After",
  "Damage",
  "Other",
] as const;
type PhotoCategory = (typeof PHOTO_CATEGORIES)[number];

type Assessment = "good" | "bad" | null;
type ChecklistState = Record<
  string,
  {
    assessment: Assessment;
    notes: string;
    showNotes: boolean;
    photos: { uri: string; uploaded: boolean }[];
  }
>;

type GalleryPhoto = {
  uri: string;
  category: PhotoCategory;
  uploaded: boolean;
};

export default function PDIScreen() {
  const { profile } = useAuth();
  const { isOnline } = useOffline();
  const [boats, setBoats] = useState<Boat[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [boatId, setBoatId] = useState("");
  const [activeTab, setActiveTab] = useState<Category>("Engine");
  const [generalNotes, setGeneralNotes] = useState("");
  const [checklist, setChecklist] = useState<ChecklistState>({});
  const [submitting, setSubmitting] = useState(false);

  // Photo gallery state
  const [galleryPhotos, setGalleryPhotos] = useState<GalleryPhoto[]>([]);
  const [selectedPhotoCategory, setSelectedPhotoCategory] =
    useState<PhotoCategory>("Other");

  useEffect(() => {
    supabase
      .from("boats")
      .select("id, name, make_model, year, hin, color, customer_id")
      .order("name")
      .then(({ data }) => {
        if (data) setBoats(data);
      });
    supabase
      .from("customers")
      .select("id, name")
      .order("name")
      .then(({ data }) => {
        if (data) setCustomers(data);
      });
  }, []);

  const selectedBoat = boats.find((b) => b.id === boatId);
  const owner = customers.find((c) => c.id === selectedBoat?.customer_id);

  const completedCount = Object.values(checklist).filter(
    (v) => v.assessment !== null
  ).length;
  const flaggedCount = Object.values(checklist).filter(
    (v) => v.assessment === "bad"
  ).length;

  function setAssessment(item: string, assessment: Assessment) {
    setChecklist((prev) => ({
      ...prev,
      [item]: {
        assessment,
        notes: prev[item]?.notes || "",
        showNotes: prev[item]?.showNotes || false,
        photos: prev[item]?.photos || [],
      },
    }));
  }

  function setItemNotes(item: string, notes: string) {
    setChecklist((prev) => ({
      ...prev,
      [item]: {
        assessment: prev[item]?.assessment || null,
        notes,
        showNotes: prev[item]?.showNotes || true,
        photos: prev[item]?.photos || [],
      },
    }));
  }

  function toggleItemNotes(item: string) {
    setChecklist((prev) => ({
      ...prev,
      [item]: {
        assessment: prev[item]?.assessment || null,
        notes: prev[item]?.notes || "",
        showNotes: !prev[item]?.showNotes,
        photos: prev[item]?.photos || [],
      },
    }));
  }

  async function takeItemPhoto(item: string) {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission Required",
        "Camera access is needed to take photos."
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.7,
      allowsEditing: false,
    });

    if (!result.canceled && result.assets[0]) {
      setChecklist((prev) => ({
        ...prev,
        [item]: {
          assessment: prev[item]?.assessment || null,
          notes: prev[item]?.notes || "",
          showNotes: prev[item]?.showNotes || false,
          photos: [
            ...(prev[item]?.photos || []),
            { uri: result.assets[0].uri, uploaded: false },
          ],
        },
      }));
    }
  }

  async function takeGalleryPhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission Required",
        "Camera access is needed to take photos."
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.7,
      allowsEditing: false,
    });

    if (!result.canceled && result.assets[0]) {
      setGalleryPhotos((prev) => [
        ...prev,
        {
          uri: result.assets[0].uri,
          category: selectedPhotoCategory,
          uploaded: false,
        },
      ]);
    }
  }

  async function pickGalleryPhoto() {
    const { status } =
      await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission Required",
        "Photo library access is needed."
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.7,
      allowsMultipleSelection: true,
      selectionLimit: 5,
    });

    if (!result.canceled && result.assets.length > 0) {
      const newPhotos = result.assets.map((a) => ({
        uri: a.uri,
        category: selectedPhotoCategory,
        uploaded: false,
      }));
      setGalleryPhotos((prev) => [...prev, ...newPhotos]);
    }
  }

  function removeGalleryPhoto(index: number) {
    setGalleryPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  async function uploadPhoto(
    uri: string,
    bucket: string,
    reportId: string
  ): Promise<string | null> {
    try {
      const fileName = `${reportId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const response = await fetch(uri);
      const blob = await response.blob();

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(fileName, blob, { contentType: "image/jpeg" });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        return null;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from(bucket).getPublicUrl(fileName);

      return publicUrl;
    } catch (err) {
      console.error("Upload failed:", err);
      return null;
    }
  }

  function resetForm() {
    setBoatId("");
    setGeneralNotes("");
    setChecklist({});
    setActiveTab("Engine");
    setGalleryPhotos([]);
    setSelectedPhotoCategory("Other");
  }

  async function handleSubmitOffline() {
    if (!profile || !boatId) {
      Alert.alert("Error", "Please select a boat before submitting.");
      return;
    }

    setSubmitting(true);

    try {
      const checklistItems = Object.entries(checklist)
        .filter(([, val]) => val.assessment !== null)
        .map(([itemName, val], i) => {
          const category =
            Object.entries(CHECKLIST).find(([, items]) =>
              items.includes(itemName)
            )?.[0] || "Engine";
          return {
            category: category.toLowerCase(),
            itemName,
            assessment: val.assessment as string,
            notes: val.notes || null,
            sortOrder: i,
          };
        });

      const photos: { localUri: string; category: string; caption?: string }[] = [];

      for (const [itemName, val] of Object.entries(checklist)) {
        if (val.photos && val.photos.length > 0) {
          for (const photo of val.photos) {
            photos.push({ localUri: photo.uri, category: "other", caption: `PDI: ${itemName}` });
          }
        }
      }

      for (const photo of galleryPhotos) {
        const categorySlug = photo.category.toLowerCase().replace(/\s+/g, "_");
        photos.push({ localUri: photo.uri, category: categorySlug });
      }

      await savePendingPDIReport({
        techId: profile.id,
        boatId,
        customerId: selectedBoat?.customer_id || null,
        boatName: selectedBoat?.name || "",
        ownerName: owner?.name || "",
        makeModel: selectedBoat?.make_model || "",
        year: selectedBoat?.year || null,
        hin: selectedBoat?.hin || "",
        color: selectedBoat?.color || "",
        totalItems: TOTAL_ITEMS,
        completedItems: completedCount,
        flaggedItems: flaggedCount,
        generalNotes: generalNotes,
        checklistItems,
        photos,
      });

      setSubmitting(false);
      Alert.alert(
        "Saved Offline",
        "PDI report saved locally. It will sync when you have a connection.",
        [{ text: "OK", onPress: resetForm }]
      );
    } catch (err) {
      console.error("Offline save failed:", err);
      setSubmitting(false);
      Alert.alert("Error", "Failed to save PDI report offline.");
    }
  }

  async function handleSubmitOnline() {
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
      Alert.alert(
        "Error",
        reportError?.message || "Failed to submit PDI"
      );
      setSubmitting(false);
      return;
    }

    const rows = Object.entries(checklist)
      .filter(([, val]) => val.assessment !== null)
      .map(([itemName, val], i) => {
        const category =
          Object.entries(CHECKLIST).find(([, items]) =>
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

    // Upload checklist item photos
    for (const [itemName, val] of Object.entries(checklist)) {
      if (val.photos && val.photos.length > 0) {
        for (const photo of val.photos) {
          const url = await uploadPhoto(photo.uri, "pdi-photos", report.id);
          if (url) {
            await supabase.from("report_photos").insert({
              report_id: report.id,
              photo_url: url,
              category: "other",
              caption: `PDI: ${itemName}`,
            });
          }
        }
      }
    }

    // Upload gallery photos
    for (const photo of galleryPhotos) {
      const categorySlug = photo.category
        .toLowerCase()
        .replace(/\s+/g, "_") as string;
      const url = await uploadPhoto(photo.uri, "pdi-photos", report.id);
      if (url) {
        await supabase.from("report_photos").insert({
          report_id: report.id,
          photo_url: url,
          category: categorySlug,
        });
      }
    }

    setSubmitting(false);
    Alert.alert("Success", "PDI Report submitted!", [
      { text: "OK", onPress: resetForm },
    ]);
  }

  async function handleSubmit() {
    if (!profile || !boatId) {
      Alert.alert("Error", "Please select a boat before submitting.");
      return;
    }

    if (isOnline) {
      await handleSubmitOnline();
    } else {
      await handleSubmitOffline();
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
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
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipScroll}
      >
        {boats.map((b) => (
          <TouchableOpacity
            key={b.id}
            style={[styles.chip, boatId === b.id && styles.chipActive]}
            onPress={() => setBoatId(b.id)}
          >
            <Text
              style={[
                styles.chipText,
                boatId === b.id && styles.chipTextActive,
              ]}
            >
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
          {owner && (
            <Text style={styles.boatBarOwner}>Owner: {owner.name}</Text>
          )}
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
            <Text
              style={[
                styles.tabText,
                activeTab === cat && styles.tabTextActive,
              ]}
            >
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
              <View style={styles.checklistActions}>
                {/* Camera button */}
                <TouchableOpacity
                  style={styles.iconBtn}
                  onPress={() => takeItemPhoto(item)}
                >
                  <Text style={styles.iconBtnText}>{"\uD83D\uDCF7"}</Text>
                </TouchableOpacity>
                {/* Notes toggle */}
                <TouchableOpacity
                  style={[
                    styles.iconBtn,
                    state?.showNotes && styles.iconBtnActive,
                  ]}
                  onPress={() => toggleItemNotes(item)}
                >
                  <Text style={styles.iconBtnText}>{"\uD83D\uDCDD"}</Text>
                </TouchableOpacity>
                {/* Assessment buttons */}
                <View style={styles.assessmentRow}>
                  <TouchableOpacity
                    style={[
                      styles.assessBtn,
                      state?.assessment === "bad" && styles.assessBtnBad,
                    ]}
                    onPress={() =>
                      setAssessment(
                        item,
                        state?.assessment === "bad" ? null : "bad"
                      )
                    }
                  >
                    <Text
                      style={[
                        styles.assessText,
                        state?.assessment === "bad" &&
                          styles.assessTextActive,
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
                    onPress={() =>
                      setAssessment(
                        item,
                        state?.assessment === "good" ? null : "good"
                      )
                    }
                  >
                    <Text
                      style={[
                        styles.assessText,
                        state?.assessment === "good" &&
                          styles.assessTextActive,
                      ]}
                    >
                      GOOD
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Notes input */}
            {(state?.showNotes || state?.assessment === "bad") && (
              <TextInput
                style={styles.notesInput}
                placeholder={
                  state?.assessment === "bad"
                    ? "Describe the issue..."
                    : "Add a note..."
                }
                placeholderTextColor={colors.textSecondary + "80"}
                value={state?.notes || ""}
                onChangeText={(text) => setItemNotes(item, text)}
              />
            )}

            {/* Inline photo thumbnails */}
            {state?.photos && state.photos.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.inlinePhotoScroll}
              >
                {state.photos.map((photo, idx) => (
                  <Image
                    key={idx}
                    source={{ uri: photo.uri }}
                    style={styles.inlineThumb}
                  />
                ))}
              </ScrollView>
            )}
          </View>
        );
      })}

      {/* Photo Gallery Section */}
      <Text style={styles.sectionTitle}>Photos</Text>

      {/* Category selector */}
      <View style={styles.photoCatRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {PHOTO_CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[
                styles.photoCatChip,
                selectedPhotoCategory === cat && styles.photoCatChipActive,
              ]}
              onPress={() => setSelectedPhotoCategory(cat)}
            >
              <Text
                style={[
                  styles.photoCatChipText,
                  selectedPhotoCategory === cat &&
                    styles.photoCatChipTextActive,
                ]}
              >
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Photo grid */}
      <View style={styles.photoGrid}>
        {galleryPhotos.map((photo, index) => (
          <View key={index} style={styles.photoGridItem}>
            <Image
              source={{ uri: photo.uri }}
              style={styles.photoGridImage}
            />
            <View style={styles.photoLabel}>
              <Text style={styles.photoLabelText}>{photo.category}</Text>
            </View>
            <TouchableOpacity
              style={styles.photoRemoveBtn}
              onPress={() => removeGalleryPhoto(index)}
            >
              <Text style={styles.photoRemoveText}>{"\u2715"}</Text>
            </TouchableOpacity>
          </View>
        ))}

        <TouchableOpacity
          style={styles.addPhotoBtn}
          onPress={takeGalleryPhoto}
        >
          <Text style={styles.addPhotoIcon}>{"\uD83D\uDCF7"}</Text>
          <Text style={styles.addPhotoText}>Camera</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.addPhotoBtn}
          onPress={pickGalleryPhoto}
        >
          <Text style={styles.addPhotoIcon}>{"\uD83D\uDDBC\uFE0F"}</Text>
          <Text style={styles.addPhotoText}>Library</Text>
        </TouchableOpacity>
      </View>

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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  title: { fontSize: 24, fontWeight: "700", color: colors.textPrimary },
  counter: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  counterText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: "600",
  },
  label: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 6,
    marginTop: 8,
  },
  chipScroll: { marginBottom: 8 },
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
  boatBar: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  boatBarText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "600",
  },
  boatBarOwner: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  colorTag: {
    backgroundColor: colors.statusNew + "20",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: "flex-start",
    marginTop: 6,
  },
  colorTagText: {
    color: colors.statusNew,
    fontSize: 11,
    fontWeight: "600",
  },
  tabRow: {
    flexDirection: "row",
    marginTop: 20,
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.gold,
    marginTop: 20,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: colors.gold,
    paddingLeft: 12,
  },
  checklistRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginTop: 8,
  },
  checklistLabel: {
    color: colors.textPrimary,
    fontSize: 14,
    flex: 1,
    marginRight: 4,
  },
  checklistActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconBtnActive: {
    borderColor: colors.gold,
    backgroundColor: colors.goldMuted,
  },
  iconBtnText: {
    fontSize: 14,
  },
  assessmentRow: { flexDirection: "row", gap: 4 },
  assessBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  assessBtnBad: { backgroundColor: colors.bad, borderColor: colors.bad },
  assessBtnGood: { backgroundColor: colors.good, borderColor: colors.good },
  assessText: { fontSize: 11, fontWeight: "700", color: colors.textSecondary },
  assessTextActive: { color: colors.white },
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
  inlinePhotoScroll: {
    marginTop: 6,
    marginLeft: 8,
    marginBottom: 2,
  },
  inlineThumb: {
    width: 56,
    height: 56,
    borderRadius: 8,
    marginRight: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
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

  // Photo gallery
  photoCatRow: {
    marginBottom: 12,
  },
  photoCatChip: {
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginRight: 6,
  },
  photoCatChipActive: {
    backgroundColor: colors.goldMuted,
    borderColor: colors.gold,
  },
  photoCatChipText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "500",
  },
  photoCatChipTextActive: {
    color: colors.gold,
    fontWeight: "600",
  },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  photoGridItem: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: colors.bgCard,
  },
  photoGridImage: {
    width: "100%",
    height: "100%",
    borderRadius: 10,
  },
  photoLabel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingVertical: 3,
    paddingHorizontal: 6,
  },
  photoLabelText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: "600",
  },
  photoRemoveBtn: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  photoRemoveText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: "700",
  },
  addPhotoBtn: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bgCard,
  },
  addPhotoIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  addPhotoText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "500",
  },
  submitButton: {
    backgroundColor: colors.gold,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 32,
  },
  submitText: {
    color: colors.bgPrimary,
    fontSize: 16,
    fontWeight: "700",
  },
  flagWarning: {
    color: colors.bad,
    fontSize: 13,
    textAlign: "center",
    marginTop: 8,
    fontWeight: "600",
  },
});
