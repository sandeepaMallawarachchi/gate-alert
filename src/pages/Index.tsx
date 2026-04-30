import React, { useState, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { Settings, LogOut, Loader2, Users } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import BuzzerButton from '@/components/BuzzerButton';
import AlertOverlay from '@/components/AlertOverlay';
import SettingsModal from '@/components/SettingsModal';
import InstallInstructionsModal from '@/components/InstallInstructionsModal';
import NotificationPermission from '@/components/NotificationPermission';
import AdminUsersModal from '@/components/AdminUsersModal';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const Index: React.FC = () => {
  const { user, profile, isAdmin, loading, signOut } = useAuth();
  const [showAlert, setShowAlert] = useState(false);
  const [alertSenderName, setAlertSenderName] = useState<string>('');
  const [alertSenderAvatar, setAlertSenderAvatar] = useState<string>('');
  const [showSettings, setShowSettings] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [sendingAlert, setSendingAlert] = useState(false);

  // Handle foreground push notifications - only trigger alert if NOT already shown via realtime
  const handleNotificationReceived = useCallback((payload: any) => {
    // Push notifications are handled by the service worker for background
    // For foreground, we rely on realtime broadcast to avoid duplicates
    console.log('Foreground push received (handled by realtime):', payload);
  }, []);

  // Subscribe to realtime alerts from other users
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('gate-alerts')
      .on('broadcast', { event: 'gate_alert' }, (payload) => {
        // Don't show alert to yourself
        if (payload.payload.sender_id !== user.id) {
          setAlertSenderName(payload.payload.sender_name || 'Someone');
          setAlertSenderAvatar(payload.payload.sender_avatar || '');
          setShowAlert(true);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  const handleBuzzerClick = async () => {
    setSendingAlert(true);
    
    try {
      // Broadcast alert to all other users via realtime
      const channel = supabase.channel('gate-alerts');
      
      await channel.send({
        type: 'broadcast',
        event: 'gate_alert',
        payload: {
          sender_id: user?.id,
          sender_name: profile?.full_name || 'Unknown',
          sender_avatar: profile?.avatar_url || '',
          timestamp: new Date().toISOString(),
        },
      });

      // Also send push notification via edge function
      try {
      // Edge function now gets sender info from database based on authenticated user
      await supabase.functions.invoke('send-push-notification');
      } catch (error) {
        console.error('Error sending push notification:', error);
      }

      // Just show toast to sender, not the alert
      toast.success('Alert sent to all members!');
    } finally {
      setSendingAlert(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    toast.success('Logged out successfully');
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Avatar className="w-10 h-10 border border-primary/50">
            <AvatarImage src={profile?.avatar_url || undefined} />
            <AvatarFallback className="bg-secondary text-secondary-foreground">
              {profile?.full_name ? getInitials(profile.full_name) : 'U'}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-medium text-foreground">{profile?.full_name}</p>
            <p className="text-xs text-muted-foreground">@{profile?.username}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <NotificationPermission onNotificationReceived={handleNotificationReceived} />
          {isAdmin && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowAdmin(true)}
              className="text-muted-foreground hover:text-foreground hover:bg-secondary"
              title="Manage users"
            >
              <Users className="w-5 h-5" />
            </Button>
          )}
            variant="ghost"
            size="icon"
            onClick={() => setShowSettings(true)}
            className="text-muted-foreground hover:text-foreground hover:bg-secondary"
          >
            <Settings className="w-5 h-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            className="text-muted-foreground hover:text-destructive hover:bg-secondary"
          >
            <LogOut className="w-5 h-5" />
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="text-center mb-12">
          <h1 className="text-2xl font-bold text-foreground mb-2">Gate Access</h1>
          <p className="text-muted-foreground">Press the button to request gate opening</p>
        </div>

        <BuzzerButton onClick={handleBuzzerClick} loading={sendingAlert} />

        <p className="mt-12 text-sm text-muted-foreground text-center max-w-xs">
          All members will be notified when you press the button
        </p>
      </main>

      {/* Alert Overlay */}
      <AlertOverlay 
        isOpen={showAlert} 
        onClose={() => setShowAlert(false)} 
        senderName={alertSenderName}
        senderAvatar={alertSenderAvatar}
      />

      {/* Settings Modal */}
      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />

      {/* Install Instructions Modal - only shows on first web visit */}
      <InstallInstructionsModal />
    </div>
  );
};

export default Index;
