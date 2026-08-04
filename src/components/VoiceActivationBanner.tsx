import React from 'react';
import { Mic, MicOff } from 'lucide-react';

interface VoiceActivationBannerProps {
  isConnected: boolean;
  onStart: () => void;
  onStop: () => void;
  title: string;
  description: string;
  error?: string | null;
}

export function VoiceActivationBanner({
  isConnected,
  onStart,
  onStop,
  title,
  description,
  error
}: VoiceActivationBannerProps) {
  return (
    <div className="mb-8 flex flex-col items-center justify-center p-8 bg-gradient-to-br from-indigo-50 to-blue-50 rounded-2xl border border-indigo-100 shadow-sm relative overflow-hidden">
      {isConnected && (
        <div className="absolute inset-0 bg-indigo-500/5 animate-pulse" />
      )}
      
      <div className="relative z-10 flex flex-col items-center text-center">
        <button
          onClick={isConnected ? onStop : onStart}
          className={`w-24 h-24 rounded-full flex items-center justify-center mb-4 transition-all duration-300 ${
            isConnected 
              ? 'bg-indigo-600 text-white shadow-[0_0_40px_rgba(79,70,229,0.4)] hover:bg-indigo-700' 
              : 'bg-white text-indigo-500 hover:bg-indigo-50 hover:scale-105 shadow-md'
          }`}
        >
          <div className={isConnected ? "animate-pulse" : ""}>
            {isConnected ? (
              <Mic className="w-10 h-10" />
            ) : (
              <MicOff className="w-10 h-10" />
            )}
          </div>
        </button>

        <h3 className="text-xl font-semibold text-gray-900 mb-2">
          {isConnected ? 'I am listening...' : `${title} Paused`}
        </h3>
        <p className="text-sm text-gray-600 max-w-sm">
          {isConnected 
            ? description
            : 'Click the microphone to activate your intelligent assistant.'
          }
        </p>

        {error && (
          <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-lg border border-red-200 text-sm">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
