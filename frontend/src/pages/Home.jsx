import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import ResidentHeader, { residentAsset } from '../components/ResidentHeader.jsx'
import { api } from '../lib/api.js'

export default function Home() {
  const [news, setNews] = useState(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    api.reportsMap().then(({ features }) => {
      setNews(features.filter(({ properties }) => properties.status === 'done')
        .sort((a, b) => b.properties.created_at.localeCompare(a.properties.created_at))[0]?.properties ?? null)
    }).catch(() => setError(true))
  }, [])

  return (
    <section className="resident-screen resident-home">
      <ResidentHeader caption="우리 동네 안전 체크!" title="성북 안전 공백 지도" />
      <Link to="/map" className="rounded-[20px] bg-[#ebefcb] p-3.5">
        <span className="rounded-full bg-white px-2.5 py-1.5 text-[11px] font-bold">성북구 · 지도 예시</span>
        <h2 className="my-3 text-lg font-bold">내 주변에 어떤 제보가 있나요?</h2>
        <div className="relative">
          <img src={residentAsset('home-img.png')} alt="성북구 지도 예시" className="h-[180px] w-full rounded-[13px] object-cover" />
          {[[27, 35, '#001a47'], [51, 55, '#a7430d'], [76, 38, '#166548']].map(([x, y, color]) => (
            <span key={color} className="absolute grid size-7 -translate-1/2 place-items-center rounded-full" style={{ left: x + '%', top: y + '%', background: color }}>
              <img src={residentAsset('home-imgPin.svg')} alt="" />
            </span>
          ))}
        </div>
        <span className="mt-2.5 flex items-center justify-between text-sm font-bold">동네 지도 열기<img src={residentAsset('home-imgChev.svg')} alt="" /></span>
      </Link>
      <Link to="/report" className="resident-primary flex items-center justify-center gap-2">
        <img src={residentAsset('home-imgCamera1.svg')} alt="" />사진으로 제보하기
      </Link>
      <h2 className="text-lg font-bold">우리 동네 소식</h2>
      <article className="resident-card">
        {news ? <>
          <span className="resident-chip bg-[#e5f4ec] text-[#166548]">조치 완료</span>
          <h3 className="mt-2 font-bold">{news.category ?? '주민 제보'} 조치 완료</h3>
          <p className="mt-2 text-xs text-sub">주민 제보로 발견한 위험을 정리했어요.</p>
        </> : <p className="text-sm text-sub">{error ? '동네 소식을 불러오지 못했어요.' : '최근 조치 완료 소식이 여기에 표시돼요.'}</p>}
      </article>
    </section>
  )
}
