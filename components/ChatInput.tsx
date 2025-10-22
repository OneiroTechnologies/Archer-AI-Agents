import React, { useState, useRef, useEffect } from 'react';
import { SendIcon, MicrophoneIcon } from './icons';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  isLoading: boolean;
  onToggleLiveSession: () => void;
  isLiveSessionActive: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({ onSendMessage, isLoading, onToggleLiveSession, isLiveSessionActive }) => {
  const [inputValue, setInputValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [inputValue]);


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim() && !isLoading && !isLiveSessionActive) {
      onSendMessage(inputValue.trim());
      setInputValue('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit(e);
    }
  };


  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-3 p-4 bg-slate-900/50 backdrop-blur-sm border-t border-slate-700">
      <div className="flex-1 bg-slate-800 border border-slate-600 rounded-lg shadow-inner flex items-end">
        <textarea
          ref={textareaRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isLiveSessionActive ? "Live session in progress..." : "Transmit your mission brief to Archer..."}
          disabled={isLoading || isLiveSessionActive}
          rows={1}
          className="w-full bg-transparent p-3 resize-none focus:outline-none text-gray-200 placeholder-gray-500 disabled:opacity-50 max-h-48"
        />
      </div>
      <button
        type="button"
        onClick={onToggleLiveSession}
        aria-label={isLiveSessionActive ? "End live session" : "Start live session"}
        className={`w-12 h-12 flex-shrink-0 text-white rounded-full flex items-center justify-center transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 ${isLiveSessionActive ? 'bg-red-500 hover:bg-red-600 focus:ring-red-400 animate-pulse' : 'bg-slate-600 hover:bg-slate-500 focus:ring-slate-400'}`}
      >
        <MicrophoneIcon className="w-6 h-6" />
      </button>
      <button
        type="submit"
        disabled={isLoading || !inputValue.trim() || isLiveSessionActive}
        className="w-12 h-12 flex-shrink-0 bg-cyan-500 text-white rounded-full flex items-center justify-center transition-all duration-300 hover:bg-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:bg-slate-600 disabled:cursor-not-allowed"
      >
        <SendIcon className="w-6 h-6" />
      </button>
    </form>
  );
};