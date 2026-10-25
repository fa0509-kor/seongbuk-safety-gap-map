import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api.js'

// 주민 1 첫 화면 (QR 진입). 와이어프레임 '주민 1 · 첫 화면' 배치.
// '이번 주 제보·조치 완료 건수'는 GET /api/stats (체험·오탐 제외). 불러오기 전·실패 시 '—'
const CameraIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" />
  </svg>
)

export default function Home() {
  const [stats, setStats] = useState(null)
  useEffect(() => { api.stats().then(setStats).catch(() => {}) }, [])
  return (
    <section className="flex min-h-full flex-col gap-5 bg-page px-6 pb-6 pt-12 text-ink">
      <div className="flex items-center gap-2">
        <div className="h-7 w-7 rounded-lg bg-brand" />
        <div className="text-[15px] font-semibold">성북 안전 공백 지도</div>
      </div>
      <div className="mt-6 flex flex-col gap-2">
        <h1 className="text-[28px] font-bold leading-snug">사진 한 장으로<br />우리 동네 위험을<br />알려주세요</h1>
        <p className="text-[15px] leading-relaxed text-sub">찍어서 올리면 AI가 유형을 먼저 보고,<br />담당자가 확인해 조치까지 알려드려요.</p>
      </div>
      <div className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-4">
        <div className="text-[13px] text-sub">이번 주 성북구</div>
        <div className="grid grid-cols-2 gap-3">
          <div><div className="text-2xl font-bold">{stats?.week_reports ?? '—'}건</div><div className="text-[13px] text-sub">주민 제보</div></div>
          <div><div className="text-2xl font-bold text-teal-700">{stats?.week_done ?? '—'}건</div><div className="text-[13px] text-sub">조치 완료</div></div>
        </div>
      </div>
      <div className="flex-1" />
      <div className="flex flex-col gap-3">
        <Link to="/report" className="flex h-14 items-center justify-center gap-2.5 rounded-2xl bg-brand text-[17px] font-semibold text-white"><CameraIcon />지금 찍어보기</Link>
        <Link to="/report?demo=1" className="flex h-[52px] items-center justify-center rounded-2xl border border-line bg-white text-base font-medium">체험용 사진으로 해보기</Link>
        <Link to="/map" className="self-center p-2 text-sm text-brand">지도 먼저 보기</Link>
      </div>
      <div className="text-center text-xs text-sub">AI 결과는 담당자가 최종 확인합니다</div>
    </section>
  )
}
