import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { residentAsset } from '../components/ResidentHeader.jsx'
import { api } from '../lib/api.js'

// 쓰는 방법을 그림 세 컷으로 보여 준다 (멘토: 사용 방법이 이미지로 보이면 이해가 훨씬 쉽다).
// 선 그림은 남색 2px 선 + 연두 포인트. 그라데이션·그림자 없이 평평하게.
const ICON = { fill: 'none', stroke: '#001a47', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }
const STEPS = [
  { title: '찍어서 올려요', icon: <><rect x="6" y="14" width="36" height="26" rx="5" {...ICON} /><path d="M17 14l3-5h8l3 5" {...ICON} /><circle cx="24" cy="27" r="7" {...ICON} /><circle cx="24" cy="27" r="3" fill="#bfd300" /></> },
  { title: 'AI와 담당자가\n확인해요', icon: <><circle cx="21" cy="21" r="12" {...ICON} /><path d="M30 30l11 11" {...ICON} /><path d="M15 21l4 4 7-8" {...ICON} stroke="#001a47" /></> },
  { title: '조치되면\n알려드려요', icon: <><path d="M24 6l16 6v11c0 10-7 17-16 20C15 40 8 33 8 23V12z" {...ICON} /><path d="M17 24l5 5 9-10" stroke="#001a47" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" /></> },
]

export default function Intro() {
  const [stats, setStats] = useState(null) // 이번 주 제보·조치 완료 건수 (실패하면 이 칸만 숨김)
  useEffect(() => { api.stats().then(setStats).catch(() => {}) }, [])
  return (
    <main className="mx-auto flex min-h-full max-w-[402px] flex-col bg-page">
      {/* 급할 때 바로 걸 수 있게 맨 위에 둔다 */}
      <a href="tel:119" className="flex min-h-[48px] items-center justify-between bg-danger px-[26px] text-[15px] font-bold text-white">
        <span>위급한 상황이면 먼저 119</span><span className="text-[13px] underline">전화하기</span>
      </a>
      <div className="flex flex-1 flex-col px-[26px] pb-10 pt-8">
        <div className="flex items-center gap-3">
          <img src={residentAsset('intro-imgGroup11.svg')} alt="안전캐치" className="w-[104px]" />
          <img src={residentAsset('intro-imgImage12.png')} alt="" className="size-[72px] object-contain" />
        </div>
        <h1 className="mt-5 text-[29px] font-bold leading-[1.22] tracking-tight">
          사진 한 장으로<br />우리 <span className="text-[#899900]">동네 위험</span>을<br />알려주세요!
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-sub">찍어서 올리면 AI가 유형을 먼저 보고,<br />담당자가 확인해 조치까지 알려드려요.</p>
        <div className="mt-6 grid gap-3 text-center">
          <Link to="/report?capture=1" className="flex min-h-[62px] items-center justify-center gap-2 rounded-xl bg-brand text-xl font-bold text-white">
            <img src={residentAsset('home-imgCamera1.svg')} alt="" />지금 찍어보기
          </Link>
          <div className="grid grid-cols-2 gap-3">
            <Link to="/report?demo=1" className="grid min-h-[56px] place-items-center rounded-xl border border-sub px-2 text-[15px] font-bold leading-tight">체험용 사진으로<br />해보기</Link>
            <Link to="/map" className="grid min-h-[56px] place-items-center rounded-xl border border-sub px-2 text-[15px] font-bold leading-tight">지도로 제보<br />둘러보기</Link>
          </div>
        </div>
        <section aria-label="이렇게 써요" className="mt-8 rounded-[20px] bg-[#ebefcb] px-3.5 py-4">
          <h2 className="text-sm font-bold">이렇게 써요</h2>
          <ol className="mt-3 grid grid-cols-3 gap-2">
            {STEPS.map(({ title, icon }, i) => (
              <li key={title} className="flex flex-col items-center gap-2 text-center">
                <span className="relative grid size-[64px] place-items-center rounded-2xl bg-white">
                  <svg viewBox="0 0 48 48" className="size-9" aria-hidden="true">{icon}</svg>
                  <span className="absolute -left-1.5 -top-1.5 grid size-6 place-items-center rounded-full bg-brand text-xs font-bold text-white">{i + 1}</span>
                </span>
                <span className="whitespace-pre-line text-[13px] font-semibold leading-snug">{title}</span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs leading-relaxed text-sub">담당자가 확인한 제보는 지도에서 누구나 처리 상황을 볼 수 있어요.</p>
        </section>
        {stats && <section aria-label="이번 주 우리 동네" className="mt-3 rounded-[20px] border border-line bg-white px-3.5 py-4">
          <h2 className="text-sm font-bold">이번 주 우리 동네</h2>
          {stats.week_reports + stats.week_done === 0
            ? <p className="mt-2 text-sm text-sub">이번 주 첫 제보를 기다리고 있어요.</p>
            : <div className="mt-2 grid grid-cols-2 gap-3 text-center">
              <p><span className="block text-2xl font-bold">{stats.week_reports}건</span><span className="text-xs text-sub">새로 접수된 제보</span></p>
              <p><span className="block text-2xl font-bold">{stats.week_done}건</span><span className="text-xs text-sub">조치 완료</span></p>
            </div>}
        </section>}
      </div>
    </main>
  )
}
