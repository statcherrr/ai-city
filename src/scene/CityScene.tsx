/**
 * The 3D view. The canvas fills the viewport and the dashboard is layered over
 * it, so this file owns nothing but the scene graph and the frame hook that
 * drives the simulation.
 */

import { useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PALETTE } from '@/data/cityConfig';
import { cityEngine } from '@/engine/engine';
import { CameraRig } from './CameraRig';
import { Effects } from './Effects';
import { Buildings, Ground, Landmarks, Parks, River, Roads, TransitLine, Windows } from './Geometry';
import { Overlays } from './Overlays';
import { Agents, TrafficLights } from './Traffic';
import { buildCityVisuals, createGroundTexture } from './cityVisuals';

/** Advances the simulation once per rendered frame. */
function SimulationDriver(): null {
  useFrame((_, delta) => {
    cityEngine.tick(delta);
  });
  return null;
}

function NightLights(): React.JSX.Element {
  return (
    <>
      <ambientLight intensity={0.22} color="#3a507a" />
      <hemisphereLight args={['#1a2742', '#03060a', 0.5]} />
      <directionalLight position={[-52, 120, 68]} intensity={0.5} color="#9fb8ff" />
      <directionalLight position={[52, 60, -44]} intensity={0.14} color="#ffb98a" />
    </>
  );
}

export function CityScene(): React.JSX.Element {
  const city = cityEngine.city;
  const visuals = useMemo(() => buildCityVisuals(city), [city]);
  const groundTexture = useMemo(() => createGroundTexture(city), [city]);

  return (
    <Canvas
      dpr={[1, 1.75]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ position: [118, 104, 118], fov: 36, near: 1, far: 900 }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 0.95;
      }}
    >
      <color attach="background" args={[PALETTE.background]} />
      <fog attach="fog" args={[PALETTE.fog, 95, 360]} />

      <NightLights />
      <Ground texture={groundTexture} />
      <River city={city} />
      <Roads city={city} />
      <Parks city={city} visuals={visuals} />
      <Buildings visuals={visuals} />
      <Windows visuals={visuals} />
      <Landmarks city={city} />
      <TransitLine city={city} />
      <Agents />
      <TrafficLights />
      <Overlays />

      <CameraRig />
      <Effects />
      <SimulationDriver />
    </Canvas>
  );
}
