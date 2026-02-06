'use client';

import { useState, useEffect, useMemo } from 'react';
import type { ClientParticipant } from '@/hooks/useMeshState';

interface ParticipantListProps {
  participants: ClientParticipant[];
  allParticipants: ClientParticipant[];
  myId: string;
  token: string;
  serverUrl: string;
  roomMembers?: Record<string, string[]>;
  activeRoom?: string | null;
  onParticipantsChanged?: () => void;
}

interface TreeNode {
  participant: ClientParticipant;
  children: TreeNode[];
}

function buildTree(participants: ClientParticipant[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  for (const p of participants) {
    map.set(p.id, { participant: p, children: [] });
  }
  const roots: TreeNode[] = [];
  for (const p of participants) {
    const node = map.get(p.id)!;
    if (p.parentId && map.has(p.parentId)) {
      map.get(p.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function TreeNodeRow({
  node,
  depth,
  myId,
  token,
  serverUrl,
  collapsed,
  onToggle,
  allParticipants,
  onParticipantsChanged,
}: {
  node: TreeNode;
  depth: number;
  myId: string;
  token: string;
  serverUrl: string;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  allParticipants: ClientParticipant[];
  onParticipantsChanged?: () => void;
}) {
  const p = node.participant;
  const isDirectChild = p.parentId === myId;
  const [perm, setPerm] = useState<string>(p.permission);
  const [showReparent, setShowReparent] = useState(false);
  const hasChildren = node.children.length > 0;
  const isCollapsed = collapsed.has(p.id);

  useEffect(() => {
    setPerm(p.permission);
  }, [p.permission]);

  const base = serverUrl;

  const changePerm = async (newPerm: string) => {
    const res = await fetch(base ? `${base}/api/participants/${p.id}/permissions` : `/api/participants/${p.id}/permissions`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ permission: newPerm }),
    });
    if (res.ok) setPerm(newPerm);
  };

  const handleDelete = async () => {
    const res = await fetch(base ? `${base}/api/participants/${p.id}` : `/api/participants/${p.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) onParticipantsChanged?.();
  };

  const handleReparent = async (newParentId: string) => {
    const res = await fetch(base ? `${base}/api/participants/${p.id}/parent` : `/api/participants/${p.id}/parent`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ parentId: newParentId }),
    });
    if (res.ok) {
      setShowReparent(false);
      onParticipantsChanged?.();
    }
  };

  // Eligible reparent targets: any participant that isn't the agent itself or its descendants
  const eligibleParents = useMemo(() => {
    if (!isDirectChild) return [];
    const descendantIds = new Set<string>();
    function collectDescendants(id: string) {
      for (const ap of allParticipants) {
        if (ap.parentId === id) {
          descendantIds.add(ap.id);
          collectDescendants(ap.id);
        }
      }
    }
    collectDescendants(p.id);
    return allParticipants.filter(ap => ap.id !== p.id && !descendantIds.has(ap.id));
  }, [isDirectChild, allParticipants, p.id]);

  const permColors: Record<string, string> = {
    public: 'text-green-400',
    'dm-only': 'text-yellow-400',
    silent: 'text-red-400',
  };

  return (
    <div>
      <div
        className="flex items-center gap-1.5 px-2 py-1 text-sm hover:bg-white/5 rounded transition-colors group"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {hasChildren ? (
          <button
            onClick={() => onToggle(p.id)}
            className="text-white/30 hover:text-white/60 text-xs w-4 flex-shrink-0 transition-colors"
          >
            {isCollapsed ? '\u25B8' : '\u25BE'}
          </button>
        ) : (
          <span className="w-4 flex-shrink-0" />
        )}
        <span
          className={`w-2 h-2 rounded-full flex-shrink-0 ${
            p.online ? 'bg-green-400' : 'bg-white/20'
          }`}
        />
        <span className={p.type === 'agent' ? 'text-[#ff00ff]' : 'text-[#00f0ff]'}>
          {p.name}
        </span>
        <span className="text-[10px] text-white/40">
          ({p.role || p.type})
        </span>
        {p.type === 'agent' && isDirectChild ? (
          <select
            value={perm}
            onChange={e => changePerm(e.target.value)}
            className={`text-[10px] bg-transparent border border-white/10 rounded px-1 cursor-pointer ${
              permColors[perm] || ''
            }`}
          >
            <option value="public">public</option>
            <option value="dm-only">dm-only</option>
            <option value="silent">silent</option>
          </select>
        ) : p.type === 'agent' ? (
          <span className={`text-[10px] ${permColors[perm] || 'text-white/30'}`}>
            [{perm}]
          </span>
        ) : null}
        {/* Reparent + Delete buttons for owned agents */}
        {p.type === 'agent' && isDirectChild && (
          <div className="flex items-center gap-0.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => setShowReparent(!showReparent)}
              className="text-[10px] text-white/30 hover:text-[#00f0ff] transition-colors px-0.5"
              title="Reparent"
            >
              \u2934
            </button>
            <button
              onClick={handleDelete}
              className="text-[10px] text-white/30 hover:text-red-400 transition-colors px-0.5"
              title="Delete"
            >
              \u2715
            </button>
          </div>
        )}
      </div>
      {/* Reparent dropdown */}
      {showReparent && isDirectChild && (
        <div
          className="mx-2 mb-1 p-2 rounded bg-black/80 border border-[#00f0ff]/20"
          style={{ marginLeft: `${depth * 16 + 24}px` }}
        >
          <div className="text-[10px] text-white/40 mb-1">Transfer to:</div>
          <div className="max-h-32 overflow-y-auto space-y-0.5">
            {eligibleParents.map(ep => (
              <button
                key={ep.id}
                onClick={() => handleReparent(ep.id)}
                className="block w-full text-left text-xs px-2 py-1 rounded hover:bg-white/10 text-white/70 transition-colors"
              >
                <span className={ep.type === 'agent' ? 'text-[#ff00ff]' : 'text-[#00f0ff]'}>
                  {ep.name}
                </span>
                <span className="text-white/30 ml-1">({ep.type})</span>
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowReparent(false)}
            className="mt-1 text-[10px] text-white/30 hover:text-white/50"
          >
            Cancel
          </button>
        </div>
      )}
      {!isCollapsed && node.children.map(child => (
        <TreeNodeRow
          key={child.participant.id}
          node={child}
          depth={depth + 1}
          myId={myId}
          token={token}
          serverUrl={serverUrl}
          collapsed={collapsed}
          onToggle={onToggle}
          allParticipants={allParticipants}
          onParticipantsChanged={onParticipantsChanged}
        />
      ))}
    </div>
  );
}

export function ParticipantList({ participants, allParticipants, myId, token, serverUrl, roomMembers, activeRoom, onParticipantsChanged }: ParticipantListProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Filter to active room members if provided
  const filtered = useMemo(() => {
    if (roomMembers && activeRoom && roomMembers[activeRoom]) {
      const memberIds = new Set(roomMembers[activeRoom]);
      return participants.filter(p => memberIds.has(p.id));
    }
    return participants;
  }, [participants, roomMembers, activeRoom]);

  const tree = useMemo(() => buildTree(filtered), [filtered]);
  const onlineCount = filtered.filter(p => p.online).length;

  const handleToggle = (id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="py-2">
      <div className="px-3 mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">
          Participants
        </span>
        <span className="text-[10px] text-[#00f0ff]/70">{onlineCount} online</span>
      </div>
      {tree.map(node => (
        <TreeNodeRow
          key={node.participant.id}
          node={node}
          depth={0}
          myId={myId}
          token={token}
          serverUrl={serverUrl}
          collapsed={collapsed}
          onToggle={handleToggle}
          allParticipants={allParticipants}
          onParticipantsChanged={onParticipantsChanged}
        />
      ))}
    </div>
  );
}
