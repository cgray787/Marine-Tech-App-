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
  KeyboardAvoidingView,
  Platform,
  Modal,
  Linking,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import { useAuth } from "@/lib/auth-context";
import { useOffline } from "@/lib/offline-context";
import { supabase } from "@/lib/supabase";
import { savePendingReport } from "@/lib/offline-db";
import { colors } from "@/constants/Colors";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const THUMB_SIZE = (SCREEN_WIDTH - 40 - 24) / 3; // 3 per row with gaps

type Customer = { id: string; name: string };
type Boat = {
  id: string;
  name: string;
  make_model: string | null;
  year: number | null;
  hin: string | null;
  customer_id: string;
};
type Marina = { id: string; name: string };

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

const PHOTO_CATEGORIES = [
  "HIN Plate",
  "Engine Hours",
  "Before",
  "After",
  "Damage",
  "Other",
] as const;
type PhotoCategory = (typeof PHOTO_CATEGORIES)[number];

type Assessment = "good" | "bad" | "na" | null;
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

export default function ServiceScreen() {
  const { profile } = useAuth();
  const { isOnline } = useOffline();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [boats, setBoats] = useState<Boat[]>([]);
  const [marinas, setMarinas] = useState<Marina[]>([]);
  const [activeTab, setActiveTab] = useState<Category>("Engine");
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [jobName, setJobName] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [boatId, setBoatId] = useState("");
  const [hin, setHin] = useState("");
  const [hinSaved, setHinSaved] = useState(false);
  const [location, setLocation] = useState("");
  const [locationSaved, setLocationSaved] = useState(false);
  const [generalNotes, setGeneralNotes] = useState("");
  const [checklist, setChecklist] = useState<ChecklistState>({});

  // Parts needed state
  type Part = {
    name: string;
    qty: number;
    partNum: string;
    ordered: boolean;
    photo?: string;
    supplier: string;
    url: string;
  };
  const [parts, setParts] = useState<Part[]>([]);
  const [newPartName, setNewPartName] = useState("");
  const [viewingPartPhoto, setViewingPartPhoto] = useState<string | null>(null);
  const [expandedPartIndex, setExpandedPartIndex] = useState<number | null>(null);

  async function takePartPhoto(index: number) {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Camera access is required to take photos.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets?.[0]) {
      setParts((prev) =>
        prev.map((p, i) => (i === index ? { ...p, photo: result.assets[0].uri } : p))
      );
    }
  }

  async function savePartPhoto(uri: string) {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Photo library access is required to save.");
      return;
    }
    await MediaLibrary.saveToLibraryAsync(uri);
    Alert.alert("Saved", "Photo saved to your library.");
  }

  // Photo gallery state
  const [galleryPhotos, setGalleryPhotos] = useState<GalleryPhoto[]>([]);
  const [selectedPhotoCategory, setSelectedPhotoCategory] =
    useState<PhotoCategory>("Other");

  useEffect(() => {
    supabase
      .from("customers")
      .select("id, name")
      .order("name")
      .then(({ data }) => {
        if (data) setCustomers(data);
      });
    supabase
      .from("boats")
      .select("id, name, make_model, year, hin, customer_id")
      .order("name")
      .then(({ data }) => {
        if (data) setBoats(data);
      });
    supabase
      .from("marinas")
      .select("id, name")
      .order("name")
      .then(({ data }) => {
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
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
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
    reportId: string,
    category: string
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

  async function handleSubmitOffline() {
    if (!profile) return;

    const customer = customers.find((c) => c.id === customerId);

    setSubmitting(true);

    try {
      // Build checklist items for offline storage
      const checklistItems = Object.entries(checklist)
        .filter(([, val]) => val.assessment === "good" || val.assessment === "bad")
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

      // Collect all photos (checklist + gallery)
      const photos: { localUri: string; category: string; caption?: string }[] = [];

      for (const [itemName, val] of Object.entries(checklist)) {
        if (val.photos && val.photos.length > 0) {
          for (const photo of val.photos) {
            photos.push({ localUri: photo.uri, category: "other", caption: itemName });
          }
        }
      }

      for (const photo of galleryPhotos) {
        const categorySlug = photo.category.toLowerCase().replace(/\s+/g, "_");
        photos.push({ localUri: photo.uri, category: categorySlug });
      }

      await savePendingReport({
        jobId: "",
        techId: profile.id,
        boatId: boatId || null,
        customerId: customerId || null,
        boatName: selectedBoat?.name || "",
        ownerName: customer?.name || "",
        makeModel: selectedBoat?.make_model || "",
        year: selectedBoat?.year || null,
        hin: hin || selectedBoat?.hin || "",
        marina: location.trim(),
        marinaId: null,
        generalNotes: generalNotes,
        jobName: jobName,
        jobDescription: jobDescription,
        serviceTypes: jobName ? [jobName] : [],
        checklistItems,
        photos,
      });

      setSubmitting(false);
      Alert.alert(
        "Saved Offline",
        "Service report saved locally. It will sync when you have a connection.",
        [{ text: "OK", onPress: resetForm }]
      );
    } catch (err) {
      console.error("Offline save failed:", err);
      setSubmitting(false);
      Alert.alert("Error", "Failed to save report offline.");
    }
  }

  async function handleSubmitOnline() {
    if (!profile) return;

    const customer = customers.find((c) => c.id === customerId);

    setSubmitting(true);

    // Create job
    const jobPayload = {
      assigned_to: profile.id,
      customer_id: customerId || null,
      boat_id: boatId || null,
      marina_id: null,
      service_types: jobName ? [jobName] : [],
      status: "completed",
      notes: jobDescription || null,
      created_by: profile.id,
    };

    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .insert(jobPayload)
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
        marina: location.trim(),
        general_notes: generalNotes,
      })
      .select("id")
      .single();

    if (reportError || !report) {
      Alert.alert(
        "Error",
        reportError?.message || "Failed to create report"
      );
      setSubmitting(false);
      return;
    }

    // Insert checklist items (filter out "na" — DB only allows 'good' or 'bad')
    const checklistRows = Object.entries(checklist)
      .filter(([, val]) => val.assessment === "good" || val.assessment === "bad")
      .map(([itemName, val], i) => {
        const category =
          Object.entries(CHECKLIST).find(([, items]) =>
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
      const { error: checklistError } = await supabase
        .from("checklist_items")
        .insert(checklistRows);
      if (checklistError) {
        console.error("Checklist insert error:", checklistError);
        Alert.alert(
          "Warning",
          "Report saved but some checklist items may not have been recorded. Please check the report."
        );
      }
    }

    // Upload all photos in parallel (checklist + gallery)
    const photoUploads: Promise<void>[] = [];

    for (const [itemName, val] of Object.entries(checklist)) {
      if (val.photos && val.photos.length > 0) {
        for (const photo of val.photos) {
          photoUploads.push(
            (async () => {
              const url = await uploadPhoto(photo.uri, "report-photos", report.id, "checklist");
              if (url) {
                await supabase.from("report_photos").insert({
                  report_id: report.id,
                  photo_url: url,
                  category: "other",
                  caption: itemName,
                });
              }
            })()
          );
        }
      }
    }

    for (const photo of galleryPhotos) {
      const categorySlug = photo.category.toLowerCase().replace(/\s+/g, "_") as string;
      photoUploads.push(
        (async () => {
          const url = await uploadPhoto(photo.uri, "report-photos", report.id, categorySlug);
          if (url) {
            await supabase.from("report_photos").insert({
              report_id: report.id,
              photo_url: url,
              category: categorySlug,
            });
          }
        })()
      );
    }

    await Promise.allSettled(photoUploads);

    setSubmitting(false);
    Alert.alert("Success", "Service report submitted!", [
      { text: "OK", onPress: resetForm },
    ]);
  }

  async function handleSubmit() {
    if (!profile) {
      Alert.alert("Error", "Not logged in. Please sign out and sign back in.");
      return;
    }

    if (isOnline) {
      await handleSubmitOnline();
    } else {
      await handleSubmitOffline();
    }
  }

  function resetForm() {
    setJobName("");
    setJobDescription("");
    setCustomerId("");
    setShowClientDropdown(false);
    setClientSearch("");
    setBoatId("");
    setHin("");
    setHinSaved(false);
    setLocation("");
    setLocationSaved(false);
    setGeneralNotes("");
    setParts([]);
    setNewPartName("");
    setChecklist({});
    setActiveTab("Engine");
    setGalleryPhotos([]);
    setSelectedPhotoCategory("Other");
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>New Job</Text>
      </View>

      {/* Job Name */}
      <Text style={styles.label}>Job Name</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Spring service, Hull repair..."
        placeholderTextColor={colors.textSecondary + "80"}
        value={jobName}
        onChangeText={setJobName}
      />

      {/* Job Description */}
      <View style={styles.jobDescSection}>
        <View style={styles.jobDescHeader}>
          <Text style={styles.jobDescTitle}>Job Description</Text>
          <Text style={styles.jobDescIcon}>{"\uD83D\uDCCB"}</Text>
        </View>
        <TextInput
          style={styles.jobDescInput}
          placeholder="Describe the scope of work..."
          placeholderTextColor={colors.textSecondary + "60"}
          multiline
          numberOfLines={5}
          textAlignVertical="top"
          value={jobDescription}
          onChangeText={setJobDescription}
        />
        <Text style={styles.jobDescHint}>
          Include any special instructions or access details
        </Text>
      </View>

      {/* Customer & Vessel Section */}
      <Text style={styles.sectionTitle}>Customer & Vessel</Text>

      <Text style={styles.label}>Customer Name</Text>
      <TouchableOpacity
        style={styles.dropdown}
        onPress={() => setShowClientDropdown(!showClientDropdown)}
      >
        <Text
          style={[
            styles.dropdownText,
            !customerId && styles.dropdownPlaceholder,
          ]}
        >
          {customerId
            ? customers.find((c) => c.id === customerId)?.name || "Select Client"
            : "Select a client..."}
        </Text>
        <Text style={styles.dropdownArrow}>
          {showClientDropdown ? "\u25B2" : "\u25BC"}
        </Text>
      </TouchableOpacity>
      <TextInput
        style={styles.searchInput}
        placeholder="Search clients..."
        placeholderTextColor={colors.textSecondary + "80"}
        value={clientSearch}
        onChangeText={(text) => {
          setClientSearch(text);
          if (text.length > 0) setShowClientDropdown(true);
        }}
        onFocus={() => setShowClientDropdown(true)}
      />
      {showClientDropdown && (() => {
        const filtered = clientSearch
          ? customers.filter((c) =>
              c.name.toLowerCase().includes(clientSearch.toLowerCase())
            )
          : customers;
        return (
          <View style={styles.dropdownList}>
            {filtered.length === 0 ? (
              <View style={styles.dropdownItem}>
                <Text style={styles.dropdownItemText}>
                  {customers.length === 0 ? "No customers yet" : "No matches"}
                </Text>
              </View>
            ) : (
              filtered.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[
                    styles.dropdownItem,
                    customerId === c.id && styles.dropdownItemActive,
                  ]}
                  onPress={() => {
                    setCustomerId(c.id);
                    setBoatId("");
                    setClientSearch("");
                    setShowClientDropdown(false);
                  }}
                >
                  <Text
                    style={[
                      styles.dropdownItemText,
                      customerId === c.id && styles.dropdownItemTextActive,
                    ]}
                  >
                    {c.name}
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        );
      })()}

      <Text style={styles.label}>Boat Name</Text>
      <View style={styles.pickerWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {filteredBoats.map((b) => (
            <TouchableOpacity
              key={b.id}
              style={[styles.chip, boatId === b.id && styles.chipActive]}
              onPress={() => {
                setBoatId(b.id);
                setHin(b.hin || "");
              }}
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
          {filteredBoats.length === 0 && (
            <Text style={styles.placeholder}>No boats</Text>
          )}
        </ScrollView>
      </View>

      {selectedBoat && (
        <View style={styles.boatInfo}>
          <Text style={styles.boatInfoText}>
            {selectedBoat.make_model}{" "}
            {selectedBoat.year ? `\u2022 ${selectedBoat.year}` : ""}
          </Text>
        </View>
      )}

      <Text style={styles.label}>Hull ID / HIN</Text>
      {hinSaved ? (
        <View style={styles.savedRow}>
          <Text style={styles.savedValue}>{hin}</Text>
          <TouchableOpacity onPress={() => setHinSaved(false)}>
            <Text style={styles.editLink}>Edit</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={hin}
            onChangeText={setHin}
            placeholder="Enter HIN..."
            placeholderTextColor={colors.textSecondary + "80"}
          />
          {hin.trim().length > 0 && (
            <TouchableOpacity
              style={styles.saveFieldBtn}
              onPress={() => setHinSaved(true)}
            >
              <Text style={styles.saveFieldText}>Save</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <Text style={styles.label}>Location / Marina</Text>
      {locationSaved ? (
        <View style={styles.savedRow}>
          <Text style={styles.savedValue}>{location}</Text>
          <TouchableOpacity onPress={() => setLocationSaved(false)}>
            <Text style={styles.editLink}>Edit</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={location}
            onChangeText={setLocation}
            placeholder="Enter location or marina..."
            placeholderTextColor={colors.textSecondary + "80"}
          />
          {location.trim().length > 0 && (
            <TouchableOpacity
              style={styles.saveFieldBtn}
              onPress={() => setLocationSaved(true)}
            >
              <Text style={styles.saveFieldText}>Save</Text>
            </TouchableOpacity>
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

      {/* Status Legend */}
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: "#FF3B30" }]} />
          <Text style={styles.legendText}>Bad</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: "#34C759" }]} />
          <Text style={styles.legendText}>Good</Text>
        </View>
        <View style={styles.legendItem}>
          <Text style={styles.legendTextNA}>N/A</Text>
        </View>
      </View>

      {CHECKLIST[activeTab].map((item) => {
        const state = checklist[item];
        return (
          <View key={item}>
            <View style={styles.checklistRow}>
              <Text style={styles.checklistLabel}>{item}</Text>
              <TouchableOpacity
                style={styles.inlineIcon}
                onPress={() => takeItemPhoto(item)}
              >
                <Text style={styles.inlineIconText}>{"\u{1F4F7}"}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.inlineIcon, state?.showNotes && styles.inlineIconActive]}
                onPress={() => toggleItemNotes(item)}
              >
                <Text style={styles.inlineIconText}>{"\uD83D\uDCAC"}</Text>
              </TouchableOpacity>
              <View style={styles.checklistActions}>
                {/* Sliding toggle */}
                <View style={styles.toggleTrack}>
                  <TouchableOpacity
                    style={[styles.toggleSeg, state?.assessment === "bad" && styles.toggleSegBad]}
                    onPress={() => setAssessment(item, state?.assessment === "bad" ? null : "bad")}
                  >
                    <Text style={[styles.toggleText, state?.assessment === "bad" && styles.toggleTextActive]}>BAD</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.toggleSeg, state?.assessment === "good" && styles.toggleSegGood]}
                    onPress={() => setAssessment(item, state?.assessment === "good" ? null : "good")}
                  >
                    <Text style={[styles.toggleText, state?.assessment === "good" && styles.toggleTextActive]}>GOOD</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.toggleSeg, state?.assessment === "na" && styles.toggleSegNA]}
                    onPress={() => setAssessment(item, state?.assessment === "na" ? null : "na")}
                  >
                    <Text style={[styles.toggleText, state?.assessment === "na" && styles.toggleTextActive]}>N/A</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Notes input (show when toggled or when assessment is bad) */}
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

      {/* Category selector for gallery photos */}
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
            <Image source={{ uri: photo.uri }} style={styles.photoGridImage} />
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

        {/* Add photo buttons */}
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

      {/* Parts Needed */}
      <View style={styles.partsHeader}>
        <Text style={styles.sectionTitle}>Parts Needed</Text>
        {parts.length > 0 && (
          <View style={styles.partsCount}>
            <Text style={styles.partsCountText}>
              {parts.length} item{parts.length !== 1 ? "s" : ""}
            </Text>
          </View>
        )}
      </View>

      {parts.map((part, index) => {
        const isExpanded = expandedPartIndex === index;
        return (
          <View key={index} style={styles.partCard}>
            <View style={styles.partCardAccent} />
            <View style={styles.partCardContent}>
              {/* Collapsed summary row — tap to expand */}
              <TouchableOpacity
                style={styles.partSummaryRow}
                onPress={() => setExpandedPartIndex(isExpanded ? null : index)}
                activeOpacity={0.7}
              >
                {part.photo ? (
                  <TouchableOpacity onPress={() => setViewingPartPhoto(part.photo!)}>
                    <Image source={{ uri: part.photo }} style={styles.partThumb} />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.partPhotoPlaceholder}
                    onPress={() => takePartPhoto(index)}
                  >
                    <Text style={styles.partPhotoPlaceholderIcon}>{"\uD83D\uDCF7"}</Text>
                  </TouchableOpacity>
                )}
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.partSummaryName} numberOfLines={1}>
                    {part.name || "Unnamed Part"}
                  </Text>
                  <View style={styles.partSummaryMeta}>
                    {part.partNum ? (
                      <Text style={styles.partSummaryPartNum}>#{part.partNum}</Text>
                    ) : null}
                    <Text style={styles.partSummaryQty}>Qty: {part.qty}</Text>
                    {part.supplier ? (
                      <Text style={styles.partSummarySupplier} numberOfLines={1}>{part.supplier}</Text>
                    ) : null}
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.partOrderBtn, part.ordered && styles.partOrderedBtn]}
                  onPress={() => {
                    setParts((prev) =>
                      prev.map((p, i) => (i === index ? { ...p, ordered: !p.ordered } : p))
                    );
                  }}
                >
                  {part.ordered ? (
                    <Text style={styles.partOrderedText}>{"\u2713"}</Text>
                  ) : (
                    <Text style={styles.partOrderText}>Order</Text>
                  )}
                </TouchableOpacity>
                <Text style={styles.partExpandArrow}>{isExpanded ? "\u25B2" : "\u25BC"}</Text>
              </TouchableOpacity>

              {/* Expanded detail fields */}
              {isExpanded && (
                <View style={styles.partDetailSection}>
                  {/* Part Name */}
                  <Text style={styles.partDetailLabel}>Part Name</Text>
                  <TextInput
                    style={styles.partDetailInput}
                    value={part.name}
                    onChangeText={(text) =>
                      setParts((prev) =>
                        prev.map((p, i) => (i === index ? { ...p, name: text } : p))
                      )
                    }
                    placeholder="Part name"
                    placeholderTextColor={colors.textSecondary + "80"}
                  />

                  {/* Part Number + Qty row */}
                  <View style={styles.partDetailRow}>
                    <View style={{ flex: 2 }}>
                      <Text style={styles.partDetailLabel}>Part Number</Text>
                      <TextInput
                        style={styles.partDetailInput}
                        value={part.partNum}
                        onChangeText={(text) =>
                          setParts((prev) =>
                            prev.map((p, i) => (i === index ? { ...p, partNum: text } : p))
                          )
                        }
                        placeholder="e.g. 3861985"
                        placeholderTextColor={colors.textSecondary + "80"}
                      />
                    </View>
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={styles.partDetailLabel}>Qty</Text>
                      <TextInput
                        style={styles.partDetailInput}
                        value={String(part.qty)}
                        onChangeText={(text) => {
                          const num = parseInt(text) || 0;
                          setParts((prev) =>
                            prev.map((p, i) => (i === index ? { ...p, qty: num } : p))
                          );
                        }}
                        keyboardType="number-pad"
                        placeholder="1"
                        placeholderTextColor={colors.textSecondary + "80"}
                      />
                    </View>
                  </View>

                  {/* Supplier / Where to Buy */}
                  <Text style={styles.partDetailLabel}>Where to Buy</Text>
                  <TextInput
                    style={styles.partDetailInput}
                    value={part.supplier}
                    onChangeText={(text) =>
                      setParts((prev) =>
                        prev.map((p, i) => (i === index ? { ...p, supplier: text } : p))
                      )
                    }
                    placeholder="e.g. West Marine, Mercury dealer..."
                    placeholderTextColor={colors.textSecondary + "80"}
                  />

                  {/* URL Link */}
                  <Text style={styles.partDetailLabel}>Part URL</Text>
                  <View style={styles.partUrlRow}>
                    <TextInput
                      style={[styles.partDetailInput, { flex: 1 }]}
                      value={part.url}
                      onChangeText={(text) =>
                        setParts((prev) =>
                          prev.map((p, i) => (i === index ? { ...p, url: text } : p))
                        )
                      }
                      placeholder="https://..."
                      placeholderTextColor={colors.textSecondary + "80"}
                      autoCapitalize="none"
                      keyboardType="url"
                    />
                    {part.url.trim().length > 0 && (
                      <TouchableOpacity
                        style={styles.partUrlOpenBtn}
                        onPress={() => {
                          const url = part.url.startsWith("http") ? part.url : `https://${part.url}`;
                          Linking.openURL(url).catch(() =>
                            Alert.alert("Error", "Could not open URL")
                          );
                        }}
                      >
                        <Text style={styles.partUrlOpenText}>{"\u2197"}</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Photo + actions row */}
                  <View style={styles.partDetailActions}>
                    <TouchableOpacity
                      style={styles.partDetailPhotoBtn}
                      onPress={() => takePartPhoto(index)}
                    >
                      <Text style={styles.partDetailPhotoBtnIcon}>{"\uD83D\uDCF7"}</Text>
                      <Text style={styles.partDetailPhotoBtnText}>
                        {part.photo ? "Retake Photo" : "Add Photo"}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.partDetailDeleteBtn}
                      onPress={() => {
                        setExpandedPartIndex(null);
                        setParts((prev) => prev.filter((_, i) => i !== index));
                      }}
                    >
                      <Text style={styles.partDetailDeleteText}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          </View>
        );
      })}

      <View style={styles.addPartRow}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          placeholder="Add part name or #..."
          placeholderTextColor={colors.textSecondary + "80"}
          value={newPartName}
          onChangeText={setNewPartName}
        />
        <TouchableOpacity
          style={[
            styles.addPartBtn,
            !newPartName.trim() && { opacity: 0.4 },
          ]}
          disabled={!newPartName.trim()}
          onPress={() => {
            if (!newPartName.trim()) return;
            const newIndex = parts.length;
            setParts((prev) => [
              ...prev,
              { name: newPartName.trim(), qty: 1, partNum: "", ordered: false, supplier: "", url: "" },
            ]);
            setNewPartName("");
            setExpandedPartIndex(newIndex);
          }}
        >
          <Text style={styles.addPartBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

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

    {/* Part Photo Viewer */}
    <Modal
      visible={!!viewingPartPhoto}
      animationType="fade"
      presentationStyle="fullScreen"
    >
      <View style={styles.photoViewerContainer}>
        <View style={styles.photoViewerHeader}>
          <TouchableOpacity onPress={() => setViewingPartPhoto(null)} style={styles.photoViewerBack}>
            <Text style={styles.photoViewerBackText}>{"\u2190"}</Text>
          </TouchableOpacity>
          <Text style={styles.photoViewerTitle}>Part Photo</Text>
          <TouchableOpacity
            onPress={() => viewingPartPhoto && savePartPhoto(viewingPartPhoto)}
            style={styles.photoViewerDownload}
          >
            <Text style={styles.photoViewerDownloadText}>{"\u2B07"} Save</Text>
          </TouchableOpacity>
        </View>
        {viewingPartPhoto && (
          <Image
            source={{ uri: viewingPartPhoto }}
            style={styles.photoViewerImage}
            resizeMode="contain"
          />
        )}
      </View>
    </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  header: { marginBottom: 16 },
  title: { fontSize: 28, fontWeight: "700", color: colors.textPrimary },
  jobDescSection: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  jobDescHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  jobDescTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.gold,
    fontStyle: "italic",
  },
  jobDescIcon: {
    fontSize: 20,
    opacity: 0.5,
  },
  jobDescInput: {
    backgroundColor: colors.bgPrimary,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
    fontSize: 15,
    padding: 14,
    minHeight: 120,
    textAlignVertical: "top",
  },
  jobDescHint: {
    fontSize: 13,
    color: colors.textSecondary,
    fontStyle: "italic",
    marginTop: 8,
    opacity: 0.6,
  },
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
  label: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 6,
    marginTop: 12,
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
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  saveFieldBtn: {
    backgroundColor: colors.gold,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  saveFieldText: {
    color: colors.bgPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  savedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  savedValue: {
    fontSize: 15,
    color: colors.textPrimary,
    fontWeight: "500",
    flex: 1,
  },
  editLink: {
    fontSize: 13,
    color: colors.gold,
    fontWeight: "600",
    marginLeft: 12,
  },
  dropdown: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 4,
  },
  dropdownText: {
    fontSize: 15,
    color: colors.textPrimary,
    fontWeight: "500",
  },
  dropdownPlaceholder: {
    color: colors.textSecondary,
    fontWeight: "400",
  },
  dropdownArrow: {
    fontSize: 10,
    color: colors.textSecondary,
  },
  searchInput: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  dropdownList: {
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    marginBottom: 8,
    overflow: "hidden",
  },
  dropdownItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border + "60",
  },
  dropdownItemActive: {
    backgroundColor: colors.gold + "15",
  },
  dropdownItemText: {
    fontSize: 15,
    color: colors.textPrimary,
  },
  dropdownItemTextActive: {
    color: colors.gold,
    fontWeight: "600",
  },
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
  placeholder: {
    color: colors.textSecondary,
    fontSize: 14,
    paddingVertical: 8,
  },
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
  inlineIcon: {
    padding: 4,
  },
  inlineIconActive: {
    opacity: 1,
  },
  inlineIconText: {
    fontSize: 16,
    opacity: 0.5,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: "500",
  },
  toggleTrack: {
    flexDirection: "row",
    backgroundColor: colors.bgCard,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  toggleSeg: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  toggleSegBad: { backgroundColor: "#FF3B30" },
  toggleSegGood: { backgroundColor: "#34C759" },
  toggleSegNA: { backgroundColor: colors.textSecondary },
  toggleText: { fontSize: 10, fontWeight: "700", color: colors.textSecondary },
  toggleTextActive: { color: "#fff" },
  legendTextNA: { fontSize: 10, color: colors.textSecondary, fontWeight: "600" },
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
  partsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  partsCount: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  partsCountText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  partCard: {
    flexDirection: "row",
    backgroundColor: colors.bgSecondary,
    borderRadius: 10,
    marginBottom: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  partCardAccent: {
    width: 4,
    backgroundColor: colors.gold,
  },
  partCardContent: {
    flex: 1,
    padding: 12,
  },
  partSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  partSummaryName: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  partSummaryMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  partSummaryPartNum: {
    fontSize: 12,
    color: colors.gold,
    fontWeight: "500",
  },
  partSummaryQty: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  partSummarySupplier: {
    fontSize: 12,
    color: colors.textSecondary,
    fontStyle: "italic",
    maxWidth: 100,
  },
  partExpandArrow: {
    fontSize: 10,
    color: colors.textSecondary,
    marginLeft: 8,
    padding: 4,
  },
  partPhotoPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bgCard,
  },
  partPhotoPlaceholderIcon: {
    fontSize: 18,
    opacity: 0.4,
  },
  partDetailSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  partDetailLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: "500",
    marginBottom: 4,
    marginTop: 8,
  },
  partDetailInput: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: 14,
  },
  partDetailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  partUrlRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  partUrlOpenBtn: {
    backgroundColor: colors.gold,
    borderRadius: 8,
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  partUrlOpenText: {
    fontSize: 18,
    color: colors.bgPrimary,
    fontWeight: "700",
  },
  partDetailActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
  },
  partDetailPhotoBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  partDetailPhotoBtnIcon: {
    fontSize: 16,
  },
  partDetailPhotoBtnText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: "500",
  },
  partDetailDeleteBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  partDetailDeleteText: {
    fontSize: 13,
    color: "#ef4444",
    fontWeight: "600",
  },
  partOrderBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  partOrderedBtn: {
    borderColor: colors.good,
    backgroundColor: colors.good + "15",
  },
  partOrderText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  partOrderedText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.good,
  },
  addPartRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  addPartBtn: {
    backgroundColor: colors.gold,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  addPartBtnText: {
    color: colors.bgPrimary,
    fontSize: 14,
    fontWeight: "700",
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
  partThumb: {
    width: 44,
    height: 44,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  partCameraBtn: {
    padding: 6,
  },
  partCameraIcon: {
    fontSize: 18,
    opacity: 0.6,
  },
  photoViewerContainer: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  photoViewerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 60,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  photoViewerBack: {
    padding: 8,
  },
  photoViewerBackText: {
    fontSize: 24,
    color: colors.textPrimary,
  },
  photoViewerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  photoViewerDownload: {
    backgroundColor: colors.gold,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  photoViewerDownloadText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.bgPrimary,
  },
  photoViewerImage: {
    flex: 1,
    width: "100%",
  },
});
