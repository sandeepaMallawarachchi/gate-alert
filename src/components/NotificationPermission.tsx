import React from 'react';
import { Bell, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePushNotifications } from '@/hooks/usePushNotifications';

interface NotificationPermissionProps {
  onNotificationReceived?: (payload: any) => void;
  showLabel?: boolean;
}

const NotificationPermission: React.FC<NotificationPermissionProps> = ({ onNotificationReceived, showLabel = false }) => {
  const { isEnabled, isLoading, enableNotifications } = usePushNotifications(onNotificationReceived);

  // Hide when notifications are enabled
  if (isEnabled) {
    return null;
  }

  return (
    <Button
      variant="ghost"
      size={showLabel ? 'default' : 'icon'}
      onClick={enableNotifications}
      disabled={isLoading}
      className="text-muted-foreground hover:text-foreground hover:bg-secondary"
      title="Enable push notifications"
    >
      {showLabel ? (isLoading ? 'Enabling…' : 'Enable notifications') : isLoading ? (
        <Loader2 className="w-5 h-5 animate-spin" />
      ) : (
        <Bell className="w-5 h-5 animate-pulse" />
      )}
    </Button>
  );
};

export default NotificationPermission;
