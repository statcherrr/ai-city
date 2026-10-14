/**
 * Post-processing. Bloom is deliberately gated: the threshold sits above the
 * unlit building and road colours, so only the emissive lights bloom — windows,
 * incident markers, the response routes, signal heads and vehicle bars. The
 * rest of the city stays dark and quiet.
 */

import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';

export function Effects(): React.JSX.Element {
  return (
    <EffectComposer multisampling={4}>
      <Bloom intensity={0.85} luminanceThreshold={0.5} luminanceSmoothing={0.28} mipmapBlur radius={0.75} />
      <Vignette offset={0.34} darkness={0.78} eskil={false} />
    </EffectComposer>
  );
}
