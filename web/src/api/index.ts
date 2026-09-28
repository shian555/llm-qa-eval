// 统一 API 客户端：错误统一提取后端 detail（中文可读信息）
import axios from 'axios'
import type {
  DatasetResp,
  DiffResult,
  KbInfo,
  Overview,
  PlaygroundResult,
  RunItem,
  RunMeta,
  RunStatusInfo,
  SecurityView,
  TargetInfo,
} from './types'

export const http = axios.create({ baseURL: '/api', timeout: 60_000 })

http.interceptors.response.use(
  (r) => r,
  (err) => {
    const detail = err?.response?.data?.detail
    if (detail) err.message = typeof detail === 'string' ? detail : JSON.stringify(detail)
    return Promise.reject(err)
  },
)

// ----- 总览 / 目标 -----
export const getOverview = () => http.get<Overview>('/overview').then((r) => r.data)
export const getTargets = () =>
  http.get<{ targets: TargetInfo[] }>('/targets').then((r) => r.data.targets)

// ----- 运行 -----
export interface ListRunsParams {
  status?: string
  target?: string
  page?: number
  page_size?: number
}
export const listRuns = (params: ListRunsParams = {}) =>
  http
    .get<{ total: number; page: number; page_size: number; running_id: string | null; items: RunMeta[] }>(
      '/runs', { params },
    )
    .then((r) => r.data)
export const getRunning = () =>
  http.get<{ run_id: string | null; status: RunStatusInfo | null }>('/runs/running').then((r) => r.data)
export const getRun = (runId: string) =>
  http.get<RunMeta>(`/runs/${runId}`).then((r) => r.data)
export const getRunStatus = (runId: string) =>
  http.get<RunStatusInfo>(`/runs/${runId}/status`).then((r) => r.data)
export interface RunItemsParams {
  type?: string
  passed?: boolean
  q?: string
  page?: number
  page_size?: number
}
export const getRunItems = (runId: string, params: RunItemsParams = {}) =>
  http
    .get<{ total: number; page: number; page_size: number; items: RunItem[] }>(
      `/runs/${runId}/items`, { params },
    )
    .then((r) => r.data)
export const getRunItem = (runId: string, index: number) =>
  http.get<RunItem>(`/runs/${runId}/items/${index}`).then((r) => r.data)
export const createRun = (body: { target_id: string; note?: string; timeout_s?: number }) =>
  http.post<{ run_id: string; status: string }>('/runs', body, { timeout: 10_000 }).then((r) => r.data)
export const cancelRun = (runId: string) =>
  http.post<{ cancelled: boolean; status: string }>(`/runs/${runId}/cancel`).then((r) => r.data)
export const deleteRun = (runId: string) => http.delete(`/runs/${runId}`)
export const compareRuns = (a: string, b: string) =>
  http.post<DiffResult>('/runs/compare', { a, b }).then((r) => r.data)

// ----- 数据集 -----
export interface DatasetParams {
  type?: string
  q?: string
  page?: number
  page_size?: number
}
export const getDataset = (params: DatasetParams = {}) =>
  http.get<DatasetResp>('/dataset', { params }).then((r) => r.data)
export interface DatasetItemBody {
  type: string
  question: string
  answer?: string
  keywords?: string[]
  docs?: string[]
}
export const addDatasetItem = (body: DatasetItemBody) =>
  http.post('/dataset', body).then((r) => r.data)
export const updateDatasetItem = (index: number, body: DatasetItemBody) =>
  http.put(`/dataset/${index}`, body).then((r) => r.data)
export const deleteDatasetItem = (index: number) =>
  http.delete(`/dataset/${index}`).then((r) => r.data)
export const regenerateDataset = () =>
  http.post<{ total: number; modified: boolean }>('/dataset/regenerate').then((r) => r.data)

// ----- 安全 / Playground / 系统 -----
export const getSecurity = (runId?: string) =>
  http.get<SecurityView>('/security', { params: runId ? { run_id: runId } : {} }).then((r) => r.data)
export const playground = (body: { target_id: string; question: string; k?: number }) =>
  http.post<PlaygroundResult>('/playground', body).then((r) => r.data)
export const getKb = () => http.get<KbInfo>('/kb').then((r) => r.data)
export const getSystemInfo = () =>
  http.get<Record<string, unknown>>('/system/info').then((r) => r.data)
export const getSystemCi = () =>
  http.get<{ remote_url: string | null; badge_url: string | null; actions_url: string | null }>(
    '/system/ci',
  ).then((r) => r.data)
