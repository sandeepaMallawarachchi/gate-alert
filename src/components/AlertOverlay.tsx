import React, { useEffect, useRef } from 'react';
import { DoorOpen, X } from 'lucide-react';

interface AlertOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

const AlertOverlay: React.FC<AlertOverlayProps> = ({ isOpen, onClose }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Create and play siren sound
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      const playAlertSound = () => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        
        // Siren effect - alternating frequencies
        const duration = 3;
        const now = audioContext.currentTime;
        
        for (let i = 0; i < duration * 4; i++) {
          const t = now + i * 0.25;
          oscillator.frequency.setValueAtTime(i % 2 === 0 ? 800 : 600, t);
        }
        
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + duration);
      };

      playAlertSound();

      // Auto close after 5 seconds
      const timer = setTimeout(() => {
        onClose();
      }, 5000);

      return () => {
        clearTimeout(timer);
        audioContext.close();
      };
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center alert-flash"
      onClick={onClose}
    >
      <div className="relative text-center p-8">
        {/* Close button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full bg-background/20 hover:bg-background/40 transition-colors"
        >
          <X className="w-8 h-8 text-primary-foreground" />
        </button>
        
        {/* Icon */}
        <div className="mb-8 flex justify-center">
          <div className="w-32 h-32 rounded-full bg-background/20 flex items-center justify-center">
            <DoorOpen className="w-20 h-20 text-primary-foreground" />
          </div>
        </div>
        
        {/* Message */}
        <h1 className="text-5xl md:text-7xl font-black text-primary-foreground tracking-tight mb-4 drop-shadow-lg">
          OPEN THE GATE
        </h1>
        <p className="text-xl md:text-2xl text-primary-foreground/80 font-medium">
          Gate access requested
        </p>
        
        {/* Tap to dismiss hint */}
        <p className="mt-8 text-primary-foreground/60 text-sm">
          Tap anywhere to dismiss
        </p>
      </div>
    </div>
  );
};

export default AlertOverlay;
