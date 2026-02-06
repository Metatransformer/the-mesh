'use client';

import { useState, useRef, useCallback } from 'react';

export interface UseMeshAuth {
  token: string;
  myId: string;
  myName: string;
  serverUrl: string;
  setServerUrl: (url: string) => void;
  view: 'login' | 'register' | 'mesh';
  setView: (v: 'login' | 'register' | 'mesh') => void;
  register: (name: string, type: 'user' | 'agent') => Promise<string | null>;
  login: (token: string) => void;
  logout: () => void;
  onAuthSuccess: (token: string, id: string, name: string) => void;
  tokenRef: React.RefObject<string>;
  serverUrlRef: React.RefObject<string>;
}

export function useMeshAuth(): UseMeshAuth {
  const [view, setView] = useState<'login' | 'register' | 'mesh'>('register');
  const [token, setToken] = useState('');
  const [myId, setMyId] = useState('');
  const [myName, setMyName] = useState('');
  const [serverUrl, _setServerUrl] = useState('');
  const tokenRef = useRef<string>('');
  const serverUrlRef = useRef<string>('');

  const setServerUrl = useCallback((url: string) => {
    _setServerUrl(url);
    serverUrlRef.current = url;
  }, []);

  const saveSession = useCallback((t: string, id: string, name: string, activeRoom?: string | null, sUrl?: string) => {
    localStorage.setItem('mesh-session', JSON.stringify({ token: t, id, name, activeRoom: activeRoom ?? null, serverUrl: sUrl ?? serverUrlRef.current }));
  }, []);

  const onAuthSuccess = useCallback((t: string, id: string, name: string) => {
    setToken(t);
    setMyId(id);
    setMyName(name);
    tokenRef.current = t;
    setView('mesh');
    saveSession(t, id, name);
  }, [saveSession]);

  const register = useCallback(async (name: string, type: 'user' | 'agent'): Promise<string | null> => {
    const base = serverUrlRef.current;
    const url = base ? `${base}/api/auth/register` : '/api/auth/register';
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, type }),
    });
    const data = await res.json();
    if (data.token) {
      setToken(data.token);
      setMyId(data.id || '');
      setMyName(data.name || name);
      tokenRef.current = data.token;
      saveSession(data.token, data.id || '', data.name || name);
      return data.token;
    }
    return null;
  }, [saveSession]);

  const login = useCallback((t: string) => {
    setToken(t);
    tokenRef.current = t;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('mesh-session');
    setToken('');
    setMyId('');
    setMyName('');
    _setServerUrl('');
    tokenRef.current = '';
    serverUrlRef.current = '';
    setView('register');
  }, []);

  return {
    token,
    myId,
    myName,
    serverUrl,
    setServerUrl,
    view,
    setView,
    register,
    login,
    logout,
    onAuthSuccess,
    tokenRef,
    serverUrlRef,
  };
}
