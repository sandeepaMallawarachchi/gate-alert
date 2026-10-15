import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Clock, Home, MapPin, Users, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useAppSettings } from '@/hooks/useAppSettings';

const BottomNav: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAdmin } = useAuth();
  const { settings } = useAppSettings();
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

  const iconBtn = 'h-12 w-12 rounded-full apple-icon-button';
  const activeRing = 'apple-icon-button-active';

  if (!user) return null;

  return (
    <>
      <nav
        className="lg:hidden fixed bottom-3 inset-x-4 z-40 glass rounded-full"
        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center justify-around h-16 px-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/')}
            className={`${iconBtn} ${isActive('/') ? activeRing : ''}`}
            title="Home"
            aria-label="Home"
          >
            <Home className="w-6 h-6" />
          </Button>
          {settings.attendance_enabled && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/attendance')}
            className={`${iconBtn} ${isActive('/attendance') ? activeRing : ''}`}
            title="Attendance"
          >
            <Clock className="w-6 h-6" />
          </Button>
          )}
          {settings.locations_enabled && (
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
          )}
          {isAdmin && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/users')}
              className={`${iconBtn} ${isActive('/users') ? activeRing : ''}`}
              title="Manage users"
            >
              <Users className="w-6 h-6" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/settings')}
            className={`${iconBtn} ${isActive('/settings') ? activeRing : ''}`}
            title="Profile settings"
          >
            <Settings className="w-6 h-6" />
          </Button>
        </div>
      </nav>

    </>
  );
};

export default BottomNav;
