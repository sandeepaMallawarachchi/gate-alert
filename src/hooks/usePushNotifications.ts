import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { requestNotificationPermission, onForegroundMessage, initializeFirebase } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export const usePushNotifications = (onNotificationReceived?: (payload: any) => void) => {
  const { user } = useAuth();
  const [isEnabled, setIsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Initialize Firebase and request permission on mount
  useEffect(() => {
    if (!user) return;
    
    initializeFirebase();
    
    // Set up foreground message handler
    const unsubscribe = onForegroundMessage((payload) => {
      console.log('Foreground message received:', payload);
      if (onNotificationReceived) {
        onNotificationReceived(payload);
      }
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [user, onNotificationReceived]);

  const enableNotifications = async () => {
    if (!user) return false;
    
    setIsLoading(true);
    try {
      const token = await requestNotificationPermission();

      if (token) {
        // Save token to database
        const { error } = await supabase
          .from('fcm_tokens')
          .upsert(
            { user_id: user.id, token },
            { onConflict: 'token' }
          );

        if (error) {
          console.error('Error saving FCM token:', error);
          toast.error('Failed to enable notifications');
          return false;
        }

        setIsEnabled(true);
        toast.success('Push notifications enabled!');
        return true;
      }

      // Token not returned: either permission not granted or token creation failed
      toast.error('Could not enable notifications (permission or token failed)');
      return false;
    } catch (error) {
      console.error('Error enabling notifications:', error);
      const message = error instanceof Error ? error.message : 'Failed to enable notifications';
      toast.error(message);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isEnabled,
    isLoading,
    enableNotifications
  };
};
