export const residentAsset = (name) => '/resident-final/' + name

export default function ResidentHeader({ caption, title }) {
  return (
    <header className="flex items-center gap-3">
      <img src={residentAsset('home-imgGroup11Png.png')} alt="안전캐치" width="46" height="46" />
      <div>
        <p className="text-[11px] font-semibold text-sub">{caption}</p>
        <h1 className="text-[22px] font-bold leading-tight tracking-tight">{title}</h1>
      </div>
    </header>
  )
}
