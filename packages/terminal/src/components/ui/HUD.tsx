'use client';

import { GlassPanel } from './GlassPanel';

interface HUDProps {
  roomName: string | null;
  onlineCount: number;
  myName: string;
  federationStatus: {
    connected: boolean;
    configured: boolean;
    meshName: string | null;
  };
  onLogout: () => void;
}

export function HUD({
  roomName,
  onlineCount,
  myName,
  federationStatus,
  onLogout,
}: HUDProps) {
  return (
    <div className="fixed top-0 left-0 right-0 z-50 pointer-events-none">
      <div className="flex items-start justify-between p-4">
        {/* Top-left: Room name + online count */}
        <GlassPanel className="pointer-events-auto px-5 py-3 flex items-center gap-3">
          {roomName ? (
            <>
              <span
                className="text-lg font-bold text-[#00f0ff] tracking-wide"
                style={{ textShadow: '0 0 10px #00f0ff, 0 0 30px #00f0ff40' }}
              >
                {roomName}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-white/50">
                <span className="w-2 h-2 rounded-full bg-green-400" />
                {onlineCount}
              </span>
            </>
          ) : (
            <span
              className="text-lg font-bold text-[#00f0ff]/60 tracking-wide"
              style={{ textShadow: '0 0 10px #00f0ff40' }}
            >
              The Mesh
            </span>
          )}
        </GlassPanel>

        {/* Top-right: User info + federation + logout */}
        <GlassPanel className="pointer-events-auto px-4 py-3 flex items-center gap-4">
          {/* Federation indicator */}
          {federationStatus.configured && (
            <div className="flex items-center gap-1.5 text-xs">
              <span
                className={`w-2 h-2 rounded-full ${
                  federationStatus.connected ? 'bg-green-400' : 'bg-yellow-400 animate-pulse'
                }`}
              />
              <span className="text-white/50">
                {federationStatus.meshName || 'Federation'}
              </span>
            </div>
          )}

          {/* User name */}
          <span className="text-sm text-[#e0e0ff] font-medium">{myName}</span>

          {/* Logout */}
          <button
            onClick={onLogout}
            className="text-xs text-white/30 hover:text-red-400 transition-colors font-mono"
            title="Logout"
          >
            [exit]
          </button>
        </GlassPanel>
      </div>
    </div>
  );
}
