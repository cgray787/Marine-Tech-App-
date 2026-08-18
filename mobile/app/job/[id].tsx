import { useCallback, useEffect, useState } from "react";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  Share,
  Dimensions,
} from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { supabase } from "@/lib/supabase";
import { JobCampaigns } from "@/components/JobCampaigns";
import { JobPhotos } from "@/components/JobPhotos";
import { useAuth } from "@/lib/auth-context";
import { colors } from "@/constants/Colors";
import { generateServiceReportHTML, generatePDIReportHTML, formatEngineHours } from "@/lib/pdf-template";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const PHOTO_SIZE = SCREEN_WIDTH * 0.6;

type ServiceReport = {
  id: string;
  job_id: string;
  boat_name: string;
  owner_name: string;
  make_model: string;
  year: number | null;
  hin: string;
  marina: string;
  engine_make_model: string | null;
  engine_hours: number | null;
  battery_voltage: string | null;
  service_types: string[] | null;
  work_description: string | null;
  parts_used: string[] | null;
  concerns: string | null;
  general_notes: string | null;
  submitted_at: string;
};

type ChecklistItem = {
  id: string;
  category: string;
  item_name: string;
  assessment: "good" | "bad";
  notes: string | null;
  sort_order: number;
};

type ReportPhoto = {
  id: string;
  photo_url: string;
  category: string | null;
  caption: string | null;
};

type Customer = {
  name: string;
  email: string | null;
  phone: string | null;
};

type Boat = {
  name: string;
  make_model: string | null;
  year: number | null;
  hin: string | null;
  engine_make: string | null;
  engine_model: string | null;
  engine_hours_port: number | null;
  engine_hours_starboard: number | null;
  color: string | null;
};

type Marina = {
  name: string;
  address: string | null;
};

type Job = {
  id: string;
  status: string;
  service_types: string[] | null;
  service_descriptions: Record<string, string> | null;
  scheduled_date: string | null;
  notes: string | null;
  customers: Customer | null;
  boats: Boat | null;
  marinas: Marina | null;
  boat_id: string | null;
};

type OtherJob = {
  id: string;
  status: string;
  service_types: string[] | null;
  scheduled_date: string | null;
};

export default function JobDetailScreen() {
  const params = useLocalSearchParams<{ id: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [job, setJob] = useState<Job | null>(null);
  const [report, setReport] = useState<ServiceReport | null>(null);
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [photos, setPhotos] = useState<ReportPhoto[]>([]);
  const [otherJobs, setOtherJobs] = useState<OtherJob[]>([]);
  const [deleting, setDeleting] = useState(false);

  const fetchJobData = useCallback(async () => {
    if (!id) return;
    setLoading(true);

    // Fetch job with customer, boat, and marina details
    const { data: jobData } = await supabase
      .from("jobs")
      .select("id, status, service_types, service_descriptions, scheduled_date, notes, boat_id, customers(name, email, phone), boats(name, make_model, year, hin, engine_make, engine_model, engine_hours_port, engine_hours_starboard, color), marinas(name, address)")
      .eq("id", id)
      .single();

    if (jobData) setJob(jobData as unknown as Job);

    // Other active jobs for the same boat (Task 3).
    const boatId = (jobData as unknown as { boat_id?: string | null })?.boat_id;
    if (boatId) {
      const { data: otherJobsData } = await supabase
        .from("jobs")
        .select("id, status, service_types, scheduled_date")
        .eq("boat_id", boatId)
        .neq("status", "completed")
        .neq("id", id)
        .order("scheduled_date", { ascending: true, nullsFirst: false })
        .limit(10);
      if (otherJobsData) setOtherJobs(otherJobsData as OtherJob[]);
    }

    // Fetch service report for this job
    const { data: reportData } = await supabase
      .from("service_reports")
      .select("*")
      .eq("job_id", id)
      .single();

    if (reportData) {
      setReport(reportData);

      // Fetch checklist items for this report
      const { data: items } = await supabase
        .from("checklist_items")
        .select("*")
        .eq("report_id", reportData.id)
        .order("sort_order");

      if (items) setChecklistItems(items);

      // Fetch photos for this report
      const { data: photoData } = await supabase
        .from("report_photos")
        .select("*")
        .eq("report_id", reportData.id)
        .order("created_at");

      if (photoData) setPhotos(photoData);
    }

    setLoading(false);
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchJobData();
  }, [fetchJobData]);

  function formatDate(dateStr: string | null) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function handleBack() {
    // The native auto-generated back button no-ops on this RN new-architecture +
    // react-native-screens build (it renders but never fires goBack), so we drive
    // navigation explicitly from a custom headerLeft instead — same mechanism as the
    // working Edit/Delete header buttons.
    if (router.canGoBack()) {
      router.back();
    } else {
      // Deep-link / cold-start fallback: nothing to pop, land somewhere sensible.
      router.replace("/(tabs)/jobs");
    }
  }

  function handleEdit() {
    if (!id) return;
    router.push({ pathname: "/(tabs)/service", params: { editJobId: id } });
  }

  async function handleDelete() {
    if (!id) return;
    Alert.alert(
      "Delete Job?",
      "This permanently removes the job, its service report, checklist, and photos. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            // Delete service_reports first (cascades to checklist_items & report_photos).
            // jobs has no cascade to service_reports, so we must delete reports explicitly.
            const { error: reportErr } = await supabase
              .from("service_reports")
              .delete()
              .eq("job_id", id);
            if (reportErr) {
              setDeleting(false);
              Alert.alert("Error", reportErr.message);
              return;
            }
            const { error: jobErr } = await supabase
              .from("jobs")
              .delete()
              .eq("id", id);
            setDeleting(false);
            if (jobErr) {
              Alert.alert("Error", jobErr.message);
              return;
            }
            router.back();
          },
        },
      ]
    );
  }

  async function handleExportPDF() {
    if (!report) return;

    try {
      const html = generateServiceReportHTML(
        {
          ...report,
          engine_hours_port: job?.boats?.engine_hours_port ?? null,
          engine_hours_starboard: job?.boats?.engine_hours_starboard ?? null,
        },
        checklistItems,
        photos
      );
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: `Service Report - ${report.boat_name}`,
        UTI: "com.adobe.pdf",
      });
    } catch (error) {
      if (error instanceof Error && error.message?.includes("cancel")) {
        // User cancelled sharing — do nothing
        return;
      }
      Alert.alert("Error", "Failed to generate PDF. Please try again.");
    }
  }

  async function handleShare() {
    if (!report) {
      try {
        await Share.share({
          title: `Job ${id}`,
          message: `Job ID: ${id}`,
        });
      } catch {
        // User cancelled
      }
      return;
    }

    // Offer to share as PDF
    try {
      const html = generateServiceReportHTML(
        {
          ...report,
          engine_hours_port: job?.boats?.engine_hours_port ?? null,
          engine_hours_starboard: job?.boats?.engine_hours_starboard ?? null,
        },
        checklistItems,
        photos
      );
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: `Service Report - ${report.boat_name}`,
        UTI: "com.adobe.pdf",
      });
    } catch (error) {
      // If PDF sharing fails or is cancelled, fall back to text share
      if (error instanceof Error && error.message?.includes("cancel")) {
        return;
      }
      // Fallback to text-based share
      try {
        const partsArray: string[] = Array.isArray(report.parts_used)
          ? report.parts_used
          : typeof report.parts_used === "string"
          ? (() => { try { return JSON.parse(report.parts_used as unknown as string); } catch { return []; } })()
          : [];
        const message = `Service Report for ${report.boat_name}\nOwner: ${report.owner_name}\nMarina: ${report.marina}\n${report.make_model} (${report.year})\nHIN: ${report.hin}\n\nEngine: ${report.engine_make_model || "N/A"}\nEngine Hours: ${formatEngineHours(job?.boats?.engine_hours_port, job?.boats?.engine_hours_starboard, report.engine_hours)}\nBattery Voltage: ${report.battery_voltage || "N/A"}\n\nWork Description:\n${report.work_description || "N/A"}\n\nParts Used:\n${partsArray.map((p) => `- ${p}`).join("\n")}\n\nNotes: ${report.general_notes || "N/A"}`;
        await Share.share({
          title: `Service Report - ${report.boat_name}`,
          message,
        });
      } catch {
        // User cancelled
      }
    }
  }

  // Group checklist items by category
  const groupedItems = checklistItems.reduce<Record<string, ChecklistItem[]>>(
    (acc, item) => {
      const cat = item.category;
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(item);
      return acc;
    },
    {}
  );

  const CATEGORY_LABELS: Record<string, string> = {
    engine: "Engine",
    electrical: "Electrical",
    hull: "Hull",
    safety: "Safety",
    nav: "Navigation",
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.gold} />
        <Text style={styles.loadingText}>Loading job details...</Text>
      </View>
    );
  }

  if (!job) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.emptyIcon}>{"\u26A0\uFE0F"}</Text>
        <Text style={styles.loadingText}>Job not found</Text>
      </View>
    );
  }

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

  return (
    <>
      <Stack.Screen
        options={{
          // Custom back control — the native auto back button is dead on this build,
          // so we render our own (always present, incl. for viewers). Setting headerLeft
          // replaces the native back button, so there's no duplicate.
          headerLeft: () => (
            <TouchableOpacity
              onPress={handleBack}
              activeOpacity={0.7}
              style={styles.headerBackBtn}
              accessibilityLabel="Back"
            >
              <Text style={styles.headerBackText}>{"‹"} Back</Text>
            </TouchableOpacity>
          ),
          ...(profile && profile.role !== "viewer"
            ? {
                headerRight: () => (
                  <View style={styles.headerActions}>
                    <TouchableOpacity
                      onPress={handleEdit}
                      disabled={deleting}
                      activeOpacity={0.7}
                      style={styles.headerBtn}
                      accessibilityLabel="Edit job"
                    >
                      <Text style={styles.headerBtnText}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleDelete}
                      disabled={deleting}
                      activeOpacity={0.7}
                      style={styles.headerBtn}
                      accessibilityLabel="Delete job"
                    >
                      {deleting ? (
                        <ActivityIndicator size="small" color={colors.bad} />
                      ) : (
                        <Text style={[styles.headerBtnText, styles.headerBtnTextDanger]}>
                          Delete
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                ),
              }
            : {}),
        }}
      />
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Status Badge */}
      <View style={styles.statusRow}>
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
              { color: STATUS_COLORS[job.status] || colors.statusNew },
            ]}
          >
            {STATUS_LABELS[job.status] || job.status}
          </Text>
        </View>
        {job.scheduled_date && (
          <Text style={styles.dateText}>
            {formatDate(job.scheduled_date)}
          </Text>
        )}
      </View>

      {/* Service Type Chips */}
      {job.service_types && job.service_types.length > 0 && (
        <View style={styles.chipsRow}>
          {job.service_types.map((type, i) => (
            <View key={i} style={styles.serviceChip}>
              <Text style={styles.serviceChipText}>{type}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Work-area photos. The common path here is the calendar — tap a job,
          Open job, and shoot what is in front of you. Same rows the dashboard
          and portal read. */}
      <JobPhotos jobId={String(id)} />

      {/* Service campaigns — attached by the office, worked here. Instructions,
          photos and findings all live on the same rows the dashboard reads. */}
      <JobCampaigns jobId={String(id)} />

      {/* Service notes — per-service descriptions */}
      {(() => {
        const descs = job.service_descriptions;
        const entries = descs ? Object.entries(descs).filter(([, v]) => v && v.trim()) : [];
        if (entries.length === 0) return null;
        return (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Service Notes</Text>
            {entries.map(([type, desc]) => (
              <View key={type} style={styles.serviceNoteRow}>
                <View style={styles.serviceNoteChip}>
                  <Text style={styles.serviceNoteChipText}>{type}</Text>
                </View>
                <Text style={styles.serviceNoteText}>{desc}</Text>
              </View>
            ))}
          </View>
        );
      })()}

      {/* Other active jobs for this boat */}
      {otherJobs.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Other Active Jobs — Same Boat</Text>
          {otherJobs.map((oj) => (
            <TouchableOpacity
              key={oj.id}
              style={styles.otherJobRow}
              onPress={() => router.push({ pathname: "/job/[id]", params: { id: oj.id } })}
              activeOpacity={0.7}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.otherJobName}>
                  {oj.service_types && oj.service_types.length > 0
                    ? oj.service_types.join(", ")
                    : "Job"}
                </Text>
                {oj.scheduled_date && (
                  <Text style={styles.otherJobDate}>{formatDate(oj.scheduled_date)}</Text>
                )}
              </View>
              <View style={[styles.otherJobBadge, { backgroundColor: (STATUS_COLORS[oj.status] ?? "#4ade80") + "20" }]}>
                <Text style={[styles.otherJobBadgeText, { color: STATUS_COLORS[oj.status] ?? "#4ade80" }]}>
                  {STATUS_LABELS[oj.status] ?? oj.status}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Customer Info Card */}
      {job.customers && (
        <View style={styles.vesselCard}>
          <View style={styles.vesselCardAccent} />
          <View style={styles.vesselCardContent}>
            <Text style={styles.cardTitle}>Customer</Text>
            <View style={styles.infoGrid}>
              <InfoRow label="Name" value={job.customers.name} />
              {job.customers.phone && (
                <InfoRow label="Phone" value={job.customers.phone} />
              )}
              {job.customers.email && (
                <InfoRow label="Email" value={job.customers.email} />
              )}
            </View>
          </View>
        </View>
      )}

      {/* Vessel Info Card */}
      {job.boats && (
        <View style={styles.vesselCard}>
          <View style={styles.vesselCardAccent} />
          <View style={styles.vesselCardContent}>
            <Text style={styles.cardTitle}>Vessel Information</Text>
            <View style={styles.infoGrid}>
              <InfoRow label="Boat Name" value={job.boats.name} />
              {job.boats.make_model && (
                <InfoRow label="Make / Model" value={job.boats.make_model} />
              )}
              {job.boats.year && (
                <InfoRow label="Year" value={String(job.boats.year)} />
              )}
              {job.boats.hin && (
                <InfoRow label="HIN" value={job.boats.hin} />
              )}
              {job.boats.color && (
                <InfoRow label="Color" value={job.boats.color} />
              )}
              {job.boats.engine_make && (
                <InfoRow
                  label="Engine"
                  value={`${job.boats.engine_make}${job.boats.engine_model ? " " + job.boats.engine_model : ""}`}
                />
              )}
              {(job.boats.engine_hours_port != null ||
                job.boats.engine_hours_starboard != null) && (
                <InfoRow
                  label="Engine Hours"
                  value={formatEngineHours(
                    job.boats.engine_hours_port,
                    job.boats.engine_hours_starboard
                  )}
                />
              )}
            </View>
          </View>
        </View>
      )}

      {/* Marina Card */}
      {job.marinas && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Marina</Text>
          <View style={styles.infoGrid}>
            <InfoRow label="Name" value={job.marinas.name} />
            {job.marinas.address && (
              <InfoRow label="Address" value={job.marinas.address} />
            )}
          </View>
        </View>
      )}

      {/* Job Notes */}
      {job.notes && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Job Notes</Text>
          <Text style={styles.bodyText}>{job.notes}</Text>
        </View>
      )}

      {/* Systems Card (from service report) */}
      {report && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Systems</Text>
          <View style={styles.infoGrid}>
            <InfoRow
              label="Engine"
              value={report.engine_make_model || "—"}
            />
            <InfoRow
              label="Engine Hours"
              value={formatEngineHours(
                job.boats?.engine_hours_port,
                job.boats?.engine_hours_starboard,
                report.engine_hours
              )}
            />
            <InfoRow
              label="Battery Voltage"
              value={report.battery_voltage || "—"}
            />
          </View>
        </View>
      )}

      {/* Checklist Results */}
      {Object.keys(groupedItems).length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Inspection Results</Text>
          {Object.entries(groupedItems).map(([category, items]) => (
            <View key={category} style={styles.categorySection}>
              <Text style={styles.categoryLabel}>
                {CATEGORY_LABELS[category] || category}
              </Text>
              {items.map((item) => (
                <View key={item.id} style={styles.checklistRow}>
                  <View style={styles.checklistLeft}>
                    <View
                      style={[
                        styles.assessmentDot,
                        {
                          backgroundColor:
                            item.assessment === "good"
                              ? colors.good
                              : colors.bad,
                        },
                      ]}
                    />
                    <Text style={styles.checklistName}>{item.item_name}</Text>
                  </View>
                  <Text
                    style={[
                      styles.assessmentLabel,
                      {
                        color:
                          item.assessment === "good"
                            ? colors.good
                            : colors.bad,
                      },
                    ]}
                  >
                    {item.assessment === "good" ? "GOOD" : "BAD"}
                  </Text>
                </View>
              ))}
              {/* Show notes for bad items */}
              {items
                .filter((it) => it.assessment === "bad" && it.notes)
                .map((it) => (
                  <View key={`note-${it.id}`} style={styles.itemNote}>
                    <Text style={styles.itemNoteLabel}>{it.item_name}:</Text>
                    <Text style={styles.itemNoteText}>{it.notes}</Text>
                  </View>
                ))}
            </View>
          ))}
        </View>
      )}

      {/* Work Description */}
      {report?.work_description && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Work Description</Text>
          <Text style={styles.bodyText}>{report.work_description}</Text>
        </View>
      )}

      {/* Parts Used */}
      {report?.parts_used && (
        (() => {
          const parts: string[] = Array.isArray(report.parts_used)
            ? report.parts_used
            : typeof report.parts_used === "string"
            ? (() => { try { return JSON.parse(report.parts_used as unknown as string); } catch { return []; } })()
            : [];
          return parts.length > 0 ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Parts Used</Text>
              {parts.map((part: string, i: number) => (
                <View key={i} style={styles.partRow}>
                  <View style={styles.partBullet} />
                  <Text style={styles.partText}>{part}</Text>
                </View>
              ))}
            </View>
          ) : null;
        })()
      )}

      {/* General Notes */}
      {report?.general_notes && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>General Notes</Text>
          <Text style={styles.bodyText}>{report.general_notes}</Text>
        </View>
      )}

      {/* Photo Gallery */}
      {photos.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            Photos ({photos.length})
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.photoScroll}
          >
            {photos.map((photo) => (
              <View key={photo.id} style={styles.photoItem}>
                <Image
                  source={{ uri: photo.photo_url }}
                  style={styles.photoImage}
                  resizeMode="cover"
                />
                {photo.category && (
                  <View style={styles.photoCategoryBadge}>
                    <Text style={styles.photoCategoryText}>
                      {photo.category.replace(/_/g, " ")}
                    </Text>
                  </View>
                )}
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Job Notes (from jobs table) */}
      {!report && job.notes && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Job Notes</Text>
          <Text style={styles.bodyText}>{job.notes}</Text>
        </View>
      )}

      {/* No report message */}
      {!report && (
        <View style={styles.noReportContainer}>
          <Text style={styles.noReportIcon}>{"\uD83D\uDCCB"}</Text>
          <Text style={styles.noReportTitle}>No Service Report Yet</Text>
          <Text style={styles.noReportText}>
            A service report will appear here once the job is completed.
          </Text>
        </View>
      )}

      {/* Action Buttons */}
      {report && (
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleExportPDF}
            activeOpacity={0.7}
          >
            <Text style={styles.actionIcon}>{"\uD83D\uDCC4"}</Text>
            <Text style={styles.actionText}>Export PDF</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleShare}
            activeOpacity={0.7}
          >
            <Text style={styles.actionIcon}>{"\uD83D\uDCE4"}</Text>
            <Text style={styles.actionText}>Share</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
    </>
  );
}

function InfoRow({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text
        style={[styles.infoValue, valueColor ? { color: valueColor } : null]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 15,
    marginTop: 12,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 8,
  },

  // Status row
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  statusBadge: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginRight: 4,
  },
  headerBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  headerBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.gold,
  },
  headerBtnTextDanger: {
    color: colors.bad,
  },
  headerBackBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginLeft: 4,
  },
  headerBackText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.gold,
  },
  statusText: {
    fontSize: 13,
    fontWeight: "700",
  },
  dateText: {
    fontSize: 14,
    color: colors.textSecondary,
  },

  // Service type chips
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  serviceChip: {
    backgroundColor: colors.goldMuted,
    borderWidth: 1,
    borderColor: colors.gold + "40",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  serviceChipText: {
    color: colors.gold,
    fontSize: 13,
    fontWeight: "600",
  },

  // Vessel card with gold accent
  vesselCard: {
    flexDirection: "row",
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 12,
  },
  vesselCardAccent: {
    width: 4,
    backgroundColor: colors.gold,
  },
  vesselCardContent: {
    flex: 1,
    padding: 16,
  },

  // Generic card
  card: {
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.gold,
    marginBottom: 12,
  },

  // Info grid
  infoGrid: {
    gap: 8,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  infoLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    flex: 1,
  },
  infoValue: {
    fontSize: 14,
    color: colors.textPrimary,
    fontWeight: "500",
    flex: 1,
    textAlign: "right",
  },

  // Checklist
  categorySection: {
    marginBottom: 16,
  },
  categoryLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textSecondary,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  checklistRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: colors.bgCard,
    borderRadius: 8,
    marginBottom: 4,
  },
  checklistLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  assessmentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 10,
  },
  checklistName: {
    fontSize: 14,
    color: colors.textPrimary,
  },
  assessmentLabel: {
    fontSize: 12,
    fontWeight: "700",
    marginLeft: 8,
  },
  itemNote: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 2,
    marginBottom: 4,
    borderLeftWidth: 2,
    borderLeftColor: colors.bad,
    marginLeft: 16,
  },
  itemNoteLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.bad,
    marginBottom: 2,
  },
  itemNoteText: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },

  // Work description / notes
  bodyText: {
    fontSize: 14,
    color: colors.textPrimary,
    lineHeight: 22,
  },

  // Parts
  partRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  partBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.gold,
    marginRight: 10,
  },
  partText: {
    fontSize: 14,
    color: colors.textPrimary,
  },

  // Photo gallery
  photoScroll: {
    gap: 12,
  },
  photoItem: {
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: colors.bgCard,
  },
  photoImage: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE * 0.75,
    borderRadius: 10,
  },
  photoCategoryBadge: {
    position: "absolute",
    bottom: 8,
    left: 8,
    backgroundColor: "rgba(0,0,0,0.7)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  photoCategoryText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: "600",
    textTransform: "capitalize",
  },

  // No report
  noReportContainer: {
    alignItems: "center",
    paddingVertical: 40,
  },
  noReportIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  noReportTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: 6,
  },
  noReportText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
    maxWidth: 260,
  },

  // Action buttons
  actionsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.gold,
    borderRadius: 10,
    paddingVertical: 14,
    gap: 8,
  },
  actionIcon: {
    fontSize: 18,
  },
  actionText: {
    color: colors.bgPrimary,
    fontSize: 15,
    fontWeight: "700",
  },
  // Service notes
  serviceNoteRow: {
    marginTop: 10,
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  serviceNoteChip: {
    backgroundColor: colors.goldMuted,
    borderWidth: 1,
    borderColor: colors.gold + "40",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    flexShrink: 0,
  },
  serviceNoteChipText: {
    color: colors.gold,
    fontSize: 11,
    fontWeight: "600",
  },
  serviceNoteText: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
  },
  // Other active jobs
  otherJobRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 8,
  },
  otherJobName: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "600",
  },
  otherJobDate: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  otherJobBadge: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  otherJobBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
});
