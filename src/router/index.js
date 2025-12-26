// src/router/index.js
import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import Login from '@/views/Login.vue'
import EventDetailView from '../views/EventDetailView.vue'
import ScanQR from '@/views/ScanQR.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'login', component: Login },
    { path: '/home', name: 'home', component: HomeView, meta: { requiresWallet: true } },
    { path: '/events/:id', name: 'event', component: EventDetailView },
    { path: '/admin/dashboard', name: 'admin-dashboard', component: () => import('@/views/Admin_Dashboard.vue'), meta: { requiresWallet: true} },
    { path: '/promoter/dashboard', name: 'promoter-dashboard', component: () => import('@/views/Promoter_Dashboard.vue'), meta: { requiresWallet: true } },
    { path: '/profile', name: 'profile', component: () => import('@/views/Profile.vue'), meta: { requiresAuth: true } },
    { path: '/logout', name: 'logout', component: () => import('@/views/LogoutConfirm.vue') },
    { path: '/wallet', name: 'wallet', component: () => import('@/views/Wallet.vue') },
    { path: '/history', name: 'history', component: () => import('@/views/History.vue') },
    { path: '/scan', name: 'scan', component: ScanQR, meta: { requiresAuth: true } },
    { path: '/promoter/events/:id/transactions', name: 'promoter-event-transactions', component: () => import('@/views/Promoter_EventTransactions.vue'),
  meta: { requiresWallet: true }
},
    { path: '/:pathMatch(.*)*', redirect: { name: 'login' } },
  ],
})

router.beforeEach((to) => {
  if (!to.meta.requiresWallet) return true
  const hasToken = !!localStorage.getItem('auth_token')
  const hasAddr  = !!localStorage.getItem('walletAddress')
  if (hasToken || hasAddr) return true
  return { name: 'login' }
})

export default router
