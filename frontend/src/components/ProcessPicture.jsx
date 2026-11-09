// 제보 과정 4단계 그림 (찍기 → 담당자 확인 → 조치 → 결과 알림). 홈 맨 위에서 쓴다.
// 남색 2px 선 그림 + 연두 포인트, 그라데이션·그림자 없이 평평하게 (docs/decisions.md UI·UX 원칙)
const LINE = { fill: 'none', stroke: '#001a47', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }
const STEPS = [
  { title: '사진 찍기', icon: <><rect x="6" y="14" width="36" height="26" rx="5" {...LINE} /><path d="M17 14l3-5h8l3 5" {...LINE} /><circle cx="24" cy="27" r="7" {...LINE} /><circle cx="24" cy="27" r="3" fill="#bfd300" /></> },
  { title: '담당자 확인', icon: <><circle cx="21" cy="21" r="12" {...LINE} /><path d="M30 30l11 11" {...LINE} /><path d="M15 21l4 4 7-8" {...LINE} /></> },
  { title: '현장 조치', icon: <><path d="M10 38l16-16" {...LINE} strokeWidth="4" /><path d="M24 12a8 8 0 0 0 10 10l6 6-5 5-6-6a8 8 0 0 0-10-10z" {...LINE} /><circle cx="35" cy="13" r="3" fill="#bfd300" /></> },
  { title: '결과 알림', icon: <><path d="M12 34V22a12 12 0 0 1 24 0v12l3 4H9z" {...LINE} /><path d="M20 42a4 4 0 0 0 8 0" {...LINE} /><circle cx="36" cy="10" r="4" fill="#bfd300" /></> },
]

export default function ProcessPicture() {
  return (
    <ol aria-label="제보 과정" className="grid grid-cols-4 gap-1.5">
      {STEPS.map(({ title, icon }, i) => (
        <li key={title} className="relative flex flex-col items-center gap-1.5 text-center">
          <span className="relative grid size-[60px] place-items-center rounded-2xl bg-white">
            <svg viewBox="0 0 48 48" className="size-9" aria-hidden="true">{icon}</svg>
            <span className="absolute -left-1 -top-1 grid size-5 place-items-center rounded-full bg-brand text-[11px] font-bold text-white">{i + 1}</span>
          </span>
          <span className="text-xs font-semibold leading-tight">{title}</span>
        </li>
      ))}
    </ol>
  )
}
