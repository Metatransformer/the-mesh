'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { ClientRoom, ClientMessage, ClientParticipant } from '@/hooks/useMeshState';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';

interface ChatPanelProps {
  rooms: ClientRoom[];
  activeRoom: string | null;
  messages: ClientMessage[];
  participants: ClientParticipant[];
  myId: string;
  myName: string;
  token: string;
  roomMembers?: Record<string, string[]>;
  onJoinRoom: (roomId: string) => void;
  onSendMessage: (content: string) => void;
  onSendDm: (recipientId: string, content: string) => void;
  onCreateRoom: () => void;
  onRoomRename?: (roomId: string, newName: string) => void;
}

const MIN_WIDTH = 300;
const MAX_WIDTH = 700;
const MIN_HEIGHT = 300;
export function ChatPanel({
  rooms,
  activeRoom,
  messages,
  participants,
  myId,
  myName,
  token,
  roomMembers,
  onJoinRoom,
  onSendMessage,
  onSendDm,
  onCreateRoom,
  onRoomRename,
}: ChatPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [input, setInput] = useState('');
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const lastMessageCountRef = useRef(messages.length);

  // Resizable panel state
  const [panelSize, setPanelSize] = useState({ width: 400, height: 500 });

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Track unread when collapsed
  useEffect(() => {
    if (collapsed && messages.length > lastMessageCountRef.current) {
      setUnreadCount(prev => prev + (messages.length - lastMessageCountRef.current));
    }
    lastMessageCountRef.current = messages.length;
  }, [messages.length, collapsed]);

  // Clear unread on expand
  useEffect(() => {
    if (!collapsed) setUnreadCount(0);
  }, [collapsed]);

  // --- Resize handlers ---
  const startResize = useCallback((edge: 'left' | 'top' | 'corner') => {
    return (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const startW = panelSize.width;
      const startH = panelSize.height;
      document.body.style.userSelect = 'none';

      const onMove = (ev: MouseEvent) => {
        const maxH = window.innerHeight - 32;
        const dx = startX - ev.clientX; // left drag: negative clientX = wider
        const dy = startY - ev.clientY; // top drag: negative clientY = taller

        setPanelSize(prev => ({
          width: edge === 'top' ? prev.width : Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startW + dx)),
          height: edge === 'left' ? prev.height : Math.min(maxH, Math.max(MIN_HEIGHT, startH + dy)),
        }));
      };

      const onUp = () => {
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    };
  }, [panelSize]);

  const handleSend = () => {
    if (!input.trim()) return;

    // DM detection: @Name message
    const dmMatch = input.match(/^@(\S+)\s+([\s\S]*)/);
    if (dmMatch) {
      const targetName = dmMatch[1];
      const content = dmMatch[2]?.trim();
      const target = participants.find(p => p.name === targetName);
      if (target && content) {
        onSendDm(target.id, content);
        setInput('');
        return;
      }
    }

    onSendMessage(input.trim());
    setInput('');
  };

  const activeRoomData = rooms.find(r => r.id === activeRoom);

  // Collapsed: chat bubble
  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="fixed bottom-4 right-4 z-50 w-14 h-14 rounded-full backdrop-blur-xl bg-black/60 border border-[#00f0ff]/30 flex items-center justify-center hover:border-[#00f0ff]/60 transition-all group"
      >
        <svg
          className="w-6 h-6 text-[#00f0ff] group-hover:scale-110 transition-transform"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-[#ff00ff] text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <GlassPanel
      className="fixed bottom-4 right-4 z-50 max-w-[calc(100vw-2rem)] flex flex-col overflow-hidden"
      style={{ width: panelSize.width, height: panelSize.height }}
    >
      {/* Resize handles */}
      {/* Left edge */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px] cursor-ew-resize hover:bg-[#00f0ff]/30 transition-colors z-10"
        onMouseDown={startResize('left')}
      />
      {/* Top edge */}
      <div
        className="absolute top-0 left-0 right-0 h-[3px] cursor-ns-resize hover:bg-[#00f0ff]/30 transition-colors z-10"
        onMouseDown={startResize('top')}
      />
      {/* Top-left corner */}
      <div
        className="absolute top-0 left-0 w-[6px] h-[6px] cursor-nwse-resize z-20"
        onMouseDown={startResize('corner')}
      />

      {/* Header: Room tabs + collapse */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#00f0ff]/10">
        {/* Room tabs - horizontal scroll */}
        <div className="flex-1 flex gap-1 overflow-x-auto scrollbar-thin">
          {rooms.map(room => {
            const isAdmin = room.adminId === myId;
            const isEditing = editingRoomId === room.id;
            if (isEditing) {
              return (
                <input
                  key={room.id}
                  value={editingName}
                  onChange={e => setEditingName(e.target.value)}
                  onBlur={() => {
                    if (editingName.trim() && editingName.trim() !== room.name) {
                      onRoomRename?.(room.id, editingName.trim());
                    }
                    setEditingRoomId(null);
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      if (editingName.trim() && editingName.trim() !== room.name) {
                        onRoomRename?.(room.id, editingName.trim());
                      }
                      setEditingRoomId(null);
                    } else if (e.key === 'Escape') {
                      setEditingRoomId(null);
                    }
                  }}
                  className="flex-shrink-0 w-24 px-2 py-0.5 rounded-md text-xs bg-black/60 border border-[#00f0ff]/50 text-[#00f0ff] focus:outline-none"
                  autoFocus
                />
              );
            }
            return (
              <button
                key={room.id}
                onClick={() => onJoinRoom(room.id)}
                className={`flex-shrink-0 px-3 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${
                  activeRoom === room.id
                    ? 'bg-[#00f0ff]/20 text-[#00f0ff] border border-[#00f0ff]/30'
                    : 'text-white/50 hover:text-white/80 hover:bg-white/5'
                }`}
              >
                {room.isPrivate ? 'L' : room.federated ? 'F' : '#'}{' '}
                {room.name}
                {isAdmin && activeRoom === room.id && (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingRoomId(room.id);
                      setEditingName(room.name);
                    }}
                    className="ml-1 text-white/30 hover:text-[#00f0ff] cursor-pointer"
                    title="Rename room"
                  >
                    &#9998;
                  </span>
                )}
              </button>
            );
          })}
          <button
            onClick={onCreateRoom}
            className="flex-shrink-0 px-2 py-1 text-[#00f0ff]/50 hover:text-[#00f0ff] text-sm transition-colors"
            title="Create room"
          >
            +
          </button>
        </div>

        {/* Collapse button */}
        <button
          onClick={() => setCollapsed(true)}
          className="p-1 text-white/30 hover:text-white/60 transition-colors"
          title="Minimize"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />
          </svg>
        </button>
      </div>

      {/* Messages area */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0 scrollbar-thin"
      >
        {!activeRoom ? (
          <div className="flex items-center justify-center h-full text-white/30 text-sm py-12">
            Select a room to start chatting
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-white/30 text-sm py-12">
            No messages yet in {activeRoomData?.name || 'this room'}
          </div>
        ) : (
          messages.map(msg => (
            <ChatMessage
              key={msg.id}
              message={msg}
              participants={participants}
              isOwn={msg.senderId === myId}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      {activeRoom && (
        <div className="p-3 border-t border-[#00f0ff]/10">
          <ChatInput
            value={input}
            onChange={setInput}
            onSend={handleSend}
            participants={participants}
          />
        </div>
      )}
    </GlassPanel>
  );
}
