import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Calendar, DateData } from "react-native-calendars";
import { supabase } from "@/lib/supabase";
import { colors } from "@/constants/Colors";

export type ScheduleSheetHandle = {
  present: (job: {
    id: string;
    customerName: string;
    boatName: string | null;
    currentScheduledStart: string | null;
    currentLocation?: string | null;
  }) => void;
  dismiss: () => void;
};

type Props = {
  onScheduled?: () => void;
};

type Mode = "calendar" | "picker";

export const ScheduleSheet = forwardRef<ScheduleSheetHandle, Props>(
  ({ onScheduled }, ref) => {
    const sheetRef = useRef<BottomSheet>(null);
    const [job, setJob] = useState<{
      id: string;
      customerName: string;
      boatName: string | null;
    } | null>(null);
    const [mode, setMode] = useState<Mode>("calendar");
    const [pickedDate, setPickedDate] = useState<Date>(() => new Date());
    // endDate: null = single-day, Date = multi-day end.
    const [endDate, setEndDate] = useState<Date | null>(null);
    // Whether the calendar/picker is currently selecting the end date.
    const [pickingEnd, setPickingEnd] = useState(false);
    const [location, setLocation] = useState("");
    const [showTimePicker, setShowTimePicker] = useState(false);
    const [saving, setSaving] = useState(false);
    const snapPoints = useMemo(() => ["90%"], []);

    // True when endDate is a different (later) day than pickedDate.
    const isMultiDay =
      endDate !== null &&
      endDate > pickedDate &&
      (endDate.getFullYear() !== pickedDate.getFullYear() ||
        endDate.getMonth() !== pickedDate.getMonth() ||
        endDate.getDate() !== pickedDate.getDate());

    useImperativeHandle(ref, () => ({
      present: (j) => {
        setJob({ id: j.id, customerName: j.customerName, boatName: j.boatName });
        const initial = j.currentScheduledStart
          ? new Date(j.currentScheduledStart)
          : (() => {
              const d = new Date();
              d.setHours(d.getHours() + 1, 0, 0, 0);
              return d;
            })();
        setPickedDate(initial);
        setEndDate(null);
        setPickingEnd(false);
        setLocation(j.currentLocation ?? "");
        setMode("calendar");
        sheetRef.current?.snapToIndex(0);
      },
      dismiss: () => sheetRef.current?.close(),
    }));

    function dateToString(d: Date): string {
      // react-native-calendars expects YYYY-MM-DD in local time.
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    }

    function selectedDateString(): string {
      return dateToString(pickedDate);
    }

    async function save() {
      if (!job) return;
      setSaving(true);
      const start = pickedDate.toISOString();
      const startDateOnly = dateToString(pickedDate);

      let end: string;
      let endDateOnly: string | null = null;

      if (isMultiDay && endDate) {
        // End = end date at 17:00 local time.
        const endAt5 = new Date(endDate);
        endAt5.setHours(17, 0, 0, 0);
        end = endAt5.toISOString();
        endDateOnly = dateToString(endDate);
      } else {
        end = new Date(pickedDate.getTime() + 60 * 60 * 1000).toISOString();
      }

      const { error } = await supabase
        .from("jobs")
        .update({
          scheduled_start: start,
          scheduled_end: end,
          scheduled_date: startDateOnly,
          scheduled_end_date: endDateOnly,
          location_override: location.trim() || null,
        })
        .eq("id", job.id);
      setSaving(false);
      if (error) {
        Alert.alert("Couldn't schedule", error.message);
        return;
      }
      sheetRef.current?.close();
      onScheduled?.();
    }

    return (
      <BottomSheet
        ref={sheetRef}
        snapPoints={snapPoints}
        index={-1}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: colors.bgCard }}
        handleIndicatorStyle={{ backgroundColor: colors.textSecondary }}
      >
        <BottomSheetView style={styles.body}>
          {job && (
            <>
              <Text style={styles.title}>Schedule</Text>
              <Text style={styles.subtitle}>
                {job.customerName}
                {job.boatName ? ` · ${job.boatName}` : ""}
              </Text>

              <View style={styles.toggleRow}>
                <Pressable
                  onPress={() => setMode("calendar")}
                  style={[
                    styles.toggle,
                    mode === "calendar" && styles.toggleActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.toggleText,
                      mode === "calendar" && styles.toggleTextActive,
                    ]}
                  >
                    Calendar
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setMode("picker")}
                  style={[
                    styles.toggle,
                    mode === "picker" && styles.toggleActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.toggleText,
                      mode === "picker" && styles.toggleTextActive,
                    ]}
                  >
                    Pick exact
                  </Text>
                </Pressable>
              </View>

              {/* Mode tabs now also serve end-date picking */}
              <Text style={[styles.pickerLabel, { marginBottom: 2 }]}>
                {pickingEnd ? "End date" : "Start date"}
              </Text>

              {mode === "calendar" ? (
                <Calendar
                  onDayPress={(d: DateData) => {
                    const next = new Date(pickingEnd ? (endDate ?? pickedDate) : pickedDate);
                    next.setFullYear(d.year, d.month - 1, d.day);
                    if (!pickingEnd && next.getHours() === 0 && next.getMinutes() === 0) {
                      next.setHours(9, 0, 0, 0);
                    }
                    if (pickingEnd) {
                      // End date must be >= start.
                      if (next >= pickedDate) {
                        next.setHours(17, 0, 0, 0);
                        setEndDate(next);
                        setPickingEnd(false);
                      }
                    } else {
                      setPickedDate(next);
                    }
                  }}
                  markedDates={{
                    [selectedDateString()]: { selected: !pickingEnd, startingDay: isMultiDay, marked: isMultiDay },
                    ...(endDate && isMultiDay ? { [dateToString(endDate)]: { selected: pickingEnd, endingDay: true, marked: true } } : {}),
                  }}
                  theme={{
                    calendarBackground: colors.bgCard,
                    dayTextColor: colors.textPrimary,
                    monthTextColor: colors.textPrimary,
                    textSectionTitleColor: colors.textSecondary,
                    textDisabledColor: "#444",
                    todayTextColor: colors.gold,
                    selectedDayBackgroundColor: colors.gold,
                    selectedDayTextColor: colors.bgPrimary,
                    arrowColor: colors.gold,
                  }}
                />
              ) : (
                <View style={styles.pickerWrap}>
                  <DateTimePicker
                    value={pickingEnd ? (endDate ?? pickedDate) : pickedDate}
                    mode={pickingEnd ? "date" : "datetime"}
                    display={Platform.OS === "ios" ? "inline" : "default"}
                    themeVariant="dark"
                    minimumDate={pickingEnd ? pickedDate : undefined}
                    onChange={(_e, d) => {
                      if (Platform.OS === "android") setShowTimePicker(false);
                      if (!d) return;
                      if (pickingEnd) {
                        const ed = new Date(d);
                        ed.setHours(17, 0, 0, 0);
                        setEndDate(ed);
                        setPickingEnd(false);
                      } else {
                        setPickedDate(d);
                      }
                    }}
                  />
                </View>
              )}

              {/* End date toggle row */}
              <View style={styles.endDateRow}>
                {isMultiDay && endDate ? (
                  <View style={styles.endDateBadge}>
                    <Text style={styles.endDateBadgeText}>
                      Multi-day through {endDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </Text>
                    <Pressable onPress={() => { setEndDate(null); setPickingEnd(false); }} style={styles.endDateClear}>
                      <Text style={styles.endDateClearText}>✕</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => setPickingEnd((p) => !p)}
                    style={[styles.endDateToggle, pickingEnd && styles.endDateToggleActive]}
                  >
                    <Text style={[styles.endDateToggleText, pickingEnd && styles.endDateToggleTextActive]}>
                      {pickingEnd ? "Picking end date…" : "+ Add end date (multi-day)"}
                    </Text>
                  </Pressable>
                )}
              </View>

              <View>
                <Text style={styles.pickerLabel}>Location</Text>
                <TextInput
                  style={styles.locationInput}
                  placeholder="e.g. Elliott Bay Marina · Slip K4"
                  placeholderTextColor={colors.textSecondary + "80"}
                  value={location}
                  onChangeText={setLocation}
                />
              </View>

              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>
                  {isMultiDay ? "Spans" : "Will schedule for"}
                </Text>
                <Text style={styles.summaryValue}>
                  {pickedDate.toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                  {isMultiDay && endDate
                    ? ` – ${endDate.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}`
                    : ` ${pickedDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}
                </Text>
              </View>

              <Pressable
                onPress={save}
                disabled={saving}
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              >
                {saving ? (
                  <ActivityIndicator color={colors.bgPrimary} />
                ) : (
                  <Text style={styles.saveBtnText}>Schedule</Text>
                )}
              </Pressable>
            </>
          )}
        </BottomSheetView>
      </BottomSheet>
    );
  },
);

ScheduleSheet.displayName = "ScheduleSheet";

const styles = StyleSheet.create({
  body: { padding: 20, gap: 12 },
  title: {
    color: colors.gold,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  subtitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 4,
  },
  toggleRow: {
    flexDirection: "row",
    backgroundColor: colors.bgPrimary,
    borderRadius: 8,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggle: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 6,
  },
  toggleActive: { backgroundColor: colors.gold },
  toggleText: { color: colors.textSecondary, fontWeight: "600", fontSize: 13 },
  toggleTextActive: { color: colors.bgPrimary },
  pickerWrap: { paddingVertical: 8 },
  locationInput: {
    backgroundColor: colors.bgPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.textPrimary,
  },
  pickerLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  summaryLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  summaryValue: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "600",
  },
  saveBtn: {
    backgroundColor: colors.gold,
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 4,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: colors.bgPrimary, fontWeight: "700", fontSize: 15 },
  // End date
  endDateRow: {
    marginTop: 4,
  },
  endDateToggle: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignSelf: "flex-start",
  },
  endDateToggleActive: {
    borderColor: colors.gold,
    backgroundColor: colors.goldMuted,
  },
  endDateToggleText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  endDateToggleTextActive: {
    color: colors.gold,
  },
  endDateBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.gold + "40",
    backgroundColor: colors.goldMuted,
    alignSelf: "flex-start",
  },
  endDateBadgeText: {
    color: colors.gold,
    fontSize: 12,
    fontWeight: "600",
  },
  endDateClear: {
    paddingHorizontal: 4,
  },
  endDateClearText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
});
