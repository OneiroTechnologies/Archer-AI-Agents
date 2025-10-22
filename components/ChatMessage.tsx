
import React from 'react';
import { ChatMessage as ChatMessageType } from '../types';
import { UserIcon, ArcherIcon, GlobeIcon } from './icons';

interface CodeBlockProps {
  language: string;
  code: string;
}

const CodeBlock: React.FC<CodeBlockProps> = ({ language, code }) => {
  return (
    <div className="bg-black/70 rounded-md my-4 overflow-hidden">
      <div className="flex justify-between items-center text-xs text-gray-400 bg-gray-800/50 px-4 py-2">
        <span>{language || 'code'}</span>
        <button
          onClick={() => navigator.clipboard.writeText(code)}
          className="text-gray-400 hover:text-white transition-colors text-xs"
        >
          Copy Code
        </button>
      </div>
      <pre className="p-4 text-sm overflow-x-auto">
        <code>{code}</code>
      </pre>
    </div>
  );
};

const ParsedMessage: React.FC<{ text: string }> = ({ text }) => {
    const parts = text.split(/(```[\s\S]*?```)/g);

    return (
        <>
            {parts.map((part, index) => {
                const codeBlockMatch = part.match(/^```(\w+)?\n([\s\S]*?)```$/);
                if (codeBlockMatch) {
                    const language = codeBlockMatch[1] || '';
                    const code = codeBlockMatch[2] || '';
                    return <CodeBlock key={index} language={language} code={code} />;
                }
                // Replace newlines with <br> for regular text parts
                return part.split('\n').map((line, i) => (
                    <React.Fragment key={`${index}-${i}`}>
                        {line}
                        {i < part.split('\n').length - 1 && <br />}
                    </React.Fragment>
                ));
            })}
        </>
    );
};

interface ChatMessageProps {
  message: ChatMessageType;
  isLoading?: boolean;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, isLoading = false }) => {
  const isModel = message.role === 'model';
  const hasSources = message.sources && message.sources.length > 0;

  return (
    <div className={`flex items-start gap-4 my-6 ${isModel ? 'justify-start' : 'justify-end'}`}>
      {isModel && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center border-2 border-cyan-400">
          <ArcherIcon className="w-5 h-5 text-cyan-400" />
        </div>
      )}
      <div className={`w-full max-w-2xl flex flex-col ${isModel ? 'items-start' : 'items-end'}`}>
        <div className={`rounded-lg px-5 py-3 shadow-lg ${isModel ? 'bg-slate-800 text-gray-200 rounded-tl-none' : 'bg-cyan-800/50 text-gray-100 rounded-tr-none'}`}>
          <div className="prose prose-invert prose-sm max-w-none">
             <ParsedMessage text={message.text} />
             {isLoading && !message.text && (
                 <div className="flex items-center space-x-2 text-gray-400">
                     <span className="animate-pulse">...</span>
                     <span>Archer is formulating a response...</span>
                 </div>
             )}
          </div>
        </div>
        {isModel && hasSources && (
          <div className="mt-2 text-xs text-gray-400">
            <h4 className="font-bold mb-1 flex items-center gap-1.5"><GlobeIcon className="w-3.5 h-3.5" /> Sources:</h4>
            <ul className="flex flex-wrap gap-2">
              {message.sources?.map((source, index) => (
                <li key={index} className="bg-slate-700/50 hover:bg-slate-700 transition-colors rounded-full px-2 py-1">
                  <a href={source.uri} target="_blank" rel="noopener noreferrer" className="hover:text-cyan-400">{source.title}</a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {!isModel && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center border-2 border-gray-500">
          <UserIcon className="w-5 h-5 text-gray-400" />
        </div>
      )}
    </div>
  );
};
