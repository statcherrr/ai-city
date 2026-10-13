/**
 * Post-processing. Bloom is what turns the emissive windows, headlights and
 * signal heads into a neon night city, so its threshold sits just above the
 * unlit building colours and below the lights.
 */

import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';

export function Effects(): React.JSX.Element {
  return (
    <EffectComposer multisampling={4}>
      <Bloom intensity={1.1} luminanceThreshold={0.42} luminanceSmoothing={0.22} mipmapBlur radius={0.72} />
      <Vignette offset={0.3} darkness={0.7} eskil={false} />
    </EffectComposer>
  );
}
