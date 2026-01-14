import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Bell, Loader2 } from "lucide-react";
import { usePushNotifications } from "@/hooks/usePushNotifications";

interface NotificationPermissionModalProps {
  isStandalone: boolean;
  onNotificationReceived?: (payload: any) => void;
}

const NotificationPermissionModal = ({ 
  isStandalone, 
  onNotificationReceived 
}: NotificationPermissionModalProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const { isEnabled, isLoading, enableNotifications } = usePushNotifications(onNotificationReceived);

  useEffect(() => {
    // Only show in installed app (standalone mode)
    if (!isStandalone) return;

    // Check if already enabled
    if (isEnabled) return;

    // Check if already completed setup
    const hasCompletedSetup = localStorage.getItem("hasCompletedNotificationSetup");
    if (hasCompletedSetup) return;

    // Small delay for better UX after app loads
    const timer = setTimeout(() => setIsOpen(true), 500);
    return () => clearTimeout(timer);
  }, [isStandalone, isEnabled]);

  const handleEnable = async () => {
    const success = await enableNotifications();
    if (success) {
      localStorage.setItem("hasCompletedNotificationSetup", "true");
      setIsOpen(false);
    }
  };

  // Don't render if not in standalone mode
  if (!isStandalone) return null;

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent 
        className="max-w-md mx-4"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
              <Bell className="w-8 h-8 text-primary" />
            </div>
          </div>
          <DialogTitle className="text-xl font-bold text-center">
            Enable Notifications
          </DialogTitle>
          <DialogDescription className="text-center">
            To receive gate access alerts from other members, please enable push notifications. 
            This is required for the app to work properly.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-6 space-y-4">
          <Button 
            onClick={handleEnable} 
            className="w-full" 
            size="lg"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Enabling...
              </>
            ) : (
              <>
                <Bell className="w-4 h-4 mr-2" />
                Enable Notifications
              </>
            )}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            You'll be prompted by your device to allow notifications. 
            Please tap "Allow" to continue.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default NotificationPermissionModal;
