import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  { path: '/',           redirect: '/login' },
  { path: '/login',      name: 'Login',    component: () => import('../views/LoginView.vue') },
  { path: '/unified',    name: 'Unified',  component: () => import('../views/UnifiedView.vue') },
  { path: '/admin',      name: 'Admin',    component: () => import('../views/AdminView.vue') },
  { path: '/dashboard',  name: 'Dashboard',component: () => import('../views/DashboardView.vue') },  // v3.0
  { path: '/inventory',  name: 'Inventory',component: () => import('../views/InventoryView.vue') },  // v3.0 实时库存
  { path: '/test',       name: 'Test',     component: () => import('../views/TestPage.vue') },     // v7.1 录音测试
  { path: '/oss-admin',  name: 'OssAdmin', component: () => import('../views/OssAdmin.vue') },     // v7.1 OSS管理
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
