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
  reportsMap: () => request('/api/reports/map'),

  // 사진: 저장 + AI 분류. 응답 { key, url, ai: { category, confidence, alternatives, reason, mock } }
  uploadPhoto: (blob, { classify = true } = {}) => {
    const form = new FormData()
    form.append('file', blob, 'photo.jpg')
    return request(`/api/photos?classify=${classify}`, { method: 'POST', body: form })
  },

  // 주민 제보
  createReport: (body) => request('/api/reports', json('POST', body)),
  myReports: (ids) => (ids.length ? request(`/api/reports?ids=${ids.join(',')}`) : Promise.resolve([])),
  report: (publicId) => request(`/api/reports/${publicId}`),
  confirm: (publicId) => request(`/api/reports/${publicId}/confirm`, { method: 'POST' }), // 나도 봤어요 +1
  stats: () => request('/api/stats'), // 첫 화면 '이번 주 제보·조치 완료'

  // 관리자
  adminReports: (params = {}) => request(`/api/admin/reports?${new URLSearchParams(params)}`),
  adminReport: (id) => request(`/api/admin/reports/${id}`),
  adminUpdate: (id, body) => request(`/api/admin/reports/${id}`, json('PATCH', body)),
  adminCreate: (body) => request('/api/admin/reports', json('POST', body)),
  adminSummary: () => request('/api/admin/summary'),
  adminIntegrated: () => request('/api/admin/integrated'), // 통합 점검 후보 (공백 아님)
  adminPeriodReport: (params = {}) => request(`/api/admin/report?${new URLSearchParams(params)}`), // 기간별 보고서
}
