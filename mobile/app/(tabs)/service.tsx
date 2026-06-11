import { useState, useEffect, useCallback } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
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
import DateTimePicker from "@react-native-community/datetimepicker";
import { useAuth } from "@/lib/auth-context";
import { useOffline } from "@/lib/offline-context";
import { supabase } from "@/lib/supabase";
import { savePendingReport, savePendingParts } from "@/lib/offline-db";
import { colors } from "@/constants/Colors";
import { SUPPLIERS } from "@/constants/Suppliers";

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
  const router = useRouter();
  const params = useLocalSearchParams<{
    editJobId?: string;
    newCustomerId?: string;
    newBoatId?: string;
    newStartIso?: string;
  }>();
  const editJobId = typeof params.editJobId === "string" ? params.editJobId : null;
  const [editReportId, setEditReportId] = useState<string | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(false);
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

  // Per-service description (for the current jobName service type).
  const [serviceDescription, setServiceDescription] = useState("");

  // Scheduling — when this job should happen (lands on the calendar)
  const [scheduledStart, setScheduledStart] = useState<Date>(() => {
    // Default to next top-of-the-hour
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    return d;
  });
  // Optional end date for multi-day jobs.
  const [scheduledEnd, setScheduledEnd] = useState<Date | null>(null);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  // True when scheduledEnd is a different (later) day than scheduledStart.
  function toDateStr(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  const isMultiDay =
    scheduledEnd !== null &&
    toDateStr(scheduledEnd) > toDateStr(scheduledStart);

  // Parts needed state
  type Part = {
    name: string;
    qty: number;
    partNum: string;
    ordered: boolean;
    photo?: string;
    supplier: string;
    url: string;
    description: string;
  };
  const [parts, setParts] = useState<Part[]>([]);
  const [newPartName, setNewPartName] = useState("");
  const [viewingPartPhoto, setViewingPartPhoto] = useState<string | null>(null);
  const [expandedPartIndex, setExpandedPartIndex] = useState<number | null>(null);
  const [openSupplierIndex, setOpenSupplierIndex] = useState<number | null>(null);

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

  const fetchReferenceData = useCallback(async () => {
    if (!profile) return;
    const [custRes, boatRes, marinaRes] = await Promise.all([
      supabase.from("customers").select("id, name").order("name"),
      supabase
        .from("boats")
        .select("id, name, make_model, year, hin, customer_id")
        .order("name"),
      supabase.from("marinas").select("id, name").order("name"),
    ]);
    if (custRes.data) setCustomers(custRes.data);
    if (boatRes.data) setBoats(boatRes.data);
    if (marinaRes.data) setMarinas(marinaRes.data);
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      fetchReferenceData();
    }, [fetchReferenceData])
  );

  // Prefill for "New Job" entry points (client screen + calendar empty slot):
  // every new job goes through this full form, with customer/boat/start
  // preselected by the caller. Params are cleared after applying so a later
  // tab re-focus doesn't overwrite what the operator changed.
  const newCustomerId = typeof params.newCustomerId === "string" ? params.newCustomerId : "";
  const newBoatId = typeof params.newBoatId === "string" ? params.newBoatId : "";
  const newStartIso = typeof params.newStartIso === "string" ? params.newStartIso : "";
  useEffect(() => {
    if (editJobId) return;
    if (!newCustomerId && !newBoatId && !newStartIso) return;
    if (newCustomerId) setCustomerId(newCustomerId);
    if (newBoatId) setBoatId(newBoatId);
    if (newStartIso) {
      const d = new Date(newStartIso);
      if (!isNaN(d.getTime())) setScheduledStart(d);
    }
    router.setParams({ newCustomerId: "", newBoatId: "", newStartIso: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editJobId, newCustomerId, newBoatId, newStartIso]);

  // Prefill from an existing job when editJobId is set.
  useEffect(() => {
    if (!editJobId || !profile) return;
    let cancelled = false;

    async function loadEdit() {
      setLoadingEdit(true);
      try {
        const { data: jobData } = await supabase
          .from("jobs")
          .select("id, customer_id, boat_id, service_types, notes, scheduled_start")
          .eq("id", editJobId)
          .single();
        if (!jobData || cancelled) return;
        if (jobData.scheduled_start) {
          setScheduledStart(new Date(jobData.scheduled_start as string));
        }

        const { data: reportData } = await supabase
          .from("service_reports")
          .select("id, hin, marina, general_notes")
          .eq("job_id", editJobId)
          .single();

        const { data: items } = reportData
          ? await supabase
              .from("checklist_items")
              .select("category, item_name, assessment, notes, sort_order")
              .eq("report_id", reportData.id)
              .order("sort_order")
          : { data: [] as { category: string; item_name: string; assessment: string; notes: string | null; sort_order: number }[] };

        const { data: photoRows } = reportData
          ? await supabase
              .from("report_photos")
              .select("photo_url, category, caption")
              .eq("report_id", reportData.id)
          : { data: [] as { photo_url: string; category: string | null; caption: string | null }[] };

        if (cancelled) return;

        setJobName((jobData.service_types?.[0] as string) || "");
        setJobDescription((jobData.notes as string) || "");
        setCustomerId((jobData.customer_id as string) || "");
        setBoatId((jobData.boat_id as string) || "");
        setHin(reportData?.hin || "");
        setHinSaved(!!reportData?.hin);
        setLocation(reportData?.marina || "");
        setLocationSaved(!!reportData?.marina);
        setGeneralNotes(reportData?.general_notes || "");
        setEditReportId(reportData?.id ?? null);

        // Build checklist state from DB items.
        const checklistItemNames = new Set<string>();
        const nextChecklist: ChecklistState = {};
        for (const it of items || []) {
          const assessment = (it.assessment === "good" || it.assessment === "bad") ? it.assessment : null;
          nextChecklist[it.item_name] = {
            assessment: assessment as Assessment,
            notes: it.notes || "",
            showNotes: !!it.notes,
            photos: [],
          };
          checklistItemNames.add(it.item_name);
        }

        // Split photos: caption matching a checklist item → checklist photos; else → gallery.
        const slugToCategory: Record<string, PhotoCategory> = {
          hin_plate: "HIN Plate",
          engine_hours: "Engine Hours",
          before: "Before",
          after: "After",
          damage: "Damage",
          other: "Other",
        };
        const nextGallery: GalleryPhoto[] = [];
        for (const p of photoRows || []) {
          if (p.caption && checklistItemNames.has(p.caption)) {
            const entry = nextChecklist[p.caption];
            if (entry) {
              entry.photos = [...entry.photos, { uri: p.photo_url, uploaded: true }];
            }
          } else {
            const cat = (p.category && slugToCategory[p.category]) || "Other";
            nextGallery.push({ uri: p.photo_url, category: cat, uploaded: true });
          }
        }

        setChecklist(nextChecklist);
        setGalleryPhotos(nextGallery);
      } finally {
        if (!cancelled) setLoadingEdit(false);
      }
    }

    void loadEdit();
    return () => {
      cancelled = true;
    };
  }, [editJobId, profile]);

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
    // Already an uploaded URL (from edit-mode prefill) — just return it.
    if (uri.startsWith("http://") || uri.startsWith("https://")) {
      return uri;
    }
    try {
      const fileName = `${reportId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const response = await fetch(uri);
      const arrayBuffer = await response.arrayBuffer();

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(fileName, arrayBuffer, { contentType: "image/jpeg" });

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

  // Insert the current `parts` into the parts table for a saved report.
  // Edit mode: caller deletes existing rows first, then this re-inserts.
  async function persistParts(reportId: string, jobId: string) {
    if (!profile || parts.length === 0) return;
    for (const part of parts) {
      let photoUrl: string | null = null;
      if (part.photo) {
        photoUrl = await uploadPhoto(part.photo, "report-photos", reportId, "part");
      }
      const { error } = await supabase.from("parts").insert({
        service_report_id: reportId,
        job_id: jobId,
        customer_id: customerId || null,
        boat_id: boatId || null,
        created_by: profile.id,
        name: part.name,
        part_number: part.partNum || null,
        quantity: part.qty || 1,
        description: part.description || null,
        supplier: part.supplier || null,
        url: part.url || null,
        photo_url: photoUrl,
        status: part.ordered ? "ordered" : "need_to_order",
        ordered_at: part.ordered ? new Date().toISOString() : null,
      });
      if (error) {
        console.error("Part insert error:", error.message);
        Alert.alert("Parts warning", `A part ("${part.name}") couldn't be saved: ${error.message}`);
      }
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

      const offlineReportId = await savePendingReport({
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

      if (parts.length > 0) {
        await savePendingParts(offlineReportId, parts, profile.id);
      }

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
    const isEditing = !!editJobId;

    setSubmitting(true);

    // Build per-service descriptions payload.
    const serviceDescPayload: Record<string, string> = {};
    if (jobName && serviceDescription.trim()) {
      serviceDescPayload[jobName] = serviceDescription.trim();
    }

    // Multi-day or single-day end calculation.
    const scheduledEndComputed: Date = isMultiDay && scheduledEnd
      ? (() => { const d = new Date(scheduledEnd); d.setHours(17, 0, 0, 0); return d; })()
      : new Date(scheduledStart.getTime() + 60 * 60 * 1000);
    const endDateOnly: string | null = isMultiDay && scheduledEnd
      ? toDateStr(scheduledEnd)
      : null;

    const jobPayload = {
      customer_id: customerId || null,
      boat_id: boatId || null,
      marina_id: null,
      service_types: jobName ? [jobName] : [],
      service_descriptions: serviceDescPayload,
      status: "completed",
      notes: jobDescription || null,
      scheduled_start: scheduledStart.toISOString(),
      scheduled_end: scheduledEndComputed.toISOString(),
      scheduled_date: toDateStr(scheduledStart),
      scheduled_end_date: endDateOnly,
    };

    let reportId: string;
    let jobId: string;

    if (isEditing && editJobId) {
      // UPDATE existing job
      const { error: jobErr } = await supabase
        .from("jobs")
        .update(jobPayload)
        .eq("id", editJobId);
      if (jobErr) {
        Alert.alert("Error", jobErr.message);
        setSubmitting(false);
        return;
      }
      jobId = editJobId;

      // UPDATE existing service_report (or create if none — defensive)
      const reportPayload = {
        boat_id: boatId || null,
        customer_id: customerId || null,
        boat_name: selectedBoat?.name || "",
        owner_name: customer?.name || "",
        make_model: selectedBoat?.make_model || "",
        year: selectedBoat?.year || null,
        hin: hin || selectedBoat?.hin || "",
        marina: location.trim(),
        general_notes: generalNotes,
      };

      if (editReportId) {
        const { error: reportErr } = await supabase
          .from("service_reports")
          .update(reportPayload)
          .eq("id", editReportId);
        if (reportErr) {
          Alert.alert("Error", reportErr.message);
          setSubmitting(false);
          return;
        }
        reportId = editReportId;

        // Clear existing checklist items, photos, and parts — we re-insert from state.
        await supabase.from("checklist_items").delete().eq("report_id", reportId);
        await supabase.from("report_photos").delete().eq("report_id", reportId);
        await supabase.from("parts").delete().eq("service_report_id", reportId);
      } else {
        const { data: newReport, error: reportErr } = await supabase
          .from("service_reports")
          .insert({ ...reportPayload, job_id: jobId, tech_id: profile.id })
          .select("id")
          .single();
        if (reportErr || !newReport) {
          Alert.alert("Error", reportErr?.message || "Failed to create report");
          setSubmitting(false);
          return;
        }
        reportId = newReport.id;
      }
    } else {
      // INSERT new job
      const { data: job, error: jobError } = await supabase
        .from("jobs")
        .insert({ ...jobPayload, assigned_to: profile.id, created_by: profile.id })
        .select("id")
        .single();

      if (jobError || !job) {
        Alert.alert("Error", jobError?.message || "Failed to create job");
        setSubmitting(false);
        return;
      }
      jobId = job.id;

      // INSERT new service_report
      const { data: report, error: reportError } = await supabase
        .from("service_reports")
        .insert({
          job_id: jobId,
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
        Alert.alert("Error", reportError?.message || "Failed to create report");
        setSubmitting(false);
        return;
      }
      reportId = report.id;
    }

    // Wrap reportId in a shape compatible with code below that expects `report.id`.
    const report = { id: reportId };

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

    // Upload all photos in parallel (checklist + gallery).
    // Track failures so we can surface them to the tech instead of silently
    // marking the report submitted with missing photos.
    const photoUploads: Promise<{ ok: boolean }>[] = [];

    for (const [itemName, val] of Object.entries(checklist)) {
      if (val.photos && val.photos.length > 0) {
        for (const photo of val.photos) {
          photoUploads.push(
            (async () => {
              try {
                const url = await uploadPhoto(photo.uri, "report-photos", report.id, "checklist");
                if (!url) return { ok: false };
                const { error } = await supabase.from("report_photos").insert({
                  report_id: report.id,
                  photo_url: url,
                  category: "other",
                  caption: itemName,
                });
                return { ok: !error };
              } catch {
                return { ok: false };
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
          try {
            const url = await uploadPhoto(photo.uri, "report-photos", report.id, categorySlug);
            if (!url) return { ok: false };
            const { error } = await supabase.from("report_photos").insert({
              report_id: report.id,
              photo_url: url,
              category: categorySlug,
            });
            return { ok: !error };
          } catch {
            return { ok: false };
          }
        })()
      );
    }

    const results = await Promise.allSettled(photoUploads);
    const failedCount = results.reduce((n, r) => {
      if (r.status === "rejected") return n + 1;
      return r.value.ok ? n : n + 1;
    }, 0);

    // Persist parts (runs once for both new and edit paths).
    await persistParts(reportId, jobId);

    setSubmitting(false);

    if (failedCount > 0) {
      Alert.alert(
        "Photo upload incomplete",
        `${failedCount} photo${failedCount === 1 ? "" : "s"} did not upload. The report was saved without ${failedCount === 1 ? "it" : "them"}. Check your connection and re-add the photo${failedCount === 1 ? "" : "s"} from the report.`
      );
    }
    if (isEditing) {
      Alert.alert("Saved", "Changes saved.", [
        {
          text: "OK",
          onPress: () => {
            resetForm();
            setEditReportId(null);
            // Clear the editJobId param so the Service tab returns to "New Job" state.
            router.setParams({ editJobId: "" });
            router.back();
          },
        },
      ]);
    } else {
      Alert.alert("Success", "Service report submitted!", [
        { text: "OK", onPress: resetForm },
      ]);
    }
    // Reference jobId so TS doesn't complain about unused binding in edit path.
    void jobId;
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
    setServiceDescription("");
    setCustomerId("");
    setShowClientDropdown(false);
    setClientSearch("");
    setBoatId("");
    setHin("");
    setHinSaved(false);
    setLocation("");
    setLocationSaved(false);
    setGeneralNotes("");
    setScheduledEnd(null);
    setParts([]);
    setNewPartName("");
    setChecklist({});
    setActiveTab("Engine");
    setGalleryPhotos([]);
    setSelectedPhotoCategory("Other");
  }

  // Viewers are read-only — matches migration 032's DB-level enforcement,
  // so don't present a form whose submit would be rejected by RLS.
  if (profile && profile.role === "viewer") {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bgPrimary,
          alignItems: "center",
          justifyContent: "center",
          padding: 32,
        }}
      >
        <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: "600" }}>
          Read-only account
        </Text>
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: 14,
            textAlign: "center",
            marginTop: 8,
          }}
        >
          Your account can view jobs and reports but can&apos;t create or edit
          them. Ask the owner for Edit access.
        </Text>
      </View>
    );
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
        <Text style={styles.title}>{editJobId ? "Edit Job" : "New Job"}</Text>
        {loadingEdit && (
          <ActivityIndicator size="small" color={colors.gold} style={{ marginLeft: 12 }} />
        )}
      </View>

      {/* Job Name */}
      <Text style={styles.label}>Job Name / Service Type</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Engine Service, Hull repair..."
        placeholderTextColor={colors.textSecondary + "80"}
        value={jobName}
        onChangeText={setJobName}
      />
      {/* Per-service description — shown once jobName is non-empty */}
      {jobName.trim().length > 0 && (
        <View style={{ marginBottom: 12 }}>
          <Text style={[styles.label, { marginTop: 8 }]}>
            Notes for "{jobName}"
          </Text>
          <TextInput
            style={[styles.input, { height: 72, textAlignVertical: "top", paddingTop: 10 }]}
            placeholder={`Describe the ${jobName} work…`}
            placeholderTextColor={colors.textSecondary + "80"}
            multiline
            value={serviceDescription}
            onChangeText={setServiceDescription}
          />
        </View>
      )}

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

      <Text style={styles.label}>Scheduled Date & Time</Text>
      <View style={styles.inputRow}>
        <TouchableOpacity
          style={[styles.input, { flex: 1, justifyContent: "center" }]}
          onPress={() => setShowDatePicker(true)}
        >
          <Text style={{ color: colors.textPrimary, fontSize: 14 }}>
            {scheduledStart.toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.input, { flex: 1, marginLeft: 8, justifyContent: "center" }]}
          onPress={() => setShowTimePicker(true)}
        >
          <Text style={{ color: colors.textPrimary, fontSize: 14 }}>
            {scheduledStart.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          </Text>
        </TouchableOpacity>
      </View>
      {showDatePicker && (
        <DateTimePicker
          value={scheduledStart}
          mode="date"
          display={Platform.OS === "ios" ? "inline" : "default"}
          themeVariant="dark"
          onChange={(_event, date) => {
            if (Platform.OS === "android") setShowDatePicker(false);
            if (date) {
              const next = new Date(scheduledStart);
              next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
              setScheduledStart(next);
            }
          }}
        />
      )}
      {showTimePicker && (
        <DateTimePicker
          value={scheduledStart}
          mode="time"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          themeVariant="dark"
          onChange={(_event, date) => {
            if (Platform.OS === "android") setShowTimePicker(false);
            if (date) {
              const next = new Date(scheduledStart);
              next.setHours(date.getHours(), date.getMinutes(), 0, 0);
              setScheduledStart(next);
            }
          }}
        />
      )}
      {Platform.OS === "ios" && (showDatePicker || showTimePicker) && (
        <TouchableOpacity
          style={styles.saveFieldBtn}
          onPress={() => {
            setShowDatePicker(false);
            setShowTimePicker(false);
          }}
        >
          <Text style={styles.saveFieldText}>Done</Text>
        </TouchableOpacity>
      )}

      {/* End date (multi-day) */}
      {!isMultiDay ? (
        <TouchableOpacity
          style={styles.addEndDateBtn}
          onPress={() => setShowEndDatePicker(true)}
        >
          <Text style={styles.addEndDateText}>+ Add end date (multi-day)</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.endDateRow}>
          <Text style={styles.endDateLabel}>
            Multi-day through{" "}
            {scheduledEnd!.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </Text>
          <TouchableOpacity onPress={() => setScheduledEnd(null)}>
            <Text style={styles.endDateClearText}>Remove</Text>
          </TouchableOpacity>
        </View>
      )}
      {showEndDatePicker && (
        <DateTimePicker
          value={scheduledEnd ?? scheduledStart}
          mode="date"
          display={Platform.OS === "ios" ? "inline" : "default"}
          themeVariant="dark"
          minimumDate={scheduledStart}
          onChange={(_e, date) => {
            if (Platform.OS === "android") setShowEndDatePicker(false);
            if (date) {
              const ed = new Date(date);
              ed.setHours(17, 0, 0, 0);
              setScheduledEnd(ed);
            }
          }}
        />
      )}
      {Platform.OS === "ios" && showEndDatePicker && (
        <TouchableOpacity style={styles.saveFieldBtn} onPress={() => setShowEndDatePicker(false)}>
          <Text style={styles.saveFieldText}>Done</Text>
        </TouchableOpacity>
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
                  <View style={styles.supplierRow}>
                    <TextInput
                      style={[styles.partDetailInput, { flex: 1 }]}
                      value={part.supplier}
                      onChangeText={(text) => {
                        setParts((prev) =>
                          prev.map((p, i) => (i === index ? { ...p, supplier: text } : p))
                        );
                        if (openSupplierIndex !== index) setOpenSupplierIndex(index);
                      }}
                      onFocus={() => setOpenSupplierIndex(index)}
                      placeholder="Select or type supplier..."
                      placeholderTextColor={colors.textSecondary + "80"}
                    />
                    <TouchableOpacity
                      style={styles.supplierChevronBtn}
                      onPress={() =>
                        setOpenSupplierIndex(openSupplierIndex === index ? null : index)
                      }
                    >
                      <Text style={styles.dropdownArrow}>
                        {openSupplierIndex === index ? "▲" : "▼"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {openSupplierIndex === index && (() => {
                    const q = part.supplier.trim().toLowerCase();
                    const filtered = q
                      ? SUPPLIERS.filter((s) => s.toLowerCase().includes(q))
                      : SUPPLIERS;
                    return (
                      <ScrollView
                        style={styles.supplierDropdownList}
                        nestedScrollEnabled
                        keyboardShouldPersistTaps="handled"
                      >
                        {filtered.length === 0 ? (
                          <View style={styles.dropdownItem}>
                            <Text style={styles.dropdownItemText}>
                              No matches — your text will be saved as a custom supplier
                            </Text>
                          </View>
                        ) : (
                          filtered.map((s) => (
                            <TouchableOpacity
                              key={s}
                              style={[
                                styles.dropdownItem,
                                part.supplier === s && styles.dropdownItemActive,
                              ]}
                              onPress={() => {
                                setParts((prev) =>
                                  prev.map((p, i) =>
                                    i === index ? { ...p, supplier: s } : p
                                  )
                                );
                                setOpenSupplierIndex(null);
                              }}
                            >
                              <Text
                                style={[
                                  styles.dropdownItemText,
                                  part.supplier === s && styles.dropdownItemTextActive,
                                ]}
                              >
                                {s}
                              </Text>
                            </TouchableOpacity>
                          ))
                        )}
                      </ScrollView>
                    );
                  })()}

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

                  {/* Description */}
                  <Text style={styles.partDetailLabel}>Description / details</Text>
                  <TextInput
                    style={styles.partDetailInput}
                    value={part.description}
                    onChangeText={(t) =>
                      setParts((prev) =>
                        prev.map((p, i) => (i === index ? { ...p, description: t } : p))
                      )
                    }
                    placeholder="What's needed, location on the boat, etc."
                    placeholderTextColor={colors.textSecondary + "80"}
                    multiline
                  />

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
              { name: newPartName.trim(), qty: 1, partNum: "", ordered: false, supplier: "", url: "", description: "" },
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
          <Text style={styles.submitText}>{editJobId ? "Save Changes" : "Create Job"}</Text>
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
  // End date multi-day
  addEndDateBtn: {
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignSelf: "flex-start",
  },
  addEndDateText: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  endDateRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.gold + "40",
    backgroundColor: colors.goldMuted,
  },
  endDateLabel: {
    color: colors.gold,
    fontSize: 13,
    fontWeight: "600",
  },
  endDateClearText: {
    color: colors.textSecondary,
    fontSize: 12,
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
  supplierRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  supplierChevronBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  supplierDropdownList: {
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    marginTop: 6,
    marginBottom: 8,
    maxHeight: 220,
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
