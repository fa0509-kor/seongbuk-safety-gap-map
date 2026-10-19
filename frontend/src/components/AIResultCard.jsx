// AI 판별 결과 (주민 제보 3단계, 관리자 상세 'AI가 본 것'에서 같이 씀)
// 신뢰도는 모델이 스스로 적은 값이라 '정확도'라고 쓰지 않는다 (CLAUDE.md).
export default function AIResultCard({ ai }) {
  if (!ai) return <p className="text-sm text-gray-500">AI 결과 없음</p>
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-lg font-semibold">{ai.category}</span>
        <span className="text-sm text-gray-600">AI 확신도 {ai.confidence}</span>
      </div>
      {ai.alternatives?.length > 0 && (
        <p className="mt-1 text-sm text-gray-600">
          다른 후보: {ai.alternatives.map((a) => `${a.category} ${a.confidence}`).join(', ')}
        </p>
      )}
      {ai.reason && <p className="mt-1 text-sm">{ai.reason}</p>}
      {ai.mock && <p className="mt-2 text-xs text-amber-600">임시 결과(Mock): AI 키가 없거나 호출에 실패함</p>}
    </div>
  )
}
