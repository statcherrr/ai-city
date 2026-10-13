/**
 * Scenario overlays drawn on the city: the incident marker, the closure and the
 * detour the brain computed, and the response route of every unit currently on
 * a call.
 *
 * These change only on discrete events, so a local subscription rebuilds the
 * geometry when the overlay signature changes rather than every frame; the live
 * movement is carried by the vehicles themselves.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { PALETTE } from '@/data/cityConfig';
import { DEPARTMENTS } from '@/data/departments';
import { cityEngine, type EngineSnapshot } from '@/engine/engine';
import { nodeI, nodeJ, worldX, worldZ } from '@/engine/graph';
import type { Point } from '@/engine/types';

type Triple = [number, number, number];

interface IncidentOverlay {
  id: string;
  point: Point;
  radius: number;
  resolved: boolean;
}

interface PathOverlay {
  id: string;
  points: Triple[];
  color: string;
}

interface OverlayState {
  incidents: IncidentOverlay[];
  closures: PathOverlay[];
  detours: PathOverlay[];
  routes: PathOverlay[];
}

const EMPTY: OverlayState = { incidents: [], closures: [], detours: [], routes: [] };

function toTriple(point: Point, y: number): Triple {
  return [worldX(point.i), y, worldZ(point.j)];
}

function signature(snapshot: EngineSnapshot): string {
  const incidents = snapshot.incidents.map((i) => `${i.id}${i.resolved ? 'r' : 'a'}`).join(',');
  const detours = snapshot.detours.map((d) => `${d.id}${d.reopened ? 'r' : 'a'}`).join(',');
  const dispatches = snapshot.dispatches.map((d) => `${d.id}${d.arrived ? 'a' : 'p'}`).join(',');
  return `${snapshot.scenarioId}|${snapshot.mode}|${incidents}|${detours}|${dispatches}`;
}

/** Route of every unit currently on a call, drawn from its live path. */
function responseRoutes(): PathOverlay[] {
  const sim = cityEngine.simulation;
  const out: PathOverlay[] = [];
  for (const dispatch of sim.world.dispatches) {
    if (dispatch.arrivedAt !== null) continue;
    const agent = cityEngine.fleet.agent(dispatch.agentId);
    if (!agent) continue;
    const points: Triple[] = [];
    const last = Math.min(agent.path.length, agent.leg + 48);
    for (let leg = agent.leg; leg < last; leg++) {
      const node = agent.path[leg]!;
      points.push([worldX(nodeI(node)), 0.32, worldZ(nodeJ(node))]);
    }
    if (points.length > 1) {
      out.push({ id: dispatch.id, points, color: DEPARTMENTS[dispatch.department]?.color ?? '#ffffff' });
    }
  }
  return out;
}

function buildOverlay(snapshot: EngineSnapshot): OverlayState {
  return {
    incidents: snapshot.incidents.map((incident) => ({
      id: incident.id,
      point: incident.point,
      radius: incident.radius,
      resolved: incident.resolved,
    })),
    closures: snapshot.detours
      .filter((detour) => !detour.reopened)
      .map((detour) => ({
        id: `closure-${detour.id}`,
        points: detour.blocked.map((point) => toTriple(point, 0.24)),
        color: PALETTE.incident,
      })),
    detours: snapshot.detours
      .filter((detour) => !detour.reopened && detour.reroute.length > 1)
      .map((detour) => ({
        id: `detour-${detour.id}`,
        points: detour.reroute.map((point) => toTriple(point, 0.28)),
        color: PALETTE.detour,
      })),
    routes: responseRoutes(),
  };
}

export function Overlays(): React.JSX.Element {
  const [overlay, setOverlay] = useState<OverlayState>(EMPTY);
  const lastSignature = useRef('');

  useEffect(() => {
    return cityEngine.subscribe(({ snapshot }) => {
      const next = signature(snapshot);
      if (next === lastSignature.current) return;
      lastSignature.current = next;
      setOverlay(buildOverlay(snapshot));
    });
  }, []);

  // Re-route the drawn lines whenever the overlay set changes.
  const routes = useMemo(() => (overlay.routes.length > 0 ? responseRoutes() : []), [overlay]);

  return (
    <group>
      {overlay.closures.map((path) => (
        <Line
          key={path.id}
          points={path.points}
          color={path.color}
          lineWidth={6}
          transparent
          opacity={0.85}
        />
      ))}
      {overlay.detours.map((path) => (
        <Line
          key={path.id}
          points={path.points}
          color={path.color}
          lineWidth={3}
          dashed
          dashSize={1.5}
          gapSize={1}
          transparent
          opacity={0.9}
        />
      ))}
      {routes.map((path) => (
        <Line key={path.id} points={path.points} color={path.color} lineWidth={2.4} transparent opacity={0.7} />
      ))}
      {overlay.incidents.map((incident) => (
        <IncidentMarker
          key={incident.id}
          radius={incident.radius}
          resolved={incident.resolved}
          point={incident.point}
        />
      ))}
    </group>
  );
}

function IncidentMarker({
  radius,
  resolved,
  point,
}: {
  radius: number;
  resolved: boolean;
  point: Point;
}): React.JSX.Element {
  const ring = useRef<THREE.Mesh>(null);
  const face = useRef<THREE.Mesh>(null);
  const color = resolved ? DEPARTMENTS.ai.color : PALETTE.incident;

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (ring.current) {
      const pulse = 1 + 0.1 * Math.sin(t * 2.4);
      ring.current.scale.setScalar(pulse);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = resolved
        ? 0.22
        : 0.5 + 0.25 * Math.sin(t * 2.4);
    }
    if (face.current) {
      (face.current.material as THREE.MeshBasicMaterial).opacity = resolved ? 0.1 : 0.28 + 0.18 * Math.sin(t * 1.6);
    }
  });

  return (
    <group position={[worldX(point.i), 0, worldZ(point.j)]}>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.2, 0]}>
        <ringGeometry args={[radius * 3.1, radius * 3.6, 64]} />
        <meshBasicMaterial color={color} transparent opacity={0.6} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={face} position={[0, 13, 0]}>
        <cylinderGeometry args={[radius * 1.4, radius * 1.4, 26, 24, 1, true]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.3}
          toneMapped={false}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
