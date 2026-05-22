import type { AgentType } from "@/types/chat";
import { BookOpenCheck, FileCheck2, MapPinned, Sparkles, type LucideIcon } from "lucide-react";

export const agentConfig: Record<
	AgentType,
	{
		label: string;
		abbr: string;
		badgeClass: string;
		avatarClass: string;
		icon: LucideIcon;
	}
> = {
	main: {
		label: "한성 AI",
		abbr: "HSU",
		badgeClass: "badge-main",
		avatarClass: "avatar-main",
		icon: Sparkles,
	},
	library: {
		label: "학술정보관 에이전트",
		abbr: "학술",
		badgeClass: "badge-library",
		avatarClass: "avatar-library",
		icon: BookOpenCheck,
	},
	document: {
		label: "전자결재 기안 에이전트",
		abbr: "기안",
		badgeClass: "badge-document",
		avatarClass: "avatar-document",
		icon: FileCheck2,
	},
	map: {
		label: "캠퍼스 맵 AI",
		abbr: "MAP",
		badgeClass: "badge-main",
		avatarClass: "avatar-main",
		icon: MapPinned,
	},
};

interface Props {
	type: AgentType;
	size?: "sm" | "md";
}

export default function AgentBadge({ type, size = "md" }: Props) {
	const cfg = agentConfig[type];
	const Icon = cfg.icon;

	if (size === "sm") {
		return (
			<span className={`badge-pill ${cfg.badgeClass}`}>
				<Icon size={13} strokeWidth={2.5} aria-hidden="true" />
				{cfg.label}
			</span>
		);
	}

	return (
		<div className={`avatar-circle ${cfg.avatarClass}`} title={cfg.label}>
			<Icon size={18} strokeWidth={2.55} aria-hidden="true" />
		</div>
	);
}
