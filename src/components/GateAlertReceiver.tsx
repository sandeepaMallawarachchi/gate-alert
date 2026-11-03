import { useCallback, useEffect, useRef, useState } from 'react';
import type { MessagePayload } from 'firebase/messaging';
import { useAuth } from '@/contexts/AuthContext';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { supabase } from '@/integrations/supabase/client';
import AlertOverlay from '@/components/AlertOverlay';

// Mounted once above all pages so foreground alerts work beyond the dashboard.
export default function GateAlertReceiver() {
  const { user } = useAuth();
  const seen = useRef(new Set<string>());
  const [incoming, setIncoming] = useState<{ name: string; avatar: string } | null>(null);

  const show = useCallback((id: string, name: string, avatar: string) => {
    if (seen.current.has(id)) return;
    seen.current.add(id);
    if (seen.current.size > 100) seen.current.delete(seen.current.values().next().value);
    setIncoming({ name, avatar });
  }, []);

  const receivePush = useCallback((payload: MessagePayload) => {
    const data = payload.data;
    console.info('Push received in foreground', {
      alert_id: data?.alert_id, sent_at: data?.sent_at, received_at: new Date().toISOString(),
    });
    if (data?.type !== 'gate_alert' || data.sender_id === user?.id) return;
    if (data.alert_id) show(data.alert_id, data.sender_name || 'Someone', data.sender_avatar || '');
  }, [user?.id, show]);
  usePushNotifications(receivePush);

  useEffect(() => {
    seen.current.clear();
    setIncoming(null);
    if (!user) return;
    const channel = supabase.channel('gate-alerts')
      .on('broadcast', { event: 'gate_alert' }, ({ payload }) => {
        if (payload.sender_id === user.id) return;
        show(payload.alert_id || payload.timestamp, payload.sender_name || 'Someone', payload.sender_avatar || '');
      }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user?.id, show]);

  if (!user) return null;
  return <AlertOverlay isOpen={!!incoming} onClose={() => setIncoming(null)} senderName={incoming?.name || ''} senderAvatar={incoming?.avatar || ''} />;
}
