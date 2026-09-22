import { useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { colors } from '@/constants/Colors';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { getBoatsForCustomer, getCustomersForLocation } from '@/lib/calendar/queries';
import { EditableJob, jobDraft, jobEditPatch } from '@/lib/jobs/edit';

export function EditJobModal({ job, onClose, onSaved }: {
  job: EditableJob; onClose: () => void; onSaved: () => void;
}) {
  const { profile } = useAuth();
  const cache = useQueryClient();
  const [draft, setDraft] = useState(() => jobDraft(job));
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState<'customer' | 'boat' | null>(null);
  const [search, setSearch] = useState('');
  const [datePicker, setDatePicker] = useState<{ field: 'start' | 'end'; mode: 'date' | 'time' } | null>(null);
  const customers = useQuery({ queryKey: ['picker-customers'], queryFn: () => getCustomersForLocation(supabase) });
  const boats = useQuery({ queryKey: ['picker-boats', draft.customerId], queryFn: () => getBoatsForCustomer(supabase, draft.customerId!), enabled: !!draft.customerId });
  const canEdit = !!profile && profile.role !== 'viewer';

  async function save() {
    if (!canEdit || saving) return;
    setSaving(true);
    try {
      const patch = jobEditPatch(job, draft);
      if (Object.keys(patch).length) {
        const { data, error } = await supabase.from('jobs').update(patch).eq('id', job.id).select('id').single();
        if (error) throw error;
        if (!data) throw new Error('This job could not be updated. Check your access and try again.');
      }
      void cache.invalidateQueries({ queryKey: ['calendar-mobile'] });
      void cache.invalidateQueries({ queryKey: ['calendar-mobile-unscheduled'] });
      onSaved();
    } catch (error) {
      Alert.alert('Could not save job', error instanceof Error ? error.message : (error as { message?: string })?.message ?? 'Please try again.');
    } finally { setSaving(false); }
  }

  if (!canEdit) return null;
  const choices = picker === 'customer' ? customers : boats;
  return (
    <Modal animationType="slide" onRequestClose={() => !saving && onClose()}>
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}>
          <Pressable onPress={onClose} disabled={saving} accessibilityRole="button"><Text style={styles.link}>Cancel</Text></Pressable>
          <Text style={styles.title}>Edit job</Text>
          <Pressable onPress={save} disabled={saving} accessibilityRole="button" accessibilityLabel="Save job">
            {saving ? <ActivityIndicator color={colors.gold} /> : <Text style={styles.link}>Save</Text>}
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {job.kind !== 'paperwork' && <>
            <Text style={styles.label}>Customer</Text>
            <Pressable style={styles.input} disabled={saving} onPress={() => { setPicker('customer'); setSearch(''); }}><Text style={styles.value}>{customers.data?.find(c => c.id === draft.customerId)?.name ?? (draft.customerId ? 'Linked customer' : 'Choose customer')} ›</Text></Pressable>
            <Text style={styles.label}>Boat</Text>
            <Pressable style={styles.input} disabled={saving || !draft.customerId} onPress={() => { setPicker('boat'); setSearch(''); }}><Text style={styles.value}>{boats.data?.find(b => b.id === draft.boatId)?.name ?? (draft.boatId ? 'Linked boat' : 'Choose boat')} ›</Text></Pressable>
          </>}
          {picker && <View style={styles.choices}>
            <TextInput style={styles.input} accessibilityLabel="Search choices" placeholder="Search" placeholderTextColor={colors.textSecondary} value={search} onChangeText={setSearch} />
            {choices.isPending ? <ActivityIndicator color={colors.gold} /> : choices.isError ? <Pressable onPress={() => choices.refetch()}><Text style={styles.link}>Could not load. Tap to retry.</Text></Pressable> : <>
              <Pressable style={styles.choice} onPress={() => { setDraft(d => picker === 'customer' ? { ...d, customerId: null, boatId: null } : { ...d, boatId: null }); setPicker(null); }}><Text style={styles.value}>Unassigned</Text></Pressable>
              {(choices.data ?? []).filter(c => c.name.toLowerCase().includes(search.toLowerCase())).map(c => <Pressable key={c.id} style={styles.choice} onPress={() => {
                setDraft(d => picker === 'customer' ? { ...d, customerId: c.id, boatId: c.id === d.customerId ? d.boatId : null } : { ...d, boatId: c.id }); setPicker(null);
              }}><Text style={styles.value}>{c.name}</Text></Pressable>)}
            </>}
            <Pressable onPress={() => setPicker(null)}><Text style={styles.link}>Close choices</Text></Pressable>
          </View>}
          {job.kind !== 'paperwork' && <>
            <Text style={styles.label}>Services — one per line</Text>
            <TextInput style={styles.input} accessibilityLabel="Services" multiline editable={!saving} value={draft.services} onChangeText={services => setDraft(d => ({ ...d, services }))} />
          </>}
          <Text style={styles.label}>{job.kind === 'paperwork' ? 'Paperwork details' : 'Job notes'}</Text>
          <TextInput style={[styles.input, styles.notes]} accessibilityLabel="Job notes" multiline editable={!saving} value={draft.notes} onChangeText={notes => setDraft(d => ({ ...d, notes }))} />
          <Text style={styles.label}>Location</Text>
          <TextInput style={styles.input} accessibilityLabel="Job location" editable={!saving} value={draft.location} onChangeText={location => setDraft(d => ({ ...d, location }))} />
          {(['start', 'end'] as const).map(field => <View key={field}>
            <Text style={styles.label}>{field === 'start' ? 'Start' : 'End'}</Text>
            <Text style={styles.value}>{draft[field] ? new Date(draft[field]!).toLocaleString() : 'Unscheduled'}</Text>
            <View style={styles.dates}>
              {(['date', 'time'] as const).map(mode => <Pressable key={mode} disabled={saving} style={styles.input} onPress={() => setDatePicker({ field, mode })}><Text style={styles.link}>Change {mode}</Text></Pressable>)}
            </View>
          </View>)}
          {datePicker && <>
            <DateTimePicker value={new Date(draft[datePicker.field] ?? Date.now())} mode={datePicker.mode} display={Platform.OS === 'ios' ? 'spinner' : 'default'} themeVariant="dark" onChange={(event, date) => {
              if (Platform.OS === 'android') setDatePicker(null);
              if (event.type === 'dismissed' || !date) return;
              setDraft(d => ({ ...d, [datePicker.field]: date.toISOString() }));
            }} />
            {Platform.OS === 'ios' && <Pressable onPress={() => setDatePicker(null)}><Text style={styles.link}>Done</Text></Pressable>}
          </>}
          <Pressable style={styles.save} disabled={saving} accessibilityRole="button" onPress={save}><Text style={styles.saveText}>{saving ? 'Saving…' : 'Save changes'}</Text></Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgPrimary },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderColor: colors.border },
  title: { color: colors.textPrimary, fontSize: 20, fontWeight: '700' },
  link: { color: colors.gold, fontSize: 16, paddingVertical: 10 },
  body: { padding: 20, paddingBottom: 40, gap: 10 },
  label: { color: colors.textSecondary, fontSize: 14, marginTop: 10 },
  value: { color: colors.textPrimary, fontSize: 16 },
  input: { color: colors.textPrimary, backgroundColor: colors.bgCard, borderColor: colors.border, borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 16 },
  notes: { minHeight: 110, textAlignVertical: 'top' },
  choices: { borderWidth: 1, borderColor: colors.gold, borderRadius: 10, padding: 12 },
  choice: { paddingVertical: 14, borderBottomWidth: 1, borderColor: colors.border },
  dates: { flexDirection: 'row', gap: 10, marginTop: 8 },
  save: { backgroundColor: colors.gold, padding: 16, alignItems: 'center', borderRadius: 10, marginTop: 16 },
  saveText: { color: colors.bgPrimary, fontSize: 16, fontWeight: '700' },
});
