import { Link } from 'react-router-dom'
import { residentAsset } from '../components/ResidentHeader.jsx'

export default function Intro() {
  return (
    <main className="mx-auto flex min-h-full max-w-[402px] flex-col bg-page px-[26px] pb-14 pt-20">
      <div className="flex items-center gap-3">
        <img src={residentAsset('intro-imgGroup11.svg')} alt="안전캐치" className="w-[118px]" />
        <img src={residentAsset('intro-imgImage12.png')} alt="" className="size-[126px] object-contain" />
      </div>
      <h1 className="mt-7 text-[29px] font-bold leading-[1.22] tracking-tight">
        사진 한 장으로<br />우리 <span className="text-[#899900]">동네 위험</span>을<br />알려주세요!
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-sub">찍어서 올리면 AI가 유형을 먼저 보고,<br />담당자가 확인해 조치까지 알려드려요.</p>
      <div className="mt-auto grid gap-3 pt-12 text-center">
        <Link to="/report?capture=1" className="flex min-h-[62px] items-center justify-center gap-2 rounded-xl bg-brand text-xl font-bold text-white">
          <img src={residentAsset('home-imgCamera1.svg')} alt="" />지금 찍어보기
        </Link>
        <Link to="/report?demo=1" className="grid min-h-[62px] place-items-center rounded-xl border border-sub text-xl font-bold">체험용 사진으로 해보기</Link>
        <Link to="/map" className="py-1 text-sm underline">지도 먼저 보기</Link>
      </div>
    </main>
  )
}
