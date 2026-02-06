export interface NpcPreset {
  type: string;
  role: string;
  description: string;
  defaultPermission: 'public' | 'dm-only' | 'silent';
  icon: string; // emoji
}

export const NPC_PRESETS: NpcPreset[] = [
  {
    type: 'Scout',
    role: 'scout',
    description: 'Explores rooms, reports activity',
    defaultPermission: 'public',
    icon: '🔍',
  },
  {
    type: 'Guard',
    role: 'guard',
    description: 'Monitors security and access',
    defaultPermission: 'public',
    icon: '🛡',
  },
  {
    type: 'Messenger',
    role: 'messenger',
    description: 'DM specialist, private comms',
    defaultPermission: 'dm-only',
    icon: '📨',
  },
  {
    type: 'Observer',
    role: 'observer',
    description: 'Silent watcher, logs only',
    defaultPermission: 'silent',
    icon: '👁',
  },
  {
    type: 'Specialist',
    role: 'specialist',
    description: 'General purpose, custom role',
    defaultPermission: 'dm-only',
    icon: '⚙',
  },
];
