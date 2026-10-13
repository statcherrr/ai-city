/**
 * Isometric-style orbit camera. Angles are clamped so the city can never be
 * viewed from ground level or from underneath, and incident fly-to is an
 * animation on the camera plus the orbit target rather than a cut.
 */

import { useEffect, useRef, type ComponentRef } from 'react';
import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { cityEngine } from '@/engine/engine';
import { worldX, worldZ } from '@/engine/graph';

const HOME_OFFSET = new THREE.Vector3(104, 96, 104);
const HOME_TARGET = new THREE.Vector3(0, 0, 0);
/** How far the camera sits from the incident when it flies in. */
const FLY_DISTANCE = 64;
const FLY_SECONDS = 1.35;

interface Animation {
  elapsed: number;
  fromPosition: THREE.Vector3;
  toPosition: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
}

export function CameraRig(): React.JSX.Element {
  const controls = useRef<ComponentRef<typeof OrbitControls> | null>(null);
  const camera = useThree((state) => state.camera);
  const animation = useRef<Animation | null>(null);
  const focusToken = useRef(-1);

  const startAnimation = (toTarget: THREE.Vector3, distance: number): void => {
    const currentTarget = controls.current?.target ?? HOME_TARGET;
    const offset = camera.position.clone().sub(currentTarget);
    if (offset.lengthSq() < 0.001) offset.copy(HOME_OFFSET);
    // Keep the current viewing angle, just change how far out we stand.
    const toPosition = toTarget.clone().add(offset.setLength(distance));
    animation.current = {
      elapsed: 0,
      fromPosition: camera.position.clone(),
      toPosition,
      fromTarget: currentTarget.clone(),
      toTarget: toTarget.clone(),
    };
  };

  useEffect(() => {
    const unsubscribe = cityEngine.subscribe(({ snapshot }) => {
      if (snapshot.focusToken === focusToken.current) return;
      focusToken.current = snapshot.focusToken;
      if (!snapshot.focus) return;
      startAnimation(new THREE.Vector3(worldX(snapshot.focus.i), 0, worldZ(snapshot.focus.j)), FLY_DISTANCE);
    });

    const resetView = (): void => {
      focusToken.current = -1;
      const offset = HOME_OFFSET.clone();
      animation.current = {
        elapsed: 0,
        fromPosition: camera.position.clone(),
        toPosition: HOME_TARGET.clone().add(offset),
        fromTarget: controls.current?.target.clone() ?? HOME_TARGET.clone(),
        toTarget: HOME_TARGET.clone(),
      };
    };
    window.addEventListener('city:reset-view', resetView);
    return () => {
      unsubscribe();
      window.removeEventListener('city:reset-view', resetView);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera]);

  useFrame((_, delta) => {
    const active = animation.current;
    if (!active) return;
    active.elapsed += delta;
    const raw = Math.min(1, active.elapsed / FLY_SECONDS);
    // Smootherstep keeps the arrival gentle.
    const ease = raw * raw * raw * (raw * (raw * 6 - 15) + 10);
    camera.position.lerpVectors(active.fromPosition, active.toPosition, ease);
    const control = controls.current;
    if (control) {
      control.target.lerpVectors(active.fromTarget, active.toTarget, ease);
      control.update();
    }
    if (raw >= 1) animation.current = null;
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      enablePan
      panSpeed={0.7}
      rotateSpeed={0.55}
      zoomSpeed={0.8}
      minDistance={42}
      maxDistance={230}
      minPolarAngle={0.5}
      maxPolarAngle={1.15}
      target={[0, 0, 0]}
    />
  );
}
