import React, { useEffect, useRef, useCallback } from 'react';
import { DoorOpen, X } from 'lucide-react';

interface AlertOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  senderName?: string;
  senderAvatar?: string;
}

const AlertOverlay: React.FC<AlertOverlayProps> = ({ isOpen, onClose, senderName, senderAvatar }) => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const vibrationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const frequencyIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const stopAlarm = useCallback(() => {
    // Stop oscillator
    if (oscillatorRef.current) {
      try {
        oscillatorRef.current.stop();
      } catch (e) {}
      oscillatorRef.current = null;
    }
    
    // Clear intervals
    if (frequencyIntervalRef.current) {
      clearInterval(frequencyIntervalRef.current);
      frequencyIntervalRef.current = null;
    }
    
    // Stop vibration
    if (vibrationIntervalRef.current) {
      clearInterval(vibrationIntervalRef.current);
      vibrationIntervalRef.current = null;
    }
    if (navigator.vibrate) {
      navigator.vibrate(0);
    }
    
    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      // Create audio context and start looping siren
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;
      
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      // Use square wave for louder, more piercing alarm sound
      oscillator.type = 'square';
      // Max out the volume - 1.0 is maximum
      gainNode.gain.setValueAtTime(1.0, audioContext.currentTime);
      
      oscillatorRef.current = oscillator;
      gainNodeRef.current = gainNode;
      
      // Start oscillator with higher frequency for more attention-grabbing sound
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
      oscillator.start();
      
      // Alternate frequency for siren effect - wider range for more urgency
      let highFreq = true;
      frequencyIntervalRef.current = setInterval(() => {
        if (oscillatorRef.current) {
          oscillatorRef.current.frequency.setValueAtTime(highFreq ? 440 : 880, audioContext.currentTime);
          highFreq = !highFreq;
        }
      }, 200);
      
      // Vibration pattern - stronger, longer vibrations with continuous loop
      const vibratePattern = () => {
        if (navigator.vibrate) {
          // Long vibrations with short pauses for maximum impact
          navigator.vibrate([500, 100, 500, 100, 500, 100, 500]);
        }
      };
      
      // Start immediately
      vibratePattern();
      
      // Continue vibrating every 2.3 seconds (pattern duration)
      vibrationIntervalRef.current = setInterval(vibratePattern, 2300);

      return () => {
        stopAlarm();
      };
    }
  }, [isOpen, stopAlarm]);

  const handleClose = () => {
    stopAlarm();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center alert-flash"
      onClick={handleClose}
    >
      <div className="relative text-center p-8">
        {/* Close button */}
        <button 
          onClick={handleClose}
          className="absolute top-4 right-4 p-2 rounded-full bg-background/20 hover:bg-background/40 transition-colors"
        >
          <X className="w-8 h-8 text-primary-foreground" />
        </button>
        
        {/* Avatar or Icon */}
        <div className="mb-8 flex justify-center">
          <div className="w-32 h-32 rounded-full bg-background/20 flex items-center justify-center animate-pulse overflow-hidden border-4 border-primary-foreground/30">
            {senderAvatar ? (
              <img 
                src={senderAvatar} 
                alt={senderName || 'Sender'} 
                className="w-full h-full object-cover"
              />
            ) : (
              <DoorOpen className="w-20 h-20 text-primary-foreground" />
            )}
          </div>
        </div>
        
        {/* Message */}
        <h1 className="text-5xl md:text-7xl font-black text-primary-foreground tracking-tight mb-4 drop-shadow-lg">
          OPEN THE GATE
        </h1>
        <p className="text-xl md:text-2xl text-primary-foreground/80 font-medium">
          {senderName ? `${senderName} requests access` : 'Gate access requested'}
        </p>
        
        {/* Tap to dismiss hint */}
        <p className="mt-8 text-primary-foreground/60 text-sm animate-pulse">
          Tap anywhere to stop alarm
        </p>
      </div>
    </div>
  );
};

export default AlertOverlay;
