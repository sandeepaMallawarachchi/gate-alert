import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Settings, LogOut, Loader2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import BuzzerButton from '@/components/BuzzerButton';
import AlertOverlay from '@/components/AlertOverlay';
import SettingsModal from '@/components/SettingsModal';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

const Index: React.FC = () => {
  const { user, profile, loading, signOut } = useAuth();
  const [showAlert, setShowAlert] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

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

  const handleBuzzerClick = () => {
    setShowAlert(true);
    // TODO: Send push notification to security/admin
    toast.success('Gate alert sent!');
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
          <Button
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

        <BuzzerButton onClick={handleBuzzerClick} />

        <p className="mt-12 text-sm text-muted-foreground text-center max-w-xs">
          Security will be notified when you press the button
        </p>
      </main>

      {/* Alert Overlay */}
      <AlertOverlay isOpen={showAlert} onClose={() => setShowAlert(false)} />

      {/* Settings Modal */}
      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  );
};

export default Index;
