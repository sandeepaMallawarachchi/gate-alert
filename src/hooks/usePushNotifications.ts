import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { requestNotificationPermission, onForegroundMessage, initializeFirebase } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

// Desktop/mobile header controls can mount together. Share token refresh work.
const tokenSyncs = new Map<string, Promise<boolean>>();
function syncToken(userId: string, askPermission: boolean): Promise<boolean> {
  const pending = tokenSyncs.get(userId);
  if (pending) return pending;
  const job = (async () => {
    const token = await requestNotificationPermission(askPermission);
    if (!token) return false;
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user.id !== userId) return false;
    const { error } = await supabase.from('fcm_tokens').upsert(
      { user_id: userId, token, updated_at: new Date().toISOString() },
      { onConflict: 'token' },
    );
    if (error) throw error;
    return true;
  })().finally(() => tokenSyncs.delete(userId));
  tokenSyncs.set(userId, job);
  return job;
}

export const usePushNotifications = (onNotificationReceived?: (payload: any) => void) => {
  const { user } = useAuth();
  const [isEnabled, setIsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const callback = useRef(onNotificationReceived);
  callback.current = onNotificationReceived;

  useEffect(() => {
    setIsEnabled(false);
    if (!user) return;
    let cancelled = false;
    initializeFirebase();
    const unsubscribe = onForegroundMessage((payload) => callback.current?.(payload));
    let lastAttempt = 0;
    const refresh = async () => {
      if (document.visibilityState === 'hidden' || Date.now() - lastAttempt < 60_000) return;
      lastAttempt = Date.now();
      try {
        const enabled = await syncToken(user.id, false);
        if (!cancelled) setIsEnabled(enabled);
      } catch (error) {
        if (!cancelled) setIsEnabled(false);
        console.warn('Push registration refresh failed:', error);
      }
    };
    void refresh();
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('online', refresh);
    const interval = window.setInterval(refresh, 30 * 60_000);
    return () => {
      cancelled = true;
      unsubscribe();
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('online', refresh);
      window.clearInterval(interval);
    };
  }, [user?.id]);

  const enableNotifications = useCallback(async () => {
    if (!user) return false;
    setIsLoading(true);
    try {
      const enabled = await syncToken(user.id, true);
      setIsEnabled(enabled);
      if (enabled) toast.success('Push notifications enabled!');
      else toast.error('Could not enable notifications on this device');
      return enabled;
    } catch (error) {
      console.error('Error enabling notifications:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to enable notifications');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  return { isEnabled, isLoading, enableNotifications };
};
