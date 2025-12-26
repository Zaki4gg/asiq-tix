import { vi } from 'vitest'

// Mock confirm (bisa dioverride per test)
vi.spyOn(window, 'confirm').mockImplementation(() => true)

// Banyak komponen UI butuh ini (terutama library tertentu)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Kalau ada kode yang pakai fetch
if (!globalThis.fetch) {
  globalThis.fetch = vi.fn()
}
