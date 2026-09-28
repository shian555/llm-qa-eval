import { createBrowserRouter, Navigate } from 'react-router-dom'
import { BasicLayout } from '../layouts/BasicLayout'
import DashboardPage from '../pages/dashboard'
import RunListPage from '../pages/runs/list'
import RunDetailPage from '../pages/runs/detail'
import ComparePage from '../pages/compare'
import DatasetPage from '../pages/dataset'
import SecurityPage from '../pages/security'
import PlaygroundPage from '../pages/playground'
import AboutPage from '../pages/about'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <BasicLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'runs', element: <RunListPage /> },
      { path: 'runs/:runId', element: <RunDetailPage /> },
      { path: 'compare', element: <ComparePage /> },
      { path: 'dataset', element: <DatasetPage /> },
      { path: 'security', element: <SecurityPage /> },
      { path: 'playground', element: <PlaygroundPage /> },
      { path: 'about', element: <AboutPage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])
