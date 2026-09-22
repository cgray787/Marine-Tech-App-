import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom', globals: true, include: ['tests/mobile/*.test.tsx'], setupFiles: ['./vitest.setup.ts'] },
  resolve: { dedupe: ['react', 'react-dom', '@tanstack/react-query'], alias: {
    '@react-native-community/netinfo': resolve(__dirname, 'tests/mobile/netinfo-stub.ts'),
    'expo-router': resolve(__dirname, 'tests/mobile/router-stub.tsx'),
    '@react-navigation/native': resolve(__dirname, 'tests/mobile/router-stub.tsx'),
    'expo-print': resolve(__dirname, 'tests/mobile/expo-stub.ts'),
    'expo-sharing': resolve(__dirname, 'tests/mobile/expo-stub.ts'),
    '@': resolve(__dirname, 'mobile'),
    'react-native-safe-area-context': resolve(__dirname, 'tests/mobile/safe-area-stub.tsx'),
    '@react-native-community/datetimepicker': resolve(__dirname, 'tests/mobile/date-picker-stub.tsx'),
    'react-native': resolve(__dirname, 'tests/mobile/native-stub.tsx'),
  } },
});
