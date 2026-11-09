// 백엔드 API 호출 모음. 주소·응답 모양은 docs/api.md (서버를 켜면 /docs 에서도 확인).
// 화면 코드에서는 fetch를 직접 쓰지 말고 여기 함수를 쓴다 → 주소가 바뀌어도 이 파일만 고치면 됨.

async function request(path, options = {}) {
  const res = await fetch(path, options)
  if (!res.ok) {
    let detail = res.statusText
    try { detail = (await res.json()).detail ?? detail } catch { /* 본문 없음 */ }
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail))
  }
  return res.json()
}

const json = (method, body) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export const api = {
  health: () => request('/api/health'),
  meta: () => request('/api/meta'),

  // 지도
  facilities: () => request('/api/facilities'),
  gaps: () => request('/api/gaps'),
  zones: () => request('/api/zones'), // 보호구역 경계 (경계 있는 곳 MultiPolygon, 없는 곳 Point)
  reportsMap: () => request('/api/reports/map'),
  reportsSummary: (limit = 5) => request(`/api/reports/summary?limit=${limit}`), // 홈 제보 현황: 확인 대기 건수(숫자만), 상태별 건수, 최근 확인된 제보

  // 사진: 저장 + AI 분류. 응답 { key, url, ai: { category, confidence, alternatives, reason, mock } }
  uploadPhoto: (blob, { classify = true } = {}) => {
    const form = new FormData()
    form.append('file', blob, 'photo.jpg')
    return request(`/api/photos?classify=${classify}`, { method: 'POST', body: form })
  },

  // 주민 제보
  createReport: (body) => request('/api/reports', json('POST', body)),
  myReports: (ids, clientKey) => (ids.length ? request(`/api/reports?ids=${ids.join(',')}${clientKey ? `&client_key=${encodeURIComponent(clientKey)}` : ''}`) : Promise.resolve([])), // client_key가 같은 제보는 완료 전에도 내 사진이 나옴
  nearby: (lat, lon, category, accuracy) => request(`/api/reports/nearby?${new URLSearchParams({ lat, lon, ...(category ? { category } : {}), ...(accuracy ? { accuracy } : {}) })}`), // 같은 곳에 이미 있는 제보(진행 중, 조치 완료 후)
  cancelReport: (publicId, clientKey) => request(`/api/reports/${publicId}/cancel`, json('POST', { client_key: clientKey })), // 접수 상태 제보 취소(본인 브라우저만)
  feedback: (publicId, kind, clientKey) => request(`/api/reports/${publicId}/feedback`, json('POST', { kind, client_key: clientKey })), // 조치 완료 뒤 고쳐졌어요/아직 그대로예요
  report: (publicId) => request(`/api/reports/${publicId}`),
  confirm: (publicId) => request(`/api/reports/${publicId}/confirm`, { method: 'POST' }), // 나도 봤어요 +1
  ranking: (limit = 5, clientKey) => request(`/api/ranking?limit=${limit}${clientKey ? `&client_key=${encodeURIComponent(clientKey)}` : ''}`), // 안전왕 순위(홈). 식별값은 내 순위를 찾는 데만 쓴다
  stats: () => request('/api/stats'), // 첫 화면 '이번 주 제보·조치 완료'

  // 관리자
  adminReports: (params = {}) => request(`/api/admin/reports?${new URLSearchParams(params)}`),
  adminPlaceHistory: (id) => request(`/api/admin/reports/${id}/place-history`), // 같은 곳 이력(조치 전후 사진, 재발)
  adminReport: (id) => request(`/api/admin/reports/${id}`),
  adminUpdate: (id, body) => request(`/api/admin/reports/${id}`, json('PATCH', body)),
  ledgerUrl: (params = {}) => `/api/admin/ledger.xlsx?${new URLSearchParams(params)}`, // 점검 대장 엑셀 (a 태그 href로 바로 내려받기)
  adminCreate: (body) => request('/api/admin/reports', json('POST', body)),
  adminSummary: () => request('/api/admin/summary'),
  adminIntegrated: () => request('/api/admin/integrated'), // 통합 점검 후보 (공백 아님)
  adminPeriodReport: (params = {}) => request(`/api/admin/report?${new URLSearchParams(params)}`), // 기간별 보고서
}
