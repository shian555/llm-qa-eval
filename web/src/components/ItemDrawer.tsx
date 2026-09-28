import { Alert, Collapse, Descriptions, Drawer, Progress, Space, Spin, Tag, Typography } from 'antd'
import { useAsync } from '../hooks/useAsync'
import { getRunItem } from '../api'
import type { Scores } from '../api/types'
import { renderCitations } from './AnswerText'
import { PassTag, TypeTag } from './Tags'
import { fmtDuration, scoreTone } from '../utils/format'

interface Props {
  runId: string
  index: number | null
  onClose: () => void
}

function ScoreBar({ label, value }: { label: string; value: number | null | undefined }) {
  const v = value ?? 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 84, fontSize: 13, color: 'rgba(0,0,0,0.65)' }}>{label}</span>
      <Progress
        percent={v * 100}
        size="small"
        strokeColor={scoreTone(value)}
        format={() => (value === null || value === undefined ? '—' : value.toFixed(3))}
        style={{ flex: 1, marginBottom: 0 }}
      />
    </div>
  )
}

export function scoreRows(scores: Scores | null) {
  if (!scores) return null
  return (
    <Space direction="vertical" size={4} style={{ width: '100%' }}>
      <ScoreBar label="检索召回率" value={scores.recall} />
      <ScoreBar label="问答准确率" value={scores.accuracy} />
      <ScoreBar label="引用准确性" value={scores.citation} />
    </Space>
  )
}

// 用例详情抽屉：运行明细表 / Red Team 页共用。按 index 拉取完整明细（含检索片段）
export function ItemDrawer({ runId, index, onClose }: Props) {
  const { data, loading } = useAsync(
    () => (index === null ? Promise.resolve(null) : getRunItem(runId, index)),
    [runId, index],
  )
  const item = data

  return (
    <Drawer
      title={index === null ? '用例详情' : `用例 #${index}`}
      open={index !== null}
      onClose={onClose}
      width={640}
      destroyOnClose
    >
      {loading && <Spin />}
      {!loading && item && (
        <Space direction="vertical" size={14} style={{ width: '100%' }}>
          <Space>
            <TypeTag type={item.type} />
            <PassTag passed={item.passed} />
            {item.latency_ms !== null && (
              <Tag>耗时 {fmtDuration(item.latency_ms)}</Tag>
            )}
          </Space>

          {item.error && <Alert type="error" showIcon message="评测执行异常" description={item.error} />}

          <div>
            <Typography.Text type="secondary">问题</Typography.Text>
            <Typography.Paragraph copyable style={{ marginBottom: 0 }}>
              {item.question}
            </Typography.Paragraph>
          </div>

          {item.type === 'normal' && scoreRows(item.scores)}
          {item.type === 'inject' && (
            <Alert
              type={item.defended ? 'success' : 'error'}
              showIcon
              message={item.defended ? '模型守住：未执行注入/越狱指令' : '被攻破：答案包含违规执行痕迹（defeat markers）'}
            />
          )}
          {item.type === 'hallucination' && (
            <Alert
              type={item.hallucinated ? 'error' : 'success'}
              showIcon
              message={item.hallucinated ? '发生幻觉：对知识库外问题编造了答案' : '正确拒答：未编造'}
            />
          )}

          <div>
            <Typography.Text type="secondary">
              检索片段（top-k，进入生成的上下文）
            </Typography.Text>
            {item.contexts === null ? (
              <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                该次运行未记录检索片段（CLI 历史报告迁移的运行不含此数据）
              </Typography.Paragraph>
            ) : item.contexts.length === 0 ? (
              <Typography.Paragraph type="warning" style={{ marginBottom: 0 }}>
                检索结果为空（召回失败）
              </Typography.Paragraph>
            ) : (
              <Collapse
                size="small"
                items={item.contexts.map((c, i) => ({
                  key: i,
                  label: (
                    <span>
                      <span className="cite-mark mono">[{i + 1}]</span>{' '}
                      {c.length > 60 ? `${c.slice(0, 60)}…` : c}
                    </span>
                  ),
                  children: <Typography.Paragraph style={{ marginBottom: 0 }}>{c}</Typography.Paragraph>,
                }))}
              />
            )}
          </div>

          <div>
            <Typography.Text type="secondary">模型答案</Typography.Text>
            <Typography.Paragraph className="answer-text" style={{ marginBottom: 0 }}>
              {renderCitations(item.answer)}
            </Typography.Paragraph>
          </div>

          <Descriptions
            size="small"
            column={1}
            bordered
            items={[
              { key: 'passed', label: '判定', children: <PassTag passed={item.passed} /> },
              ...(item.scores
                ? [
                    {
                      key: 'scores',
                      label: '三维得分',
                      children: `${item.scores.recall.toFixed(3)} / ${item.scores.accuracy.toFixed(
                        3,
                      )} / ${item.scores.citation.toFixed(3)}`,
                    },
                  ]
                : []),
            ]}
          />
        </Space>
      )}
    </Drawer>
  )
}
