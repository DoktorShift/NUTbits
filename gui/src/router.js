import { createRouter, createWebHistory } from 'vue-router'
import api from './api/client.js'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'Login',
      component: () => import('./views/Login.vue'),
      meta: { public: true },
    },
    {
      path: '/',
      redirect: '/dashboard',
    },
    {
      path: '/dashboard',
      name: 'Dashboard',
      component: () => import('./views/Dashboard.vue'),
    },
    {
      path: '/connections',
      name: 'Connections',
      component: () => import('./views/Connections.vue'),
    },
    {
      path: '/history',
      name: 'History',
      component: () => import('./views/History.vue'),
    },
    {
      path: '/pay',
      name: 'Pay',
      component: () => import('./views/Pay.vue'),
    },
    {
      path: '/receive',
      name: 'Receive',
      component: () => import('./views/Receive.vue'),
    },
    {
      path: '/mints',
      name: 'Mints',
      component: () => import('./views/Mints.vue'),
    },
    {
      path: '/relays',
      name: 'Relays',
      component: () => import('./views/Relays.vue'),
    },
    {
      path: '/nuts',
      name: 'NUTs',
      component: () => import('./views/Nuts.vue'),
    },
    {
      path: '/fees',
      name: 'Fees',
      component: () => import('./views/Fees.vue'),
    },
    {
      path: '/settings',
      name: 'Settings',
      component: () => import('./views/Settings.vue'),
    },
    {
      path: '/logs',
      name: 'Logs',
      component: () => import('./views/Logs.vue'),
    },
  ],
})

// Auth guard — redirect to login if no token is stored
router.beforeEach(async (to) => {
  if (to.meta.public) return true

  const token = localStorage.getItem('nutbits_api_token')
  if (token) return true

  // No token in localStorage — try auto-detect for local use
  const result = await api.autoDetectToken()
  if (result.ok) return true

  // No token available — send to login
  return { name: 'Login', replace: true }
})

export default router
