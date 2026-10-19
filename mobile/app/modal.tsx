import { StatusBar } from 'expo-status-bar';
import { Platform, StyleSheet, Text, View } from 'react-native';

export default function ModalScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Ncode Field Operations</Text>
      <View style={styles.separator} />
      <Text style={styles.text}>Field Attendance & Location Tracking System v1.0.0</Text>
      <StatusBar style={Platform.OS === 'ios' ? 'light' : 'auto'} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#ffffff',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  separator: {
    marginVertical: 16,
    height: 1,
    width: '80%',
    backgroundColor: '#e2e8f0',
  },
  text: {
    fontSize: 14,
    color: '#64748b',
  },
});
