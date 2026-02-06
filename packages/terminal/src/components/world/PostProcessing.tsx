'use client';

import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';

export function PostProcessing() {
  return (
    <EffectComposer>
      <Bloom
        intensity={1.5}
        luminanceThreshold={0.1}
        luminanceSmoothing={0.9}
        mipmapBlur
        radius={0.8}
      />
      <Vignette offset={0.3} darkness={0.7} />
    </EffectComposer>
  );
}
