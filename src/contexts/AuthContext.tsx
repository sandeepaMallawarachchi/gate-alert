import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface Profile {
  id: string;
  user_id: string;
  username: string;
  full_name: string;
  avatar_url: string | null;
}

interface Profile {
  id: string;
  user_id: string;
  username: string;
  full_name: string;
  avatar_url: string | null;
  is_active?: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isAdmin: boolean;
  loading: boolean;
  signUp: (email: string, password: string, username: string, fullName: string, avatarUrl?: string) => Promise<{ error: Error | null }>;
  signIn: (username: string, password: string) => Promise<{ error: Error | null; code?: string }>;
  signOut: () => Promise<void>;
  updateProfile: (fullName: string, avatarUrl?: string) => Promise<{ error: Error | null }>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      console.error('Error fetching profile:', error);
      return null;
    }
    return data;
  };

  const fetchIsAdmin = async (userId: string) => {
    const { data } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();
    return !!data;
  };

  const refreshProfile = async () => {
    if (user) {
      const profileData = await fetchProfile(user.id);
      setProfile(profileData);
    }
  };

  useEffect(() => {
    const checkActive = async (p: any) => {
      if (p && p.is_active === false) {
        await supabase.auth.signOut();
        setProfile(null);
        setIsAdmin(false);
        try { (await import('sonner')).toast.error('No employee found under this name! contact admin for more details'); } catch {}
        return false;
      }
      return true;
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        setTimeout(async () => {
          const profileData = await fetchProfile(session.user.id);
          setProfile(profileData);
          const admin = await fetchIsAdmin(session.user.id);
          setIsAdmin(admin);
          await checkActive(profileData);
        }, 0);
      } else {
        setProfile(null);
        setIsAdmin(false);
      }
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        fetchProfile(session.user.id).then(async (p) => {
          setProfile(p);
          await checkActive(p);
        });
        fetchIsAdmin(session.user.id).then(setIsAdmin);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Periodically re-check active status so deactivated users get auto-logged out
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(async () => {
      const p = await fetchProfile(user.id);
      if (p && (p as any).is_active === false) {
        await supabase.auth.signOut();
        try { (await import('sonner')).toast.error('No employee found under this name! contact admin for more details'); } catch {}
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [user]);

  const signUp = async (email: string, password: string, username: string, fullName: string, avatarUrl?: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          username,
          full_name: fullName,
          avatar_url: avatarUrl || null,
        },
      },
    });
    return { error };
  };

  const signIn = async (usernameOrEmail: string, password: string) => {
    const isEmail = usernameOrEmail.includes('@');
    
    if (!isEmail) {
      const { data, error: fnError } = await supabase.functions.invoke('auth-with-username', {
        body: { username: usernameOrEmail, password },
      });

      // Edge function returns non-2xx -> fnError set; data still has body
      const code = (data as any)?.error;
      if (code === 'NOT_FOUND' || code === 'INACTIVE') {
        return { error: new Error('No employee found under this name! contact admin for more details'), code };
      }
      if (fnError || code) {
        return { error: new Error('Invalid username or password') };
      }

      if (data?.access_token && data?.refresh_token) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
        });
        return { error: sessionError };
      }

      return { error: new Error('Invalid username or password') };
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: usernameOrEmail,
      password,
    });

    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
  };

  const updateProfile = async (fullName: string, avatarUrl?: string) => {
    if (!user) return { error: new Error('Not authenticated') };

    const updates: Partial<Profile> = { full_name: fullName };
    if (avatarUrl !== undefined) {
      updates.avatar_url = avatarUrl;
    }

    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('user_id', user.id);

    if (!error) {
      await refreshProfile();
    }

    return { error };
  };

  return (
    <AuthContext.Provider value={{
      user,
      session,
      profile,
      isAdmin,
      loading,
      signUp,
      signIn,
      signOut,
      updateProfile,
      refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
