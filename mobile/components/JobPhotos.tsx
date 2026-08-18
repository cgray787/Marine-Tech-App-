import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { colors } from "@/constants/Colors";
import { useOffline } from "@/lib/offline-context";
import {
  getJobPhotos,
  uploadJobPhoto,
  deleteJobPhoto,
  pendingJobPhotoUris,
  type JobPhoto,
} from "@/lib/job-photos";

/**
 * Work-area photos on a job.
 *
 * The common path into this screen is the calendar: a tech taps a job, hits
 * "Open job", and is standing at the boat. They want to photograph what they see
 * — often before any service report exists, and frequently no report ever will.
 *
 * These write to report_photos with job_id set, which is the same row the
 * dashboard job page and the portal read. A photo taken here shows up for the
 * office without anything being copied or synced between systems.
 */
export function JobPhotos({ jobId }: { jobId: string }) {
  const { isOnline } = useOffline();
  const [photos, setPhotos] = useState<JobPhoto[] | null>(null);
  const [queued, setQueued] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      setPhotos(await getJobPhotos(jobId));
      setLoadFailed(false);
    } catch {
      // Say we could not reach the server rather than implying there are no
      // photos — a tech in a dead-spot would otherwise re-shoot everything.
      setLoadFailed(true);
      setPhotos((prev) => prev ?? []);
    }
    setQueued(await pendingJobPhotoUris(jobId).catch(() => []));
  }, [jobId]);

  useEffect(() => {
    load();
  }, [load]);

  async function shoot(fromLibrary = false) {
    const perm = fromLibrary
      ? await ImagePicker.requestMediaLibraryPermissionsAsync()
      : await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== "granted") {
      Alert.alert(
        fromLibrary ? "Photo access needed" : "Camera access needed",
        "Marine Tech needs this to attach work-area photos to the job."
      );
      return;
    }
    const result = fromLibrary
      ? await ImagePicker.launchImageLibraryAsync({ quality: 0.6 })
      : await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (result.canceled || !result.assets?.[0]?.uri) return;

    const uri = result.assets[0].uri;
    setBusy(true);
    try {
      const { photo, queued: wasQueued } = await uploadJobPhoto(jobId, uri, null, isOnline);
      if (photo) setPhotos((prev) => [...(prev ?? []), photo]);
      if (wasQueued) setQueued((prev) => [...prev, uri]);
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete(p: JobPhoto) {
    Alert.alert("Remove photo?", "This removes it from the job for everyone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            await deleteJobPhoto(p.id);
            setPhotos((prev) => (prev ?? []).filter((x) => x.id !== p.id));
          } catch {
            Alert.alert("Could not remove", "Check your signal and try again.");
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  const total = (photos?.length ?? 0) + queued.length;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionLabel}>JOB PHOTOS</Text>
        {total > 0 && (
          <View style={styles.countPill}>
            <Text style={styles.countText}>{total}</Text>
          </View>
        )}
      </View>
      <Text style={styles.hint}>
        Photos of the work area on this job. These appear straight away on the
        office dashboard and the portal.
      </Text>

      {photos === null ? (
        <ActivityIndicator color={colors.gold} style={{ marginTop: 14 }} />
      ) : (
        <>
          {loadFailed && (
            <Text style={styles.warn}>
              Couldn&apos;t load existing photos — no connection. Anything you take now
              is saved on this device and uploads when you have signal.
            </Text>
          )}

          {total > 0 && (
            <View style={styles.grid}>
              {(photos ?? []).map((p) => (
                <TouchableOpacity
                  key={p.id}
                  onLongPress={() => confirmDelete(p)}
                  delayLongPress={500}
                  activeOpacity={0.8}
                >
                  <Image source={{ uri: p.photo_url }} style={styles.thumb} />
                </TouchableOpacity>
              ))}
              {queued.map((uri, i) => (
                <View key={`q${i}`}>
                  <Image source={{ uri }} style={[styles.thumb, styles.thumbQueued]} />
                  <Text style={styles.queuedTag}>queued</Text>
                </View>
              ))}
            </View>
          )}

          {total > 0 && (
            <Text style={styles.helpText}>Press and hold a photo to remove it.</Text>
          )}

          <View style={styles.actions}>
            <TouchableOpacity
              onPress={() => shoot(false)}
              disabled={busy}
              style={[styles.cameraBtn, busy && styles.disabled]}
              activeOpacity={0.7}
            >
              <Text style={styles.cameraText}>
                {busy ? "Working…" : total ? "📷  Add another" : "📷  Take a photo"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => shoot(true)}
              disabled={busy}
              style={[styles.libraryBtn, busy && styles.disabled]}
              activeOpacity={0.7}
            >
              <Text style={styles.libraryText}>Library</Text>
            </TouchableOpacity>
          </View>

          {queued.length > 0 && (
            <Text style={styles.queuedNote}>
              {queued.length} photo{queued.length === 1 ? "" : "s"} waiting to upload —
              they&apos;ll send automatically once you have signal.
            </Text>
          )}
        </>
      )}
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
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
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
  hint: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 6 },
  warn: { color: colors.statusInProgress, fontSize: 12, lineHeight: 17, marginTop: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  thumb: {
    width: 78,
    height: 78,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  thumbQueued: { opacity: 0.55, borderColor: colors.gold },
  queuedTag: {
    position: "absolute",
    bottom: 4,
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 9,
    color: colors.gold,
    backgroundColor: "rgba(6,10,18,0.75)",
  },
  helpText: { color: colors.textSecondary, fontSize: 11, marginTop: 8, opacity: 0.8 },
  actions: { flexDirection: "row", gap: 8, marginTop: 12 },
  cameraBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.borderLight,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
  },
  cameraText: { color: colors.textSecondary, fontSize: 15 },
  libraryBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 16,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  libraryText: { color: colors.textSecondary, fontSize: 14 },
  disabled: { opacity: 0.4 },
  queuedNote: { color: colors.gold, fontSize: 12, marginTop: 10, lineHeight: 17 },
});
