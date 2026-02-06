'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface MessageParticleProps {
  position: [number, number, number];
  color: string;
  active: boolean;
}

export function MessageParticle({ position, color, active }: MessageParticleProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const startTime = useRef(0);
  const hasStarted = useRef(false);

  const { positions, velocities } = useMemo(() => {
    const count = 30;
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = 0;
      pos[i * 3 + 1] = 0;
      pos[i * 3 + 2] = 0;
      // Random burst direction
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = 1 + Math.random() * 3;
      vel[i * 3] = speed * Math.sin(phi) * Math.cos(theta);
      vel[i * 3 + 1] = speed * Math.sin(phi) * Math.sin(theta);
      vel[i * 3 + 2] = speed * Math.cos(phi);
    }
    return { positions: pos, velocities: vel };
  }, []);

  useFrame((state) => {
    if (!pointsRef.current || !active) return;

    if (!hasStarted.current) {
      hasStarted.current = true;
      startTime.current = state.clock.elapsedTime;
      // Reset positions
      const pos = pointsRef.current.geometry.attributes.position;
      const arr = pos.array as Float32Array;
      for (let i = 0; i < arr.length; i++) arr[i] = 0;
      pos.needsUpdate = true;
    }

    const elapsed = state.clock.elapsedTime - startTime.current;
    const duration = 1.0;

    if (elapsed > duration) {
      pointsRef.current.visible = false;
      return;
    }

    pointsRef.current.visible = true;
    const progress = elapsed / duration;

    // Update positions based on velocities
    const pos = pointsRef.current.geometry.attributes.position;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < arr.length / 3; i++) {
      arr[i * 3] = velocities[i * 3] * elapsed;
      arr[i * 3 + 1] = velocities[i * 3 + 1] * elapsed;
      arr[i * 3 + 2] = velocities[i * 3 + 2] * elapsed;
    }
    pos.needsUpdate = true;

    // Fade out
    const mat = pointsRef.current.material as THREE.PointsMaterial;
    mat.opacity = 1 - progress;
    mat.size = 0.1 + progress * 0.3;
  });

  if (!active) return null;

  return (
    <points ref={pointsRef} position={position}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
          count={positions.length / 3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.1}
        color={color}
        transparent
        opacity={1}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}
