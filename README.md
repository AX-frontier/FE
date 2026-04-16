# 한성대학교 AI 통합 정보 서비스

메타 에이전트 기반 대학 정보 통합 AI 서비스 프론트엔드입니다.

## 기술 스택

- **Vite** + **React 19** + **TypeScript**
- **Tailwind CSS 4**
- **TanStack Query** + **Axios**
- **React Router v7**
- **pnpm**

## 프로젝트 구조

```
src/
├── apis/                  # API 통신
├── assets/                # 정적 자원
├── components/
│   └── common/
│       ├── Header/        # 상단 네비게이션
│       ├── Sidebar/       # 대화 기록 사이드바
│       └── AgentBadge/    # 에이전트 배지
├── constants/             # 라우트 등 상수
├── pages/
│   ├── home/              # 메인 홈페이지
│   └── chat/              # 통합 채팅 페이지
│       └── components/    # DocumentReview UI
├── router/                # 라우팅 설정
├── styles/                # 전역 스타일
├── types/                 # 타입 정의
└── utils/
    └── aiService.ts       # Claude API 연동 + 에이전트 감지
```

## 에이전트 시스템

| 에이전트 | 트리거 키워드 | 역할 |
|---|---|---|
| 🎓 한성 AI (메인) | 일반 학교 정보 | 기본 응답 계층 |
| 📚 학술정보관 AI | 도서관, 도서, 대출, DB... | 학술정보관 이용·도서 검색 |
| 📋 문서 결재 AI | 결재, 문서, 기안, 공문... | 행정 결재 문서 검토 |

## 시작하기

```bash
pnpm install
pnpm dev
```

## 빌드

```bash
pnpm build
```

## 브랜드 컬러

| 컬러 | Hex | 용도 |
|---|---|---|
| Sky Blue | `#00AEEF` | 강조, 그라디언트 |
| Blue | `#003DA5` | 메인 |
| Dark Blue | `#002060` | 제목, 강조 |
| Gray | `#6D6E71` | 보조 텍스트 |

## 영상 배경

홈페이지 히어로 섹션에 영상이 들어갑니다.  
`public/hero.mp4` 경로에 mp4 파일을 넣으면 자동으로 재생됩니다.

## 커밋 컨벤션

```
[feat/#이슈번호] 기능 설명
[fix/#이슈번호] 버그 수정
[design/#이슈번호] UI/UX 작업
```
