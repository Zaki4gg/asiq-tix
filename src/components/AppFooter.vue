<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import '@/assets/footer.css'

/* Sembunyikan footer di halaman login */
const route = useRoute()
const hidden = computed(() => (route.name === 'login' || route.path === '/login'))

/* Data kontak (ubah jika perlu) */
const year = new Date().getFullYear()
const brand = 'AsiqIt'

const offices = [
  {
    city: 'BALIKPAPAN',
    email: 'asiqtix.bpn@gmail.com',
    tel: '087879127524',
    telHref: '+6287879127524',
    addr1: 'Jl. Jendral Sudirman No. 88,',
    addr2: 'Klandasan Ilir, Balikpapan',
    addr3: 'Kota 76113',
  }
]
</script>

<template>
  <footer v-if="!hidden" class="site-footer" role="contentinfo">
    <div class="footer-inner">
      <!-- Brand / Contact us / Sosial -->
      <section class="brand-cell">
        <h2 class="footer-title">Contact us</h2>

        <nav class="socials" aria-label="social links">
          <a href="https://www.instagram.com/bagas.y0/" aria-label="Instagram" class="ico">
            <!-- Instagram -->
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.9.2 2.4.4.6.2 1 .4 1.5.8.4.3.7.8.8 1.5.2.5.3 1.2.4 2.4.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 1.2-.2 1.9-.4 2.4-.2.6-.4 1-.8 1.5-.3.4-.8.7-1.5.8-.5.2-1.2.3-2.4.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.9-.2-2.4-.4-.6-.2-1-.4-1.5-.8-.4-.3-.7-.8-.8-1.5-.2-.5-.3-1.2-.4-2.4C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.9c.1-1.2.2-1.9.4-2.4.2-.6.4-1 .8-1.5.3-.4.8-.7 1.5-.8.5-.2 1.2-.3 2.4-.4C8.4 2.2 8.8 2.2 12 2.2Zm0 1.8c-3.1 0-3.5 0-4.7.1-1.1.1-1.7.2-2.1.4-.5.2-.8.4-1.1.7-.3.3-.5.6-.7 1.1-.2.4-.3 1-.4 2.1-.1 1.2-.1 1.6-.1 4.7s0 3.5.1 4.7c.1 1.1.2 1.7.4 2.1.2.5.4.8.7 1.1.3.3.6.5 1.1.7.4.2 1 .3 2.1.4 1.2.1 1.6.1 4.7.1s3.5 0 4.7-.1c1.1-.1 1.7-.2 2.1-.4.5-.2.8-.4 1.1-.7.3-.3.5-.6.7-1.1.2-.4.3-1 .4-2.1.1-1.2.1-1.6.1-4.7s0-3.5-.1-4.7c-.1-1.1-.2-1.7-.4-2.1-.2-.5-.4-.8-.7-1.1-.3-.3-.6-.5-1.1-.7-.4-.2-1-.3-2.1-.4-1.2-.1-1.6-.1-4.7-.1Zm0 3.4a6.6 6.6 0 1 1 0 13.2 6.6 6.6 0 0 1 0-13.2Zm0 2a4.6 4.6 0 1 0 0 9.2 4.6 4.6 0 0 0 0-9.2Zm5-2.2a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z"/>
            </svg>
          </a>
          <a href="https://web.facebook.com/profile.php?id=100010487190698" aria-label="Facebook" class="ico">
            <!-- Facebook -->
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M13.5 22v-8h2.7l.4-3h-3.1V8.6c0-.9.2-1.6 1.6-1.6h1.7V4.3c-.3 0-1.3-.1-2.5-.1-2.5 0-4.1 1.5-4.1 4.2V11H8.3v3h2.9v8h2.3Z"/>
            </svg>
          </a>
          <a href="https://www.tiktok.com/@bagaspp253" aria-label="Tiktok" class="ico">
            <!-- TikTok -->
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12.67 2h2.53c.12 1.1.44 2.02 1.09 2.89.63.84 1.47 1.35 2.53 1.55v2.56c-.96-.02-1.86-.23-2.71-.65-.42-.2-.82-.45-1.22-.72l-.01 6.7c0 1.15-.23 2.22-.83 3.2a6.08 6.08 0 0 1-4.18 2.94c-.77.14-1.52.14-2.27-.05-1.65-.42-2.9-1.36-3.72-2.85-1.26-2.31-.98-5.2.69-7.22 1.28-1.52 2.93-2.24 4.93-2.21v2.66c-.52.02-1 .1-1.45.32-1.03.48-1.62 1.3-1.75 2.42-.18 1.5.67 2.86 2.03 3.3 1.72.56 3.59-.48 3.93-2.26.05-.26.07-.54.07-.81l.02-11.52Z"/>
            </svg>
          </a>
        </nav>

        <small class="copy">© {{ year }} {{ brand }}. All rights reserved.</small>
      </section>

      <!-- Kantor -->
      <section
        v-for="(o, i) in offices"
        :key="i"
        class="office-cell"
      >
        <h3 class="city">{{ o.city }}</h3>
        <a class="email" :href="`mailto:${o.email}`">{{ o.email }}</a>
        <a class="tel" :href="`tel:${o.telHref}`">{{ o.tel }}</a>
        <address class="addr">
          <span>{{ o.addr1 }}</span>
          <span>{{ o.addr2 }}</span>
          <span v-if="o.addr3">{{ o.addr3 }}</span>
        </address>
      </section>
    </div>
  </footer>
</template>
