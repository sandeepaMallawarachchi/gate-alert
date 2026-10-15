import React, { useState, useEffect, useCallback } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { LogOut, Loader2, Users, MapPin, Settings, Clock, Bell } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import AlertOverlay from '@/components/AlertOverlay';
import InstallInstructionsModal from '@/components/InstallInstructionsModal';
import NotificationPermission from '@/components/NotificationPermission';
import { useAuth } from '@/contexts/AuthContext';
import { useAppSettings } from '@/hooks/useAppSettings';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const Index: React.FC = () => {
  const { user, profile, isAdmin, loading, signOut } = useAuth();
  const { settings } = useAppSettings();
  const navigate = useNavigate();
  const [showAlert, setShowAlert] = useState(false);
  const [alertSenderName, setAlertSenderName] = useState<string>('');
  const [alertSenderAvatar, setAlertSenderAvatar] = useState<string>('');
  const [sendingAlert, setSendingAlert] = useState(false);
  const [sharingCount, setSharingCount] = useState(0);

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

  // Track how many members are currently sharing location
  useEffect(() => {
    if (!user) return;
    const fetchCount = async () => {
      const { count } = await supabase
        .from('shared_locations')
        .select('*', { count: 'exact', head: true });
      setSharingCount(count || 0);
    };
    fetchCount();
    const channel = supabase
      .channel('shared-locations-count')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shared_locations' }, fetchCount)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
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
      <header className="sticky top-3 z-30 mx-3 mt-3 flex items-center justify-between px-4 py-3 glass rounded-full">
        <button
          onClick={() => navigate('/settings')}
          className="flex items-center gap-3 rounded-md p-1 -m-1 hover:bg-secondary transition-colors"
          title="Open settings"
        >
          <Avatar className="w-10 h-10 border border-primary/50">
            <AvatarImage src={profile?.avatar_url || undefined} />
            <AvatarFallback className="bg-secondary text-secondary-foreground">
              {profile?.full_name ? getInitials(profile.full_name) : 'U'}
            </AvatarFallback>
          </Avatar>
          <div className="text-left">
            <p className="text-sm font-medium text-foreground">{profile?.full_name}</p>
            <p className="text-xs text-muted-foreground">@{profile?.username}</p>
          </div>
        </button>
        
        <div className="hidden lg:flex items-center gap-2">
          <NotificationPermission onNotificationReceived={handleNotificationReceived} />
          {settings.attendance_enabled && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/attendance')}
            className="apple-icon-button"
            title="Attendance"
          >
            <Clock className="w-5 h-5" />
          </Button>
          )}
          {settings.locations_enabled && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/locations')}
            className="relative apple-icon-button"
            title="Live locations"
          >
            <MapPin className={`w-5 h-5 ${sharingCount > 0 ? 'text-success animate-pulse drop-shadow-[0_0_6px_rgba(52,199,89,0.7)]' : ''}`} />
            {sharingCount > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-success animate-ping" />
            )}
          </Button>
          )}
          {isAdmin && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/users')}
              className="apple-icon-button"
              title="Manage users"
            >
              <Users className="w-5 h-5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            className="apple-icon-button hover:!text-destructive"
          >
            <LogOut className="w-5 h-5" />
          </Button>
        </div>

        {/* Mobile/tablet header: notification stays here, other icons live in bottom nav */}
        <div className="lg:hidden flex items-center gap-2">
          <NotificationPermission onNotificationReceived={handleNotificationReceived} />
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            className="apple-icon-button hover:!text-destructive"
            title="Log out"
          >
            <LogOut className="w-5 h-5" />
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-start px-4 pt-8 pb-24 lg:pb-4">
        <div className="text-center mb-10">
          <h1 className="text-2xl font-bold text-foreground mb-1">
            {profile?.full_name ? `Hello, ${profile.full_name.split(' ')[0]}` : 'Dashboard'}
          </h1>
        </div>

        <div className="grid grid-cols-2 gap-3 w-full max-w-sm px-1">
          {/* Send Alert */}
          <Card
            className="col-span-2 liquid-card p-5 flex flex-col items-center justify-center gap-3 cursor-pointer border-primary/30 overflow-hidden transition-transform hover:-translate-y-0.5"
            onClick={handleBuzzerClick}
          >
            <div className="relative flex items-center justify-center">
              {!sendingAlert && (
                <>
                  <div className="absolute w-32 h-32 rounded-full border-2 border-primary/30 ring-expand" />
                  <div className="absolute w-32 h-32 rounded-full border-2 border-primary/20 ring-expand" style={{ animationDelay: '0.5s' }} />
                </>
              )}
              {sendingAlert && (
                <div className="absolute w-32 h-32 rounded-full border-4 border-primary/50 animate-pulse" />
              )}
              <button
                disabled={sendingAlert}
                className="relative w-28 h-28 rounded-full bg-gradient-to-br from-primary to-alert-glow buzzer-glow transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center border-4 border-primary/50 shadow-[inset_0_-8px_20px_rgba(0,0,0,0.3)]"
              >
                <div className="flex flex-col items-center gap-1">
                  {sendingAlert ? (
                    <Loader2 className="w-9 h-9 text-primary-foreground drop-shadow-lg animate-spin" />
                  ) : (
                    <Bell className="w-9 h-9 text-primary-foreground drop-shadow-lg" />
                  )}
                  <span className="text-xs font-bold text-primary-foreground tracking-wider uppercase">
                    {sendingAlert ? 'Sending...' : 'Alert'}
                  </span>
                </div>
              </button>
            </div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Notify all members instantly</p>
            </div>
          </Card>

          {/* Mark Attendance */}
          {settings.attendance_enabled && (
          <Card
            className={`${settings.locations_enabled ? '' : 'col-span-2'} liquid-card p-5 flex flex-col items-center justify-center gap-3 cursor-pointer transition-transform hover:-translate-y-0.5`}
            onClick={() => navigate('/attendance')}
          >
            <div className="relative w-16 h-16 flex items-center justify-center">
              <Clock className="w-9 h-9 text-primary" strokeWidth={1.8} />
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-foreground">Attendance</p>
              <p className="text-xs text-muted-foreground">Check in / out</p>
            </div>
          </Card>
          )}

          {/* Live Locations */}
          {settings.locations_enabled && (
          <Card
            className={`${settings.attendance_enabled ? '' : 'col-span-2'} liquid-card p-5 flex flex-col items-center justify-center gap-3 cursor-pointer transition-transform hover:-translate-y-0.5`}
            onClick={() => navigate('/locations')}
          >
            <div className="relative w-16 h-16 flex items-center justify-center">
              <MapPin className={`w-9 h-9 ${sharingCount > 0 ? 'text-success animate-pulse drop-shadow-[0_0_6px_rgba(52,199,89,0.7)]' : 'text-primary'}`} strokeWidth={1.8} />
              {sharingCount > 0 && (
                <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-success animate-ping" />
              )}
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-foreground">Locations</p>
              <p className="text-xs text-muted-foreground">
                {sharingCount > 0 ? `${sharingCount} sharing` : 'Live map'}
              </p>
            </div>
          </Card>
          )}

          {/* Admin Users */}
          {isAdmin && (
            <Card
              className="col-span-2 liquid-card p-5 flex flex-row items-center gap-4 cursor-pointer transition-transform hover:-translate-y-0.5"
              onClick={() => navigate('/users')}
            >
              <div className="relative w-14 h-14 flex items-center justify-center shrink-0">
                <Users className="w-8 h-8 text-primary" strokeWidth={1.8} />
              </div>
              <div>
                <p className="text-base font-semibold text-foreground">Manage Team</p>
                <p className="text-xs text-muted-foreground">Add users, assign admin access</p>
              </div>
            </Card>
          )}
        </div>
      </main>


      {/* Alert Overlay */}
      <AlertOverlay
        isOpen={showAlert}
        onClose={() => setShowAlert(false)}
        senderName={alertSenderName}
        senderAvatar={alertSenderAvatar}
      />

      {/* Settings Modal */}


      {/* Admin Users Modal */}

      {/* Install Instructions Modal - only shows on first web visit */}
      <InstallInstructionsModal />
    </div>
  );
};

export default Index;
