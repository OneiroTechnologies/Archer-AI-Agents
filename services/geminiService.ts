
import { GoogleGenAI, Chat, LiveCallbacks, Modality } from "@google/genai";
import { SYSTEM_INSTRUCTION } from '../constants';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

export function createArcherChatSession(): Chat {
  const model = 'gemini-2.5-pro';
  
  const chat = ai.chats.create({
    model: model,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      tools: [{ googleSearch: {} }],
    },
  });

  return chat;
}

// FIX: Removed `LiveSession` from imports and the return type annotation.
// The `LiveSession` type is not an exported member of the '@google/genai' package.
// The return type is now correctly inferred from the `ai.live.connect` method.
export function startArcherLiveSession(callbacks: LiveCallbacks) {
    return ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks,
        config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            responseModalities: [Modality.AUDIO],
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
            },
        },
    });
}
