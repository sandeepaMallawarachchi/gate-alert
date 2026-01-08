import React from 'react';
import { Bell } from 'lucide-react';

interface BuzzerButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

const BuzzerButton: React.FC<BuzzerButtonProps> = ({ onClick, disabled }) => {
  return (
    <div className="relative flex items-center justify-center">
      {/* Animated rings */}
      <div className="absolute w-64 h-64 rounded-full border-2 border-primary/30 ring-expand" />
      <div className="absolute w-64 h-64 rounded-full border-2 border-primary/20 ring-expand" style={{ animationDelay: '0.5s' }} />
      
      {/* Main button */}
      <button
        onClick={onClick}
        disabled={disabled}
        className="relative w-52 h-52 rounded-full bg-gradient-to-br from-primary to-alert-glow 
                   buzzer-glow transition-all duration-200 
                   hover:scale-105 active:scale-95 
                   disabled:opacity-50 disabled:cursor-not-allowed
                   flex items-center justify-center
                   border-4 border-primary/50
                   shadow-[inset_0_-8px_20px_rgba(0,0,0,0.3)]"
      >
        <div className="flex flex-col items-center gap-3">
          <Bell className="w-16 h-16 text-primary-foreground drop-shadow-lg" />
          <span className="text-xl font-bold text-primary-foreground tracking-wider uppercase">
            OPEN GATE
          </span>
        </div>
      </button>
    </div>
  );
};

export default BuzzerButton;
