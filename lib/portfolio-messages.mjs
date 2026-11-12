import { normalizeLocale } from './portfolio-i18n.mjs'

const messages = {
  ko: {
    meta: {
      title: '최지훈 | 사용자와 업무를 연결하는 웹 개발자',
      description: '교통약자 이동지원 앱부터 지도·관제 웹까지. 사용자와 업무를 연결하는 웹 개발자 최지훈의 역할, 구현 과정과 기술 선택을 소개합니다.',
      siteName: '최지훈 포트폴리오',
      imageAlt: 'B JIHOON 로고와 ‘사용자와 업무를 연결합니다.’ 문구가 있는 포트폴리오 공유 이미지',
      previewTitle: '포트폴리오 디자인 미리보기 | 최지훈',
      previewDescription: '사용자와 업무를 연결하는 웹 개발자 최지훈의 소개와 프로젝트를 살펴보는 디자인 미리보기입니다.',
      projectsTitle: '전체 프로젝트 | 웹 개발자 최지훈',
      projectsDescription: '이동지원 앱, 지도·관제 웹, 설계 도구와 기업 홈페이지. 프로젝트별 문제, 맡은 역할, 주요 구현과 기술 선택을 살펴보세요.',
    },
    nav: {
      theme: '화면 테마 전환', skip: '본문으로 건너뛰기', preview: '디자인 미리보기', examples: '예시 콘텐츠',
      archive: '기존 홈과 비교하기', home: '최지훈 포트폴리오 홈', logo: '최지훈 포트폴리오',
      primary: '주요 메뉴', projects: '프로젝트', approach: '하는 일', contact: '연락하기', footer: '하단 메뉴',
      tagline: '사용자와 업무를 연결하는 웹 개발자', language: '언어 선택', korean: '한국어로 보기', english: '영어로 보기',
    },
    home: {
      heroTitle: ['복잡한 업무를,', '명확한 웹 경험으로.'], introBefore: '안녕하세요, 웹 개발자 ', name: '최지훈', introAfter: '입니다.',
      description: ['교통약자 이동지원 이용자 앱부터 관제 웹까지.', '업무 흐름을 이해하고 화면과 API를 연결합니다.'],
      selected: '대표 프로젝트 보기', talk: '함께 이야기하기', expertise: ['서비스 프론트엔드', '지도·관제 UI', '웹 애플리케이션 연동'],
      visualLabel: '사용자 화면과 업무 시스템을 연결하는 개발 경험', visualTitle: ['화면을 넘어,', '일의 흐름까지.'],
      workflow: [{ title: '사용자의 화면', caption: '모바일 · WebView' }, { title: '운영자의 업무', caption: '지도 · 관제 · 관리' }, { title: '시스템의 연결', caption: '웹 API · 외부 연동' }],
      visualBottom: '사용자와 업무 사이의 연결을 만듭니다.', workTitle: ['프로젝트에 담긴', '문제와 해결의 과정.'],
      workDescription: ['서로 다른 사용자와 업무,', '그리고 제가 맡은 역할을 담았습니다.'],
      sampleNote: '화면 검토를 위한 예시 프로젝트입니다. 이미지는 실제 서비스 화면이 아닌 구성 스케치입니다.',
      emptyTitle: '아직 표시할 프로젝트가 없습니다.', emptyBody: '프로젝트 소개가 준비되면 이곳에서 확인할 수 있습니다.',
      workFooter: '프로젝트마다 다른 제약과 선택의 이유가 있습니다.', allProjects: '전체 프로젝트 보기',
      approachTitle: ['사용자와 업무를', '함께 이해하는 개발.'],
      approach: [
        { title: '사용자가 다음 행동을 알 수 있도록', body: '가입, 승인, 위치 선택과 접수. 여러 단계를 하나의 자연스러운 화면 흐름으로 연결합니다.' },
        { title: '복잡한 정보를 읽을 수 있도록', body: '지도 위의 수요와 차량, 여러 업무 상태를 목적에 맞게 표현하고 조작할 수 있게 만듭니다.' },
        { title: '화면과 시스템이 같은 뜻을 갖도록', body: 'API 응답과 화면 상태를 연결하며, 성공과 실패 사이의 예외 상황도 함께 다룹니다.' },
      ],
      contactTitle: ['다음 문제를', '함께 풀어가요.'], contactDescription: ['채용과 협업, 프로젝트에 관한 이야기를 기다립니다.', '편한 방법으로 연락해 주세요.'],
      kakao: '카카오 오픈채팅으로 연락하기', github: '포트폴리오 GitHub 보기',
    },
    card: {
      role: '내 역할', contribution: '핵심 기여', technologies: '{title} 사용 기술', caseStudy: '상세 사례 읽기',
      caseStudyLabel: '{title} 상세 사례 읽기 (새 탭)', preview: '사례 미리보기', previewLabel: '{title} 사례 미리보기',
      caseStudyEnglish: '상세 사례 읽기 (영문)', caseStudyEnglishLabel: '{title} 영문 상세 사례 읽기 (새 탭)',
      githubLabel: '{title} GitHub 저장소 (새 탭)', youtubeLabel: '{title} YouTube 영상 (새 탭)',
      translationPending: '영문 소개를 준비하고 있습니다. 확인된 원문을 표시합니다.',
      close: '닫기', closeLabel: '사례 미리보기 닫기',
      dialogNotice: '소개 내용과 카드 구성을 확인하는 예시입니다. 실제 상세 문서와 서비스 화면은 공개 준비 후 연결합니다.',
    },
    catalog: {
      back: '소개와 대표 프로젝트', title: ['프로젝트마다 다른 문제,', '그 안에 담긴 구현 경험.'],
      description: ['이용자 서비스부터 관제와 설계 도구까지.', '분야와 기술로 작업을 살펴보세요.'], search: '프로젝트 검색',
      placeholder: '프로젝트명, 사용 기술, 키워드', clear: '검색어 지우기', hint: '여러 단어를 입력하면 모두 포함하는 프로젝트를 찾습니다.',
      sort: '정렬', recent: '최근 시작 순', byTitle: '이름순', categories: '프로젝트 분야', all: '전체',
      results: '검색 결과 {count}개', total: '전체 {count}개', emptyTitle: '조건에 맞는 프로젝트가 없습니다.',
      emptyBody: '다른 키워드나 분야로 다시 살펴보세요.', unconfiguredTitle: '프로젝트를 준비하고 있습니다.',
      unconfiguredBody: '정리한 프로젝트와 구현 경험을 이곳에 소개하겠습니다.', reset: '검색과 분야 초기화',
      closing: '프로젝트의 배경과 구현 과정은 각 상세 소개에서 이어집니다.', contact: '경험에 대해 이야기하기',
    },
    art: {
      dispatchAlt: '수요와 차량을 연결하는 관제 화면의 구성 스케치', dispatchDemand: '수요 · 차량 · 재배치', dispatchAction: '확인에서 다음 행동까지', dispatchSteps: '수요 확인 → 계획 → 진행 확인',
      mobileAlt: '이용자 가입과 위치 선택을 잇는 모바일 화면의 구성 스케치', mobileApproval: '센터 회원 승인', mobileQuestion: '어디로 이동하나요?', mobileOrigin: '출발지 선택', mobileDestination: '도착지 선택', mobileSubmit: '위치를 정하고 다음 단계로',
      webAlt: '반응형 기업 홈페이지의 구성 스케치', webEyebrow: 'A NEW PERSPECTIVE', webTitle: '더 명확하게,', webBody: '더 유연하게.', webAction: '소개　 제품　 문의',
      unavailable: '표지 대신 구성 스케치를 표시합니다', coverAlt: '{title} 표지', coverCaption: '프로젝트 표지', conceptCaption: '구성 스케치 · 실제 서비스 화면 아님',
    },
  },
  en: {
    meta: {
      title: 'Jihoon Choi | Web Developer',
      description: 'From accessible mobility apps to dispatch dashboards, Jihoon Choi connects interfaces and APIs. Explore project challenges, contributions, and decisions.',
      siteName: 'Jihoon Choi Portfolio',
      imageAlt: 'B JIHOON logo with the Korean message “Connecting people and workflows.”',
      previewTitle: 'Portfolio Design Preview | Jihoon Choi',
      previewDescription: 'A design preview of web developer Jihoon Choi’s portfolio, connecting people and workflows through interfaces and APIs.',
      projectsTitle: 'Projects | Jihoon Choi, Web Developer',
      projectsDescription: 'Explore accessible mobility apps, dispatch dashboards, design tools, and websites, with project challenges, Jihoon Choi’s role, and implementation decisions.',
    },
    nav: {
      theme: 'Switch color theme', skip: 'Skip to content', preview: 'Design preview', examples: 'Example content',
      archive: 'Compare the previous home', home: 'Jihoon Choi portfolio home', logo: 'Jihoon Choi portfolio',
      primary: 'Main navigation', projects: 'Projects', approach: 'Approach', contact: 'Contact', footer: 'Footer navigation',
      tagline: 'A web developer connecting people and workflows', language: 'Choose language', korean: 'Read this page in Korean', english: 'Read this page in English',
    },
    home: {
      heroTitle: ['Complex workflows.', 'Clear web experiences.'], introBefore: 'Hi, I’m ', name: 'Jihoon Choi', introAfter: ', a web developer.',
      description: ['From accessible mobility apps to dispatch dashboards,', 'I connect interfaces and APIs with an understanding of the workflow.'],
      selected: 'Explore selected work', talk: 'Let’s talk', expertise: ['Service frontends', 'Maps & dispatch UI', 'Web application integration'],
      visualLabel: 'Development experience connecting user interfaces and business systems', visualTitle: ['Beyond the screen,', 'into the workflow.'],
      workflow: [{ title: 'The user’s interface', caption: 'Mobile · WebView' }, { title: 'The operator’s work', caption: 'Maps · Dispatch · Administration' }, { title: 'Connected systems', caption: 'Web APIs · External integration' }],
      visualBottom: 'Building connections between people and their work.', workTitle: ['The problems behind the work.', 'The decisions that shaped it.'],
      workDescription: ['Different people, different workflows,', 'and the role I played in each.'],
      sampleNote: 'Example projects for reviewing this design. Images are concept sketches, not actual service screenshots.',
      emptyTitle: 'No projects to display yet.', emptyBody: 'Project introductions will appear here when they are ready.',
      workFooter: 'Every project has its own constraints and reasons for each decision.', allProjects: 'View all projects',
      approachTitle: ['Understanding the people.', 'Understanding the work.'],
      approach: [
        { title: 'Make the next action clear', body: 'Registration, approval, location selection, and requests: connecting individual steps into a coherent user journey.' },
        { title: 'Make complex information readable', body: 'Presenting demand, vehicles, and operational states on maps so people can understand and act on them.' },
        { title: 'Keep the interface and system in sync', body: 'Connecting API responses to interface states, including the exceptions between success and failure.' },
      ],
      contactTitle: ['Let’s solve', 'the next problem.'], contactDescription: ['Open to conversations about roles, collaboration, and projects.', 'Get in touch in the way that works for you.'],
      kakao: 'Get in touch on Kakao Open Chat', github: 'View this portfolio on GitHub',
    },
    card: {
      role: 'My role', contribution: 'Contribution', technologies: '{title} technologies', caseStudy: 'Case study (Korean)',
      caseStudyLabel: '{title} case study in Korean (opens in a new tab)', preview: 'Preview case study', previewLabel: 'Preview {title}',
      caseStudyEnglish: 'Case study (English)', caseStudyEnglishLabel: '{title} case study in English (opens in a new tab)',
      githubLabel: '{title} GitHub repository (opens in a new tab)', youtubeLabel: '{title} YouTube video (opens in a new tab)',
      translationPending: 'English content is being prepared. The available Korean source is shown where needed.',
      close: 'Close', closeLabel: 'Close case study preview',
      dialogNotice: 'This example demonstrates the introduction and card layout. Actual case studies and service screenshots will be linked when ready for publication.',
    },
    catalog: {
      back: 'Introduction & selected work', title: ['Different problems.', 'Hands-on implementation.'],
      description: ['From user services to dispatch and design tools.', 'Explore the work by domain and technology.'], search: 'Search projects',
      placeholder: 'Project name, technology, or keyword', clear: 'Clear search', hint: 'Use multiple words to find projects that include every term.',
      sort: 'Sort by', recent: 'Most recent start', byTitle: 'Name', categories: 'Project categories', all: 'All',
      results: 'Results: {count}', total: 'All projects: {count}', emptyTitle: 'No projects match these filters.',
      emptyBody: 'Try a different keyword or category.', unconfiguredTitle: 'Projects are being prepared.',
      unconfiguredBody: 'Project introductions and implementation experience will appear here.', reset: 'Reset search & category',
      closing: 'Each case study explains the context and implementation in more detail.', contact: 'Let’s talk about the work',
    },
    art: {
      dispatchAlt: 'Concept sketch of a dispatch interface connecting demand and vehicles', dispatchDemand: 'Demand · Fleet · Planning', dispatchAction: 'From insight to action', dispatchSteps: 'Review → Plan → Track',
      mobileAlt: 'Concept sketch of mobile registration and location selection', mobileApproval: 'Member approval', mobileQuestion: 'Where to next?', mobileOrigin: 'Select pickup', mobileDestination: 'Select destination', mobileSubmit: 'Set a location and continue',
      webAlt: 'Concept sketch of a responsive company website', webEyebrow: 'A NEW PERSPECTIVE', webTitle: 'More clarity.', webBody: 'More flexibility.', webAction: 'About　 Products　 Contact',
      unavailable: 'Concept sketch shown because the cover is unavailable', coverAlt: '{title} cover', coverCaption: 'Project cover', conceptCaption: 'Concept sketch · Not an actual service screen',
    },
  },
}

export function getPortfolioMessages(locale) {
  return messages[normalizeLocale(locale)]
}

export function formatPortfolioMessage(template, values = {}) {
  return template.replace(/\{(\w+)\}/g, (match, key) => values[key] == null ? match : String(values[key]))
}

export function getCaseStudyLink(project, locale) {
  if (!project.href) return null
  const { card } = getPortfolioMessages(locale)
  const english = project.detailLanguage === 'en'
  return {
    href: project.href,
    hrefLang: english ? 'en' : 'ko',
    text: english ? card.caseStudyEnglish : card.caseStudy,
    ariaLabel: formatPortfolioMessage(english ? card.caseStudyEnglishLabel : card.caseStudyLabel, { title: project.title }),
  }
}
