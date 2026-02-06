'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Line } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { MESH_THEME } from '@/lib/theme';
import type { ClientParticipant, ClientRoom, ClientMessage } from '@/hooks/useMeshState';
import { MeshGrid } from './MeshGrid';
import { MeshSkybox } from './MeshSkybox';
import { MeshRoom } from './MeshRoom';
import { MeshAvatar } from './MeshAvatar';
import { MessageParticle } from './MessageParticle';
import { PostProcessing } from './PostProcessing';

interface MeshWorldProps {
  participants: ClientParticipant[];
  rooms: ClientRoom[];
  activeRoom: string | null;
  messages: ClientMessage[];
  myId: string;
  roomMembers: Record<string, string[]>;
  activeRooms: Record<string, string>;
  roomPositionOverrides?: Record<string, [number, number]>;
  onRoomClick?: (roomId: string) => void;
  onGroundClick?: (position: [number, number, number]) => void;
}

interface ParticleBurst {
  id: string;
  position: [number, number, number];
  color: string;
}

interface AvatarPlacement {
  participant: ClientParticipant;
  position: [number, number, number];
  roomPosition: [number, number, number];
  isGhost: boolean;
}

/** Smoothly animates camera to a target position when cameraTarget changes */
function CameraController({
  target,
  controlsRef,
}: {
  target: [number, number, number] | null;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}) {
  const { camera } = useThree();
  const goalTarget = useRef<THREE.Vector3 | null>(null);
  const goalPosition = useRef<THREE.Vector3 | null>(null);
  const animating = useRef(false);

  useEffect(() => {
    if (!target) return;
    const offset = new THREE.Vector3(0, 8, 12);
    goalTarget.current = new THREE.Vector3(...target);
    goalPosition.current = new THREE.Vector3(...target).add(offset);
    animating.current = true;
    if (controlsRef.current) {
      controlsRef.current.autoRotate = false;
    }
  }, [target, controlsRef]);

  useFrame(() => {
    if (!animating.current || !goalTarget.current || !goalPosition.current) return;
    const controls = controlsRef.current;
    if (!controls) return;

    const factor = 0.05;
    controls.target.lerp(goalTarget.current, factor);
    camera.position.lerp(goalPosition.current, factor);

    const targetDist = controls.target.distanceTo(goalTarget.current);
    const posDist = camera.position.distanceTo(goalPosition.current);

    if (targetDist < 0.05 && posDist < 0.05) {
      controls.target.copy(goalTarget.current);
      camera.position.copy(goalPosition.current);
      animating.current = false;
      controls.autoRotate = true;
    }
  });

  return null;
}

/** RTS-style keyboard controls: WASD pan + ]/[/+/- zoom */
function KeyboardControls({
  controlsRef,
}: {
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}) {
  const { camera } = useThree();
  const pressed = useRef<Set<string>>(new Set());
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      pressed.current.add(e.key.toLowerCase());
    };
    const onUp = (e: KeyboardEvent) => {
      pressed.current.delete(e.key.toLowerCase());
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, []);

  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    const keys = pressed.current;

    // --- WASD pan ---
    const forward = keys.has('w');
    const backward = keys.has('s');
    const left = keys.has('a');
    const right = keys.has('d');
    const panning = forward || backward || left || right;

    if (panning) {
      // Disable autoRotate while panning, schedule re-enable
      controls.autoRotate = false;
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => {
        if (controls) controls.autoRotate = true;
      }, 3000);

      const panSpeed = 0.4;
      // Forward direction projected onto XZ plane
      const fwd = new THREE.Vector3()
        .subVectors(controls.target, camera.position)
        .setY(0)
        .normalize();
      // Right (strafe) direction
      const strafe = new THREE.Vector3().crossVectors(fwd, camera.up).normalize();

      const delta = new THREE.Vector3();
      if (forward) delta.add(fwd);
      if (backward) delta.sub(fwd);
      if (right) delta.add(strafe);
      if (left) delta.sub(strafe);
      delta.normalize().multiplyScalar(panSpeed);

      camera.position.add(delta);
      controls.target.add(delta);
    }

    // --- Zoom ---
    const zoomIn = keys.has(']') || keys.has('=') || keys.has('+');
    const zoomOut = keys.has('[') || keys.has('-');
    if (!zoomIn && !zoomOut) return;

    const direction = new THREE.Vector3()
      .subVectors(controls.target, camera.position)
      .normalize();
    const speed = 0.3;
    const dist = camera.position.distanceTo(controls.target);

    if (zoomIn && dist > controls.minDistance) {
      camera.position.addScaledVector(direction, speed);
    }
    if (zoomOut && dist < controls.maxDistance) {
      camera.position.addScaledVector(direction, -speed);
    }
  });

  return null;
}

export function MeshWorld({
  participants,
  rooms,
  activeRoom,
  messages,
  myId,
  roomMembers,
  activeRooms,
  roomPositionOverrides,
  onRoomClick,
  onGroundClick,
}: MeshWorldProps) {
  const [bursts, setBursts] = useState<ParticleBurst[]>([]);
  const [cameraTarget, setCameraTarget] = useState<[number, number, number] | null>(null);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  // Arrange rooms: use server position if available, fallback to circle layout
  const roomPositions = useMemo(() => {
    if (rooms.length === 0) return [];
    const radius = 12;
    return rooms.map((room, i): [number, number, number] => {
      const override = roomPositionOverrides?.[room.id];
      if (override) return [override[0], 0, override[1]];
      const angle = (i / rooms.length) * Math.PI * 2;
      return [
        Math.cos(angle) * radius,
        0,
        Math.sin(angle) * radius,
      ];
    });
  }, [rooms, roomPositionOverrides]);

  // Build a lookup: roomId -> position
  const roomPosMap = useMemo(() => {
    const map: Record<string, [number, number, number]> = {};
    rooms.forEach((r, i) => {
      if (roomPositions[i]) map[r.id] = roomPositions[i];
    });
    return map;
  }, [rooms, roomPositions]);

  // Compute avatar placements based on room membership
  const avatarPlacements = useMemo(() => {
    const placements: AvatarPlacement[] = [];
    const participantMap = new Map(participants.map(p => [p.id, p]));

    // Find each participant's "primary" room:
    // - Local user: use the activeRoom prop (the room they switched to)
    // - Others: use activeRooms tracking (from participant_online events), fallback to first room
    const primaryRoom = new Map<string, string>();
    for (const [roomId, memberIds] of Object.entries(roomMembers)) {
      for (const memberId of memberIds) {
        if (!primaryRoom.has(memberId)) {
          if (memberId === myId) {
            // Local user: primary room is whichever room they actively selected
            if (activeRoom) primaryRoom.set(memberId, activeRoom);
            else primaryRoom.set(memberId, roomId);
          } else if (activeRooms[memberId]) {
            // Remote participant: use tracked active room
            primaryRoom.set(memberId, activeRooms[memberId]);
          } else {
            // Fallback: first room encountered
            primaryRoom.set(memberId, roomId);
          }
        }
      }
    }

    // For each room, position its members around the room platform
    for (const [roomId, memberIds] of Object.entries(roomMembers)) {
      const roomPos = roomPosMap[roomId];
      if (!roomPos) continue;

      memberIds.forEach((memberId, i) => {
        const p = participantMap.get(memberId);
        if (!p) return;

        const angle = (i / memberIds.length) * Math.PI * 2;
        const orbitRadius = 2;
        const pos: [number, number, number] = [
          roomPos[0] + Math.cos(angle) * orbitRadius,
          1.5,
          roomPos[2] + Math.sin(angle) * orbitRadius,
        ];

        const isPrimary = primaryRoom.get(memberId) === roomId;
        placements.push({
          participant: p,
          position: pos,
          roomPosition: roomPos,
          isGhost: !isPrimary,
        });
      });
    }

    // Place participants not in any room at the origin
    for (const p of participants) {
      if (!primaryRoom.has(p.id)) {
        placements.push({
          participant: p,
          position: [0, 1.5, 0],
          roomPosition: [0, 0, 0],
          isGhost: false,
        });
      }
    }

    return placements;
  }, [participants, roomMembers, roomPosMap, myId, activeRoom, activeRooms]);

  // Spawn particle bursts on new messages
  useEffect(() => {
    if (messages.length === 0) return;
    const latest = messages[messages.length - 1];
    // Find avatar position for sender
    const senderPlacement = avatarPlacements.find(
      (a) => a.participant.id === latest.senderId && !a.isGhost
    );
    const pos: [number, number, number] = senderPlacement
      ? senderPlacement.position
      : [0, 1.5, 0];
    const sender = participants.find((p) => p.id === latest.senderId);
    const color = sender?.type === 'agent' ? MESH_THEME.magenta : MESH_THEME.cyan;

    const burst: ParticleBurst = { id: latest.id, position: pos, color };
    setBursts((prev) => [...prev.slice(-5), burst]);

    const timer = setTimeout(() => {
      setBursts((prev) => prev.filter((b) => b.id !== burst.id));
    }, 1500);
    return () => clearTimeout(timer);
  }, [messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRoomClick = (roomId: string, index: number) => {
    onRoomClick?.(roomId);
    if (roomPositions[index]) {
      setCameraTarget(roomPositions[index]);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 0 }}>
      <Canvas
        camera={{ position: [0, 15, 25], fov: 60, near: 0.1, far: 2000 }}
        gl={{ antialias: true, alpha: false }}
      >
        <ambientLight intensity={0.15} />
        <pointLight
          position={[10, 20, 10]}
          color={MESH_THEME.cyan}
          intensity={0.8}
          distance={0}
        />
        <pointLight
          position={[-10, 15, -10]}
          color={MESH_THEME.magenta}
          intensity={0.5}
          distance={0}
        />

        <fogExp2 attach="fog" color={MESH_THEME.void} density={0.004} />

        <OrbitControls
          ref={controlsRef}
          autoRotate
          autoRotateSpeed={0.3}
          enableDamping
          dampingFactor={0.05}
          minPolarAngle={Math.PI / 6}
          maxPolarAngle={Math.PI / 2.5}
          minDistance={3}
          maxDistance={1000}
          enablePan
          mouseButtons={{
            LEFT: THREE.MOUSE.ROTATE,
            MIDDLE: THREE.MOUSE.PAN,
            RIGHT: THREE.MOUSE.DOLLY,
          }}
        />

        <CameraController target={cameraTarget} controlsRef={controlsRef} />
        <KeyboardControls controlsRef={controlsRef} />

        <MeshGrid />
        <MeshSkybox />

        {rooms.map((room, i) => (
          <MeshRoom
            key={room.id}
            room={room}
            isActive={room.id === activeRoom}
            position={roomPositions[i]}
            memberCount={roomMembers[room.id]?.length || 0}
            onClick={() => handleRoomClick(room.id, i)}
          />
        ))}

        {avatarPlacements.map((a, i) => (
          <MeshAvatar
            key={`${a.participant.id}-${a.isGhost ? 'ghost' : 'primary'}-${i}`}
            participant={a.participant}
            position={a.position}
            isOnline={a.participant.online}
            isGhost={a.isGhost}
          />
        ))}

        {/* Connector lines from avatars to their room centers */}
        {avatarPlacements.map((a, i) => (
          <ConnectorLine
            key={`line-${i}`}
            from={a.position}
            to={[a.roomPosition[0], 0.2, a.roomPosition[2]]}
            color={a.isGhost ? MESH_THEME.gridDim : (a.participant.type === 'agent' ? MESH_THEME.magenta : MESH_THEME.cyan)}
            opacity={a.isGhost ? 0.15 : 0.3}
          />
        ))}

        {bursts.map((burst) => (
          <MessageParticle
            key={burst.id}
            position={burst.position}
            color={burst.color}
            active
          />
        ))}

        {/* Invisible ground plane for click-to-create */}
        {onGroundClick && (
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, -0.01, 0]}
            onClick={(e) => {
              e.stopPropagation();
              const p = e.point;
              onGroundClick([p.x, p.y, p.z]);
            }}
          >
            <planeGeometry args={[2000, 2000]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        )}

        <PostProcessing />
      </Canvas>
    </div>
  );
}

function ConnectorLine({
  from,
  to,
  color,
  opacity,
}: {
  from: [number, number, number];
  to: [number, number, number];
  color: string;
  opacity: number;
}) {
  return (
    <Line
      points={[from, to]}
      color={color}
      lineWidth={1}
      transparent
      opacity={opacity}
    />
  );
}
