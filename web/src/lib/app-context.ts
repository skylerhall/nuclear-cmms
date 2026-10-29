import { createContext, useContext } from 'react';
import type { Person } from '../../../shared/types.ts';
import type { Bootstrap } from './types.ts';

export interface AppState extends Bootstrap {
  actor: Person;
  setActor: (id: string) => void;
  /** Bumped after any change so pages refetch. */
  version: number;
  changed: () => void;
}

export const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp outside provider');
  return ctx;
}
