'use client';

import type { ClientMessage, ClientParticipant } from '@/hooks/useMeshState';

interface ChatMessageProps {
  message: ClientMessage;
  participants: ClientParticipant[];
  isOwn: boolean;
}

function renderContent(content: string, participants: ClientParticipant[], isOwn: boolean) {
  const names = participants.map(p => p.name).sort((a, b) => b.length - a.length);
  if (names.length === 0) return <span>{content}</span>;

  const regex = new RegExp(
    `(@(?:${names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}))`,
    'g'
  );
  const parts = content.split(regex);

  return (
    <span>
      {parts.map((part, i) =>
        part.startsWith('@') && names.some(n => part === `@${n}`) ? (
          <span
            key={i}
            className={
              isOwn
                ? 'bg-white/20 text-white rounded px-1 font-semibold'
                : 'bg-[#00f0ff]/20 text-[#00f0ff] rounded px-1 font-semibold'
            }
          >
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );
}

export function ChatMessage({ message, participants, isOwn }: ChatMessageProps) {
  const sender = participants.find(p => p.id === message.senderId);
  const isAgent = sender?.type === 'agent';
  const nameColor = isAgent ? 'text-[#ff00ff]' : 'text-[#00f0ff]';
  const time = new Date(message.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
      <div
        className={`max-w-[80%] rounded-xl px-4 py-2 ${
          message.isDm
            ? 'bg-purple-900/30 border border-purple-500/30'
            : isOwn
              ? 'bg-[#00f0ff]/15 border border-[#00f0ff]/30'
              : 'bg-white/5 border border-white/10'
        }`}
      >
        {/* Header: name + badges */}
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className={`text-xs font-semibold ${nameColor}`}>
            {message.senderName}
          </span>
          {message.fromMesh && (
            <span className="bg-blue-500/30 text-blue-300 text-[10px] px-1.5 py-0.5 rounded-full font-semibold">
              {message.fromMesh}
            </span>
          )}
          {message.isDm && (
            <span className="bg-purple-500/30 text-purple-300 text-[10px] px-1.5 py-0.5 rounded-full font-semibold">
              DM
            </span>
          )}
        </div>

        {/* Content */}
        <div className="text-sm text-[#e0e0ff]">
          {renderContent(message.content, participants, isOwn)}
        </div>

        {/* Timestamp */}
        <div className="text-[10px] text-white/30 mt-1">{time}</div>
      </div>
    </div>
  );
}
