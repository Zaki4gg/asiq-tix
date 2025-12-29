// src/utils/friendlyErrors.js

/** 
 * Ubah error teknis dari blockchain / wallet menjadi pesan
 * yang ramah pengguna (Bahasa Indonesia).
 */
export function prettifyBuyError (reason, err) {
  const text = String(reason || '').trim()
  const lower = text.toLowerCase()

  // Kalau sebelumnya kita sudah tulis pesan sendiri dalam bahasa Indonesia
  // (misal: "Tiket on-chain sudah habis", "Event ini tidak aktif lagi")
  // biarkan saja apa adanya.
  if (
    /tiket|event|saldo|hari h|sold out|jumlah|harga|wallet/i.test(text)
  ) {
    return text
  }

  // User menolak transaksi di MetaMask
  if (lower.includes('user rejected') || lower.includes('user denied') || err?.code === 4001) {
    return 'Transaksi dibatalkan dari wallet Anda.'
  }

  // Saldo kurang
  if (lower.includes('insufficient funds')) {
    return 'Saldo POL/MATIC di wallet Anda tidak cukup untuk membeli tiket ini.'
  }

  // Error generik dari library: "could not coalesce error"
  if (lower.includes('could not coalesce error')) {
    return 'Terjadi kendala pada jaringan blockchain saat memproses transaksi. ' +
           'Saldo Anda tidak terpotong. Silakan coba lagi dalam beberapa saat.'
  }

  // Error jaringan / RPC lain
  if (lower.includes('network') || lower.includes('rpc') || lower.includes('internal error')) {
    return 'Terjadi masalah jaringan saat memproses transaksi. Silakan coba lagi.'
  }

  // Fallback super umum
  return 'Transaksi tiket gagal diproses. Silakan coba lagi, atau hubungi admin jika masalah tetap muncul.'
}
