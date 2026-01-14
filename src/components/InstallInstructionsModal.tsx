import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Share, MoreVertical, PlusSquare, Download } from "lucide-react";

const InstallInstructionsModal = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "android">("android");

  useEffect(() => {
    // Check if app is installed (standalone mode)
    const isStandalone = 
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;

    // Check if already shown
    const hasSeenInstall = localStorage.getItem("hasSeenInstallInstructions");

    // Only show on web browser, not in installed app
    if (!isStandalone && !hasSeenInstall) {
      // Detect platform
      const userAgent = navigator.userAgent.toLowerCase();
      if (/iphone|ipad|ipod/.test(userAgent)) {
        setPlatform("ios");
      } else {
        setPlatform("android");
      }
      
      // Small delay for better UX
      setTimeout(() => setIsOpen(true), 1000);
    }
  }, []);

  const handleClose = () => {
    localStorage.setItem("hasSeenInstallInstructions", "true");
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-center">
            Install This App
          </DialogTitle>
          <DialogDescription className="text-center">
            Add this app to your home screen for the best experience
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue={platform} className="w-full mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="android" className="flex items-center gap-2">
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                <path d="M17.523 15.341c-.5 0-.904.405-.904.904 0 .5.405.905.904.905.5 0 .905-.405.905-.905 0-.5-.406-.904-.905-.904zm-11.046 0c-.5 0-.904.405-.904.904 0 .5.405.905.904.905.5 0 .905-.405.905-.905 0-.5-.405-.904-.905-.904zm11.405-6.02l1.997-3.458a.416.416 0 00-.152-.567.416.416 0 00-.567.152l-2.022 3.5C15.413 8.016 13.307 7.5 11 7.5s-4.413.516-6.139 1.448L2.839 5.448a.416.416 0 00-.567-.152.416.416 0 00-.152.567l1.997 3.458C1.5 11.155 0 14.043 0 17.341h22c0-3.298-1.5-6.186-4.118-8.02z"/>
              </svg>
              Android
            </TabsTrigger>
            <TabsTrigger value="ios" className="flex items-center gap-2">
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
              </svg>
              iOS
            </TabsTrigger>
          </TabsList>

          <TabsContent value="android" className="mt-6 space-y-6">
            <div className="space-y-4">
              <div className="flex items-start gap-4 p-4 bg-muted rounded-lg">
                <div className="flex-shrink-0 w-10 h-10 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold">
                  1
                </div>
                <div className="flex-1">
                  <p className="font-medium">Open Chrome menu</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Tap the <MoreVertical className="inline w-4 h-4" /> three dots in the top-right corner
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4 p-4 bg-muted rounded-lg">
                <div className="flex-shrink-0 w-10 h-10 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold">
                  2
                </div>
                <div className="flex-1">
                  <p className="font-medium">Select "Install app" or "Add to Home screen"</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Look for <Download className="inline w-4 h-4" /> Install app option in the menu
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4 p-4 bg-muted rounded-lg">
                <div className="flex-shrink-0 w-10 h-10 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold">
                  3
                </div>
                <div className="flex-1">
                  <p className="font-medium">Confirm installation</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Tap "Install" in the popup to add the app to your home screen
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="ios" className="mt-6 space-y-6">
            <div className="space-y-4">
              <div className="flex items-start gap-4 p-4 bg-muted rounded-lg">
                <div className="flex-shrink-0 w-10 h-10 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold">
                  1
                </div>
                <div className="flex-1">
                  <p className="font-medium">Open Safari Share menu</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Tap the <Share className="inline w-4 h-4" /> Share button at the bottom of the screen
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4 p-4 bg-muted rounded-lg">
                <div className="flex-shrink-0 w-10 h-10 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold">
                  2
                </div>
                <div className="flex-1">
                  <p className="font-medium">Scroll and tap "Add to Home Screen"</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Find <PlusSquare className="inline w-4 h-4" /> Add to Home Screen in the share options
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4 p-4 bg-muted rounded-lg">
                <div className="flex-shrink-0 w-10 h-10 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold">
                  3
                </div>
                <div className="flex-1">
                  <p className="font-medium">Tap "Add" to confirm</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Tap "Add" in the top-right corner to install the app
                  </p>
                </div>
              </div>
            </div>

            <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              <p className="text-sm text-yellow-600 dark:text-yellow-400">
                <strong>Note:</strong> This only works in Safari. If you're using another browser, open this page in Safari first.
              </p>
            </div>
          </TabsContent>
        </Tabs>

        <Button onClick={handleClose} className="w-full mt-4">
          Got it!
        </Button>
      </DialogContent>
    </Dialog>
  );
};

export default InstallInstructionsModal;
