import { useEffect, useState } from 'react'
import StatusSteps from '../components/StatusSteps.jsx'
import { api } from '../lib/api.js'
import { myReports } from '../lib/myReports.js'

// 주민 4 내 제보: 상태 진행, 제보 사진과 조치 후 사진, 담당 부서 메모.
// 이 화면을 열면 '확인한 시각'을 저장해 하단바 빨간 점이 꺼진다.
export default function MyReports() {
  const [list, setList] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.myReports(myReports.ids())
      .then((r) => { setList(r); myReports.markSeen() })
      .catch((e) => setError(e.message))
  }, [])

  if (error) return <p className="p-5 text-danger">불러오기 실패: {error}</p>
  if (!list) return <p className="p-5">불러오는 중…</p>
  if (!list.length) return <p className="p-5 text-gray-500">아직 이 폰에서 보낸 제보가 없습니다.</p>

  return (
    <section className="flex flex-col gap-4 p-5">
      <h1 className="text-xl font-bold">내 제보</h1>
      {list.map((r) => (
        <article key={r.public_id} className="flex flex-col gap-2 rounded-lg border p-3">
          <div className="flex justify-between text-sm">
            <span className="font-semibold">{r.ai?.category ?? '분류 없음'}</span>
            <span className="text-gray-500">{new Date(r.created_at).toLocaleDateString('ko-KR')}</span>
          </div>
          <StatusSteps status={r.status} />
          <div className="grid grid-cols-2 gap-2">
            {r.photo_url && <figure><img src={r.photo_url} alt="제보 사진" className="rounded" /><figcaption className="text-xs text-gray-500">제보 사진</figcaption></figure>}
            {r.after_photo_url && <figure><img src={r.after_photo_url} alt="조치 후 사진" className="rounded" /><figcaption className="text-xs text-gray-500">조치 후</figcaption></figure>}
          </div>
          {r.dept_note && <p className="rounded bg-gray-50 p-2 text-sm">담당 부서: {r.dept_note}</p>}
        </article>
      ))}
    </section>
  )
}
