import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api.js'

// 주민 1 첫 화면 (QR 진입). 문구·배치는 와이어프레임 기준으로 다시 그림.
// '이번 주 제보·조치 완료 건수'는 GET /api/stats (체험·오탐 제외). 불러오기 전·실패 시 '—'
export default function Home() {
  const [stats, setStats] = useState(null)
  useEffect(() => { api.stats().then(setStats).catch(() => {}) }, [])
  return (
    <section className="flex flex-col gap-4 p-5">
      <h1 className="text-2xl font-bold">성북 안전 공백 지도</h1>
      <p className="text-gray-600">[와이어프레임 문구 자리]</p>
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-lg bg-gray-50 p-3"><div className="text-xs text-gray-500">이번 주 제보</div><div className="text-xl">{stats?.week_reports ?? '—'}</div></div>
        <div className="rounded-lg bg-gray-50 p-3"><div className="text-xs text-gray-500">조치 완료</div><div className="text-xl">{stats?.week_done ?? '—'}</div></div>
      </div>
      <Link to="/report" className="rounded-lg bg-brand py-3 text-center font-semibold text-white">지금 찍어보기</Link>
      <Link to="/report?demo=1" className="rounded-lg border py-3 text-center">체험용 사진으로 해보기</Link>
      <Link to="/map" className="rounded-lg border py-3 text-center">지도 먼저 보기</Link>
    </section>
  )
}
