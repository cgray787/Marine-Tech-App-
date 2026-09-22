import { useEffect } from 'react';
export const useLocalSearchParams = () => ({ id: 'job-1' });
export const useRouter = () => ({ push: () => {}, canGoBack: () => true, back: () => {} });
export const Stack = { Screen: () => null };
export function useFocusEffect(callback: () => void) { useEffect(callback, [callback]); }
