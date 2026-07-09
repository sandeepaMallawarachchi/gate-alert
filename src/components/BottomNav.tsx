import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Clock, MapPin, Users, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import SettingsModal from '@/components/SettingsModal';
import AdminUsersModal from '@/components/AdminUsersModal';

const BottomNav: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAdmin } = useAuth();
  const [showSettings, setShowSettings] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [sharingCount, setSharingCount] = useState(0);

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
      .channel('shared-locations-count-nav')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shared_locations' }, fetchCount)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const isActive = (path: string) => location.pathname === path;

  const iconBtn =
    'h-12 w-12 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_0_1px_hsl(var(--primary)/0.4)]';
  const activeRing = 'ring-2 ring-primary-foreground/40';

  if (!user) return null;

  return (
    <>
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center justify-around h-16 px-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/attendance')}
            className={`${iconBtn} ${isActive('/attendance') ? activeRing : ''}`}
            title="Attendance"
          >
            <Clock className="w-6 h-6" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/locations')}
            className={`relative ${iconBtn} ${isActive('/locations') ? activeRing : ''}`}
            title="Live locations"
          >
            <MapPin className="w-6 h-6" />
            {sharingCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-background animate-ping" />
            )}
          </Button>
          {isAdmin && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowAdmin(true)}
              className={iconBtn}
              title="Manage users"
            >
              <Users className="w-6 h-6" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowSettings(true)}
            className={iconBtn}
            title="Profile settings"
          >
            <Settings className="w-6 h-6" />
          </Button>
        </div>
      </nav>

      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
      <AdminUsersModal open={showAdmin} onOpenChange={setShowAdmin} />
    </>
  );
};

export default BottomNav;
