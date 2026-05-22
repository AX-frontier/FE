export type PageNavigationTarget = {
	label: string;
	url: string;
	aliases: string[];
};

const NAVIGATION_TERMS = [
	"이동",
	"열어",
	"열어줘",
	"바로가기",
	"링크",
	"페이지",
	"사이트",
	"접속",
];

const INFORMATION_QUESTION_TERMS = [
	"몇시",
	"몇 시",
	"언제",
	"운영시간",
	"운영 시간",
	"개관",
	"휴관",
	"몇시에",
	"몇 시에",
	"몇시까지",
	"몇 시까지",
	"알려줘",
];

const EXPLICIT_PAGE_TERMS = [
	"페이지",
	"사이트",
	"링크",
	"바로가기",
	"이동",
	"접속",
];

export const PAGE_NAVIGATION_TARGETS: PageNavigationTarget[] = [
	{
		label: "웹메일",
		url: "https://mail.hansung.ac.kr/",
		aliases: ["웹메일", "메일", "한성 웹메일"],
	},
	{
		label: "전자 조달",
		url: "https://www.ebiz4u.co.kr/home.do",
		aliases: ["전자조달", "전자 조달", "인터넷 전자조달", "조달"],
	},
	{
		label: "학술정보관",
		url: "https://hsel.hansung.ac.kr/",
		aliases: ["학술정보관", "학정관", "도서관", "hsel"],
	},
	{
		label: "대학 일자리 플러스 센터",
		url: "https://career.hansung.ac.kr/",
		aliases: ["대학일자리플러스센터", "대학 일자리 플러스 센터", "일자리센터", "일자리 플러스", "커리어"],
	},
	{
		label: "제증명 발급",
		url: "https://career.hansung.ac.kr/",
		aliases: ["제증명", "제증명발급", "증명서", "증명서 발급"],
	},
	{
		label: "공지사항",
		url: "https://www.hansung.ac.kr/hansung/6172/subview.do",
		aliases: ["공지사항", "공지", "한성공지"],
	},
	{
		label: "eclass",
		url: "https://learn.hansung.ac.kr/login.php?errorcode=4",
		aliases: ["eclass", "이클래스", "e-class", "학습관리"],
	},
	{
		label: "종합정보시스템",
		url: "https://info.hansung.ac.kr/",
		aliases: ["종합정보시스템", "종정시", "수강신청", "종합정보", "info"],
	},
	{
		label: "장학금 안내",
		url: "https://hansung.ac.kr/edubank/5762/subview.do",
		aliases: ["장학금", "장학금 안내", "장학"],
	},
	{
		label: "공간예약",
		url: "https://www.hansung.ac.kr/cncschool/4182/subview.do?enc=Zm5jdDF8QEB8JTJGcmVzdmUlMkZjbmNzY2hvb2wlMkY3JTJGYXJ0Y2xSZWdpc3RWaWV3LmRvJTNG",
		aliases: ["공간예약", "공간 예약", "시설예약", "시설 예약"],
	},
	{
		label: "학사일정",
		url: "https://www.hansung.ac.kr/hansung/6096/subview.do",
		aliases: ["학사일정", "학사 일정", "일정"],
	},
	{
		label: "연구정보",
		url: "https://hansung.ac.kr/sites/rnd/index.do",
		aliases: ["연구정보", "연구 정보", "산학연구", "연구"],
	},
];

function compact(value: string): string {
	return value.toLowerCase().replace(/\s+/g, "");
}

function hasNavigationIntent(message: string): boolean {
	const normalized = compact(message);
	if (!NAVIGATION_TERMS.some((term) => normalized.includes(compact(term)))) {
		return false;
	}
	if (INFORMATION_QUESTION_TERMS.some((term) => normalized.includes(compact(term)))) {
		return false;
	}
	return (
		EXPLICIT_PAGE_TERMS.some((term) => normalized.includes(compact(term))) ||
		normalized.endsWith("열어") ||
		normalized.endsWith("열어줘")
	);
}

export function resolvePageNavigationTarget(
	message: string,
): PageNavigationTarget | null {
	if (!hasNavigationIntent(message)) return null;
	const normalized = compact(message);
	return (
		PAGE_NAVIGATION_TARGETS.find((target) =>
			target.aliases.some((alias) => normalized.includes(compact(alias))),
		) ?? null
	);
}
