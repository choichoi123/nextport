import { useEffect, useId, useState } from 'react'
import styles from '@/styles/portfolio-preview.module.css'

function DispatchSketch() {
  const patternId = `preview-grid-${useId().replace(/:/g, '')}`
  return (
    <svg viewBox="0 0 640 390" role="img" aria-label="수요와 차량을 연결하는 관제 화면의 구성 스케치">
      <defs>
        <pattern id={patternId} width="48" height="48" patternUnits="userSpaceOnUse">
          <path d="M48 0H0V48" fill="none" stroke="#d7e1d9" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="640" height="390" fill="#e7eee7" />
      <rect width="640" height="390" fill={`url(#${patternId})`} />
      <path d="M-20 330C100 280 65 180 200 185S335 70 450 105 560 110 660 5" fill="none" stroke="#cadfd9" strokeWidth="47" />
      <path d="M-20 330C100 280 65 180 200 185S335 70 450 105 560 110 660 5" fill="none" stroke="#f7faf7" strokeWidth="28" />
      <g fill="#b4d6bd" stroke="#8cba9b" strokeWidth="1.5">
        <path d="m220 95 34 20v40l-34 20-34-20v-40z" />
        <path d="m284 134 34 20v40l-34 20-34-20v-40z" opacity=".55" />
        <path d="m155 134 34 20v40l-34 20-34-20v-40z" opacity=".5" />
        <path d="m220 173 34 20v40l-34 20-34-20v-40z" opacity=".7" />
      </g>
      <path d="M182 282 220 214 284 173 348 216 405 176" fill="none" stroke="#236a50" strokeWidth="3" strokeDasharray="7 7" />
      <g fill="#236a50" stroke="#fff" strokeWidth="5">
        <circle cx="182" cy="282" r="10" /><circle cx="284" cy="173" r="10" /><circle cx="405" cy="176" r="10" />
      </g>
      <g transform="translate(30 26)">
        <rect width="160" height="38" rx="19" fill="#fff" />
        <circle cx="22" cy="19" r="4" fill="#236a50" />
        <text x="37" y="24" fill="#385648" fontSize="13">수요 · 차량 · 재배치</text>
      </g>
      <g transform="translate(420 224)">
        <rect width="190" height="134" rx="15" fill="#fff" />
        <text x="19" y="30" fontSize="12" fill="#7c8c81">WORKFLOW</text>
        <text x="19" y="58" fontSize="14" fontWeight="600" fill="#244535">확인에서 다음 행동까지</text>
        <path d="M20 83h148" stroke="#e5ebe5" />
        <text x="20" y="110" fontSize="12" fill="#5a7061">수요 확인 → 계획 → 진행 확인</text>
      </g>
    </svg>
  )
}

function MobileSketch() {
  return (
    <svg viewBox="0 0 640 390" role="img" aria-label="이용자 가입과 위치 선택을 잇는 모바일 화면의 구성 스케치">
      <rect width="640" height="390" fill="#eee9df" />
      <circle cx="335" cy="190" r="154" fill="#e2ddcf" />
      <g transform="translate(360 92) rotate(7)">
        <rect width="194" height="222" rx="15" fill="#f9f8f3" stroke="#d2cabb" />
        <text x="20" y="33" fontSize="12" fill="#8a806d">ADMINISTRATOR</text>
        <text x="20" y="65" fontSize="18" fontWeight="600" fill="#514936">센터 회원 승인</text>
        <path d="M20 86h154" stroke="#ded8cb" />
        {[112, 150, 188].map((y) => <g key={y}><circle cx="30" cy={y} r="9" fill="#e1ddcf" /><rect x="49" y={y - 4} width="66" height="7" rx="3.5" fill="#d4ccba" /><rect x="133" y={y - 8} width="40" height="16" rx="8" fill="#dce8dc" /></g>)}
      </g>
      <g transform="translate(138 21) rotate(-5 104 173)">
        <rect width="208" height="349" rx="31" fill="#254737" />
        <rect x="7" y="7" width="194" height="335" rx="25" fill="#fffefa" />
        <rect x="73" y="13" width="62" height="7" rx="3.5" fill="#254737" />
        <text x="20" y="54" fontSize="11" fontWeight="600" fill="#244535">MOBILITY SERVICE</text>
        <text x="20" y="83" fontSize="21" fontWeight="600" fill="#244535">어디로 이동하나요?</text>
        <g fill="#6a776c" fontSize="11">
          <rect x="17" y="104" width="174" height="43" rx="9" fill="#f0f3ed" />
          <circle cx="32" cy="125" r="4" fill="#3f775a" /><text x="46" y="129">출발지 선택</text>
          <rect x="17" y="155" width="174" height="43" rx="9" fill="#f0f3ed" />
          <circle cx="32" cy="176" r="4" fill="#bd8961" /><text x="46" y="180">도착지 선택</text>
        </g>
        <rect x="17" y="211" width="174" height="76" rx="9" fill="#e2ebe1" />
        <path d="M27 268 69 246 116 259 172 227" fill="none" stroke="#9db99c" strokeWidth="11" />
        <path d="M47 269 80 237 131 252 166 231" fill="none" stroke="#3f775a" strokeWidth="2" strokeDasharray="4 4" />
        <rect x="17" y="302" width="174" height="23" rx="7" fill="#254737" />
        <text x="104" y="318" textAnchor="middle" fontSize="10" fill="#fff">위치를 정하고 다음 단계로</text>
      </g>
    </svg>
  )
}

function WebsiteSketch() {
  return (
    <svg viewBox="0 0 640 390" role="img" aria-label="반응형 기업 홈페이지의 구성 스케치">
      <rect width="640" height="390" fill="#dfe6eb" />
      <g transform="translate(42 42)">
        <rect width="556" height="308" rx="15" fill="#fff" />
        <path d="M0 15Q0 0 15 0h526q15 0 15 15v18H0z" fill="#f1f4f6" />
        <g fill="#b7c3cb"><circle cx="16" cy="17" r="3" /><circle cx="27" cy="17" r="3" /><circle cx="38" cy="17" r="3" /></g>
        <text x="27" y="65" fill="#344e61" fontSize="13" fontWeight="600">COMPANY</text>
        <text x="340" y="64" fill="#8c9ca8" fontSize="10">소개　 제품　 문의</text>
        <rect y="83" width="556" height="225" fill="#d4dfe7" />
        <path d="M290 308 376 84h76l-86 224M410 308l86-224h60v224" fill="#bdcdd8" />
        <text x="29" y="147" fill="#42627a" fontSize="10" letterSpacing="2">A NEW PERSPECTIVE</text>
        <text x="27" y="193" fill="#27485f" fontSize="35" fontWeight="600">더 명확하게,</text>
        <text x="27" y="237" fill="#27485f" fontSize="35" fontWeight="600">더 유연하게.</text>
        <path d="M31 272h43" stroke="#486b82" strokeWidth="2" />
        <g transform="translate(421 166)">
          <rect width="101" height="155" rx="13" fill="#29485e" />
          <rect x="5" y="5" width="91" height="145" rx="9" fill="#f9fbfc" />
          <rect x="15" y="34" width="71" height="62" fill="#d4dfe7" />
          <rect x="15" y="109" width="43" height="4" rx="2" fill="#a2b8c8" /><rect x="15" y="120" width="65" height="3" rx="1.5" fill="#d4dfe7" />
        </g>
      </g>
    </svg>
  )
}

export default function ProjectArt({ project, className = '' }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [project.cover])
  const isCover = project.cover && !failed

  return (
    <figure className={`${styles.projectArt} ${className}`}>
      {isCover ? <img src={project.cover} alt={`${project.title} 표지`} loading="lazy" decoding="async" onError={() => setFailed(true)} />
        : project.art === 'dispatch' ? <DispatchSketch />
          : project.art === 'mobile' ? <MobileSketch /> : <WebsiteSketch />}
      {!isCover && <figcaption>{failed ? '표지 대신 구성 스케치를 표시합니다' : '구성 스케치 · 실제 서비스 화면 아님'}</figcaption>}
    </figure>
  )
}
