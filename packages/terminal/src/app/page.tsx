'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useMeshAuth } from '@/hooks/useMeshAuth';
import { useMeshState } from '@/hooks/useMeshState';
import { useMeshWebSocket } from '@/hooks/useMeshWebSocket';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { ParticipantPanel } from '@/components/ui/ParticipantPanel';
import { RoomCreationModal } from '@/components/ui/RoomCreationModal';
import { HUD } from '@/components/ui/HUD';

// Lazy-load 3D world to avoid SSR issues with Three.js
const MeshWorld = dynamic(
  () => import('@/components/world/MeshWorld').then(mod => ({ default: mod.MeshWorld })),
  { ssr: false }
);

export default function MeshPage() {
  const auth = useMeshAuth();
  const state = useMeshState(auth.serverUrlRef);
  const ws = useMeshWebSocket({ auth, state });

  // Form state for auth screens
  const [regName, setRegName] = useState('');
  const [regType, setRegType] = useState<'user' | 'agent'>('user');
  const [loginToken, setLoginToken] = useState('');
  const [serverUrlInput, setServerUrlInput] = useState('http://localhost:3001');

  // Room creation modal state
  const [creationPoint, setCreationPoint] = useState<[number, number, number] | null>(null);

  // Restore session on mount
  useEffect(() => {
    const saved = localStorage.getItem('mesh-session');
    if (saved) {
      try {
        const session = JSON.parse(saved);
        if (session.token) {
          if (session.serverUrl) {
            auth.setServerUrl(session.serverUrl);
            setServerUrlInput(session.serverUrl);
          }
          auth.login(session.token);
          if (session.activeRoom) {
            state.setActiveRoom(session.activeRoom);
          }
          ws.connect(session.token);
          return;
        }
      } catch {}
    }
    // Auto-register via URL param ?user=Name&server=http://...
    const params = new URLSearchParams(window.location.search);
    const autoServer = params.get('server');
    if (autoServer) {
      auth.setServerUrl(autoServer);
      setServerUrlInput(autoServer);
    }
    const autoName = params.get('user');
    if (autoName) {
      handleAutoRegister(autoName);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll federation status + fetch room positions when in mesh view
  useEffect(() => {
    if (auth.view !== 'mesh') return;
    state.checkFederationStatus();
    state.fetchRoomPositions();
    const interval = setInterval(() => state.checkFederationStatus(), 15_000);
    return () => clearInterval(interval);
  }, [auth.view]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAutoRegister = async (name: string) => {
    const token = await auth.register(name, 'user');
    if (token) ws.connect(token);
  };

  const handleRegister = async () => {
    if (!regName.trim()) return;
    auth.setServerUrl(serverUrlInput.trim());
    const token = await auth.register(regName.trim(), regType);
    if (token) ws.connect(token);
  };

  const handleLogin = () => {
    if (!loginToken.trim()) return;
    auth.setServerUrl(serverUrlInput.trim());
    auth.login(loginToken.trim());
    ws.connect(loginToken.trim());
  };

  const handleLogout = () => {
    auth.logout();
    state.clearAll();
  };

  const handleJoinRoom = useCallback((roomId: string) => {
    state.setActiveRoom(roomId);
    state.setMessages([]);
    ws.joinRoom(roomId);
    state.fetchMessages(roomId, auth.tokenRef.current || auth.token);
    // Persist active room
    const saved = localStorage.getItem('mesh-session');
    if (saved) {
      try {
        const session = JSON.parse(saved);
        session.activeRoom = roomId;
        localStorage.setItem('mesh-session', JSON.stringify(session));
      } catch {}
    }
  }, [auth.tokenRef, state, ws]);

  const handleSendMessage = useCallback((content: string) => {
    if (!state.activeRoom || !content.trim()) return;
    ws.sendMessage(state.activeRoom, content.trim(), auth.token);
  }, [state.activeRoom, ws, auth.token]);

  const handleSendDm = useCallback((recipientId: string, content: string) => {
    if (!state.activeRoom || !content.trim()) return;
    ws.sendDm(recipientId, state.activeRoom, content.trim());
  }, [state.activeRoom, ws]);

  const handleGroundClick = useCallback((pos: [number, number, number]) => {
    setCreationPoint(pos);
  }, []);

  const handleCreateRoom = useCallback(async () => {
    // Fallback: create room without position (from chat panel + button)
    setCreationPoint([0, 0, 0]);
  }, []);

  const handleCreateRoomConfirm = useCallback(async (name: string, isPrivate: boolean, inviteIds: string[]) => {
    const posX = creationPoint ? creationPoint[0] : undefined;
    const posZ = creationPoint ? creationPoint[2] : undefined;
    const base = auth.serverUrl;
    const res = await fetch(base ? `${base}/api/rooms` : '/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
      body: JSON.stringify({ name, isPrivate, posX, posZ }),
    });
    if (res.ok) {
      const room = await res.json();
      // Invite selected participants
      for (const pid of inviteIds) {
        await fetch(base ? `${base}/api/rooms/${room.id}/invite` : `/api/rooms/${room.id}/invite`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
          body: JSON.stringify({ participantId: pid }),
        });
      }
      state.fetchRooms(auth.token);
      state.fetchRoomPositions();
      state.fetchRoomMembers(auth.token);
    }
    setCreationPoint(null);
  }, [auth.token, auth.serverUrl, state, creationPoint]);

  const handleParticipantsChanged = useCallback(async () => {
    await state.fetchParticipants();
    if (auth.token) {
      await state.fetchRoomMembers(auth.token);
    }
  }, [state, auth.token]);

  const handleRoomRename = useCallback(async (roomId: string, newName: string) => {
    const base = auth.serverUrl;
    const res = await fetch(base ? `${base}/api/rooms/${roomId}` : `/api/rooms/${roomId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
      body: JSON.stringify({ name: newName }),
    });
    if (res.ok) {
      state.fetchRooms(auth.token);
    }
  }, [auth.token, auth.serverUrl, state]);

  // --- Auth screens ---
  if (auth.view !== 'mesh') {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: '#050510' }}>
        {/* Background gradient */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-20 blur-[120px]"
            style={{ background: 'radial-gradient(circle, #00f0ff 0%, transparent 70%)' }} />
          <div className="absolute top-1/3 left-1/3 w-[400px] h-[400px] rounded-full opacity-10 blur-[100px]"
            style={{ background: 'radial-gradient(circle, #ff00ff 0%, transparent 70%)' }} />
        </div>

        <GlassPanel className="relative z-10 p-8 w-96 space-y-6">
          <div className="text-center">
            <h1
              className="text-4xl font-bold tracking-wider"
              style={{ color: '#00f0ff', textShadow: '0 0 20px #00f0ff, 0 0 40px #00f0ff40' }}
            >
              THE MESH
            </h1>
            <p className="text-white/40 text-sm mt-2 font-mono">
              command center for humans &amp; agents
            </p>
          </div>

          {/* Server URL */}
          <div>
            <label className="block text-[10px] text-white/30 uppercase tracking-wider mb-1 font-mono">Server</label>
            <input
              value={serverUrlInput}
              onChange={e => setServerUrlInput(e.target.value)}
              placeholder="http://localhost:3001"
              className="w-full bg-black/60 border border-white/10 rounded-lg px-4 py-2 text-xs text-[#e0e0ff]/60 font-mono placeholder-white/20 focus:outline-none focus:border-[#00f0ff]/30 transition-colors"
            />
          </div>

          {/* Tab toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => auth.setView('register')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                auth.view === 'register'
                  ? 'bg-[#00f0ff]/20 text-[#00f0ff] border border-[#00f0ff]/30'
                  : 'bg-white/5 text-white/40 border border-white/10'
              }`}
            >
              Register
            </button>
            <button
              onClick={() => auth.setView('login')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                auth.view === 'login'
                  ? 'bg-[#00f0ff]/20 text-[#00f0ff] border border-[#00f0ff]/30'
                  : 'bg-white/5 text-white/40 border border-white/10'
              }`}
            >
              Login
            </button>
          </div>

          {auth.view === 'register' ? (
            <div className="space-y-3">
              <input
                value={regName}
                onChange={e => setRegName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleRegister()}
                placeholder="Name"
                className="w-full bg-black/60 border border-[#00f0ff]/30 rounded-lg px-4 py-2.5 text-sm text-[#e0e0ff] placeholder-white/30 focus:outline-none focus:border-[#00f0ff] transition-colors"
                autoFocus
              />
              <select
                value={regType}
                onChange={e => setRegType(e.target.value as 'user' | 'agent')}
                className="w-full bg-black/60 border border-[#00f0ff]/30 rounded-lg px-4 py-2.5 text-sm text-[#e0e0ff] focus:outline-none focus:border-[#00f0ff] transition-colors"
              >
                <option value="user">Human</option>
                <option value="agent">Agent</option>
              </select>
              <button
                onClick={handleRegister}
                className="w-full bg-[#00f0ff]/20 hover:bg-[#00f0ff]/30 text-[#00f0ff] border border-[#00f0ff]/30 py-2.5 rounded-lg text-sm font-medium transition-all"
              >
                Enter The Mesh
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <input
                value={loginToken}
                onChange={e => setLoginToken(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                placeholder="Your token"
                className="w-full bg-black/60 border border-[#00f0ff]/30 rounded-lg px-4 py-2.5 text-sm text-[#e0e0ff] font-mono placeholder-white/30 focus:outline-none focus:border-[#00f0ff] transition-colors"
                autoFocus
              />
              <button
                onClick={handleLogin}
                className="w-full bg-[#00f0ff]/20 hover:bg-[#00f0ff]/30 text-[#00f0ff] border border-[#00f0ff]/30 py-2.5 rounded-lg text-sm font-medium transition-all"
              >
                Connect
              </button>
            </div>
          )}
        </GlassPanel>
      </div>
    );
  }

  // --- Main Mesh view ---
  const activeRoomData = state.rooms.find(r => r.id === state.activeRoom);
  const onlineCount = state.participants.filter(p => p.online).length;

  return (
    <div className="fixed inset-0">
      {/* 3D World (full viewport, z-0) */}
      <MeshWorld
        participants={state.participants}
        rooms={state.rooms}
        activeRoom={state.activeRoom}
        messages={state.messages}
        myId={auth.myId}
        roomMembers={state.roomMembers}
        activeRooms={state.activeRooms}
        roomPositionOverrides={state.roomPositions}
        onRoomClick={handleJoinRoom}
        onGroundClick={handleGroundClick}
      />

      {/* HUD overlay (top) */}
      <HUD
        roomName={activeRoomData?.name ?? null}
        onlineCount={onlineCount}
        myName={auth.myName}
        federationStatus={{
          connected: state.federationStatus.connected,
          configured: state.federationStatus.configured,
          meshName: state.federationStatus.meshName,
        }}
        onLogout={handleLogout}
      />

      {/* Participant panel (left side) */}
      <ParticipantPanel
        participants={state.participants}
        myId={auth.myId}
        token={auth.token}
        serverUrl={auth.serverUrl}
        roomMembers={state.roomMembers}
        activeRoom={state.activeRoom}
        onParticipantsChanged={handleParticipantsChanged}
      />

      {/* Chat panel overlay (bottom-right) */}
      <ChatPanel
        rooms={state.rooms}
        activeRoom={state.activeRoom}
        messages={state.messages}
        participants={state.participants}
        myId={auth.myId}
        myName={auth.myName}
        token={auth.token}
        roomMembers={state.roomMembers}
        onJoinRoom={handleJoinRoom}
        onSendMessage={handleSendMessage}
        onSendDm={handleSendDm}
        onCreateRoom={handleCreateRoom}
        onRoomRename={handleRoomRename}
      />

      {/* Room creation modal */}
      {creationPoint && (
        <RoomCreationModal
          participants={state.participants}
          myId={auth.myId}
          onConfirm={handleCreateRoomConfirm}
          onCancel={() => setCreationPoint(null)}
        />
      )}
    </div>
  );
}
