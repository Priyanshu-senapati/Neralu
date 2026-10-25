import * as THREE from 'three'

/*
 * Photographs as textures, decoded off the main thread where the browser does it reliably
 * (createImageBitmap), so a 4096-pixel map arrives without freezing the page while it decodes; the
 * freeze is longest on Windows laptops. Older Safari and Firefox, whose ImageBitmap options are
 * unreliable, use the ordinary image loader: the same gate three.js's own GLTFLoader uses.
 * The bitmap is flipped and left unconverted, exactly as TextureLoader uploads a NoColorSpace
 * texture, so both paths look the same.
 */

const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
const safari = /^((?!chrome|android).)*safari/i.test(ua)
const safariVersion = safari ? Number(ua.match(/Version\/(\d+)/)?.[1] ?? 0) : Infinity
const firefoxVersion = Number(ua.match(/Firefox\/(\d+)\./)?.[1] ?? Infinity)
const offThread = typeof createImageBitmap !== 'undefined' && safariVersion >= 17 && firefoxVersion >= 98

export async function loadTexture(src: string): Promise<THREE.Texture> {
  if (!offThread) return new THREE.TextureLoader().loadAsync(src)
  const bitmap = await new THREE.ImageBitmapLoader()
    .setOptions({ imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
    .loadAsync(src)
  const texture = new THREE.Texture(bitmap)
  texture.needsUpdate = true
  texture.addEventListener('dispose', () => bitmap.close())
  return texture
}
