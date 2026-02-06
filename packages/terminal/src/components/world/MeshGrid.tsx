'use client';

import { Grid } from '@react-three/drei';
import { MESH_THEME } from '@/lib/theme';

export function MeshGrid() {
  return (
    <Grid
      position={[0, 0, 0]}
      args={[100, 100]}
      cellSize={1}
      cellThickness={0.5}
      cellColor={MESH_THEME.gridDim}
      sectionSize={10}
      sectionThickness={1.5}
      sectionColor={MESH_THEME.cyan}
      fadeDistance={200}
      fadeStrength={1.0}
      infiniteGrid
    />
  );
}
