import {
  DatabaseOutlined,
  ExperimentOutlined,
  HistoryOutlined,
  InfoCircleOutlined,
  SafetyCertificateOutlined,
  SwapOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import { Badge, Button, Layout, Menu, Space, Tooltip } from 'antd'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { usePolling } from '../hooks/usePolling'
import { getRunning } from '../api'
import type { RunStatusInfo } from '../api/types'

const { Sider, Header, Content } = Layout

const MENU_ITEMS = [
  { key: '/', icon: <ThunderboltOutlined />, label: '总览' },
  { key: '/runs', icon: <HistoryOutlined />, label: '评测运行' },
  { key: '/compare', icon: <SwapOutlined />, label: '运行对比' },
  { key: '/dataset', icon: <DatabaseOutlined />, label: '数据集' },
  { key: '/security', icon: <SafetyCertificateOutlined />, label: '安全测试' },
  { key: '/playground', icon: <ExperimentOutlined />, label: '在线调试' },
  { key: '/about', icon: <InfoCircleOutlined />, label: '关于' },
]

// 全局运行状态徽标：有评测进行中时所有页面可见，点击直达详情
function RunBadge() {
  const navigate = useNavigate()
  const { data } = usePolling(getRunning, { intervalMs: 2000 })
  const running: RunStatusInfo | null = data?.status ?? null
  if (!data?.run_id) return null
  const done = running?.progress
  return (
    <Tooltip title={running ? `评测进行中 ${done?.done}/${done?.total}，点击查看` : '评测进行中'}>
      <Badge status="processing" offset={[-2, 2]}>
        <Button
          size="small"
          type="primary"
          ghost
          onClick={() => navigate(`/runs/${data.run_id}`)}
        >
          评测进行中
        </Button>
      </Badge>
    </Tooltip>
  )
}

export function BasicLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const selected =
    MENU_ITEMS.filter((m) => m.key !== '/')
      .find((m) => location.pathname.startsWith(m.key))?.key ?? '/'

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider theme="dark" width={200}>
        <div
          className="site-title"
          style={{ color: '#fff', padding: '18px 24px', fontSize: 15 }}
        >
          LLM QA Eval 评测平台
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selected]}
          items={MENU_ITEMS}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header className="site-header" style={{ height: 48, lineHeight: '48px' }}>
          <span className="site-title">
            大模型问答系统 · 三维质量评测 + 安全鲁棒性测试
          </span>
          <Space>
            <RunBadge />
          </Space>
        </Header>
        <Content className="page">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
