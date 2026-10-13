/**
 * Live traffic: every vehicle is one instance of a shared unit cube, and every
 * signal head is one instance of a shared cube. All per-frame work writes
 * matrices in place; nothing here allocates.
 */

import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { BLOCK } from '@/data/cityConfig';
import { signalNodeIds } from '@/engine/city';
import { cityEngine } from '@/engine/engine';
import type { Agent, AgentKind } from '@/engine/agents';
import { nodeI, nodeJ, worldX, worldZ, type NodeId } from '@/engine/graph';
import { signalColor } from '@/engine/signals';
import { writeInstance, writeInstanceColor } from './scratch';

interface VehicleSpec {
  size: [number, number, number];
  color: [number, number, number];
  /** Light bar over the cab. */
  bar?: 'fire' | 'police' | 'plow';
  /** How far the headlights pool on the road, as a multiple of the body length. */
  headlight: number;
  /** Ride height, so wheels are implied rather than modelled. */
  lift: number;
}

const VEHICLES: Record<AgentKind, VehicleSpec> = {
  car: { size: [1.15, 0.62, 2.3], color: [0.3, 0.35, 0.44], headlight: 1.9, lift: 0.16 },
  bus: { size: [1.75, 2.05, 4.6], color: [0.36, 0.3, 0.54], headlight: 2.6, lift: 0.42 },
  'fire-truck': { size: [1.85, 2.15, 4.4], color: [0.56, 0.18, 0.15], bar: 'fire', headlight: 2.6, lift: 0.18 },
  plow: { size: [1.9, 1.65, 3.9], color: [0.6, 0.45, 0.15], bar: 'plow', headlight: 2.4, lift: 0.18 },
  police: { size: [1.2, 0.68, 2.4], color: [0.17, 0.26, 0.5], bar: 'police', headlight: 2.1, lift: 0.16 },
  utility: { size: [1.6, 1.9, 3.8], color: [0.32, 0.38, 0.43], bar: 'plow', headlight: 2.4, lift: 0.18 },
};

/** Per-instance tint spread, so the traffic is not one flat colour. */
function vehicleTint(agent: Agent, base: [number, number, number]): [number, number, number] {
  const variation = 0.78 + ((agent.id * 37) % 11) / 26;
  return [base[0] * variation, base[1] * variation, base[2] * variation];
}

export function Agents(): React.JSX.Element {
  const agents = cityEngine.fleet.agents;
  const capacity = Math.max(1, agents.length);
  const emergencyAgents = useMemo(() => agents.filter((agent) => VEHICLES[agent.kind].bar !== undefined), [agents]);

  const bodies = useRef<THREE.InstancedMesh>(null);
  const bars = useRef<THREE.InstancedMesh>(null);
  const pools = useRef<THREE.InstancedMesh>(null);

  const bodyGeometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const bodyMaterial = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0.35 }), []);
  const barGeometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const barMaterial = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false }), []);
  const poolGeometry = useMemo(() => {
    const plane = new THREE.PlaneGeometry(1, 1);
    plane.rotateX(-Math.PI / 2);
    return plane;
  }, []);
  const poolMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        toneMapped: false,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    [],
  );

  // Static per-vehicle tint, written once.
  useLayoutEffect(() => {
    const bodyMesh = bodies.current;
    const barMesh = bars.current;
    const poolMesh = pools.current;
    if (!bodyMesh || !barMesh || !poolMesh) return;

    for (let i = 0; i < agents.length; i++) {
      const agent = agents[i]!;
      const tint = vehicleTint(agent, VEHICLES[agent.kind].color);
      writeInstanceColor(bodyMesh, i, tint[0], tint[1], tint[2]);
      writeInstanceColor(poolMesh, i * 2, 1.5, 1.32, 1.0);
      writeInstanceColor(poolMesh, i * 2 + 1, 1.8, 0.22, 0.18);
    }
    for (let i = 0; i < emergencyAgents.length; i++) {
      const spec = VEHICLES[emergencyAgents[i]!.kind];
      if (spec.bar === 'fire') writeInstanceColor(barMesh, i, 1.4, 0.3, 0.25);
      else if (spec.bar === 'police') writeInstanceColor(barMesh, i, 0.4, 0.5, 1.6);
      else writeInstanceColor(barMesh, i, 1.5, 1.05, 0.2);
    }
    if (bodyMesh.instanceColor) bodyMesh.instanceColor.needsUpdate = true;
    if (poolMesh.instanceColor) poolMesh.instanceColor.needsUpdate = true;
    if (barMesh.instanceColor) barMesh.instanceColor.needsUpdate = true;
  }, [agents, emergencyAgents]);

  useFrame(() => {
    const bodyMesh = bodies.current;
    const barMesh = bars.current;
    const poolMesh = pools.current;
    if (!bodyMesh || !barMesh || !poolMesh) return;

    for (let i = 0; i < agents.length; i++) {
      const agent = agents[i]!;
      const spec = VEHICLES[agent.kind];
      const [width, height, length] = spec.size;
      writeInstance(
        bodyMesh,
        i,
        agent.x,
        height / 2 + spec.lift,
        agent.z,
        agent.heading,
        width,
        height,
        length,
      );

      const forwardX = Math.sin(agent.heading);
      const forwardZ = Math.cos(agent.heading);
      const poolLength = length * spec.headlight * 0.55;
      const reach = length * 0.5 + poolLength * 0.3;
      writeInstance(
        poolMesh,
        i * 2,
        agent.x + forwardX * reach,
        0.14,
        agent.z + forwardZ * reach,
        agent.heading,
        width * 1.25,
        1,
        poolLength,
      );
      writeInstance(
        poolMesh,
        i * 2 + 1,
        agent.x - forwardX * reach,
        0.14,
        agent.z - forwardZ * reach,
        agent.heading,
        width * 1.05,
        1,
        poolLength * 0.5,
      );
    }

    // Emergency light bars strobe; values above 1 make them bloom.
    for (let index = 0; index < emergencyAgents.length; index++) {
      const agent = emergencyAgents[index]!;
      const spec = VEHICLES[agent.kind];
      const [width, height, length] = spec.size;
      const flash = Math.sin(agent.blink * 1.7) > 0 ? 1.9 : 0.4;
      const idle = agent.onCall || agent.kind === 'plow' || agent.kind === 'police';
      const intensity = idle ? flash : 0.45;
      writeInstance(
        barMesh,
        index,
        agent.x,
        height + spec.lift + 0.12,
        agent.z,
        agent.heading,
        width * 0.62,
        0.16,
        length * 0.48,
      );
      if (spec.bar === 'fire') writeInstanceColor(barMesh, index, intensity * 1.6, intensity * 0.32, intensity * 0.22);
      else if (spec.bar === 'police')
        writeInstanceColor(barMesh, index, intensity * 0.4, intensity * 0.52, intensity * 1.7);
      else writeInstanceColor(barMesh, index, intensity * 1.5, intensity * 1.02, intensity * 0.2);
    }

    bodyMesh.instanceMatrix.needsUpdate = true;
    barMesh.instanceMatrix.needsUpdate = true;
    poolMesh.instanceMatrix.needsUpdate = true;
    if (barMesh.instanceColor) barMesh.instanceColor.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh ref={bodies} args={[bodyGeometry, bodyMaterial, capacity]} frustumCulled={false} />
      <instancedMesh
        ref={bars}
        args={[barGeometry, barMaterial, Math.max(1, emergencyAgents.length)]}
        frustumCulled={false}
      />
      <instancedMesh ref={pools} args={[poolGeometry, poolMaterial, capacity * 2]} frustumCulled={false} />
    </group>
  );
}

const SIGNAL_RGB: [number, number, number][] = [
  [2.6, 0.28, 0.32], // red
  [2.7, 1.6, 0.2], // amber
  [0.18, 2.5, 0.85], // green
];

/** Two heads per signalled intersection: one per axis. */
export function TrafficLights(): React.JSX.Element {
  const nodes = useMemo<NodeId[]>(() => signalNodeIds(), []);
  const headCount = nodes.length * 2;
  const heads = useRef<THREE.InstancedMesh>(null);
  const posts = useRef<THREE.InstancedMesh>(null);
  const lastCode = useMemo(() => new Int8Array(headCount).fill(-1), [headCount]);

  const headGeometry = useMemo(() => new THREE.BoxGeometry(0.42, 0.42, 0.42), []);
  const headMaterial = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false }), []);
  const postGeometry = useMemo(() => {
    const cylinder = new THREE.CylinderGeometry(0.075, 0.09, 3.6, 6);
    cylinder.translate(0, 1.8, 0);
    return cylinder;
  }, []);
  const postMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#20303f', roughness: 0.6 }), []);

  useLayoutEffect(() => {
    const headMesh = heads.current;
    const postMesh = posts.current;
    if (!headMesh || !postMesh) return;
    nodes.forEach((node, index) => {
      const x = worldX(nodeI(node));
      const z = worldZ(nodeJ(node));
      // The north/south head hangs over the cross street, and vice versa.
      writeInstance(headMesh, index * 2, x, 3.6, z + BLOCK * 0.26, 0, 1, 1, 1);
      writeInstance(headMesh, index * 2 + 1, x + BLOCK * 0.26, 3.6, z, 0, 1, 1, 1);
      writeInstance(postMesh, index * 2, x, 0, z + BLOCK * 0.26, 0, 1, 1, 1);
      writeInstance(postMesh, index * 2 + 1, x + BLOCK * 0.26, 0, z, 0, 1, 1, 1);
    });
    headMesh.instanceMatrix.needsUpdate = true;
    headMesh.computeBoundingSphere();
    postMesh.instanceMatrix.needsUpdate = true;
    postMesh.computeBoundingSphere();
  }, [nodes]);

  useFrame(() => {
    const headMesh = heads.current;
    if (!headMesh) return;
    const world = cityEngine.simulation.world;
    const timeSec = world.timeMin * 60;
    let dirty = false;
    for (let index = 0; index < nodes.length; index++) {
      const node = nodes[index]!;
      for (let axisIndex = 0; axisIndex < 2; axisIndex++) {
        const color = signalColor(world, node, axisIndex === 0 ? 'ns' : 'ew', timeSec);
        const code = color === 'green' ? 2 : color === 'amber' ? 1 : 0;
        const slot = index * 2 + axisIndex;
        if (lastCode[slot] === code) continue;
        lastCode[slot] = code;
        const rgb = SIGNAL_RGB[code]!;
        writeInstanceColor(headMesh, slot, rgb[0], rgb[1], rgb[2]);
        dirty = true;
      }
    }
    if (dirty && headMesh.instanceColor) headMesh.instanceColor.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh ref={heads} args={[headGeometry, headMaterial, headCount]} frustumCulled={false} />
      <instancedMesh ref={posts} args={[postGeometry, postMaterial, headCount]} frustumCulled={false} />
    </group>
  );
}