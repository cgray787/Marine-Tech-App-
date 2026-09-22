import { createContext, useContext, useEffect, useState, useRef, useCallback } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

type Profile = {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "manager" | "tech" | "viewer" | "owner";
  status: "active" | "invited" | "disabled" | string;
  tier: "shop" | "individual";
  phone: string | null;
  avatar_url: string | null;
  org_id: string | null;
  location_id: string | null;
};

type AuthContextType = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  signIn: async () => ({ error: null }),
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const profileRequest = useRef(0);
  const authGeneration = useRef(0);
  const activeAuthId = useRef<string | null>(null);

  const fetchProfile = useCallback(async (authId: string) => {
    const request = ++profileRequest.current;
    try {
      const { data, error } = await supabase.from("profiles").select("*").eq("auth_id", authId).single();
      if (request !== profileRequest.current || activeAuthId.current !== authId) return;
      if (error) console.error("Failed to fetch profile:", error.message);
      setProfile(data ?? null);
    } catch (err) {
      if (request !== profileRequest.current || activeAuthId.current !== authId) return;
      console.error("Profile fetch error:", err);
      setProfile(null);
    } finally {
      if (request === profileRequest.current && activeAuthId.current === authId) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const initialGeneration = authGeneration.current;
    function applySession(next: Session | null) {
      if (!mounted) return;
      ++authGeneration.current;
      ++profileRequest.current;
      const nextId = next?.user.id ?? null;
      if (activeAuthId.current !== nextId) setProfile(null);
      activeAuthId.current = nextId;
      setSession(next);
      if (nextId) void fetchProfile(nextId);
      else { setProfile(null); setLoading(false); }
    }
    // A late persisted-session read must never undo a newer login/logout event.
    void supabase.auth.getSession().then(({ data: { session: saved } }) => {
      if (authGeneration.current === initialGeneration) applySession(saved);
    }).catch((err) => {
      console.error("Session recovery failed:", err);
      if (mounted && authGeneration.current === initialGeneration) applySession(null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => {
      if (event !== "INITIAL_SESSION") applySession(next);
    });
    return () => { mounted = false; ++profileRequest.current; subscription.unsubscribe(); };
  }, [fetchProfile]);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }

  async function signOut() {
    ++authGeneration.current;
    ++profileRequest.current;
    activeAuthId.current = null;
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setLoading(false);
  }

  async function refreshProfile() {
    const user = session?.user;
    if (user) await fetchProfile(user.id);
  }

  return (
    <AuthContext.Provider
      value={{ session, user: session?.user ?? null, profile, loading, signIn, signOut, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
