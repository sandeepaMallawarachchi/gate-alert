import React, { createContext, useContext, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface AppSettings {
  attendance_enabled: boolean;
  locations_enabled: boolean;
}

interface Ctx {
  settings: AppSettings;
  loaded: boolean;
  update: (patch: Partial<AppSettings>) => Promise<{ error: any }>;
}

const defaults: AppSettings = { attendance_enabled: false, locations_enabled: true };
const AppSettingsContext = createContext<Ctx>({ settings: defaults, loaded: false, update: async () => ({ error: null }) });

export const AppSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [settings, setSettings] = useState<AppSettings>(defaults);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const { data } = await supabase.from('app_settings').select('attendance_enabled, locations_enabled').eq('id', 1).maybeSingle();
      if (data) setSettings(data);
      setLoaded(true);
    };
    fetch();
    const ch = supabase
      .channel('app-settings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, fetch)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  const update = async (patch: Partial<AppSettings>) => {
    setSettings((s) => ({ ...s, ...patch }));
    const { error } = await supabase.from('app_settings').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', 1);
    if (error) {
      const { data } = await supabase.from('app_settings').select('attendance_enabled, locations_enabled').eq('id', 1).maybeSingle();
      if (data) setSettings(data);
    }
    return { error };
  };

  return <AppSettingsContext.Provider value={{ settings, loaded, update }}>{children}</AppSettingsContext.Provider>;
};

export const useAppSettings = () => useContext(AppSettingsContext);

export const FeatureGate: React.FC<{ feature: keyof AppSettings; children: React.ReactNode }> = ({ feature, children }) => {
  const { settings, loaded } = useAppSettings();
  const { user } = useAuth();
  if (user && loaded && !settings[feature]) return <Navigate to="/" replace />;
  if (user && !loaded) return null;
  return <>{children}</>;
};
