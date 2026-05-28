import {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
} from "react-native";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import DateTimePicker from "@react-native-community/datetimepicker";
import { addHours, parseISO, format as fmtDate } from "date-fns";
import { formatTime } from "@/lib/calendar/format";

const DURATIONS_HOURS: { label: string; hours: number }[] = [
  { label: "30m", hours: 0.5 },
  { label: "1h", hours: 1 },
  { label: "2h", hours: 2 },
  { label: "3h", hours: 3 },
  { label: "4h", hours: 4 },
];

export type NewJobSheetHandle = {
  present: (initialStartIso: string) => void;
  dismiss: () => void;
};

type Props = {
  onCreated?: () => void;
};

export const NewJobSheet = forwardRef<NewJobSheetHandle, Props>(
  function NewJobSheet({ onCreated: _ }, ref) {
    const sheetRef = useRef<BottomSheet>(null);
    const snapPoints = useMemo(() => ["50%", "90%"], []);

    const [startIso, setStartIso] = useState<string | null>(null);
    const [durationHours, setDurationHours] = useState<number>(1);
    const [showTimePicker, setShowTimePicker] = useState(false);

    useImperativeHandle(ref, () => ({
      present: (initial) => {
        setStartIso(initial);
        setDurationHours(1);
        sheetRef.current?.snapToIndex(0);
      },
      dismiss: () => sheetRef.current?.close(),
    }));

    const startDate  = startIso ? parseISO(startIso) : null;
    const endDate    = startDate ? addHours(startDate, durationHours) : null;
    const crossesMidnight = (h: number): boolean => {
      if (!startDate) return false;
      const tentativeEnd = addHours(startDate, h);
      return tentativeEnd.getDate() !== startDate.getDate();
    };

    return (
      <BottomSheet
        ref={sheetRef}
        snapPoints={snapPoints}
        index={-1}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: "#0d1320" }}
        handleIndicatorStyle={{ backgroundColor: "#8892A5" }}
      >
        <BottomSheetScrollView contentContainerStyle={styles.body}>
          <Text style={styles.heading}>Schedule a job</Text>

          {/* Schedule row */}
          <Text style={styles.label}>WHEN</Text>
          <View style={styles.scheduleRow}>
            <Text style={styles.dateText}>
              {startDate ? fmtDate(startDate, "EEE, MMM d") : "—"}
            </Text>
            <Pressable
              onPress={() => setShowTimePicker(true)}
              style={styles.timeButton}
              testID="new-job-time"
            >
              <Text style={styles.timeText}>
                {startDate ? formatTime(startDate) : "—"}
              </Text>
            </Pressable>
          </View>

          {/* Duration chips */}
          <Text style={styles.label}>DURATION</Text>
          <View style={styles.chipRow}>
            {DURATIONS_HOURS.map((d) => {
              const disabled = crossesMidnight(d.hours);
              const selected = durationHours === d.hours;
              return (
                <Pressable
                  key={d.label}
                  disabled={disabled}
                  onPress={() => setDurationHours(d.hours)}
                  style={[
                    styles.chip,
                    selected && styles.chipSelected,
                    disabled && styles.chipDisabled,
                  ]}
                  testID={`new-job-duration-${d.label}`}
                >
                  <Text
                    style={[
                      styles.chipText,
                      selected && styles.chipTextSelected,
                    ]}
                  >
                    {d.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {endDate && (
            <Text style={styles.subhint}>
              Ends at {formatTime(endDate)}
            </Text>
          )}

          {/* Customer + boat pickers (added in Task 11) */}
          {/* Sticky footer (added in Task 12) */}
        </BottomSheetScrollView>

        {showTimePicker && startDate && (
          <DateTimePicker
            value={startDate}
            mode="time"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={(_event, selected) => {
              setShowTimePicker(Platform.OS === "ios");
              if (selected) {
                setStartIso(selected.toISOString());
              }
            }}
          />
        )}
      </BottomSheet>
    );
  },
);

const styles = StyleSheet.create({
  body: { padding: 20, paddingBottom: 80 },
  heading: { color: "#f1f5f9", fontSize: 18, fontWeight: "600", marginBottom: 16 },
  label: {
    color: "#8892A5",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
    marginTop: 12,
  },
  scheduleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#1a2236",
    paddingBottom: 8,
  },
  dateText: { color: "#f1f5f9", fontSize: 15 },
  timeButton: { padding: 4 },
  timeText: { color: "#C9A96E", fontSize: 15, fontWeight: "600" },
  chipRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  chip: {
    height: 36,
    minWidth: 56,
    backgroundColor: "#1a2236",
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 10,
  },
  chipSelected: { backgroundColor: "#C9A96E" },
  chipDisabled: { opacity: 0.3 },
  chipText: { color: "#f1f5f9", fontSize: 13, fontWeight: "500" },
  chipTextSelected: { color: "#060a12", fontWeight: "700" },
  subhint: { color: "#8892A5", fontSize: 11, marginTop: 6 },
});
