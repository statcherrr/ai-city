/**
 * Reusable scratch objects. The render loop writes thousands of instance
 * matrices per frame, so nothing in the scene allocates inside `useFrame`.
 */

import * as THREE from 'three';

export const tmpObject = new THREE.Object3D();
export const tmpColor = new THREE.Color();
export const tmpVector = new THREE.Vector3();

/** Compose a transform into `mesh` instance `index`. */
export function writeInstance(
  mesh: THREE.InstancedMesh,
  index: number,
  x: number,
  y: number,
  z: number,
  rotationY: number,
  scaleX: number,
  scaleY: number,
  scaleZ: number,
): void {
  tmpObject.position.set(x, y, z);
  tmpObject.rotation.set(0, rotationY, 0);
  tmpObject.scale.set(scaleX, scaleY, scaleZ);
  tmpObject.updateMatrix();
  mesh.setMatrixAt(index, tmpObject.matrix);
}

/** Set an instance's colour from raw RGB (values above 1 bloom harder). */
export function writeInstanceColor(
  mesh: THREE.InstancedMesh,
  index: number,
  r: number,
  g: number,
  b: number,
): void {
  tmpColor.setRGB(r, g, b);
  mesh.setColorAt(index, tmpColor);
}
