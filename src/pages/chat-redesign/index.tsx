import Sidebar from "@/components/common/Sidebar";
import type {
	AgentType,
	ChatHistory,
	ConversationDetail,
	ConversationListItem,
	Message,
} from "@/types/chat";
import {
	getConversationDetail,
	listConversations,
	normalizeTableChecks,
	reviewDocument,
	sendQueryToSpringStream,
} from "@/utils/aiService";
import type { DocumentReviewApiResponse } from "@/utils/aiService";
import {
	BookOpen,
	ClipboardCheck,
	type LucideIcon,
	Library,
	Menu,
	RotateCcw,
	Send,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
	DocumentInput,
	type DocumentSubmitPayload,
	ReviewResult,
} from "../chat/components/DocumentReview";
import "./chatRedesign.css";

type DisplayMessage = Message & {
	reviewScore?: number;
	originalText?: string;
	originalHtml?: string | null;
	correctedText?: string;
	correctedHtml?: string | null;
	copyNotice?: string | null;
	tableChecks?: DocumentReviewApiResponse["tableChecks"];
	tableChecksAvailable?: boolean;
	stripTablesOnCopy?: boolean;
	feedbackText?: string;
	showDocInput?: boolean;
	initialDocText?: string;
	loadingText?: string;
	sourceLinks?: SourceLink[];
};

const ACTIVE_CONVERSATION_KEY = "hansung-ai.activeConversationUid";

type SourceLink = {
	title: string;
	url: string;
	label?: string;
};

const DESK_META: Record<
	AgentType,
	{
		label: string;
		color: string;
	}
> = {
	main: {
		label: "종합 안내",
		color: "#003DA5",
	},
	library: {
		label: "학술정보관",
		color: "#0B6E4F",
	},
	document: {
		label: "문서 검토",
		color: "#6B3A0F",
	},
};

const ROUTE_META: Record<
	AgentType,
	{
		classification: string;
		icon: LucideIcon;
		hint: string;
	}
> = {
	main: {
		classification: "일반 문의",
		icon: BookOpen,
		hint: "학사, 장학, 교내 공지와 일반 안내를 연결해요",
	},
	library: {
		classification: "학술 정보",
		icon: Library,
		hint: "도서 검색, 대출·반납, 열람실, 학술 DB를 안내해요",
	},
	document: {
		classification: "문서 점검",
		icon: ClipboardCheck,
		hint: "전자결재 문서의 표현, 형식, 표 검토를 진행해요",
	},
};

function createConversationUid(): string {
	return crypto.randomUUID();
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

function safeHref(url: string): string | null {
	try {
		const parsed = new URL(url);
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
			return null;
		return parsed.toString();
	} catch {
		return null;
	}
}

function renderInlineMarkdown(value: string): string {
	const linkPlaceholders: string[] = [];
	const withLinkPlaceholders = value.replace(
		/\[([^\]]+)]\((https?:\/\/[^\s)]+)\)/g,
		(match, label: string, url: string) => {
			const href = safeHref(url);
			if (!href) return match;
			const index = linkPlaceholders.length;
			linkPlaceholders.push(
				`<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`,
			);
			return `__LINK_${index}__`;
		},
	);

	let safe = escapeHtml(withLinkPlaceholders)
		.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
		.replace(
			/(^|[\s(])(https?:\/\/[^\s<)]+)/g,
			(match, prefix: string, url: string) => {
				const href = safeHref(url);
				if (!href) return match;
				return `${prefix}<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`;
			},
		);

	linkPlaceholders.forEach((link, index) => {
		safe = safe.replace(`__LINK_${index}__`, link);
	});
	return safe;
}

function renderMessageHtml(content: string): string {
	return content
		.split("\n")
		.map((line) => {
			const safe = renderInlineMarkdown(line);
			if (safe.startsWith("### ")) return `<h3>${safe.slice(4)}</h3>`;
			if (safe.startsWith("## ")) return `<h2>${safe.slice(3)}</h2>`;
			if (safe.startsWith("- "))
				return `<p class="desk-markdown-list">${safe.slice(2)}</p>`;
			if (!safe.trim()) return "<br />";
			return `<p>${safe}</p>`;
		})
		.join("");
}

function sourceLinksFromSources(sources: unknown): SourceLink[] {
	if (!Array.isArray(sources)) return [];
	return sources
		.map((source, index): SourceLink | null => {
			if (!source || typeof source !== "object") return null;
			const record = source as Record<string, unknown>;
			const rawUrl =
				record.sourceUrl ??
				record.url ??
				record.link ??
				record.href ??
				record.pageUrl;
			if (typeof rawUrl !== "string") return null;
			const url = safeHref(rawUrl);
			if (!url) return null;
			const rawTitle =
				record.title ??
				record.name ??
				record.pageTitle ??
				record.documentTitle ??
				`참고 ${index + 1}`;
			const title =
				typeof rawTitle === "string" && rawTitle.trim()
					? rawTitle.trim()
					: `참고 ${index + 1}`;
			const rawDate = record.updatedAt ?? record.date ?? record.publishedAt;
			return {
				title,
				url,
				label:
					typeof rawDate === "string" && rawDate.trim() ? rawDate : undefined,
			};
		})
		.filter((source): source is SourceLink => Boolean(source));
}

function sourceLinksFromText(content: string): SourceLink[] {
	const matches = content.match(/https?:\/\/[^\s<)]+/g) ?? [];
	return Array.from(new Set(matches))
		.map((url, index): SourceLink | null => {
			const href = safeHref(url);
			if (!href) return null;
			return {
				title: `관련 페이지 ${index + 1}`,
				url: href,
			};
		})
		.filter((source): source is SourceLink => Boolean(source));
}

function mergeSourceLinks(
	primary: SourceLink[],
	fallbackContent: string,
): SourceLink[] {
	const byUrl = new Map<string, SourceLink>();
	for (const source of [...primary, ...sourceLinksFromText(fallbackContent)]) {
		if (!byUrl.has(source.url)) byUrl.set(source.url, source);
	}
	return Array.from(byUrl.values()).slice(0, 4);
}

function formatClock(date: Date): string {
	return date.toLocaleTimeString("ko-KR", {
		hour: "2-digit",
		minute: "2-digit",
	});
}

function loadingCopyForAgent(agent: AgentType): string {
	if (agent === "library") return "학술정보관 정보를 확인하고 있어요";
	if (agent === "document") return "문서 검토 방식으로 준비하고 있어요";
	return "담당 안내 정보를 확인하고 있어요";
}

function demoAnswerFor(text: string): {
	agent: AgentType;
	content: string;
	showDocInput?: boolean;
	sourceLinks?: SourceLink[];
} {
	const agent = detectAgentFromText(text);
	if (agent === "library") {
		return {
			agent,
			content:
				"학술정보관 운영시간은 학기 중 평일과 주말 운영 시간이 다를 수 있어요.\n\n## 바로 확인할 내용\n- 열람실은 시험 기간에 연장 운영될 수 있습니다.\n- 자료실, 대출/반납 데스크, 자유열람실은 운영 시간이 서로 다를 수 있습니다.\n- 방문 전 학술정보관 공지사항에서 당일 운영 변경 여부를 확인하는 것이 안전합니다.\n\n## 다음 질문 예시\n- 오늘 자유열람실 몇 시까지 해?\n- 책 반납은 어디서 해?\n- 학술 DB 접속 방법 알려줘",
			sourceLinks: [
				{
					title: "학술정보관 개관시간/휴관일 안내",
					url: "https://hsel.hansung.ac.kr/",
					label: "학술정보관",
				},
			],
		};
	}
	if (agent === "document") {
		return {
			agent,
			content:
				"문서 검토는 문서 본문을 붙여넣으면 표현, 형식, 확인 항목을 나눠서 정리해드릴게요.\n\n아래 문서 검토 패널에 전자결재 본문을 그대로 붙여넣어 주세요.",
			showDocInput: true,
		};
	}
	return {
		agent,
		content:
			"질문하신 내용은 종합 안내에서 먼저 확인할 수 있어요.\n\n## 안내 방식\n- 학사, 장학, 공지, 시설처럼 학교 전반 정보를 우선 확인합니다.\n- 도서관 관련 질문이면 학술정보관으로 넘겨 확인합니다.\n- 결재 문서나 공문 검토는 문서 검토로 분리해서 처리합니다.\n\n## 예시 질문\n- 이번 학기 수강신청 일정 알려줘\n- 장학금 신청 방법 알려줘\n- 학생증 재발급 어디서 해?",
		sourceLinks: [
			{
				title: "한성대학교 공지사항",
				url: "https://www.hansung.ac.kr/hansung/8385/subview.do",
				label: "공식 홈페이지",
			},
		],
	};
}

function toHistoryItem(item: {
	conversationUid: string;
	title: string;
	lastMessagePreview: string | null;
	messageCount: number;
	updatedAt: string;
}): ChatHistory {
	return {
		id: item.conversationUid,
		title: item.title || "새 질문",
		lastMessage: item.lastMessagePreview || "아직 저장된 메시지가 없습니다.",
		timestamp: new Date(item.updatedAt),
		messageCount: item.messageCount,
	};
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function asArray<T = unknown>(value: unknown): T[] {
	return Array.isArray(value) ? (value as T[]) : [];
}

function asBoolean(value: unknown): boolean {
	return value === true;
}

function asNumber(value: unknown, fallback = 0): number {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function documentReviewFromMetadata(metadata?: Record<string, unknown>):
	| (Partial<DocumentReviewApiResponse> & {
			originalText?: string;
			originalHtml?: string | null;
	  })
	| null {
	const direct = asRecord(metadata?.documentReview);
	const nestedSources = asRecord(metadata?.sources);
	const review = direct ?? asRecord(nestedSources?.documentReview);
	if (!review) return null;

	const summary = asRecord(review.summary);
	const revisedDocument = asRecord(review.revisedDocument);
	const findings = asArray<DocumentReviewApiResponse["findings"][number]>(
		review.findings,
	);
	const checkRequiredItems = asArray<
		DocumentReviewApiResponse["checkRequiredItems"][number]
	>(review.checkRequiredItems);
	const formatNoticeItems = asArray<
		DocumentReviewApiResponse["formatNoticeItems"][number]
	>(review.formatNoticeItems);
	const extractedTables = asArray<
		DocumentReviewApiResponse["extractedTables"][number]
	>(review.extractedTables);
	const tableChecks = normalizeTableChecks(
		review.tableChecks as DocumentReviewApiResponse["tableChecks"],
	);

	return {
		originalText: asString(review.originalText),
		originalHtml: asString(review.originalHtml) ?? null,
		answer: asString(review.answer) ?? "",
		confidence: asNumber(review.confidence),
		fallbackUsed: review.fallbackUsed === true,
		fallbackReason: asString(review.fallbackReason),
		summary: {
			overallOpinion: asString(summary?.overallOpinion) ?? "",
			totalFindingCount: asNumber(summary?.totalFindingCount, findings.length),
			highCount: asNumber(summary?.highCount),
			mediumCount: asNumber(summary?.mediumCount),
			lowCount: asNumber(summary?.lowCount),
		},
		findings,
		checkRequiredItems,
		formatNoticeItems,
		extractedTables,
		tableChecks,
		tableChecksAvailable: asBoolean(review.tableChecksAvailable),
		revisedDocument: {
			format: "plain_text",
			content: asString(revisedDocument?.content) ?? "",
			htmlContent: asString(revisedDocument?.htmlContent) ?? null,
		},
		reviewMarkdown: asString(review.reviewMarkdown) ?? "",
	};
}

function reviewResultMessageFromHistory(
	message: ConversationDetail["messages"][number],
	review: NonNullable<ReturnType<typeof documentReviewFromMetadata>>,
): DisplayMessage {
	const summary = review.summary ?? {
		overallOpinion: "",
		totalFindingCount: review.findings?.length ?? 0,
		highCount: 0,
		mediumCount: 0,
		lowCount: 0,
	};
	const findings = review.findings ?? [];
	const checkRequiredItems = review.checkRequiredItems ?? [];
	const extractedTables = review.extractedTables ?? [];
	const tableChecks = review.tableChecks ?? [];
	const revisedDocument = review.revisedDocument ?? {
		format: "plain_text",
		content: message.content,
		htmlContent: null,
	};
	const findingCount = summary.totalFindingCount ?? findings.length;
	const hasDocumentTables =
		containsHtmlTable(review.originalHtml) ||
		containsHtmlTable(revisedDocument.htmlContent);
	const tableSummary = extractedTables.length
		? `\n\n인식된 표: ${extractedTables.length}개\n${extractedTables.map((table) => `- 표 ${table.index}: ${table.rowCount}행 x ${table.columnCount}열`).join("\n")}`
		: "\n\n인식된 표: 없음";
	const feedbackText = `${withoutTableCheckSection(review.reviewMarkdown || message.content)}${tableSummary}`;

	return {
		id: `${message.role}-${message.queryUid}-${message.createdAt}`,
		role: message.role,
		content: `문서 분석이 완료되었습니다. **${findingCount}건의 수정 제안**, **${checkRequiredItems.length}건의 확인 항목**, **${tableChecks.length}건의 표 검토 항목**이 식별되었습니다.`,
		timestamp: new Date(message.createdAt),
		agentType: "document",
		reviewScore: Math.max(
			55,
			95 -
				findingCount * 5 -
				checkRequiredItems.length * 3 -
				tableCheckPenalty(tableChecks),
		),
		originalText: review.originalText,
		originalHtml: review.originalHtml,
		correctedText: revisedDocument.content,
		correctedHtml: revisedDocument.htmlContent,
		tableChecks,
		tableChecksAvailable: review.tableChecksAvailable ?? false,
		copyNotice: hasDocumentTables
			? "본문 복사 시 표는 자리표시 문구로 대체됩니다. 표는 아래 표 검토 결과를 참고해 원본 전자결재/HWP 표에 직접 반영해 주세요."
			: null,
		stripTablesOnCopy: hasDocumentTables,
		feedbackText,
	};
}

function toDisplayMessages(detail: ConversationDetail): DisplayMessage[] {
	let lastAgent: AgentType = "main";
	return detail.messages.map((message) => {
		if (message.role === "user") {
			lastAgent = detectAgentFromText(message.content);
		}
		const review =
			message.role === "assistant"
				? documentReviewFromMetadata(message.metadata)
				: null;
		if (review) {
			lastAgent = "document";
			return reviewResultMessageFromHistory(message, review);
		}
		return {
			id: `${message.role}-${message.queryUid}-${message.createdAt}`,
			role: message.role,
			content:
				message.role === "assistant" && lastAgent === "document"
					? withoutTableCheckSection(message.content)
					: message.content,
			timestamp: new Date(message.createdAt),
			agentType: message.role === "assistant" ? lastAgent : undefined,
			sourceLinks:
				message.role === "assistant"
					? mergeSourceLinks(
							sourceLinksFromSources(message.metadata?.sources),
							message.content,
						)
					: undefined,
		};
	});
}

function detectAgentFromText(content: string): AgentType {
	const libraryKeywords = [
		"도서관",
		"학술정보관",
		"도서",
		"책",
		"대출",
		"반납",
		"열람실",
	];
	const documentKeywords = ["결재", "문서", "기안", "공문", "검토", "검수"];
	if (documentKeywords.some((keyword) => content.includes(keyword)))
		return "document";
	if (libraryKeywords.some((keyword) => content.includes(keyword)))
		return "library";
	return "main";
}

function containsHtmlTable(html?: string | null): boolean {
	if (!html) return false;
	return (
		new DOMParser()
			.parseFromString(html, "text/html")
			.querySelector("table") !== null
	);
}

function withoutTableCheckSection(markdown: string): string {
	return markdown
		.replace(
			/\n?<!-- TABLE_CHECKS_START -->[\s\S]*?<!-- TABLE_CHECKS_END -->\n?/g,
			"",
		)
		.replace(/\n?<!-- TABLE_CHECKS_START -->[\s\S]*$/g, "")
		.replace(/\n?<!-- TABLE_CHECKS_END -->\n?/g, "");
}

function tableCheckPenalty(
	tableChecks: DocumentReviewApiResponse["tableChecks"],
): number {
	return tableChecks.reduce((sum, item) => {
		if (item.severity === "HIGH") return sum + 4;
		if (item.severity === "MEDIUM") return sum + 2;
		return sum + 1;
	}, 0);
}

export default function ChatRedesignPage() {
	const location = useLocation();
	const navigate = useNavigate();
	const routeState = location.state as {
		query?: string;
		newConversation?: boolean;
		conversationUid?: string;
	} | null;
	const demoFallbackEnabled =
		new URLSearchParams(location.search).get("demo") === "1";
	const [messages, setMessages] = useState<DisplayMessage[]>([]);
	const [input, setInput] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [currentAgent, setCurrentAgent] = useState<AgentType>("main");
	const [sidebarOpen, setSidebarOpen] = useState(false);
	const [histories, setHistories] = useState<ChatHistory[]>([]);
	const [conversationUid, setConversationUid] = useState(() => {
		if (routeState?.conversationUid) return routeState.conversationUid;
		if (routeState?.newConversation) return createConversationUid();
		const stored = window.localStorage.getItem(ACTIVE_CONVERSATION_KEY);
		return stored || createConversationUid();
	});

	const bottomRef = useRef<HTMLDivElement>(null);
	const isSendingRef = useRef(false);
	const didAutoSubmitRef = useRef(false);

	const scrollBottom = useCallback(() => {
		bottomRef.current?.scrollIntoView({ behavior: "smooth" });
	}, []);

	useEffect(() => {
		scrollBottom();
	});

	const refreshHistories = useCallback(async () => {
		try {
			const items = await listConversations();
			setHistories(items.map(toHistoryItem));
			return items;
		} catch {
			setHistories([]);
			return null;
		}
	}, []);

	const restoreConversation = useCallback(async (uid: string) => {
		try {
			const detail = await getConversationDetail(uid);
			setConversationUid(detail.conversationUid);
			window.localStorage.setItem(
				ACTIVE_CONVERSATION_KEY,
				detail.conversationUid,
			);
			const restored = toDisplayMessages(detail);
			setMessages(restored);
			const lastUser = [...restored]
				.reverse()
				.find((message) => message.role === "user");
			setCurrentAgent(
				lastUser ? detectAgentFromText(lastUser.content) : "main",
			);
		} catch {
			const nextUid = createConversationUid();
			setConversationUid(nextUid);
			window.localStorage.setItem(ACTIVE_CONVERSATION_KEY, nextUid);
			setMessages([]);
		}
	}, []);

	useEffect(() => {
		window.localStorage.setItem(ACTIVE_CONVERSATION_KEY, conversationUid);
	}, [conversationUid]);

	useEffect(() => {
		let cancelled = false;
		async function loadInitialConversation() {
			let items: ConversationListItem[];
			try {
				items = await listConversations();
			} catch {
				if (!cancelled) setHistories([]);
				return;
			}
			if (cancelled) return;

			setHistories(items.map(toHistoryItem));
			if (routeState?.newConversation) return;
			if (routeState?.conversationUid) {
				await restoreConversation(routeState.conversationUid);
				return;
			}
			const stored = window.localStorage.getItem(ACTIVE_CONVERSATION_KEY);
			if (!stored) return;

			if (items.some((item) => item.conversationUid === stored)) {
				await restoreConversation(stored);
				return;
			}
			window.localStorage.removeItem(ACTIVE_CONVERSATION_KEY);
		}
		loadInitialConversation();
		return () => {
			cancelled = true;
		};
	}, [
		restoreConversation,
		routeState?.conversationUid,
		routeState?.newConversation,
	]);

	// Keep route-state auto-submit one-shot, matching the current chat page behavior.
	// biome-ignore lint/correctness/useExhaustiveDependencies: route state should only seed the first render.
	useEffect(() => {
		if (didAutoSubmitRef.current) return;
		const q = routeState?.query;
		if (!q) return;
		didAutoSubmitRef.current = true;
		if (routeState?.newConversation) {
			const nextUid = createConversationUid();
			setConversationUid(nextUid);
			window.localStorage.setItem(ACTIVE_CONVERSATION_KEY, nextUid);
			setMessages([]);
			setCurrentAgent("main");
			handleSend(q, nextUid);
		} else {
			handleSend(q);
		}
		window.history.replaceState({}, "", `${location.pathname}${location.search}`);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const push = (m: DisplayMessage) =>
		setMessages((previous) => [...previous, m]);

	const handleSend = async (
		override?: string,
		targetConversationUid = conversationUid,
	) => {
		const text = (override ?? input).trim();
		if (!text || isSendingRef.current) return;
		isSendingRef.current = true;
		setInput("");
		setIsLoading(true);

		push({
			id: Date.now().toString(),
			role: "user",
			content: text,
			timestamp: new Date(),
		});

		const discoveryId = `desk-check-${Date.now()}`;
		push({
			id: discoveryId,
			role: "assistant",
			content: "",
			agentType: currentAgent,
			timestamp: new Date(),
			isAgentDiscovery: true,
			isSearching: true,
		});

		const tid = `desk-answer-${Date.now()}`;
		push({
			id: tid,
			role: "assistant",
			content: "",
			agentType: currentAgent,
			timestamp: new Date(),
			isTyping: true,
			loadingText: "질문 성격을 확인하고 있어요",
		});

		try {
			let streamingStarted = false;
			let receivedTerminalEvent = false;
			let resolvedAgent: AgentType = currentAgent;

			for await (const event of sendQueryToSpringStream(
				text,
				targetConversationUid,
			)) {
				if (event.type === "routing") {
					const raw = event.targetAgent.toLowerCase();
					const agent = (
						raw === "document_review" ? "document" : raw
					) as AgentType;
					resolvedAgent = agent;
					setCurrentAgent(agent);
					setMessages((previous) =>
						previous.map((message) =>
							message.id === discoveryId
								? { ...message, agentType: agent, isSearching: false }
								: message.id === tid
									? {
											...message,
											agentType: agent,
											loadingText: loadingCopyForAgent(agent),
										}
									: message,
						),
					);
				} else if (event.type === "chunk") {
					if (!streamingStarted) {
						streamingStarted = true;
						setMessages((previous) =>
							previous.map((message) =>
								message.id === tid
									? {
											...message,
											isTyping: false,
											loadingText: undefined,
											content: event.text,
										}
									: message,
							),
						);
					} else {
						setMessages((previous) =>
							previous.map((message) =>
								message.id === tid
									? { ...message, content: message.content + event.text }
									: message,
							),
						);
					}
				} else if (event.type === "done") {
					receivedTerminalEvent = true;
					const raw = (event.targetAgent ?? resolvedAgent)
						.toString()
						.toLowerCase();
					const agent = (
						raw === "document_review" ? "document" : raw
					) as AgentType;
					setCurrentAgent(agent);
					setMessages((previous) =>
						previous.map((message) =>
							message.id === discoveryId
								? { ...message, agentType: agent, isSearching: false }
								: message,
						),
					);
					if (event.requiresDocumentInput) {
						const answer =
							(event.answer as string) ||
							"검토할 전자결재 문서 본문을 아래 검토지에 붙여넣어 주세요.";
						const sourceLinks = mergeSourceLinks(
							sourceLinksFromSources(event.sources),
							answer,
						);
						setMessages((previous) =>
							previous.map((message) =>
								message.id === tid
									? {
											...message,
											agentType: agent,
											isTyping: false,
											loadingText: undefined,
											content: answer,
											showDocInput: true,
											sourceLinks,
										}
									: message,
							),
						);
					} else {
						setMessages((previous) =>
							previous.map((message) =>
								message.id === tid
									? (() => {
											const answer =
												(event.answer as string) ?? message.content;
											return {
												...message,
												agentType: agent,
												isTyping: false,
												loadingText: undefined,
												content: answer,
												sourceLinks: mergeSourceLinks(
													sourceLinksFromSources(event.sources),
													answer,
												),
											};
										})()
									: message,
							),
						);
					}
				}
			}
			if (!streamingStarted && !receivedTerminalEvent) {
				const demo = demoFallbackEnabled ? demoAnswerFor(text) : null;
				if (demo) setCurrentAgent(demo.agent);
				setMessages((previous) =>
					previous.map((message) =>
						message.id === tid
							? {
									...message,
									agentType: demo?.agent ?? message.agentType,
									isTyping: false,
									loadingText: undefined,
									content:
										demo?.content ??
										"질문은 확인했지만 답변을 받지 못했습니다. 백엔드 연결 상태를 확인해 주세요.",
									showDocInput: demo?.showDocInput,
									sourceLinks: demo?.sourceLinks,
								}
							: message.id === discoveryId
								? {
										...message,
										agentType: demo?.agent ?? message.agentType,
										isSearching: false,
									}
								: message,
					),
				);
			}
		} catch {
			const demo = demoFallbackEnabled ? demoAnswerFor(text) : null;
			if (demo) setCurrentAgent(demo.agent);
			setMessages((previous) =>
				previous.map((message) =>
					message.id === tid
						? {
								...message,
								agentType: demo?.agent ?? message.agentType,
								content:
									demo?.content ??
									"지금은 백엔드 API에 연결할 수 없습니다. 서버가 실행 중인지 확인해 주세요.",
								isTyping: false,
								loadingText: undefined,
								showDocInput: demo?.showDocInput,
								sourceLinks: demo?.sourceLinks,
							}
						: message.id === discoveryId
							? {
									...message,
									agentType: demo?.agent ?? message.agentType,
									isSearching: false,
								}
							: message,
				),
			);
		} finally {
			isSendingRef.current = false;
			setIsLoading(false);
			refreshHistories();
		}
	};

	const handleDocSubmit = async (doc: DocumentSubmitPayload) => {
		setIsLoading(true);
		setMessages((previous) =>
			previous.map((message) =>
				message.showDocInput ? { ...message, showDocInput: false } : message,
			),
		);
		const docCheckId = `desk-doc-check-${Date.now()}`;
		push({
			id: docCheckId,
			role: "assistant",
			agentType: "document",
			timestamp: new Date(),
			content:
				"문서를 확인하고 있습니다. 수정 제안과 확인 항목으로 나눠 정리합니다.",
			isTyping: true,
			loadingText: "문서 구조와 표 정보를 확인하고 있어요",
		});

		try {
			const res = await reviewDocument(
				{
					title: "전자결재 문서",
					docType: "OFFICIAL_DOCUMENT",
					bodyText: doc.text,
					bodyHtml: doc.html,
					editorJson: doc.editorJson as Record<string, unknown>,
				},
				conversationUid,
			);
			const findingCount = res.summary.totalFindingCount;
			const hasDocumentTables =
				containsHtmlTable(doc.html) ||
				containsHtmlTable(res.revisedDocument.htmlContent);
			const score = Math.max(
				55,
				95 -
					findingCount * 5 -
					res.checkRequiredItems.length * 3 -
					tableCheckPenalty(res.tableChecks),
			);
			const tableSummary = res.extractedTables.length
				? `\n\n인식된 표: ${res.extractedTables.length}개\n${res.extractedTables.map((table) => `- 표 ${table.index}: ${table.rowCount}행 x ${table.columnCount}열`).join("\n")}`
				: "\n\n인식된 표: 없음";
			const feedbackText = `${withoutTableCheckSection(res.reviewMarkdown)}${tableSummary}`;

			setMessages((previous) =>
				previous.map((message) =>
					message.id === docCheckId
						? {
								...message,
								isTyping: false,
								loadingText: undefined,
								content:
									"문서 검토가 완료되었습니다. 아래 결과를 확인해 주세요.",
							}
						: message,
				),
			);

			push({
				id: `desk-doc-result-${Date.now()}`,
				role: "assistant",
				agentType: "document",
				timestamp: new Date(),
				content: `문서 검토가 끝났습니다. **${findingCount}건의 수정 제안**, **${res.checkRequiredItems.length}건의 확인 항목**, **${res.tableChecks.length}건의 표 검토 항목**을 확인해 주세요.`,
				reviewScore: score,
				originalText: doc.text,
				originalHtml: doc.html,
				correctedText: res.revisedDocument.content,
				correctedHtml: res.revisedDocument.htmlContent,
				tableChecks: res.tableChecks,
				tableChecksAvailable: res.tableChecksAvailable,
				copyNotice: hasDocumentTables
					? "본문 복사 시 표는 자리표시 문구로 대체됩니다. 표는 아래 표 검토 결과를 참고해 원본 전자결재/HWP 표에 직접 반영해 주세요."
					: null,
				stripTablesOnCopy: hasDocumentTables,
				feedbackText,
			});
		} catch {
			setMessages((previous) =>
				previous.map((message) =>
					message.id === docCheckId
						? {
								...message,
								isTyping: false,
								loadingText: undefined,
								content: "문서 검토 중 오류가 발생했습니다.",
							}
						: message,
				),
			);
		} finally {
			setIsLoading(false);
			refreshHistories();
		}
	};

	const handleNewChat = () => {
		const nextUid = createConversationUid();
		setConversationUid(nextUid);
		window.localStorage.setItem(ACTIVE_CONVERSATION_KEY, nextUid);
		setMessages([]);
		setCurrentAgent("main");
		setSidebarOpen(false);
	};

	const handleSelectHistory = async (id: string) => {
		setSidebarOpen(false);
		await restoreConversation(id);
	};

	const openDocumentDesk = () => {
		setCurrentAgent("document");
		push({
			id: `desk-doc-${Date.now()}`,
			role: "assistant",
			agentType: "document",
			timestamp: new Date(),
			content: "검토할 전자결재 본문을 아래 입력 영역에 붙여넣어 주세요.",
			showDocInput: true,
		});
	};

	const hasMsg = messages.length > 0;
	const reviewMode = messages.some(
		(message) => message.reviewScore !== undefined,
	);

	return (
		<div
			className={`desk-shell ${sidebarOpen ? "desk-sidebar-open" : "desk-sidebar-closed"}`}
		>
			<Sidebar
				isOpen={sidebarOpen}
				onClose={() => setSidebarOpen(false)}
				histories={histories}
				onSelectHistory={handleSelectHistory}
				onNewChat={handleNewChat}
				activeId={conversationUid}
			/>

			<header
				className="site-header chat-mode"
				style={{
					display: "flex",
					alignItems: "center",
					padding: "0 32px",
					gap: 12,
				}}
			>
				<button
					type="button"
					className="chat-menu-button"
					onClick={() => setSidebarOpen((open) => !open)}
					aria-label={sidebarOpen ? "대화 기록 닫기" : "대화 기록 열기"}
					style={{
						border: "none",
						background: "none",
						cursor: "pointer",
						padding: 8,
						borderRadius: 6,
						color: "var(--text-2)",
						display: "flex",
						alignItems: "center",
						transition: "background 0.12s",
					}}
					onMouseEnter={(event) => {
						event.currentTarget.style.background = "var(--bg)";
					}}
					onMouseLeave={(event) => {
						event.currentTarget.style.background = "none";
					}}
				>
					<Menu size={20} />
				</button>

				<button
					type="button"
					onClick={() => navigate("/")}
					style={{
						border: "none",
						background: "none",
						cursor: "pointer",
						display: "flex",
						alignItems: "center",
						gap: 16,
					}}
				>
					<span
						style={{
							fontWeight: 900,
							fontSize: 42,
							color: "var(--blue)",
							letterSpacing: "-0.05em",
						}}
					>
						HSU
					</span>
					<div
						style={{
							borderLeft: "2px solid var(--border-md)",
							paddingLeft: 16,
						}}
					>
						<div
							style={{
								fontSize: 20,
								fontWeight: 700,
								color: "var(--blue-dark)",
								lineHeight: 1.3,
							}}
						>
							한성대학교
						</div>
						<div
							style={{
								fontSize: 14,
								color: "var(--text-3)",
								letterSpacing: "0.06em",
								lineHeight: 1.3,
							}}
						>
							HANSUNG UNIVERSITY
						</div>
					</div>
				</button>

				<div style={{ flex: 1 }} />

				<button
					type="button"
					style={{
						fontSize: 12,
						fontWeight: 600,
						padding: "5px 12px",
						borderRadius: 6,
						border: "none",
						background: "var(--blue-tint)",
						color: "var(--blue)",
						cursor: "pointer",
						fontFamily: "inherit",
					}}
				>
					장학금
				</button>
			</header>

			<main className={`desk-main ${hasMsg ? "has-messages" : ""}`}>
				<section className="desk-workspace">
					{hasMsg && (
						<div className={`desk-ledger ${reviewMode ? "is-wide" : ""}`}>
								{messages
									.filter((msg) => !msg.isAgentDiscovery)
									.map((msg) => {
										const agent = msg.agentType ?? currentAgent;
										const meta = DESK_META[agent];
										const route = ROUTE_META[agent];
										const AgentIcon = route.icon;
										return (
											<article
												key={msg.id}
											className={`desk-entry desk-entry-${msg.role}`}
										>
											{msg.role === "user" ? (
												<div className="desk-user-note">{msg.content}</div>
											) : (
												<>
													<div
														className="desk-answer-card"
														style={
															{
																"--desk-accent": meta.color,
															} as React.CSSProperties
														}
														>
															<div className="desk-answer-head">
																<div className="desk-agent-route">
																	<div className="desk-agent-route-status">
																		<span className="desk-agent-route-check" />
																		에이전트 연결 완료
																	</div>
																	<div className="desk-agent-route-track">
																		<span className="desk-agent-route-chip desk-agent-route-chip-classification">
																			{route.classification}
																		</span>
																		<span
																			className="desk-agent-route-connector"
																			aria-hidden="true"
																		>
																			→
																		</span>
																		<span className="desk-agent-route-chip desk-agent-route-chip-agent">
																			<AgentIcon size={13} />
																			{meta.label} AI
																		</span>
																	</div>
																	<p className="desk-agent-route-hint">{route.hint}</p>
																</div>
																<small>{formatClock(msg.timestamp)}</small>
															</div>
														{msg.isTyping ? (
															<div className="desk-answer-loading">
																<span />
																<span />
																<span />
																<p>
																	{msg.loadingText ?? "답변을 준비하고 있어요"}
																</p>
															</div>
														) : (
															<>
																<div
																	className="desk-markdown"
																	// biome-ignore lint/security/noDangerouslySetInnerHtml: renderMessageHtml escapes user/API text before adding limited markdown tags.
																	dangerouslySetInnerHTML={{
																		__html: renderMessageHtml(msg.content),
																	}}
																/>
																{msg.sourceLinks &&
																	msg.sourceLinks.length > 0 && (
																		<div className="desk-sources">
																			<span className="desk-sources-label">
																				참고
																			</span>
																			<div className="desk-source-list">
																				{msg.sourceLinks.map((source) => (
																					<a
																						key={source.url}
																						href={source.url}
																						target="_blank"
																						rel="noopener noreferrer"
																						className="desk-source-link"
																					>
																						<span>{source.title}</span>
																						{source.label && (
																							<small>{source.label}</small>
																						)}
																					</a>
																				))}
																			</div>
																		</div>
																	)}
															</>
														)}
													</div>

													{msg.showDocInput && (
														<div className="desk-document-wrap">
															<div className="desk-document-shell">
																<aside className="desk-document-brief">
																	<span className="desk-document-kicker">
																		DOCUMENT REVIEW
																	</span>
																	<h3>전자결재 문서를 붙여넣어 주세요</h3>
																	<p>
																		문서 검토는 일반 검색과 다르게 원문 구조,
																		표, 결재 문구를 함께 확인합니다.
																	</p>
																	<ul>
																		<li>공문 문체와 맞춤법 확인</li>
																		<li>수정 제안과 확인 항목 분리</li>
																		<li>표가 포함된 문서 구조 점검</li>
																	</ul>
																</aside>
																<div className="desk-document-editor">
																	<DocumentInput
																		onSubmit={handleDocSubmit}
																		isLoading={isLoading}
																		initialText={msg.initialDocText}
																	/>
																</div>
															</div>
														</div>
													)}

													{msg.reviewScore !== undefined && (
														<div className="desk-review-wrap">
															<ReviewResult
																score={msg.reviewScore}
																originalText={msg.originalText}
																originalHtml={msg.originalHtml}
																correctedText={msg.correctedText ?? ""}
																correctedHtml={msg.correctedHtml}
																copyNotice={msg.copyNotice}
																tableChecks={msg.tableChecks}
																tableChecksAvailable={msg.tableChecksAvailable}
																stripTablesOnCopy={msg.stripTablesOnCopy}
																feedbackText={msg.feedbackText ?? ""}
															/>
														</div>
													)}
												</>
											)}
										</article>
									);
								})}
							<div ref={bottomRef} />
						</div>
					)}
				</section>
			</main>

			<footer className="desk-compose-area">
				<div className="desk-compose-inner">
					<div className="desk-compose-box">
						<textarea
							value={input}
							onChange={(event) => setInput(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter" && !event.shiftKey) {
									event.preventDefault();
									handleSend();
								}
							}}
							placeholder="궁금한 학교 정보를 검색해보세요"
							rows={1}
						/>
						<div className="desk-compose-tools">
							<div className="desk-tool-group">
								<button
									type="button"
									onClick={() => handleSend("학술정보관 운영시간 알려줘")}
								>
									<Library size={15} />
									학술정보관
								</button>
								<button type="button" onClick={openDocumentDesk}>
									<ClipboardCheck size={15} />
									문서 검토
								</button>
								<button
									type="button"
									onClick={() => handleSend("장학금 신청 방법 알려줘")}
								>
									<BookOpen size={15} />
									장학 안내
								</button>
							</div>
							<div className="desk-tool-group">
								{hasMsg && (
									<button type="button" onClick={handleNewChat}>
										<RotateCcw size={15} />새 질문
									</button>
								)}
								<button
									type="button"
									className="desk-send-button"
									onClick={() => handleSend()}
									disabled={!input.trim() || isLoading}
								>
									<Send size={16} />
									검색
								</button>
							</div>
						</div>
					</div>
				</div>
			</footer>
		</div>
	);
}
