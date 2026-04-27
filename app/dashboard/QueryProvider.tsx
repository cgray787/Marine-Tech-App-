'use client';
import { QueryClientProvider } from '@tanstack/react-query';
import { makeQueryClient } from '@/lib/react-query';
import { useState, type ReactNode } from 'react';

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => makeQueryClient());
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
