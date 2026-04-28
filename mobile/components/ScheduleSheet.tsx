import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
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
    const [showTimePicker, setShowTimePicker] = useState(false);
    const [saving, setSaving] = useState(false);
    const snapPoints = useMemo(() => ["75%"], []);

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
        setMode("calendar");
        sheetRef.current?.snapToIndex(0);
      },
      dismiss: () => sheetRef.current?.close(),
    }));

    function selectedDateString(): string {
      return pickedDate.toISOString().slice(0, 10);
    }

    async function save() {
      if (!job) return;
      setSaving(true);
      const start = pickedDate.toISOString();
      const end = new Date(pickedDate.getTime() + 60 * 60 * 1000).toISOString();
      const dateOnly = pickedDate.toISOString().slice(0, 10);
      const { error } = await supabase
        .from("jobs")
        .update({
          scheduled_start: start,
          scheduled_end: end,
          scheduled_date: dateOnly,
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

              {mode === "calendar" ? (
                <Calendar
                  onDayPress={(d: DateData) => {
                    const next = new Date(pickedDate);
                    next.setFullYear(d.year, d.month - 1, d.day);
                    if (next.getHours() === 0 && next.getMinutes() === 0) {
                      next.setHours(9, 0, 0, 0);
                    }
                    setPickedDate(next);
                  }}
                  markedDates={{
                    [selectedDateString()]: { selected: true },
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
                  <Text style={styles.pickerLabel}>Date & time</Text>
                  <DateTimePicker
                    value={pickedDate}
                    mode="datetime"
                    display={Platform.OS === "ios" ? "inline" : "default"}
                    themeVariant="dark"
                    onChange={(_e, d) => {
                      if (Platform.OS === "android") setShowTimePicker(false);
                      if (d) setPickedDate(d);
                    }}
                  />
                </View>
              )}

              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Will schedule for</Text>
                <Text style={styles.summaryValue}>
                  {pickedDate.toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}{" "}
                  {pickedDate.toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
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
});
