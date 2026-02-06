'use client';

import { useRef, useCallback, useEffect } from 'react';
import type { ClientMessage, ClientRoom, RemoteParticipant, UseMeshState } from './useMeshState';
import type { UseMeshAuth } from './useMeshAuth';

export interface UseMeshWebSocket {
  ws: React.RefObject<WebSocket | null>;
  connected: boolean;
  connect: (token: string) => void;
  sendMessage: (roomId: string, content: string, token: string) => void;
  sendDm: (recipientId: string, roomId: string, content: string) => void;
  joinRoom: (roomId: string) => void;
  toggleFederation: (roomId: string, federated: boolean) => void;
}

interface UseMeshWebSocketOptions {
  auth: UseMeshAuth;
  state: UseMeshState;
}

export function useMeshWebSocket({ auth, state }: UseMeshWebSocketOptions): UseMeshWebSocket {
  const ws = useRef<WebSocket | null>(null);
  const wsConnected = useRef(false);
  const pollInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable refs to avoid stale closures in WS callbacks
  const authRef = useRef(auth);
  authRef.current = auth;
  const stateRef = useRef(state);
  stateRef.current = state;

  const stopPolling = useCallback(() => {
    if (pollInterval.current) {
      clearInterval(pollInterval.current);
      pollInterval.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    pollInterval.current = setInterval(async () => {
      const room = stateRef.current.activeRoomRef.current;
      const t = authRef.current.tokenRef.current;
      if (!room || !t) return;
      try {
        const base = authRef.current.serverUrlRef.current;
        const msgUrl = base ? `${base}/api/rooms/${room}/messages` : `/api/rooms/${room}/messages`;
        const res = await fetch(msgUrl, { headers: { Authorization: `Bearer ${t}` } });
        if (res.ok) {
          const msgs: ClientMessage[] = await res.json();
          stateRef.current.setMessages(msgs);
        }
      } catch {}
    }, 2000);
  }, [stopPolling]);

  const connect = useCallback((t: string) => {
    if (ws.current && ws.current.readyState <= 1) return;
    let wsUrl: string;
    const sUrl = authRef.current.serverUrlRef.current;
    if (sUrl) {
      // Derive WS URL from server URL: http→ws, https→wss
      wsUrl = sUrl.replace(/^http/, 'ws') + '/api/ws';
    } else {
      const envWs = process.env.NEXT_PUBLIC_INTERCHANGE_WS;
      if (envWs) {
        wsUrl = `${envWs}/api/ws`;
      } else {
        const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
        wsUrl = `${proto}://${window.location.host}/api/ws`;
      }
    }
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      socket.send(JSON.stringify({ type: 'auth', token: t }));
    };

    socket.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      const currentAuth = authRef.current;
      const currentState = stateRef.current;

      if (msg.type === 'auth_ok') {
        wsConnected.current = true;
        stopPolling();
        currentAuth.onAuthSuccess(t, msg.participant.id, msg.participant.name);
        currentState.fetchRooms(t);
        currentState.fetchParticipants();
        currentState.fetchRemoteParticipants();
        currentState.fetchRoomMembers(t);
        currentState.checkFederationStatus();
        if (currentState.activeRoomRef.current) {
          socket.send(JSON.stringify({ type: 'join_room', roomId: currentState.activeRoomRef.current }));
          currentState.fetchMessages(currentState.activeRoomRef.current, t);
        }
      } else if (msg.type === 'auth_error') {
        localStorage.removeItem('mesh-session');
        currentAuth.setView('register');
      } else if (msg.type === 'new_message') {
        currentState.setMessages((prev: ClientMessage[]) => [...prev, msg.message]);
      } else if (msg.type === 'room_joined') {
        currentState.fetchMessages(msg.roomId, t);
      } else if (msg.type === 'participant_online' || msg.type === 'participant_offline') {
        currentState.fetchParticipants();
        if (msg.type === 'participant_online' && msg.roomId && msg.participantId) {
          currentState.setActiveRooms(prev => ({ ...prev, [msg.participantId]: msg.roomId }));
        }
      } else if (msg.type === 'remote_participants') {
        currentState.setRemoteParticipants(msg.participants as RemoteParticipant[] || []);
      } else if (msg.type === 'room_members') {
        currentState.setRoomMembers(msg.members as Record<string, string[]>);
      } else if (msg.type === 'federation_status') {
        currentState.setRooms((prev: ClientRoom[]) =>
          prev.map(r => r.id === msg.roomId ? { ...r, federated: msg.federated as boolean } : r)
        );
      }
    };

    socket.onclose = () => {
      wsConnected.current = false;
      ws.current = null;
      const currentToken = authRef.current.tokenRef.current;
      if (currentToken) {
        startPolling();
        reconnectTimeout.current = setTimeout(() => {
          if (authRef.current.tokenRef.current) {
            connect(authRef.current.tokenRef.current);
          }
        }, 3000);
      }
    };

    socket.onerror = () => {
      socket.close();
    };

    ws.current = socket;
  }, [startPolling, stopPolling]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      ws.current?.close();
      stopPolling();
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
    };
  }, [stopPolling]);

  const sendMessage = useCallback((roomId: string, content: string, token: string) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'message', roomId, content }));
    } else {
      // HTTP fallback when WebSocket is not connected
      const base = authRef.current.serverUrlRef.current;
      const fallbackUrl = base ? `${base}/api/rooms/${roomId}/messages` : `/api/rooms/${roomId}/messages`;
      fetch(fallbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content }),
      }).catch(() => {});
    }
  }, []);

  const sendDm = useCallback((recipientId: string, roomId: string, content: string) => {
    ws.current?.send(JSON.stringify({ type: 'dm', recipientId, roomId, content }));
  }, []);

  const joinRoom = useCallback((roomId: string) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'join_room', roomId }));
    }
  }, []);

  const toggleFederation = useCallback((roomId: string, federated: boolean) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'federate_room', roomId, federated }));
    }
  }, []);

  return {
    ws,
    connected: wsConnected.current,
    connect,
    sendMessage,
    sendDm,
    joinRoom,
    toggleFederation,
  };
}
