const Home = () => import('@/views/index.vue')

const K8sView = () => import('@/views/k8s/index.vue')
const K8sTerminal = () => import('@/views/k8s/terminal/index.vue')

export const AppRoutes = [
  {
    path: '/',
    name: 'Home',
    component: Home
  },
  {
    path: '/k8s',
    name: 'K8s',
    component: K8sView,
    children: [
      {
        path: '',
        name: 'K8sTerminal',
        component: K8sTerminal
      }
    ]
  }
]
