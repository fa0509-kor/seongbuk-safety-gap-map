import { useRef, useState } from 'react'

// 조치 전·후 사진을 좌우로 밀어서 비교한다 (안전신문고는 글 답변만 오는데, 우리는 사진으로 직접 확인하게 한다).
// 사진 어디서든 손가락·마우스로 끌면 움직인다(포인터 이벤트). 위아래로 움직이면 페이지가 그대로 스크롤된다(touch-action: pan-y).
// 키보드(좌우 화살표)와 스크린리더는 slider 역할로 지원한다.
export default function BeforeAfter({ before, after }) {
  const [pos, setPos] = useState(50)
  const box = useRef(null)
  const dragging = useRef(false)
  const move = (clientX) => {
    const r = box.current.getBoundingClientRect()
    setPos(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)))
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div ref={box} role="slider" tabIndex={0} aria-label="조치 전후 사진 비교. 좌우로 움직이세요"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pos)}
        className="relative aspect-[4/3] w-full cursor-ew-resize select-none overflow-hidden rounded-lg bg-gray-200 [touch-action:pan-y]"
        onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); move(e.clientX) }}
        onPointerMove={(e) => { if (dragging.current) move(e.clientX) }}
        onPointerUp={() => { dragging.current = false }}
        onPointerCancel={() => { dragging.current = false }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') { e.preventDefault(); setPos((v) => Math.max(0, v - 5)) }
          if (e.key === 'ArrowRight') { e.preventDefault(); setPos((v) => Math.min(100, v + 5)) }
        }}>
        <img src={after} alt="조치 후 사진" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
        <img src={before} alt="조치 전 사진" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }} />
        <div className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_4px_rgba(0,0,0,0.5)]" style={{ left: `${pos}%` }}>
          <span className="absolute left-1/2 top-1/2 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-sm font-bold text-ink shadow-md" aria-hidden="true">↔</span>
        </div>
        <span className="pointer-events-none absolute left-2 top-2 rounded bg-ink px-1.5 py-0.5 text-xs font-semibold text-white">조치 전</span>
        <span className="pointer-events-none absolute right-2 top-2 rounded bg-brand px-1.5 py-0.5 text-xs font-semibold text-white">조치 후</span>
      </div>
      <p className="text-[13px] text-sub">사진을 좌우로 밀어서 조치 전과 후를 비교해 보세요</p>
    </div>
  )
}
