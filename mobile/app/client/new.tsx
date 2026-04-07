import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { colors } from "@/constants/Colors";

export default function NewClientScreen() {
  const { profile } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  // Customer fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");

  // Boat fields
  const [boatName, setBoatName] = useState("");
  const [makeModel, setMakeModel] = useState("");
  const [year, setYear] = useState("");
  const [hin, setHin] = useState("");
  const [engineMake, setEngineMake] = useState("");
  const [engineModel, setEngineModel] = useState("");
  const [boatColor, setBoatColor] = useState("");
  const [homeMarina, setHomeMarina] = useState("");

  async function handleSubmit() {
    if (!name.trim()) {
      Alert.alert("Required", "Please enter the customer's name.");
      return;
    }

    setSubmitting(true);

    try {
      // Get profile ID — use context if available, otherwise fetch directly
      let profileId = profile?.id ?? null;
      if (!profileId) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const { data: p } = await supabase
            .from("profiles")
            .select("id")
            .eq("auth_id", session.user.id)
            .single();
          profileId = p?.id ?? null;
        }
      }

      // Create customer
      const { data: customer, error: custError } = await supabase
        .from("customers")
        .insert({
          name: name.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          address: address.trim() || null,
          notes: notes.trim() || null,
          created_by: profileId,
        })
        .select("id")
        .single();

      if (custError || !customer) {
        Alert.alert(
          "Save Failed",
          `Could not create customer: ${custError?.message || "Unknown error"}\n\nCode: ${custError?.code || "none"}\nDetails: ${custError?.details || "none"}`
        );
        setSubmitting(false);
        return;
      }

    // Create boat if boat name is provided
    if (boatName.trim()) {
      const { error: boatError } = await supabase.from("boats").insert({
        customer_id: customer.id,
        name: boatName.trim(),
        make_model: makeModel.trim() || null,
        year: year ? parseInt(year, 10) : null,
        hin: hin.trim() || null,
        engine_make: engineMake.trim() || null,
        engine_model: engineModel.trim() || null,
        color: boatColor.trim() || null,
        home_marina: homeMarina.trim() || null,
      });

      if (boatError) {
        Alert.alert(
          "Warning",
          `Customer created but boat failed: ${boatError.message}`
        );
        setSubmitting(false);
        router.back();
        return;
      }
    }

      setSubmitting(false);
      Alert.alert("Success", `${name.trim()} has been added.`, [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (err: unknown) {
      Alert.alert("Unexpected Error", err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backButton}>{"\u2039"} Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Add Client</Text>
        </View>

        {/* Customer Info Section */}
        <Text style={styles.sectionTitle}>Customer Information</Text>

        <Text style={styles.label}>
          Full Name <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. John Smith"
          placeholderTextColor={colors.textSecondary + "80"}
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
        />

        <Text style={styles.label}>Phone Number</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. 206-555-1234"
          placeholderTextColor={colors.textSecondary + "80"}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />

        <Text style={styles.label}>Email Address</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. john@email.com"
          placeholderTextColor={colors.textSecondary + "80"}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <Text style={styles.label}>Address</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. 123 Harbor Dr, Seattle, WA"
          placeholderTextColor={colors.textSecondary + "80"}
          value={address}
          onChangeText={setAddress}
        />

        <Text style={styles.label}>Notes</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Any additional notes about this customer..."
          placeholderTextColor={colors.textSecondary + "80"}
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />

        {/* Boat Info Section */}
        <Text style={styles.sectionTitle}>Boat Information</Text>
        <Text style={styles.sectionSubtitle}>
          Optional — you can add boats later from the client page.
        </Text>

        <Text style={styles.label}>Boat Name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Sea Breeze IV"
          placeholderTextColor={colors.textSecondary + "80"}
          value={boatName}
          onChangeText={setBoatName}
        />

        <Text style={styles.label}>Make / Model</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Boston Whaler 280"
          placeholderTextColor={colors.textSecondary + "80"}
          value={makeModel}
          onChangeText={setMakeModel}
        />

        <View style={styles.row}>
          <View style={styles.halfField}>
            <Text style={styles.label}>Year</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 2024"
              placeholderTextColor={colors.textSecondary + "80"}
              value={year}
              onChangeText={setYear}
              keyboardType="number-pad"
              maxLength={4}
            />
          </View>
          <View style={styles.halfField}>
            <Text style={styles.label}>Color</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. White"
              placeholderTextColor={colors.textSecondary + "80"}
              value={boatColor}
              onChangeText={setBoatColor}
            />
          </View>
        </View>

        <Text style={styles.label}>HIN (Hull ID Number)</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. BWC28001A424"
          placeholderTextColor={colors.textSecondary + "80"}
          value={hin}
          onChangeText={setHin}
          autoCapitalize="characters"
        />

        <View style={styles.row}>
          <View style={styles.halfField}>
            <Text style={styles.label}>Engine Make</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Mercury"
              placeholderTextColor={colors.textSecondary + "80"}
              value={engineMake}
              onChangeText={setEngineMake}
            />
          </View>
          <View style={styles.halfField}>
            <Text style={styles.label}>Engine Model</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. V8 300hp"
              placeholderTextColor={colors.textSecondary + "80"}
              value={engineModel}
              onChangeText={setEngineModel}
            />
          </View>
        </View>

        <Text style={styles.label}>Home Marina</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Bay Marina"
          placeholderTextColor={colors.textSecondary + "80"}
          value={homeMarina}
          onChangeText={setHomeMarina}
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
            <Text style={styles.submitText}>Save Client</Text>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 40 },
  header: { marginBottom: 24 },
  backButton: {
    fontSize: 16,
    color: colors.gold,
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.gold,
    marginTop: 28,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textSecondary,
    marginTop: 14,
    marginBottom: 6,
  },
  required: {
    color: colors.bad,
  },
  input: {
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.textPrimary,
  },
  textArea: {
    minHeight: 80,
    paddingTop: 12,
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  halfField: {
    flex: 1,
  },
  submitButton: {
    backgroundColor: colors.gold,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 32,
  },
  submitText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.bgPrimary,
  },
});
