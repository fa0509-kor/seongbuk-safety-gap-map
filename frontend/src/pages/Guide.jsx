import { Link } from 'react-router-dom'
import ProcessPicture from '../components/ProcessPicture.jsx'
import ResidentHeader from '../components/ResidentHeader.jsx'

// 서비스 안내 + 포인트·봉사시간 안내. 포인트·봉사시간 교환은 팀 논의 중이라 '준비 중'으로만 적고, 정해지지 않은 숫자는 쓰지 않는다.
const FEATURES = [
  ['제보하기', '위험해 보이는 곳 사진을 올려요. 얼굴이나 차량 번호판이 나오지 않게 찍어 주세요.'],
  ['동네 지도', '이웃이 알린 위험과 처리 상황을 지도에서 볼 수 있어요.'],
  ['내 활동', '내가 보낸 제보가 접수 → 검토 → 조치 → 완료 중 어디까지 왔는지, 단계마다 언제였는지, 내 점수와 학생이 할 수 있는 일을 봐요.'],
  ['안전왕 순위', '담당자가 확인한 제보가 쌓이면 순위에 올라요.'],
]

export default function Guide() {
  return (
    <section className="resident-screen">
      <ResidentHeader caption="서비스 안내" title="안전캐치 이용 안내" />
      <article className="resident-card">
        <h2 className="text-lg font-bold">안전캐치는 이런 서비스예요</h2>
        <p className="mt-2 text-sm leading-relaxed">사진 한 장으로 우리 동네의 위험을 알리면, 담당자가 확인하고 조치한 결과까지 알려 드려요. 이웃이 알린 제보도 지도에서 함께 볼 수 있어요.</p>
      </article>
      <section aria-label="제보 과정" className="rounded-[20px] bg-[#ebefcb] p-3.5">
        <h2 className="text-lg font-bold">제보하면 이렇게 처리돼요</h2>
        <div className="mt-3"><ProcessPicture /></div>
        <p className="mt-3 text-sm leading-snug">사진을 올리면 접수되고, 담당자가 확인하면 지도와 홈에 올라와요. 조치가 끝나면 조치 전·후 사진과 함께 보수 완료, 소유자 안내, 이상 없음 같은 결과를 알려 드려요.</p>
      </section>
      <a href="tel:119" className="flex min-h-[52px] items-center justify-between rounded-[15px] bg-danger px-4 text-[15px] font-bold text-white">
        <span>위급한 상황이면 먼저 119</span><span className="text-[13px] underline">전화하기</span>
      </a>
      <section aria-label="기능 안내" className="rounded-[20px] bg-[#ebefcb] p-3.5">
        <h2 className="text-lg font-bold">메뉴별로 이렇게 써요</h2>
        <dl className="mt-3 grid gap-3">
          {FEATURES.map(([name, text]) => (
            <div key={name}><dt className="text-sm font-bold">{name}</dt><dd className="mt-0.5 text-sm leading-snug">{text}</dd></div>
          ))}
        </dl>
      </section>
      <section aria-label="포인트와 봉사시간" className="resident-card flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold">포인트와 봉사시간</h2>
          <span className="resident-chip shrink-0 bg-[#ebefcb]">준비 중</span>
        </div>
        <div>
          <h3 className="text-sm font-bold">지금 되는 것</h3>
          <p className="mt-1 text-sm leading-snug">담당자가 확인한 제보 1건에 10점이 쌓이고, 홈의 안전왕 순위에 반영돼요. 이 점수는 순위에만 쓰이고, 포인트로 바꾸는 것은 아직 준비 중이에요.</p>
        </div>
        <div>
          <h3 className="text-sm font-bold">준비 중인 것</h3>
          <ul className="mt-1 grid list-disc gap-1 pl-5 text-sm leading-snug">
            <li>성인: 쌓은 점수를 포인트와 봉사활동 시간 중 하나로 받기</li>
            <li>학생(미성년): 봉사활동 시간으로 받기</li>
          </ul>
        </div>
        <p className="rounded-xl bg-page px-3 py-2.5 text-sm leading-snug">점수를 포인트나 봉사시간으로 바꾸는 것은 아직 시작하지 않았어요. 시간 인정 방식은 팀에서 논의 중이고, 정해지면 이 화면에서 알려 드릴게요.</p>
      </section>
      <Link to="/report" className="resident-primary grid place-items-center">사진으로 제보하기</Link>
    </section>
  )
}
