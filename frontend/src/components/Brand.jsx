import { Link } from 'react-router-dom'

// 서비스 이름 표시. 주민 화면은 '안전 캐치' 글자 로고(두 줄로 쌓고 모서리에 노란 괄호, Figma 주민 앱 리디자인 기준)를 쓴다.
// 로고 이미지 파일(마스코트 부엉이 포함)은 디자인 팀 최종본을 받아 교체한다. 지금은 코드로 그린 글자 로고다.
// 관리자 화면은 이름 변경 전 로고 이미지를 그대로 쓴다(legacy). 관리자 쪽 이름 변경은 따로 한다.
export default function Brand({ inverse = false, home = '/', legacy = false }) {
  if (legacy) {
    return <Link to={home} className="brand-logo" aria-label="성북 안전공백지도 홈"><img src={inverse ? '/brand/logo-white.png' : '/brand/logo.png'} alt="성북 안전공백지도" /></Link>
  }
  return (
    <Link to={home} className="brand-mark" aria-label="안전 캐치 홈">
      <span className="brand-mark-box" aria-hidden="true"><span>안전</span><span>캐치</span></span>
    </Link>
  )
}
