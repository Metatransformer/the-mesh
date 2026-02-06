'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { MESH_THEME } from '@/lib/theme';
import type { ClientParticipant } from '@/hooks/useMeshState';

function hashId(id: string): number {
  return id.split('').reduce((h, c) => h * 31 + c.charCodeAt(0), 0) >>> 0;
}

type GeometryElement = 'octahedronGeometry' | 'dodecahedronGeometry' | 'boxGeometry' | 'sphereGeometry'
  | 'icosahedronGeometry' | 'tetrahedronGeometry' | 'coneGeometry' | 'torusKnotGeometry';

const HUMAN_GEOMETRIES: GeometryElement[] = ['octahedronGeometry', 'dodecahedronGeometry', 'boxGeometry', 'sphereGeometry'];
const AGENT_GEOMETRIES: GeometryElement[] = ['icosahedronGeometry', 'tetrahedronGeometry', 'coneGeometry', 'torusKnotGeometry'];

function GeometryJSX({ type, size }: { type: GeometryElement; size: number }) {
  switch (type) {
    case 'octahedronGeometry': return <octahedronGeometry args={[size, 0]} />;
    case 'dodecahedronGeometry': return <dodecahedronGeometry args={[size, 0]} />;
    case 'boxGeometry': return <boxGeometry args={[size * 1.4, size * 1.4, size * 1.4]} />;
    case 'sphereGeometry': return <sphereGeometry args={[size, 16, 16]} />;
    case 'icosahedronGeometry': return <icosahedronGeometry args={[size, 0]} />;
    case 'tetrahedronGeometry': return <tetrahedronGeometry args={[size, 0]} />;
    case 'coneGeometry': return <coneGeometry args={[size, size * 2, 8]} />;
    case 'torusKnotGeometry': return <torusKnotGeometry args={[size * 0.6, size * 0.2, 64, 8]} />;
  }
}

interface MeshAvatarProps {
  participant: ClientParticipant;
  position: [number, number, number];
  isOnline: boolean;
  isGhost?: boolean;
}

export function MeshAvatar({ participant, position, isOnline, isGhost = false }: MeshAvatarProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const wireRef = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  const initialY = position[1];

  const seed = useMemo(() => hashId(participant.id), [participant.id]);
  const isAgent = participant.type === 'agent';
  const geoType = isAgent
    ? AGENT_GEOMETRIES[seed % 4]
    : HUMAN_GEOMETRIES[seed % 4];
  const size = 0.4 + (seed % 3) * 0.1;
  const color = useMemo(() => {
    const hue = isAgent ? 280 + (seed % 60) : 150 + (seed % 60);
    return `hsl(${hue}, 80%, 60%)`;
  }, [seed, isAgent]);

  // Lerp group position toward target for smooth transitions
  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.position.x += (position[0] - groupRef.current.position.x) * 0.05;
      groupRef.current.position.z += (position[2] - groupRef.current.position.z) * 0.05;
    }
    if (!meshRef.current || !wireRef.current) return;
    const y = initialY + Math.sin(state.clock.elapsedTime * 1.5 + position[0]) * 0.3;
    meshRef.current.position.y = y;
    wireRef.current.position.y = y;
    meshRef.current.rotation.y += 0.005;
    wireRef.current.rotation.y += 0.005;
  });

  const ghostMult = isGhost ? 0.35 : 1;
  const solidOpacity = (isOnline ? 0.8 : 0.25) * ghostMult;
  const wireOpacity = (isOnline ? 0.6 : 0.15) * (isGhost ? 0.5 : 1);
  const emissiveIntensity = (isOnline ? 0.5 : 0.1) * ghostMult;

  return (
    <group ref={groupRef} position={[position[0], 0, position[2]]}>
      {/* Solid mesh — hidden for ghosts */}
      {!isGhost && (
        <mesh ref={meshRef} position={[0, initialY, 0]}>
          <GeometryJSX type={geoType} size={size} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={emissiveIntensity}
            transparent
            opacity={solidOpacity}
          />
        </mesh>
      )}

      <mesh ref={isGhost ? meshRef : wireRef} position={[0, initialY, 0]}>
        <GeometryJSX type={geoType} size={size + 0.05} />
        <meshBasicMaterial
          color={color}
          wireframe
          transparent
          opacity={wireOpacity}
        />
      </mesh>

      {/* Second wireRef for non-ghost so both refs exist */}
      {isGhost && <mesh ref={wireRef} visible={false} />}

      <Html
        position={[0, initialY + 1, 0]}
        center
        distanceFactor={15}
        style={{ pointerEvents: 'none' }}
      >
        <div
          style={{
            color: isOnline ? color : MESH_THEME.text,
            fontSize: '12px',
            fontFamily: 'monospace',
            opacity: (isOnline ? 1 : 0.4) * ghostMult,
            textShadow: isOnline && !isGhost
              ? `0 0 8px ${color}`
              : 'none',
            whiteSpace: 'nowrap',
            userSelect: 'none',
          }}
        >
          {participant.name}
        </div>
      </Html>
    </group>
  );
}
