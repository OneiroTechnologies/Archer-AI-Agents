
import React, { useState, useEffect, useRef } from 'react';
// FIX: Removed `LiveSession` from imports as it is not an exported member of '@google/genai'.
import { type Chat, type LiveServerMessage } from '@google/genai';
import { ChatMessage } from './components/ChatMessage';
import { ChatInput } from './components/ChatInput';
import { createArcherChatSession, startArcherLiveSession } from './services/geminiService';
import { type ChatMessage as ChatMessageType } from './types';

// Audio helper functions as per @google/genai guidelines
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

function encode(bytes: Uint8Array) {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function createBlob(data: Float32Array): { data: string, mimeType: string } {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
        const s = Math.max(-1, Math.min(1, data[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return {
        data: encode(new Uint8Array(int16.buffer)),
        mimeType: 'audio/pcm;rate=16000',
    };
}


const App: React.FC = () => {
  const [chatSession, setChatSession] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Live Session State
  const [isLiveSessionActive, setIsLiveSessionActive] = useState(false);
  // FIX: Replaced `Promise<LiveSession>` with `ReturnType<typeof startArcherLiveSession>` to correctly type the ref
  // based on the inferred return type of `startArcherLiveSession`.
  const sessionPromiseRef = useRef<ReturnType<typeof startArcherLiveSession> | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const sourcesRef = useRef(new Set<AudioBufferSourceNode>());
  const nextStartTimeRef = useRef(0);
  const turnRefs = useRef({ userInputId: '', modelOutputId: '' });

  useEffect(() => {
    setChatSession(createArcherChatSession());
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSendMessage = async (messageText: string) => {
    if (!chatSession) return;

    setIsLoading(true);
    const userMessage: ChatMessageType = { id: Date.now().toString(), role: 'user', text: messageText };
    const modelMessageId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, userMessage, { id: modelMessageId, role: 'model', text: '' }]);

    try {
      const stream = await chatSession.sendMessageStream({ message: messageText });
      
      let fullText = '';
      let sources: { uri: string; title: string }[] = [];

      for await (const chunk of stream) {
        fullText += chunk.text;
        if (chunk.candidates?.[0]?.groundingMetadata?.groundingChunks) {
            const newSources = chunk.candidates[0].groundingMetadata.groundingChunks
                .map(c => c.web?.uri && c.web?.title ? { uri: c.web.uri, title: c.web.title } : null)
                .filter(s => s !== null) as { uri: string; title: string }[];
            sources = [...new Map([...sources, ...newSources].map(item => [item.uri, item])).values()];
        }
        
        setMessages(prev =>
          prev.map(msg =>
            msg.id === modelMessageId ? { ...msg, text: fullText, sources } : msg
          )
        );
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages(prev =>
        prev.map(msg =>
          msg.id === modelMessageId ? { ...msg, text: "Apologies, Axius. There's been a communications disruption. Check your console for the technical details." } : msg
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const cleanupLiveSession = () => {
    if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
    }
    if (scriptProcessorRef.current) {
        scriptProcessorRef.current.disconnect();
        scriptProcessorRef.current = null;
    }
    if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
        inputAudioContextRef.current.close();
    }
    if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
        outputAudioContextRef.current.close();
    }
    sourcesRef.current.forEach(source => source.stop());
    sourcesRef.current.clear();
  };

  const handleToggleLiveSession = async () => {
    if (isLiveSessionActive) {
      // Stop session
      setIsLiveSessionActive(false);
      if (sessionPromiseRef.current) {
          sessionPromiseRef.current.then(session => session.close());
          sessionPromiseRef.current = null;
      }
      cleanupLiveSession();
      return;
    }

    // Start session
    setIsLiveSessionActive(true);
    setMessages(prev => [...prev, { id: 'live-status', role: 'model', text: 'Opening secure channel... Stand by.' }]);

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;

        // Fix: Cast `window` to `any` to allow access to `webkitAudioContext` for Safari compatibility.
        inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        
        nextStartTimeRef.current = 0;

        sessionPromiseRef.current = startArcherLiveSession({
            onopen: () => {
                setMessages(prev => prev.map(m => m.id === 'live-status' ? {...m, text: 'Channel open. You may speak now, Axius.'} : m));
                const inputCtx = inputAudioContextRef.current!;
                const source = inputCtx.createMediaStreamSource(stream);
                const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
                scriptProcessorRef.current = scriptProcessor;

                scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                    const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                    const pcmBlob = createBlob(inputData);
                    sessionPromiseRef.current?.then((session) => {
                      session.sendRealtimeInput({ media: pcmBlob });
                    });
                };
                source.connect(scriptProcessor);
                scriptProcessor.connect(inputCtx.destination);
            },
            onmessage: async (message: LiveServerMessage) => {
              if (message.serverContent?.inputTranscription) {
                const text = message.serverContent.inputTranscription.text;
                if (!turnRefs.current.userInputId) {
                  const newId = `user-live-${Date.now()}`;
                  turnRefs.current.userInputId = newId;
                  setMessages(prev => [...prev, { id: newId, role: 'user', text }]);
                } else {
                  setMessages(prev => prev.map(m => m.id === turnRefs.current.userInputId ? { ...m, text: m.text + text } : m));
                }
              }

              if (message.serverContent?.outputTranscription) {
                const text = message.serverContent.outputTranscription.text;
                if (!turnRefs.current.modelOutputId) {
                  const newId = `model-live-${Date.now()}`;
                  turnRefs.current.modelOutputId = newId;
                  setMessages(prev => [...prev, { id: newId, role: 'model', text }]);
                } else {
                  setMessages(prev => prev.map(m => m.id === turnRefs.current.modelOutputId ? { ...m, text: m.text + text } : m));
                }
              }
              
              const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
              if (base64Audio) {
                  const outputCtx = outputAudioContextRef.current!;
                  nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
                  const audioBuffer = await decodeAudioData(decode(base64Audio), outputCtx, 24000, 1);
                  const source = outputCtx.createBufferSource();
                  source.buffer = audioBuffer;
                  source.connect(outputCtx.destination);
                  source.addEventListener('ended', () => sourcesRef.current.delete(source));
                  source.start(nextStartTimeRef.current);
                  nextStartTimeRef.current += audioBuffer.duration;
                  sourcesRef.current.add(source);
              }

              if (message.serverContent?.interrupted) {
                sourcesRef.current.forEach(source => source.stop());
                sourcesRef.current.clear();
                nextStartTimeRef.current = 0;
              }

              if (message.serverContent?.turnComplete) {
                turnRefs.current.userInputId = '';
                turnRefs.current.modelOutputId = '';
              }
            },
            onerror: (e: ErrorEvent) => {
                console.error("Live session error:", e);
                setMessages(prev => [...prev, { id: `error-${Date.now()}`, role: 'model', text: `Comms error, Axius. Secure channel compromised. Details in console.` }]);
                setIsLiveSessionActive(false);
                cleanupLiveSession();
            },
            onclose: (e: CloseEvent) => {
                if(isLiveSessionActive) {
                    setIsLiveSessionActive(false);
                    cleanupLiveSession();
                }
            },
        });
    } catch (error) {
        console.error("Failed to start live session:", error);
        setMessages(prev => prev.map(m => m.id === 'live-status' ? {...m, text: 'Failed to access microphone. Mission aborted.'} : m));
        setIsLiveSessionActive(false);
    }
  };


  return (
    <div className="flex flex-col h-screen font-sans text-gray-200 bg-slate-900">
      <header className="p-4 text-center border-b border-slate-700 shadow-lg bg-slate-900/50 backdrop-blur-sm">
        <h1 className="text-2xl font-bold text-cyan-400">AGENT ARCHER</h1>
        <p className="text-sm text-slate-400">
            {isLiveSessionActive ? (
                <span className="flex items-center justify-center gap-2 text-red-400 animate-pulse">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                    </span>
                    LIVE
                </span>
            ) : "Axius Mission Control"}
        </p>
      </header>

      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-4xl mx-auto">
          {messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} isLoading={isLoading && msg.role === 'model' && msg.id === messages[messages.length - 1].id} />
          ))}
          <div ref={messagesEndRef} />
        </div>
      </main>

      <footer className="w-full max-w-4xl mx-auto">
        <ChatInput onSendMessage={handleSendMessage} isLoading={isLoading} onToggleLiveSession={handleToggleLiveSession} isLiveSessionActive={isLiveSessionActive}/>
      </footer>
    </div>
  );
};

export default App;
