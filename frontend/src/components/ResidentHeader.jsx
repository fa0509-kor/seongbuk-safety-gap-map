import { Link } from 'react-router-dom'

export const residentAsset = (name) => '/resident-final/' + name

export default function ResidentHeader({ caption, title }) {
  return (
    <header className="sticky top-0 z-[1000] -mx-6 -mt-[18px] -mb-3.5 flex shrink-0 items-center gap-3 border-b border-line bg-page px-6 pb-3.5 pt-[18px]">
      <Link to="/home" aria-label="홈으로" className="shrink-0">
        <img src={residentAsset('home-imgGroup11Png.png')} alt="안전캐치" width="46" height="46" />
      </Link>
      <div>
        <p className="text-[11px] font-semibold text-sub">{caption}</p>
        <h1 className="text-[22px] font-bold leading-tight tracking-tight">{title}</h1>
      </div>
    </header>
  )
}
