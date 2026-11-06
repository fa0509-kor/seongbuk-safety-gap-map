import { formatTaken } from '../lib/exif.js'

// 제보 화면: 붙인 사진(최대 4장) 한 줄과, 사진 수만큼의 메모 칸. 사진마다 번호를 달고 메모 칸 이름에도 같은 번호를 쓴다.
// 사진 모서리의 X로 지우고(대표를 지우면 다음 사진이 대표가 됨), 대표가 아닌 사진은 '대표로 지정'으로 대표를 바꾼다.
// 대표 사진 한 장만 제보의 AI 분류·점수에 쓰인다. AI는 사진마다 본 내용으로 메모 초안을 칸마다 채운다.
export default function PhotoStrip({ items, onMemo, onRemove, onMakeMain, onAdd, adding, max = 4, aiDrafted }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-line bg-white p-3">
      <p className="text-sm font-semibold">붙인 사진 {items.length}/{max}</p>
      <div className="flex items-center gap-2 overflow-x-auto pb-0.5 pt-2">
        {items.map((it, i) => (
          <div key={it.key} className="relative h-[72px] w-[72px] shrink-0">
            <img src={it.preview} alt={`사진 ${i + 1}${i === 0 ? ' (대표)' : ''}`} className="h-full w-full rounded-lg border border-line object-cover" />
            <span className={`absolute left-0 top-0 rounded-br rounded-tl-lg px-1.5 py-0.5 text-xs font-semibold text-white ${i === 0 ? 'bg-ink' : 'bg-gray-600'}`}>{i === 0 ? '1 대표' : i + 1}</span>
            <button type="button" onClick={() => onRemove(i)} aria-label={`사진 ${i + 1} 지우기`}
              className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full border border-line bg-white text-sm font-bold text-ink shadow">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" /></svg>
            </button>
          </div>
        ))}
        {items.length < max && (
          <label className="flex h-[72px] w-[72px] shrink-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-sub text-[13px] font-medium text-sub">
            {adding ? '올리는 중' : <><span className="text-lg leading-none">+</span>사진 추가</>}
            <input type="file" accept="image/*" multiple className="hidden" disabled={adding}
              onChange={(e) => { if (e.target.files.length) onAdd([...e.target.files]); e.target.value = '' }} />
          </label>
        )}
      </div>
      {aiDrafted && <p className="text-[13px] text-sub">AI가 사진마다 보고 쓴 초안이 칸마다 들어 있어요. 고쳐서 보내셔도 됩니다.</p>}
      <ul className="flex flex-col gap-2">
        {items.map((it, i) => (
          <li key={it.key} className="flex flex-col gap-1 rounded-lg bg-page p-2.5">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">사진 {i + 1}{i === 0 ? ' (대표)' : ''} 메모 (선택)</span>
              <input value={it.memo} maxLength={200} onChange={(e) => onMemo(i, e.target.value)}
                placeholder="예: 담장 아래쪽 금이 간 곳" className="h-11 rounded-lg border border-line bg-white px-3 text-[15px] text-ink" />
            </label>
            <div className="flex items-center justify-between text-[13px] text-sub">
              <span>{it.takenAt ? `촬영 ${formatTaken(it.takenAt)}` : '촬영 일시를 알 수 없어요'}</span>
              {i > 0 && <button type="button" onClick={() => onMakeMain(i)} className="-my-3 py-3 font-medium text-brand underline">대표로 지정</button>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
