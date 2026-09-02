// scene-kit primitives: one-line mesh constructors with shadows on by default.

import * as THREE from "three"

export function mesh<G extends THREE.BufferGeometry, M extends THREE.Material>(geometry: G, material: M, x = 0, y = 0, z = 0, cast = true, receive = true): THREE.Mesh<G, M> {
  const object = new THREE.Mesh(geometry, material)
  object.position.set(x, y, z)
  object.castShadow = cast
  object.receiveShadow = receive
  return object
}

export const box = (w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0) => mesh(new THREE.BoxGeometry(w, h, d), material, x, y, z)

export const cyl = (radiusTop: number, radiusBottom: number, height: number, material: THREE.Material, x = 0, y = 0, z = 0, segments = 16) =>
  mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), material, x, y, z)

export const sph = (radius: number, material: THREE.Material, x = 0, y = 0, z = 0, segments = 16) => mesh(new THREE.SphereGeometry(radius, segments, Math.max(8, segments / 2)), material, x, y, z)

export const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
