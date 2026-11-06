// 사진 위에 문제 위치를 빨간 사각형으로 그린다. boxes는 사진 전체를 1로 본 비율(x, y, w, h)이라 사진 크기가 달라도 맞는다.
// AI 추정이라 틀릴 수 있다 (정확도는 검증하지 않았다).
export default function BoxedPhoto({ src, boxes, alt }) {
  return (
    <div className="relative">
      <img src={src} alt={alt} className="block w-full rounded-lg" />
      {(boxes ?? []).map((b, i) => (
        <div key={i} className="pointer-events-none absolute rounded-sm border-[3px] border-red-600"
          style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` }}>
          {b.label && <span className="absolute left-0 top-0 bg-red-600 px-1 text-xs font-semibold leading-5 text-white">{b.label}</span>}
        </div>
      ))}
    </div>
  )
}
