// src/composables/useConfirmLogout.js
import { useRouter } from 'vue-router'

export function useConfirmLogout() {
  const router = useRouter()

  function hardLogout() {
    // bersihkan semua jejak sesi yang kamu pakai
    localStorage.removeItem('auth_token')
    localStorage.removeItem('walletAddress')
    // kalau pakai Pinia / store lain, reset di sini juga
    // e.g. useUserStore().$reset()
  }

  async function confirmLogout({
    message = 'Apakah Anda yakin ingin keluar?',
    redirectTo = '/login',       // selesai logout ke mana
  } = {}) {
    const ok = window.confirm(message)
    if (!ok) return false

    hardLogout()
    await router.push(redirectTo)
    return true
  }

  return { confirmLogout }
}
