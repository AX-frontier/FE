import Sidebar from "@/components/common/Sidebar";
import type { ChatHistory } from "@/types/chat";
import { listConversations } from "@/utils/aiService";
import {
	BookOpen,
	Briefcase,
	Building2,
	CalendarDays,
	ExternalLink,
	FileCheck,
	FlaskConical,
	Gift,
	Globe,
	GraduationCap,
	type LucideIcon,
	Mail,
	Megaphone,
	Menu,
	MonitorPlay,
	Search,
	X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

function DotsGrid({ size = 18 }: { size?: number }) {
	const r = size * 0.09;
	const step = size / 3;
	return (
		<svg
			width={size}
			height={size}
			viewBox={`0 0 ${size} ${size}`}
			fill="currentColor"
		>
			{[0, 1, 2].flatMap((row) =>
				[0, 1, 2].map((col) => (
					<circle
						key={`${row}-${col}`}
						cx={step * col + step / 2}
						cy={step * row + step / 2}
						r={r}
					/>
				)),
			)}
		</svg>
	);
}

const MENUS: { id: number; Icon: LucideIcon; label: string; url: string }[] = [
	{
		id: 1,
		Icon: Mail,
		label: "한성 웹메일",
		url: "https://mail.hansung.ac.kr",
	},
	{ id: 2, Icon: Globe, label: "인터넷 전자조달", url: "#" },
	{
		id: 3,
		Icon: BookOpen,
		label: "학술정보관",
		url: "https://library.hansung.ac.kr",
	},
	{ id: 4, Icon: Briefcase, label: "일자리플러스센터", url: "#" },
	{ id: 5, Icon: FileCheck, label: "제증명발급", url: "#" },
	{ id: 6, Icon: Megaphone, label: "공지사항", url: "#" },
	{
		id: 7,
		Icon: MonitorPlay,
		label: "eclass",
		url: "https://eclass.hansung.ac.kr",
	},
	{ id: 8, Icon: GraduationCap, label: "수강신청", url: "#" },
	{ id: 9, Icon: Gift, label: "장학금 안내", url: "#" },
	{ id: 10, Icon: Building2, label: "시설 예약", url: "#" },
	{ id: 11, Icon: CalendarDays, label: "학사일정", url: "#" },
	{ id: 12, Icon: FlaskConical, label: "연구정보", url: "#" },
];

const NEWS = [
	{
		cat: "한성소식",
		title: "김선태 교수 2백만원 한성대 발전기금 납부",
		content: "글로컬상생홍보팀 · NO. 538",
		date: "2026.05.18",
		color: "#003DA5",
		image: "/hansung-news/news-538.jpg",
	},
	{
		cat: "한성소식",
		title: "허은영 교수 1백만원 한성대 발전기금 납부",
		content: "글로컬상생홍보팀 · NO. 537",
		date: "2026.05.18",
		color: "#0050CC",
		image: "/hansung-news/news-537.jpg",
	},
	{
		cat: "한성소식",
		title: "한성대학교 총학생회, 오순영 AI 미래포럼 공동의장 초청 <마스터 클래스> 성료",
		content: "글로컬상생홍보팀 · NO. 536",
		date: "2026.05.15",
		color: "#0B6E4F",
		image: "/hansung-news/news-536.jpg",
	},
	{
		cat: "한성소식",
		title: "한성대학교 ‘제2회 코지마 특강·워크숍’ 개최",
		content: "전통 동양화 재료 산학협력 확대 · NO. 535",
		date: "2026.05.15",
		color: "#6B3A0F",
		image: "/hansung-news/news-535.jpg",
	},
	{
		cat: "한성소식",
		title: "한성대학교 ‘갤러리 지선’ 개관 정헌이 교수 추모 오픈전",
		content: "글로컬상생홍보팀 · NO. 534",
		date: "2026.05.11",
		color: "#0050CC",
		image: "/hansung-news/news-534.jpg",
	},
];

const RECOMMENDED_QUERIES = [
	"복수전공 신청 기간 알려줘",
	"학술정보관 오늘 몇 시까지 해?",
	"장학금 신청 방법 알려줘",
	"전자결재 기안문 검토해줘",
	"수강신청 정정 기간 알려줘",
];

const ACTIVE_CONVERSATION_KEY = "hansung-ai.activeConversationUid";

function toHistoryItem(item: {
	conversationUid: string;
	title: string;
	lastMessagePreview: string | null;
	messageCount: number;
	updatedAt: string;
}): ChatHistory {
	return {
		id: item.conversationUid,
		title: item.title || "새 대화",
		lastMessage: item.lastMessagePreview || "아직 저장된 메시지가 없습니다.",
		timestamp: new Date(item.updatedAt),
		messageCount: item.messageCount,
	};
}

export default function HomePage() {
	const navigate = useNavigate();
	const [q, setQ] = useState("");
	const [showGrid, setGrid] = useState(false);
	const [newsIdx, setNewsIdx] = useState(0);
	const [sidebarOpen, setSidebarOpen] = useState(false);
	const [histories, setHistories] = useState<ChatHistory[]>([]);
	const [activeConversationUid, setActiveConversationUid] = useState<
		string | undefined
	>(() => window.localStorage.getItem(ACTIVE_CONVERSATION_KEY) ?? undefined);
	const inputRef = useRef<HTMLInputElement>(null);

	const go = (text?: string) => {
		const s = (text ?? q).trim();
		if (s) navigate("/chat", { state: { query: s, newConversation: true } });
	};

	const refreshHistories = useCallback(async () => {
		try {
			const items = await listConversations();
			setHistories(items.map(toHistoryItem));
		} catch {
			setHistories([]);
		}
	}, []);

	useEffect(() => {
		refreshHistories();
	}, [refreshHistories]);

	const handleSelectHistory = (id: string) => {
		window.localStorage.setItem(ACTIVE_CONVERSATION_KEY, id);
		setActiveConversationUid(id);
		setSidebarOpen(false);
		navigate("/chat", { state: { conversationUid: id } });
	};

	const handleNewChat = () => {
		const nextUid = crypto.randomUUID();
		window.localStorage.setItem(ACTIVE_CONVERSATION_KEY, nextUid);
		setActiveConversationUid(nextUid);
		setSidebarOpen(false);
		navigate("/chat", {
			state: { conversationUid: nextUid, newConversation: true },
		});
	};

	// Auto-advance news slideshow
	useEffect(() => {
		if (showGrid) return;
		const t = setInterval(() => {
			setNewsIdx((i) => (i + 1) % NEWS.length);
		}, 5000);
		return () => clearInterval(t);
	}, [showGrid]);

	useEffect(() => {
		if (!showGrid) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") setGrid(false);
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [showGrid]);

	const news = NEWS[newsIdx];

	return (
		<div
			className={`home-page-shell ${sidebarOpen ? "home-sidebar-open" : "home-sidebar-closed"}`}
			style={{
				height: "100vh",
				overflow: "hidden",
				position: "relative",
				background: "#000",
			}}
		>
			{/* ── Video background ── */}
			<video
				autoPlay
				muted
				loop
				playsInline
				style={{
					position: "absolute",
					inset: 0,
					width: "100%",
					height: "100%",
					objectFit: "cover",
					zIndex: 0,
				}}
			>
				<source src="/hansung_main.mp4" type="video/mp4" />
			</video>

			{/* ── Dark overlay ── */}
			<div
				style={{
					position: "absolute",
					inset: 0,
					background: "rgba(0,12,40,0.38)",
					zIndex: 1,
				}}
			/>

			{/* ── Floating legacy homepage button ── */}
			<button
				type="button"
				className="floating-legacy-btn floating-quick-btn"
				onClick={() => setGrid((value) => !value)}
				aria-label={showGrid ? "퀵메뉴 닫기" : "퀵메뉴 열기"}
			>
				{showGrid ? <X size={14} /> : <DotsGrid size={16} />}
				퀵메뉴
			</button>

			{/* ── Header ── */}
			<header className={`site-header ${sidebarOpen ? "sidebar-active" : ""}`} style={{ zIndex: 100 }}>
				<div
					style={{
						width: "100%",
						padding: "0 32px",
						height: "100%",
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
					}}
				>
					<div style={{ display: "flex", alignItems: "center", gap: 16 }}>
						<button
							onClick={() => setSidebarOpen((open) => !open)}
							className="home-history-button"
							aria-label={sidebarOpen ? "대화 기록 닫기" : "대화 기록 열기"}
						>
							<Menu size={20} />
						</button>
						<img
							className="header-logo-img"
							src="/hansung_logo.png"
							alt="한성대학교"
						/>
					</div>
					<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
						<a
							href="https://www.hansung.ac.kr"
							target="_blank"
							rel="noopener noreferrer"
							className="header-legacy-link"
						>
							<ExternalLink size={16} />
							기존 홈페이지
						</a>
					</div>
				</div>
			</header>

			<Sidebar
				isOpen={sidebarOpen}
				onClose={() => setSidebarOpen(false)}
				histories={histories}
				onSelectHistory={handleSelectHistory}
				onNewChat={handleNewChat}
				activeId={activeConversationUid}
			/>

			{showGrid && (
				<div
					className="quick-modal-backdrop"
					onClick={() => setGrid(false)}
					role="presentation"
				>
					<div
						className="quick-modal"
						onClick={(event) => event.stopPropagation()}
						role="dialog"
						aria-modal="true"
						aria-labelledby="quick-modal-title"
					>
						<div className="quick-modal-header">
							<div>
								<div className="quick-modal-kicker">HANSUNG SHORTCUT</div>
								<h2 id="quick-modal-title">퀵메뉴</h2>
							</div>
							<button
								type="button"
								className="quick-modal-close"
								onClick={() => setGrid(false)}
								aria-label="퀵메뉴 닫기"
							>
								<X size={18} />
							</button>
						</div>
						<div className="quick-modal-grid">
							{MENUS.map((item) => (
								<a
									key={item.id}
									href={item.url}
									className="quick-modal-card"
									target={item.url === "#" ? undefined : "_blank"}
									rel={item.url === "#" ? undefined : "noopener noreferrer"}
								>
									<span className="quick-modal-icon">
										<item.Icon size={22} strokeWidth={1.7} />
									</span>
									<span>{item.label}</span>
								</a>
							))}
						</div>
					</div>
				</div>
			)}

			{/* ── Main content (centered column) ── */}
			<div
				className="home-content"
				style={{
					position: "absolute",
					inset: 0,
					zIndex: 2,
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					justifyContent: "center",
					paddingTop: 100,
				}}
			>
				{/* Search bar */}
				<div style={{ width: "100%", maxWidth: 680, padding: "0 16px" }}>
					<div className="search-wrap">
						<div className="home-ai-search-label">
							<span className="home-ai-search-mark">AI</span>
						</div>
						<input
							ref={inputRef}
							value={q}
							onChange={(e) => setQ(e.target.value)}
							onKeyDown={(e) => e.key === "Enter" && go()}
							placeholder="학사, 도서관, 기안문까지 한 번에 질문해 보세요"
							style={{
								flex: 1,
								height: 62,
								border: "none",
								outline: "none",
								background: "none",
								padding: "0 16px",
								fontSize: 17,
								color: "var(--text-1)",
								fontFamily: "inherit",
							}}
						/>
						<button
							onClick={() => go()}
							className="btn-blue"
							style={{
								margin: 8,
								height: 46,
								padding: "0 20px",
								borderRadius: 9999,
								fontSize: 14,
								display: "flex",
								alignItems: "center",
								gap: 6,
								flexShrink: 0,
								fontFamily: "inherit",
							}}
						>
							<Search size={16} />
							검색
						</button>
					</div>
				</div>

				<div className="home-recommend-marquee" aria-label="추천 검색어">
					<div className="home-recommend-track">
						{[...RECOMMENDED_QUERIES, ...RECOMMENDED_QUERIES].map((query, index) => (
							<button
								key={`${query}-${index}`}
								type="button"
								className="home-recommend-chip"
								onClick={() => go(query)}
							>
								{query}
							</button>
						))}
					</div>
				</div>

				{/* Below search: news slideshow */}
				<div
					style={{
						width: "100%",
						maxWidth: 680,
						padding: "0 16px",
						marginTop: 28,
					}}
				>
					{/* ── 한성소식 slideshow ── */}
					<div
						key={newsIdx}
						className="anim-news"
						style={{
							display: "flex",
							gap: 20,
							alignItems: "stretch",
							cursor: "pointer",
						}}
						onClick={() => setNewsIdx((i) => (i + 1) % NEWS.length)}
					>
							{/* Left: image frame */}
							<div
								style={{
									width: 220,
									flexShrink: 0,
									borderRadius: 14,
									backgroundImage: `linear-gradient(140deg, ${news.color}55 0%, rgba(0,0,0,0.1) 100%), url(${news.image})`,
									backgroundSize: "cover",
									backgroundPosition: "center",
									backdropFilter: "blur(4px)",
									border: "1px solid rgba(255,255,255,0.18)",
									position: "relative",
									overflow: "hidden",
									minHeight: 140,
								}}
							>
								{/* Decorative grid lines */}
								<div
									style={{
										position: "absolute",
										inset: 0,
										backgroundImage:
											"linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
										backgroundSize: "24px 24px",
									}}
								/>
								{/* Category badge */}
								<div
									style={{
										position: "absolute",
										top: 12,
										left: 12,
										fontSize: 12,
										fontWeight: 700,
										color: "rgba(255,255,255,0.9)",
										background: "rgba(255,255,255,0.18)",
										border: "1px solid rgba(255,255,255,0.28)",
										borderRadius: 4,
										padding: "2px 8px",
										letterSpacing: "0.04em",
									}}
								>
									{news.cat}
								</div>
								{/* Date */}
								<div
									style={{
										position: "absolute",
										bottom: 12,
										left: 12,
										fontSize: 12,
										color: "rgba(255,255,255,0.55)",
									}}
								>
									{news.date}
								</div>
								{/* Corner accent */}
								<div
									style={{
										position: "absolute",
										bottom: -20,
										right: -20,
										width: 80,
										height: 80,
										borderRadius: "50%",
										background: "rgba(255,255,255,0.08)",
									}}
								/>
							</div>

							{/* Right: text */}
							<div
								style={{
									flex: 1,
									display: "flex",
									flexDirection: "column",
									justifyContent: "center",
									gap: 10,
								}}
							>
								<div
									style={{
										fontSize: 12,
										fontWeight: 700,
										color: "rgba(255,255,255,0.55)",
										letterSpacing: "0.08em",
										textTransform: "uppercase",
									}}
								>
									한성소식
								</div>
								<h3
									style={{
										fontSize: 19,
										fontWeight: 700,
										color: "#fff",
										lineHeight: 1.45,
										letterSpacing: "-0.02em",
									}}
								>
									{news.title}
								</h3>
								<p
									style={{
										fontSize: 14,
										color: "rgba(255,255,255,0.62)",
										lineHeight: 1.7,
									}}
								>
									{news.content}
								</p>

								{/* Dot indicators */}
								<div style={{ display: "flex", gap: 6, marginTop: 4 }}>
									{NEWS.map((_, i) => (
										<button
											key={i}
											onClick={(e) => {
												e.stopPropagation();
												setNewsIdx(i);
											}}
											style={{
												border: "none",
												cursor: "pointer",
												borderRadius: 99,
												transition: "all 0.2s",
												width: newsIdx === i ? 18 : 6,
												height: 6,
												padding: 0,
												background:
													newsIdx === i ? "#fff" : "rgba(255,255,255,0.35)",
											}}
										/>
									))}
								</div>
							</div>
					</div>
				</div>
			</div>
		</div>
	);
}
