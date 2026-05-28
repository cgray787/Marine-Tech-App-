import {
  forwardRef,
  useEffect,
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
  ActivityIndicator,
  Alert,
} from "react-native";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addHours, parseISO, format as fmtDate } from "date-fns";
import { formatTime } from "@/lib/calendar/format";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import {
  getCustomersForLocation,
  getBoatsForCustomer,
  createJob,
  type PickerCustomer,
  type PickerBoat,
} from "@/lib/calendar/queries";

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
  function NewJobSheet({ onCreated }, ref) {
    const sheetRef = useRef<BottomSheet>(null);
    const snapPoints = useMemo(() => ["50%", "90%"], []);

    const [startIso, setStartIso] = useState<string | null>(null);
    const [durationHours, setDurationHours] = useState<number>(1);
    const [showTimePicker, setShowTimePicker] = useState(false);

    const [customerId, setCustomerId] = useState<string | null>(null);
    const [boatId, setBoatId] = useState<string | null>(null);
    const [showCustomerPicker, setShowCustomerPicker] = useState(false);
    const [showBoatPicker, setShowBoatPicker] = useState(false);

    const customersQuery = useQuery({
      queryKey: ["picker-customers"],
      queryFn: () => getCustomersForLocation(supabase),
      staleTime: 60_000,
    });

    const boatsQuery = useQuery({
      queryKey: ["picker-boats", customerId],
      queryFn: () => getBoatsForCustomer(supabase, customerId!),
      enabled: customerId != null,
      staleTime: 60_000,
    });

    const queryClient = useQueryClient();
    const { profile } = useAuth();

    const createMutation = useMutation({
      mutationFn: async () => {
        if (!startIso || !customerId || !boatId) {
          throw new Error("Missing required fields");
        }
        const start = parseISO(startIso);
        const end   = addHours(start, durationHours);
        return createJob(supabase, {
          customerId,
          boatId,
          assignedTo: profile?.id ?? null,
          scheduledStart: start.toISOString(),
          scheduledEnd: end.toISOString(),
        });
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["calendar-mobile"] });
        queryClient.invalidateQueries({ queryKey: ["calendar-mobile-unscheduled"] });
        sheetRef.current?.close();
        onCreated?.();
      },
      onError: (err: Error) => {
        Alert.alert("Couldn't schedule", err.message);
      },
    });

    const canSubmit = !!(startIso && customerId && boatId) && !createMutation.isPending;

    const selectedCustomer = customersQuery.data?.find((c) => c.id === customerId) ?? null;
    const selectedBoat     = boatsQuery.data?.find((b) => b.id === boatId) ?? null;

    // Reset boat when customer changes; auto-select the only boat if just one
    useEffect(() => {
      setBoatId(null);
    }, [customerId]);

    useEffect(() => {
      if (boatsQuery.data && boatsQuery.data.length === 1) {
        setBoatId(boatsQuery.data[0].id);
      }
    }, [boatsQuery.data]);

    useImperativeHandle(ref, () => ({
      present: (initial) => {
        setStartIso(initial);
        setDurationHours(1);
        setCustomerId(null);
        setBoatId(null);
        setShowCustomerPicker(false);
        setShowBoatPicker(false);
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

          {/* Customer picker */}
          <Text style={styles.label}>CUSTOMER</Text>
          <Pressable
            onPress={() => setShowCustomerPicker((v) => !v)}
            style={styles.pickerRow}
            testID="new-job-customer"
          >
            <Text style={styles.pickerValue}>
              {selectedCustomer ? selectedCustomer.name : "Tap to choose"}
            </Text>
            <Text style={styles.pickerChevron}>{showCustomerPicker ? "▴" : "▾"}</Text>
          </Pressable>
          {showCustomerPicker && (
            <View style={styles.pickerList}>
              {customersQuery.isLoading && (
                <ActivityIndicator color="#C9A96E" style={{ padding: 12 }} />
              )}
              {customersQuery.data?.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => {
                    setCustomerId(c.id);
                    setShowCustomerPicker(false);
                  }}
                  style={styles.pickerItem}
                  testID={`customer-${c.id}`}
                >
                  <Text style={styles.pickerItemText}>{c.name}</Text>
                </Pressable>
              ))}
              {customersQuery.data?.length === 0 && (
                <Text style={styles.pickerEmpty}>No customers in your location yet</Text>
              )}
            </View>
          )}

          {/* Boat picker */}
          <Text style={styles.label}>BOAT</Text>
          <Pressable
            onPress={() => customerId && setShowBoatPicker((v) => !v)}
            style={[styles.pickerRow, !customerId && styles.pickerRowDisabled]}
            testID="new-job-boat"
          >
            <Text style={styles.pickerValue}>
              {selectedBoat
                ? `${selectedBoat.name}${selectedBoat.makeModel ? ` · ${selectedBoat.makeModel}` : ""}`
                : customerId
                  ? "Tap to choose"
                  : "Pick a customer first"}
            </Text>
            <Text style={styles.pickerChevron}>{showBoatPicker ? "▴" : "▾"}</Text>
          </Pressable>
          {showBoatPicker && customerId && (
            <View style={styles.pickerList}>
              {boatsQuery.isLoading && (
                <ActivityIndicator color="#C9A96E" style={{ padding: 12 }} />
              )}
              {boatsQuery.data?.map((b) => (
                <Pressable
                  key={b.id}
                  onPress={() => {
                    setBoatId(b.id);
                    setShowBoatPicker(false);
                  }}
                  style={styles.pickerItem}
                  testID={`boat-${b.id}`}
                >
                  <Text style={styles.pickerItemText}>
                    {b.name}{b.makeModel ? ` · ${b.makeModel}` : ""}
                  </Text>
                </Pressable>
              ))}
              {boatsQuery.data?.length === 0 && (
                <Text style={styles.pickerEmpty}>No boats on this customer</Text>
              )}
            </View>
          )}

        </BottomSheetScrollView>

        <View style={styles.footer}>
          <Pressable
            onPress={() => sheetRef.current?.close()}
            style={styles.cancelBtn}
            testID="new-job-cancel"
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Pressable
            disabled={!canSubmit}
            onPress={() => createMutation.mutate()}
            style={[styles.scheduleBtn, !canSubmit && styles.scheduleBtnDisabled]}
            testID="new-job-schedule"
          >
            {createMutation.isPending ? (
              <ActivityIndicator color="#060a12" />
            ) : (
              <Text style={styles.scheduleText}>Schedule</Text>
            )}
          </Pressable>
        </View>

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
  pickerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#1a2236",
    paddingVertical: 10,
  },
  pickerRowDisabled: { opacity: 0.5 },
  pickerValue: { color: "#f1f5f9", fontSize: 15, flex: 1, marginRight: 8 },
  pickerChevron: { color: "#8892A5", fontSize: 12 },
  pickerList: {
    marginTop: 4,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#1a2236",
    borderRadius: 6,
    maxHeight: 200,
    backgroundColor: "#060a12",
  },
  pickerItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1a2236",
  },
  pickerItemText: { color: "#f1f5f9", fontSize: 14 },
  pickerEmpty: { color: "#8892A5", fontSize: 12, padding: 12, fontStyle: "italic" },
  footer: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#1a2236",
    backgroundColor: "#0d1320",
  },
  cancelBtn: { paddingHorizontal: 18, justifyContent: "center" },
  cancelText: { color: "#8892A5", fontSize: 14, fontWeight: "500" },
  scheduleBtn: {
    flex: 1,
    height: 48,
    backgroundColor: "#C9A96E",
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  scheduleBtnDisabled: { opacity: 0.4 },
  scheduleText: { color: "#060a12", fontSize: 15, fontWeight: "700" },
});
