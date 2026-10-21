import { useEffect, useRef, useState, type ImgHTMLAttributes } from 'react'
import manifest from '~/lib/image-manifest.json'

interface ImageEntry {
  width: number
  height: number
  variants: { src: string; width: number }[]
}

const images: Record<string, ImageEntry> = manifest

/** Browser-selected WebP size, with the untouched original as a fallback. */
export default function OptimizedImage({
  src = '', sizes = '100vw', loading = 'lazy', decoding = 'async', onError, ...props
}: ImgHTMLAttributes<HTMLImageElement>) {
  const entry = images[src]
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const useWebp = entry && failedSource !== src
  // An SSR image can fail before hydration attaches React's onError handler.
  useEffect(() => {
    const image = imageRef.current
    if (useWebp && image?.complete && image.naturalWidth === 0) setFailedSource(src)
  }, [src, useWebp])
  return (
    <picture>
      {useWebp && <source
        type="image/webp"
        srcSet={entry.variants.map(image => `${image.src} ${image.width}w`).join(', ')}
        sizes={sizes}
      />}
      <img
        ref={imageRef}
        width={entry?.width}
        height={entry?.height}
        {...props}
        src={src}
        sizes={sizes}
        loading={loading}
        decoding={decoding}
        onError={event => {
          if (useWebp) setFailedSource(src)
          else onError?.(event)
        }}
      />
    </picture>
  )
}
