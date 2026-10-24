import * as THREE from 'three'

/*
 * Places on the Earth model (radius 1, north pole +y), matching three.js SphereGeometry's UV layout
 * so a point lands exactly on its pixel of the equirectangular maps.
 */

// Kamala's home to about 100 m: shared views never show a registered person's exact position.
export const KAMALA = { lat: 12.926, lng: 77.585 }
export const WARD = { lat: 12.925, lng: 77.584 }
/** 1 unit of the Earth model in kilometres. */
export const EARTH_KM = 6371

export function latLngToVec(lat: number, lng: number, r = 1, out = new THREE.Vector3()): THREE.Vector3 {
  const phi = ((lng + 180) * Math.PI) / 180
  const theta = ((90 - lat) * Math.PI) / 180
  return out.set(-Math.cos(phi) * Math.sin(theta) * r, Math.cos(theta) * r, Math.sin(phi) * Math.sin(theta) * r)
}

/** Web Mercator tile edges → degrees (the satellite mosaics are stitched from z/x/y tiles). */
export const tileLng = (x: number, z: number) => (x / 2 ** z) * 360 - 180
export const tileLat = (y: number, z: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI
/** Mercator y (0 at the north edge of the world) for a latitude, as a tile coordinate at zoom z. */
export const mercY = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z
}

/** The two satellite mosaics in public/earth: tile ranges as downloaded (inclusive). */
export const MOSAICS = {
  bengaluru: { src: '/earth/bengaluru.jpg', z: 12, x0: 2927, x1: 2934, y0: 1896, y1: 1903 },
  ward: { src: '/earth/ward47.jpg', z: 15, x0: 23443, x1: 23448, y0: 15194, y1: 15199 },
}
