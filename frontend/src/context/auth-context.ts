import { createContext } from 'react';
import type { Session } from '@supabase/supabase-js';


export interface AuthContextType {
  session: Session | null;
  token: string | null;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

export const AuthContext = createContext<AuthContextType | null>(null);
