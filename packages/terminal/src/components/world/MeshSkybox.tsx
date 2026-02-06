'use client';

import { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { MESH_THEME } from '@/lib/theme';

export function MeshSkybox() {
  const pointsRef = useRef<THREE.Points>(null);
  const { scene } = useThree();

  // Set scene background
  useMemo(() => {
    scene.background = new THREE.Color(MESH_THEME.void);
  }, [scene]);

  // Generate particle positions
  const { positions, speeds } = useMemo(() => {
    const count = 800;
    const pos = new Float32Array(count * 3);
    const spd = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      // Random position on a sphere shell, radius 80-400
      const r = 80 + Math.random() * 320;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
      spd[i] = 0.001 + Math.random() * 0.003;
    }
    return { positions: pos, speeds: spd };
  }, []);

  useFrame((_state, delta) => {
    if (!pointsRef.current) return;
    const pos = pointsRef.current.geometry.attributes.position;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < arr.length / 3; i++) {
      // Slow drift upward + slight rotation
      arr[i * 3 + 1] += speeds[i] * delta * 60;
      const angle = speeds[i] * delta * 0.5;
      const x = arr[i * 3];
      const z = arr[i * 3 + 2];
      arr[i * 3] = x * Math.cos(angle) - z * Math.sin(angle);
      arr[i * 3 + 2] = x * Math.sin(angle) + z * Math.cos(angle);
      // Reset if drifted too far up
      if (arr[i * 3 + 1] > 400) arr[i * 3 + 1] = -400;
    }
    pos.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
          count={positions.length / 3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.15}
        color={MESH_THEME.cyan}
        transparent
        opacity={0.3}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}
