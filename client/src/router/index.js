import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  { path: '/',           redirect: '/login' },
  { path: '/login',      name: 'Login',    component: () => import('../views/LoginView.vue') },
  { path: '/unified',    name: 'Unified',  component: () => import('../views/UnifiedView.vue') },
  { path: '/admin',      name: 'Admin',    component: () => import('../views/AdminView.vue') },
  { path: '/dashboard',  name: 'Dashboard',component: () => import('../views/DashboardView.vue') },  // v3.0
  { path: '/inventory',  name: 'Inventory',component: () => import('../views/InventoryView.vue') },  // v3.0 实时库存
  { path: '/reports',    name: 'Reports',  component: () => import('../views/ReportListView.vue') },  // v4.0
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
