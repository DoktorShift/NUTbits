import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
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
    {
      path: '/connect',
      name: 'DeepLinkConnect',
      component: () => import('./views/DeepLinkConnect.vue'),
      meta: { fullscreen: true },
    },
  ],
})

export default router
