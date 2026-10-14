/**
 * Static city geometry. Everything here is generated once from the city layout
 * and poured into instanced meshes, so the whole city costs a handful of draw
 * calls and nothing in this file runs per frame.
 */

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Html, Line } from '@react-three/drei';
import { BLOCK, GRID_BLOCKS, PALETTE, ROAD_LIFT, ROAD_WIDTH } from '@/data/cityConfig';
import type { CityModel } from '@/engine/city';
import { nodeI, nodeJ, worldX, worldZ } from '@/engine/graph';
import type { CityVisuals } from './cityVisuals';
import { writeInstance, writeInstanceColor } from './scratch';

/** Building tint ramp, all one restrained dark family. */
const BUILDING_TINTS: [number, number, number][] = [
  [0.11, 0.13, 0.17],
  [0.09, 0.11, 0.15],
];

/**
 * Window tone: a cool paper so a few windows catch the bloom. The gain above 1
 * is what lets incidents, signals, routes and lights bloom while the city stays
 * dark.
 */
const WINDOW: [number, number, number] = [0.85, 1.35, 1.85];

const WORLD_SPAN = GRID_BLOCKS * BLOCK;
const GROUND_MARGIN = 140;

function useDisposable(...objects: { dispose: () => void }[]): void {
  useEffect(() => {
    return () => {
      for (const object of objects) object.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, objects);
}

export function Ground({ texture }: { texture: THREE.CanvasTexture }): React.JSX.Element {
  const size = WORLD_SPAN + GROUND_MARGIN;
  useMemo(() => {
    const k = WORLD_SPAN / size;
    texture.repeat.set(1 / k, 1 / k);
    texture.offset.set(-(0.5 - k / 2) / k, -(0.5 - k / 2) / k);
    texture.needsUpdate = true;
  }, [texture, size]);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial
        map={texture}
        color="#0a1018"
        emissiveMap={texture}
        emissive="#44618f"
        emissiveIntensity={0.18}
        roughness={0.95}
        metalness={0.05}
      />
    </mesh>
  );
}

export function River({ city }: { city: CityModel }): React.JSX.Element {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => {
    const plane = new THREE.PlaneGeometry(1, 1);
    plane.rotateX(-Math.PI / 2);
    return plane;
  }, []);
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: PALETTE.water,
        roughness: 0.1,
        metalness: 0.85,
        emissive: new THREE.Color('#071f30'),
        emissiveIntensity: 0.45,
      }),
    [],
  );
  useDisposable(geometry, material);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    city.riverRects.forEach((rect, index) => {
      writeInstance(mesh, index, rect.x, 0.04, rect.z, 0, rect.w * 1.03, 1, rect.d * 1.03);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [city]);

  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, Math.max(1, city.riverRects.length)]}
      frustumCulled={false}
    />
  );
}

export function Roads({ city }: { city: CityModel }): React.JSX.Element {
  const roads = useRef<THREE.InstancedMesh>(null);
  const dashes = useRef<THREE.InstancedMesh>(null);
  const edgeCount = city.graph.edges.length;

  const planeGeometry = useMemo(() => {
    const plane = new THREE.PlaneGeometry(1, 1);
    plane.rotateX(-Math.PI / 2);
    return plane;
  }, []);
  const roadMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: PALETTE.road,
        roughness: 0.82,
        metalness: 0.12,
        emissive: new THREE.Color('#0c1220'),
        emissiveIntensity: 0.45,
      }),
    [],
  );
  const dashMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#5b7591', transparent: true, opacity: 0.4, toneMapped: false }),
    [],
  );
  useDisposable(planeGeometry, roadMaterial, dashMaterial);

  useLayoutEffect(() => {
    const mesh = roads.current;
    const dashMesh = dashes.current;
    if (!mesh || !dashMesh) return;

    city.graph.edges.forEach((edge, index) => {
      const ax = worldX(nodeI(edge.a));
      const az = worldZ(nodeJ(edge.a));
      const bx = worldX(nodeI(edge.b));
      const bz = worldZ(nodeJ(edge.b));
      const midX = (ax + bx) / 2;
      const midZ = (az + bz) / 2;
      const rotationY = edge.axis === 'ew' ? 0 : Math.PI / 2;
      const lift = edge.bridge ? ROAD_LIFT + 1.1 : ROAD_LIFT;
      writeInstance(mesh, index, midX, lift, midZ, rotationY, BLOCK, ROAD_WIDTH, 1);

      const dirX = (bx - ax) / BLOCK;
      const dirZ = (bz - az) / BLOCK;
      for (let d = 0; d < 2; d++) {
        const offset = d === 0 ? -BLOCK * 0.22 : BLOCK * 0.22;
        writeInstance(
          dashMesh,
          index * 2 + d,
          midX + dirX * offset,
          lift + 0.02,
          midZ + dirZ * offset,
          rotationY,
          BLOCK * 0.32,
          0.4,
          1,
        );
      }
    });

    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    dashMesh.instanceMatrix.needsUpdate = true;
    dashMesh.computeBoundingSphere();
  }, [city]);

  return (
    <group>
      <instancedMesh ref={roads} args={[planeGeometry, roadMaterial, edgeCount]} frustumCulled={false} />
      <instancedMesh
        ref={dashes}
        args={[planeGeometry, dashMaterial, Math.max(1, edgeCount * 2)]}
        frustumCulled={false}
      />
      <Bridges city={city} />
    </group>
  );
}

function Bridges({ city }: { city: CityModel }): React.JSX.Element {
  const ref = useRef<THREE.InstancedMesh>(null);
  const bridgeEdges = useMemo(() => city.graph.edges.filter((edge) => edge.bridge), [city]);
  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const material = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#5fb8ff', toneMapped: false, transparent: true, opacity: 0.55 }),
    [],
  );
  useDisposable(geometry, material);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    bridgeEdges.forEach((edge, index) => {
      const ax = worldX(nodeI(edge.a));
      const az = worldZ(nodeJ(edge.a));
      const bx = worldX(nodeI(edge.b));
      const bz = worldZ(nodeJ(edge.b));
      const midX = (ax + bx) / 2;
      const midZ = (az + bz) / 2;
      const rotationY = edge.axis === 'ew' ? 0 : Math.PI / 2;
      const acrossX = edge.axis === 'ew' ? 0 : ROAD_WIDTH / 2;
      const acrossZ = edge.axis === 'ew' ? ROAD_WIDTH / 2 : 0;
      const y = ROAD_LIFT + 1.45;
      writeInstance(mesh, index * 2, midX - acrossX, y, midZ - acrossZ, rotationY, BLOCK, 0.13, 0.13);
      writeInstance(mesh, index * 2 + 1, midX + acrossX, y, midZ + acrossZ, rotationY, BLOCK, 0.13, 0.13);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [bridgeEdges]);

  return <instancedMesh ref={ref} args={[geometry, material, Math.max(1, bridgeEdges.length * 2)]} frustumCulled={false} />;
}

export function Buildings({ visuals }: { visuals: CityVisuals }): React.JSX.Element {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.72, metalness: 0.22 }), []);
  useDisposable(geometry, material);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    visuals.buildings.forEach((building, index) => {
      writeInstance(mesh, index, building.x, building.h / 2, building.z, 0, building.w, building.h, building.d);
      const tint = BUILDING_TINTS[building.tint] ?? BUILDING_TINTS[0]!;
      writeInstanceColor(mesh, index, tint[0], tint[1], tint[2]);
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [visuals]);

  return (
    <instancedMesh ref={ref} args={[geometry, material, Math.max(1, visuals.buildings.length)]} frustumCulled={false} />
  );
}

export function Windows({ visuals }: { visuals: CityVisuals }): React.JSX.Element {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false, side: THREE.FrontSide }), []);
  useDisposable(geometry, material);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    visuals.windows.forEach((window, index) => {
      writeInstance(mesh, index, window.x, window.y, window.z, window.rotationY, window.w, window.h, 1);
      writeInstanceColor(mesh, index, WINDOW[0], WINDOW[1], WINDOW[2]);
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [visuals]);

  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, Math.max(1, visuals.windows.length)]}
      frustumCulled={false}
    />
  );
}

export function Parks({ city, visuals }: { city: CityModel; visuals: CityVisuals }): React.JSX.Element {
  const trees = useRef<THREE.InstancedMesh>(null);
  const lamps = useRef<THREE.InstancedMesh>(null);
  const parkBlocks = useMemo(() => city.blocks.filter((block) => block.kind === 'park'), [city]);

  const groundGeometry = useMemo(() => {
    const plane = new THREE.PlaneGeometry(1, 1);
    plane.rotateX(-Math.PI / 2);
    return plane;
  }, []);
  const groundMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: PALETTE.park,
        roughness: 0.95,
        emissive: new THREE.Color('#061810'),
        emissiveIntensity: 0.2,
      }),
    [],
  );
  const treeGeometry = useMemo(() => {
    const cone = new THREE.ConeGeometry(1, 1, 6);
    cone.translate(0, 0.5, 0);
    return cone;
  }, []);
  const treeMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#0e2216',
        roughness: 0.9,
        emissive: new THREE.Color('#04110a'),
        emissiveIntensity: 0.15,
      }),
    [],
  );
  const lampGeometry = useMemo(() => new THREE.SphereGeometry(0.17, 8, 8), []);
  const lampMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffd9a0', toneMapped: false }), []);
  useDisposable(groundGeometry, groundMaterial, treeGeometry, treeMaterial, lampGeometry, lampMaterial);

  useLayoutEffect(() => {
    const treeMesh = trees.current;
    const lampMesh = lamps.current;
    if (!treeMesh || !lampMesh) return;
    visuals.trees.forEach((tree, index) => {
      writeInstance(treeMesh, index, tree.x, 0.05, tree.z, 0, 1.5 * tree.scale, 4.4 * tree.scale, 1.5 * tree.scale);
    });
    visuals.parkLamps.forEach((lamp, index) => {
      writeInstance(lampMesh, index, lamp.x, 3.1, lamp.z, 0, 1, 1, 1);
    });
    treeMesh.instanceMatrix.needsUpdate = true;
    treeMesh.computeBoundingSphere();
    lampMesh.instanceMatrix.needsUpdate = true;
    lampMesh.computeBoundingSphere();
  }, [visuals]);

  return (
    <group>
      {parkBlocks.map((block) => (
        <mesh
          key={`${block.i}-${block.j}`}
          geometry={groundGeometry}
          material={groundMaterial}
          position={[block.rect.x, 0.03, block.rect.z]}
          scale={[block.rect.w, 1, block.rect.d]}
        />
      ))}
      <instancedMesh
        ref={trees}
        args={[treeGeometry, treeMaterial, Math.max(1, visuals.trees.length)]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={lamps}
        args={[lampGeometry, lampMaterial, Math.max(1, visuals.parkLamps.length)]}
        frustumCulled={false}
      />
    </group>
  );
}

export function Landmarks({ city }: { city: CityModel }): React.JSX.Element {
  const beacons = useRef<THREE.InstancedMesh>(null);
  const beaconGeometry = useMemo(() => new THREE.SphereGeometry(0.42, 12, 12), []);
  const beaconMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.6, toneMapped: false }),
    [],
  );
  useDisposable(beaconGeometry, beaconMaterial);

  useLayoutEffect(() => {
    const mesh = beacons.current;
    if (!mesh) return;
    city.landmarks.forEach((landmark, index) => {
      writeInstance(mesh, index, landmark.rect.x, landmark.height + 2.1, landmark.rect.z, 0, 1, 1, 1);
      const color = new THREE.Color(landmark.color);
      writeInstanceColor(mesh, index, color.r * 1.7, color.g * 1.7, color.b * 1.7);
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [city.landmarks]);

  useFrame((state) => {
    beaconMaterial.opacity = 0.4 + 0.35 * (0.5 + 0.5 * Math.sin(state.clock.elapsedTime * 2.4));
  });

  return (
    <group>
      <instancedMesh
        ref={beacons}
        args={[beaconGeometry, beaconMaterial, Math.max(1, city.landmarks.length)]}
        frustumCulled={false}
      />
      {city.landmarks.map((landmark) => (
        <group key={landmark.id} position={[landmark.rect.x, 0, landmark.rect.z]}>
          <mesh position={[0, landmark.height / 2, 0]}>
            <boxGeometry args={[5.0, landmark.height, 5.0]} />
            <meshStandardMaterial color="#151b26" roughness={0.65} metalness={0.3} />
          </mesh>
          <mesh position={[0, landmark.height + 0.1, 0]}>
            <boxGeometry args={[5.2, 0.22, 5.2]} />
            <meshBasicMaterial color={landmark.color} toneMapped={false} />
          </mesh>
          <Html position={[0, landmark.height + 4.4, 0]} center distanceFactor={170} zIndexRange={[20, 0]}>
            <div className="pointer-events-none whitespace-nowrap rounded-full border border-white/10 bg-black/55 px-2 py-0.5 text-[10px] font-medium tracking-wide text-white/70 backdrop-blur-sm">
              {landmark.name}
            </div>
          </Html>
        </group>
      ))}
    </group>
  );
}

export function TransitLine({ city }: { city: CityModel }): React.JSX.Element {
  const pylons = useRef<THREE.InstancedMesh>(null);
  const rings = useRef<THREE.InstancedMesh>(null);

  const loopPoints = useMemo<[number, number, number][]>(
    () => city.transit.loop.map((node) => [worldX(nodeI(node)), 0.18, worldZ(nodeJ(node))]),
    [city],
  );

  const pylonGeometry = useMemo(() => {
    const cylinder = new THREE.CylinderGeometry(0.11, 0.13, 3.4, 8);
    cylinder.translate(0, 1.7, 0);
    return cylinder;
  }, []);
  const ringGeometry = useMemo(() => {
    const torus = new THREE.TorusGeometry(0.6, 0.07, 8, 20);
    torus.rotateX(Math.PI / 2);
    return torus;
  }, []);
  const pylonMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2a3446', roughness: 0.5 }), []);
  const ringMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ color: city.transit.color, toneMapped: false }),
    [city.transit.color],
  );
  useDisposable(pylonGeometry, ringGeometry, pylonMaterial, ringMaterial);

  useLayoutEffect(() => {
    const pylonMesh = pylons.current;
    const ringMesh = rings.current;
    if (!pylonMesh || !ringMesh) return;
    city.transit.stops.forEach((stop, index) => {
      const x = worldX(stop.point.i);
      const z = worldZ(stop.point.j);
      writeInstance(pylonMesh, index, x, 0, z, 0, 1, 1, 1);
      writeInstance(ringMesh, index, x, 3.7, z, 0, 1, 1, 1);
    });
    pylonMesh.instanceMatrix.needsUpdate = true;
    pylonMesh.computeBoundingSphere();
    ringMesh.instanceMatrix.needsUpdate = true;
    ringMesh.computeBoundingSphere();
  }, [city.transit.stops]);

  return (
    <group>
      <Line points={loopPoints} color={city.transit.color} lineWidth={2.2} transparent opacity={0.5} />
      <instancedMesh
        ref={pylons}
        args={[pylonGeometry, pylonMaterial, Math.max(1, city.transit.stops.length)]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={rings}
        args={[ringGeometry, ringMaterial, Math.max(1, city.transit.stops.length)]}
        frustumCulled={false}
      />
    </group>
  );
}
