'use client';

import { useRef, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { MESH_THEME } from '@/lib/theme';
import type { ClientRoom } from '@/hooks/useMeshState';

function hashId(id: string): number {
  return id.split('').reduce((h, c) => h * 31 + c.charCodeAt(0), 0) >>> 0;
}

interface MeshRoomProps {
  room: ClientRoom;
  isActive: boolean;
  position: [number, number, number];
  memberCount: number;
  onClick?: () => void;
}

export function MeshRoom({ room, isActive, position, memberCount, onClick }: MeshRoomProps) {
  const groupRef = useRef<THREE.Group>(null);
  const edgesRef = useRef<THREE.LineSegments>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  const seed = useMemo(() => hashId(room.id), [room.id]);
  const sides = 4 + (seed % 5);
  const radius = 2.4 + (seed % 4) * 0.4;
  const roomHue = useMemo(() => (seed * 137.5) % 360, [seed]);
  const roomColor = `hsl(${roomHue}, 70%, 50%)`;

  const geometry = useMemo(() => new THREE.CylinderGeometry(radius, radius, 0.2, sides), [radius, sides]);
  const edges = useMemo(() => new THREE.EdgesGeometry(geometry), [geometry]);

  const glowActive = isActive || hovered;

  const typePrefix = room.federated ? '\u{1F310} ' : room.isPrivate ? '\u{1F512} ' : '# ';

  useFrame((_state) => {
    if (!edgesRef.current) return;
    if (glowActive) {
      const mat = edgesRef.current.material as THREE.LineBasicMaterial;
      mat.opacity = 0.6 + Math.sin(Date.now() * 0.003) * 0.4;
    }
    // Pulse ring for active room
    if (ringRef.current && isActive) {
      const scale = 1 + Math.sin(Date.now() * 0.004) * 0.08;
      ringRef.current.scale.set(scale, 1, scale);
      (ringRef.current.material as THREE.MeshBasicMaterial).opacity =
        0.3 + Math.sin(Date.now() * 0.003) * 0.2;
    }
  });

  return (
    <group ref={groupRef} position={position}>
      <mesh
        geometry={geometry}
        onClick={(e) => { e.stopPropagation(); onClick?.(); }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = 'auto'; }}
      >
        <meshStandardMaterial
          color={glowActive ? roomColor : MESH_THEME.surface}
          emissive={glowActive ? roomColor : MESH_THEME.gridDim}
          emissiveIntensity={isActive ? 0.5 : hovered ? 0.35 : 0.1}
          transparent
          opacity={glowActive ? 0.6 : 0.3}
        />
      </mesh>

      <lineSegments ref={edgesRef} geometry={edges}>
        <lineBasicMaterial
          color={glowActive ? roomColor : MESH_THEME.gridDim}
          transparent
          opacity={glowActive ? 1 : 0.5}
        />
      </lineSegments>

      {/* Active room pulse ring */}
      {isActive && (
        <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.15, 0]}>
          <ringGeometry args={[radius + 0.2, radius + 0.6, sides]} />
          <meshBasicMaterial color={roomColor} transparent opacity={0.3} side={THREE.DoubleSide} />
        </mesh>
      )}

      <Html
        position={[0, 1.5, 0]}
        center
        distanceFactor={15}
        style={{ pointerEvents: 'none' }}
      >
        <div
          style={{
            color: glowActive ? roomColor : MESH_THEME.text,
            fontSize: '16px',
            fontFamily: 'monospace',
            fontWeight: 'bold',
            textShadow: glowActive
              ? `0 0 10px ${roomColor}, 0 0 20px ${roomColor}`
              : 'none',
            whiteSpace: 'nowrap',
            userSelect: 'none',
            textAlign: 'center',
          }}
        >
          <span style={{ fontSize: '12px', opacity: 0.8 }}>{typePrefix}</span>
          {room.name}
          {memberCount > 0 && (
            <span
              style={{
                display: 'inline-block',
                marginLeft: '6px',
                background: `hsla(${roomHue}, 70%, 50%, 0.19)`,
                border: `1px solid hsla(${roomHue}, 70%, 50%, 0.38)`,
                borderRadius: '8px',
                padding: '0 6px',
                fontSize: '11px',
                color: roomColor,
              }}
            >
              {memberCount}
            </span>
          )}
        </div>
      </Html>
    </group>
  );
}
