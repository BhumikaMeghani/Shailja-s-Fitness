import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import OptimizedImage from './OptimizedImage'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

test('uses responsive copies and falls back to the original before reporting an error', () => {
  const onError = vi.fn()
  const { container, rerender } = render(<OptimizedImage src="/images/hero-om.jpg" alt="Hero" onError={onError} />)
  expect(container.querySelector('source')?.getAttribute('srcset')).toContain('/optimized/')
  const image = screen.getByAltText('Hero')
  fireEvent.error(image)
  expect(container.querySelector('source')).toBeNull()
  expect(image.getAttribute('src')).toBe('/images/hero-om.jpg')
  expect(onError).not.toHaveBeenCalled()
  fireEvent.error(image)
  expect(onError).toHaveBeenCalledOnce()
  rerender(<OptimizedImage src="/images/instructors/manoj.png" alt="Trainer" />)
  expect(container.querySelector('source')).not.toBeNull()
})

test('detects an image that failed before hydration', () => {
  vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true)
  vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(0)
  const { container } = render(<OptimizedImage src="/images/hero-om.jpg" alt="Hero" />)
  expect(container.querySelector('source')).toBeNull()
})

test('leaves SVG and unknown sources usable without an optimized copy', () => {
  const { container } = render(<OptimizedImage src="/brand.svg" alt="Brand" />)
  expect(container.querySelector('source')).toBeNull()
  expect(screen.getByAltText('Brand').getAttribute('src')).toBe('/brand.svg')
})
