import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { colors } from "@/constants/Colors";
import {
  getJobCampaigns,
  getCampaignPhotos,
  saveCampaignWork,
  uploadCampaignPhoto,
  completeCampaign,
  completionBlocker,
  num,
  MARK,
  type CampaignEntry,
  type CampaignPhoto,
} from "@/lib/campaigns";

/**
 * Service campaigns on a job, in the field.
 *
 * The tech never browses a catalog here — campaigns arrive already attached by
 * the office. This screen is for doing the work: read the manufacturer's
 * instructions, photograph the area, write what was found, mark it done. All of
 * it writes to the same campaign_log and report_photos rows the dashboard and
 * portal read, so a photo taken at the boat shows up for the office immediately.
 */
export function JobCampaigns({ jobId }: { jobId: string }) {
  const [entries, setEntries] = useState<CampaignEntry[] | null>(null);
  const [photos, setPhotos] = useState<Record<string, CampaignPhoto[]>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { notes: string; hours: string }>>({});

  const load = useCallback(async () => {
    try {
      const rows = await getJobCampaigns(jobId);
      setEntries(rows);
      setPhotos(await getCampaignPhotos(rows.map((r) => r.id)));
      setDrafts((prev) => {
        const next = { ...prev };
        for (const r of rows) {
          // Don't clobber anything the tech is mid-way through typing.
          next[r.id] ??= {
            notes: r.conditions_found ?? "",
            hours: r.actual_hours != null ? String(r.actual_hours) : "",
          };
        }
        return next;
      });
    } catch {
      setEntries([]);
    }
  }, [jobId]);

  useEffect(() => {
    load();
  }, [load]);

  async function addPhoto(entry: CampaignEntry) {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== "granted") {
      Alert.alert(
        "Camera access needed",
        "A photo is required before a campaign can be marked complete — it is what backs up the warranty claim."
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (result.canceled || !result.assets?.[0]?.uri) return;

    setBusy(entry.id);
    try {
      const shot = await uploadCampaignPhoto(entry.id, result.assets[0].uri);
      setPhotos((prev) => ({ ...prev, [entry.id]: [...(prev[entry.id] ?? []), shot] }));
    } catch {
      Alert.alert("Upload failed", "The photo could not be uploaded. Check your signal and try again.");
    } finally {
      setBusy(null);
    }
  }

  async function saveWork(entry: CampaignEntry) {
    const d = drafts[entry.id];
    if (!d) return;
    setBusy(entry.id);
    try {
      await saveCampaignWork(entry.id, {
        conditions_found: d.notes.trim() || null,
        actual_hours: d.hours.trim() ? Number(d.hours) : null,
      });
      await load();
    } catch {
      Alert.alert("Could not save", "Your findings were not saved. Check your signal and try again.");
    } finally {
      setBusy(null);
    }
  }

  async function markDone(entry: CampaignEntry) {
    setBusy(entry.id);
    try {
      await saveCampaignWork(entry.id, {
        conditions_found: drafts[entry.id]?.notes.trim() || null,
        actual_hours: drafts[entry.id]?.hours.trim() ? Number(drafts[entry.id].hours) : null,
      });
      await completeCampaign(entry.id);
      await load();
    } catch {
      Alert.alert("Could not complete", "Check your signal and try again.");
    } finally {
      setBusy(null);
    }
  }

  if (entries === null) {
    return (
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>SERVICE CAMPAIGNS</Text>
        <ActivityIndicator color={colors.gold} style={{ marginTop: 12 }} />
      </View>
    );
  }

  if (entries.length === 0) return null; // nothing to show, don't add noise

  const open = entries.filter((e) => e.status === "open");

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionLabel}>SERVICE CAMPAIGNS</Text>
        {open.length > 0 && (
          <View style={styles.countPill}>
            <Text style={styles.countText}>{open.length} to do</Text>
          </View>
        )}
      </View>

      {entries.map((e) => {
        const shots = photos[e.id] ?? [];
        const d = drafts[e.id] ?? { notes: "", hours: "" };
        const blocker = completionBlocker({ conditions_found: d.notes, photoCount: shots.length });
        const isOpen = expanded === e.id;
        const done = e.status === "completed";
        const comp = num(e.compensated_hours);

        return (
          <View key={e.id} style={[styles.entry, done && styles.entryDone]}>
            <TouchableOpacity
              onPress={() => setExpanded(isOpen ? null : e.id)}
              activeOpacity={0.7}
              style={styles.entryHeader}
            >
              <View style={styles.mark}>
                <Text style={styles.markText}>{MARK[e.manufacturer]}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.entryTitle}>
                  {e.campaign_code} · {e.campaign_title}
                </Text>
                <Text style={styles.entryMeta}>
                  {done ? "Completed" : e.status === "not_applicable" ? "Not applicable" : "To do"}
                  {shots.length > 0 ? ` · ${shots.length} photo${shots.length === 1 ? "" : "s"}` : ""}
                </Text>
              </View>
              <Text style={styles.hours}>{comp.toFixed(1)} h</Text>
            </TouchableOpacity>

            {isOpen && (
              <View style={styles.body}>
                {!!e.instructions_snapshot && (
                  <>
                    <Text style={styles.fieldLabel}>INSTRUCTIONS</Text>
                    <Text style={styles.instructions}>{e.instructions_snapshot}</Text>
                  </>
                )}

                <Text style={styles.fieldLabel}>PHOTOS OF THE WORK AREA</Text>
                <View style={styles.shots}>
                  {shots.map((p) => (
                    <Image key={p.id} source={{ uri: p.photo_url }} style={styles.shot} />
                  ))}
                </View>
                <TouchableOpacity
                  onPress={() => addPhoto(e)}
                  disabled={busy === e.id || done}
                  style={[styles.cameraBtn, done && styles.disabled]}
                  activeOpacity={0.7}
                >
                  <Text style={styles.cameraText}>
                    {busy === e.id ? "Uploading…" : shots.length ? "📷  Add another photo" : "📷  Take a photo"}
                  </Text>
                </TouchableOpacity>

                <Text style={styles.fieldLabel}>CONDITIONS FOUND</Text>
                <TextInput
                  multiline
                  editable={!done}
                  value={d.notes}
                  onChangeText={(v) =>
                    setDrafts((prev) => ({ ...prev, [e.id]: { ...d, notes: v } }))
                  }
                  onBlur={() => saveWork(e)}
                  placeholder="What you found and what you did."
                  placeholderTextColor={colors.textSecondary + "80"}
                  style={styles.textarea}
                />

                <View style={styles.hoursRow}>
                  <View style={styles.hoursCell}>
                    <Text style={styles.fieldLabel}>COMPENSATED</Text>
                    <View style={styles.readonly}>
                      <Text style={styles.readonlyText}>{comp.toFixed(1)} h</Text>
                    </View>
                  </View>
                  <View style={styles.hoursCell}>
                    <Text style={styles.fieldLabel}>YOUR HOURS</Text>
                    <TextInput
                      editable={!done}
                      keyboardType="decimal-pad"
                      value={d.hours}
                      onChangeText={(v) =>
                        setDrafts((prev) => ({ ...prev, [e.id]: { ...d, hours: v } }))
                      }
                      onBlur={() => saveWork(e)}
                      placeholder="0.0"
                      placeholderTextColor={colors.textSecondary + "80"}
                      style={styles.hoursInput}
                    />
                  </View>
                </View>

                {!done && (
                  <>
                    <TouchableOpacity
                      onPress={() => markDone(e)}
                      disabled={!!blocker || busy === e.id}
                      style={[styles.cta, (!!blocker || busy === e.id) && styles.ctaDisabled]}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.ctaText, !!blocker && styles.ctaTextDisabled]}>
                        Mark complete
                      </Text>
                    </TouchableOpacity>
                    <Text style={[styles.gate, !blocker && styles.gateOk]}>
                      {blocker ?? "Ready to file — photo and finding recorded"}
                    </Text>
                  </>
                )}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 16,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1,
    color: colors.textSecondary,
  },
  countPill: {
    backgroundColor: colors.goldMuted,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  countText: { color: colors.gold, fontSize: 10, fontWeight: "700" },
  entry: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.bgSecondary,
    marginBottom: 8,
    overflow: "hidden",
  },
  entryDone: { opacity: 0.65 },
  entryHeader: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12 },
  mark: {
    backgroundColor: colors.goldMuted,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  markText: { color: colors.gold, fontSize: 10, fontWeight: "700" },
  entryTitle: { color: colors.textPrimary, fontSize: 14, lineHeight: 19 },
  entryMeta: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  hours: { color: colors.gold, fontSize: 13, fontVariant: ["tabular-nums"] },
  body: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: 12,
    paddingTop: 10,
  },
  fieldLabel: {
    fontSize: 10,
    letterSpacing: 1,
    color: colors.textSecondary,
    marginBottom: 6,
    marginTop: 4,
  },
  instructions: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 8,
  },
  shots: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  shot: {
    width: 64,
    height: 64,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cameraBtn: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.borderLight,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  cameraText: { color: colors.textSecondary, fontSize: 15 },
  disabled: { opacity: 0.4 },
  textarea: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.bgCard,
    color: colors.textPrimary,
    padding: 12,
    fontSize: 14,
    minHeight: 84,
    textAlignVertical: "top",
  },
  hoursRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  hoursCell: { flex: 1 },
  readonly: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.bgSecondary,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  readonlyText: { color: colors.textSecondary, fontSize: 14 },
  hoursInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.bgCard,
    color: colors.textPrimary,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  cta: {
    backgroundColor: colors.gold,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 14,
  },
  ctaDisabled: { backgroundColor: "#232c3e" },
  ctaText: { color: colors.bgPrimary, fontSize: 15, fontWeight: "700" },
  ctaTextDisabled: { color: "#4a5468" },
  gate: { color: colors.gold, fontSize: 12, textAlign: "center", marginTop: 8 },
  gateOk: { color: colors.good },
});
