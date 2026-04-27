import { View, Text, StyleSheet } from 'react-native';
export default function CalendarScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Calendar — coming online…</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060a12', justifyContent: 'center', alignItems: 'center' },
  text: { color: '#8892A5', fontSize: 16 },
});
