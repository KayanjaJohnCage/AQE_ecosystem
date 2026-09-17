export type MediaKind = 'image' | 'video'

export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024
export const MAX_VIDEO_SIZE_BYTES = 75 * 1024 * 1024

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime']

export function validateMediaUpload({
  kind,
  mimeType,
  sizeBytes,
  fileName
}: {
  kind: MediaKind
  mimeType: string
  sizeBytes: number
  fileName: string
}) {
  const safeName = fileName.trim()
  const allowedTypes = kind === 'image' ? ALLOWED_IMAGE_TYPES : ALLOWED_VIDEO_TYPES
  const maxBytes = kind === 'image' ? MAX_IMAGE_SIZE_BYTES : MAX_VIDEO_SIZE_BYTES

  if (!safeName) {
    return { ok: false, reason: 'File name is required.' }
  }

  if (!allowedTypes.includes(mimeType)) {
    return { ok: false, reason: `Unsupported ${kind} type.` }
  }

  if (sizeBytes > maxBytes) {
    return { ok: false, reason: `${kind} file exceeds the allowed size limit.` }
  }

  return { ok: true }
}

export function getMediaPublicUrl(bucket: string, path: string): string {
  return `https://storage.example.com/${bucket}/${path}`
}
