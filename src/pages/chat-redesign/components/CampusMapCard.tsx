import { Accessibility, MapPin, Navigation, Route } from "lucide-react";
import { lazy, Suspense } from "react";

export type CampusMapPoint = {
	x: number;
	y: number;
	lat?: number | null;
	lng?: number | null;
};

export type CampusMapPlace = {
	id: string;
	name: string;
	aliases?: string[];
	category: string;
	center: CampusMapPoint;
	polygon?: CampusMapPoint[];
	representativeFacilities?: string[];
	height?: number;
	floorCount?: number;
};

export type CampusMapEntrance = {
	id: string;
	placeId: string;
	name: string;
	x: number;
	y: number;
	accessible: boolean;
	nodeId?: string;
	description?: string | null;
};

export type CampusMapRoute = {
	distanceMeters: number;
	etaMinutes: number;
	accessible: boolean;
	path: CampusMapPoint[];
	steps?: string[];
};

export type CampusMapPathNode = {
	id: string;
	name?: string | null;
	x: number;
	y: number;
	type?: string;
};

export type CampusMapPathEdge = {
	id?: string | null;
	from?: string;
	from_?: string;
	to: string;
	geometry?: CampusMapPoint[];
	type?: string;
	accessible?: boolean;
	indoor?: boolean;
};

export type CampusMapResult = {
	campusId: string;
	mode: "place" | "route" | "entrance" | "candidates" | "none";
	canvas: { width: number; height: number };
	places?: CampusMapPlace[];
	selectedPlace?: CampusMapPlace | null;
	entrance?: CampusMapEntrance | null;
	route?: CampusMapRoute | null;
	candidates?: CampusMapPlace[];
	pathNodes?: CampusMapPathNode[];
	pathEdges?: CampusMapPathEdge[];
};

type Props = {
	result: CampusMapResult;
};

const CampusMap3DDeckView = lazy(
	() => import("../../chat/components/campus-map/renderers/deck3d/CampusMap3DDeckView"),
);

export function campusMapResultFromUnknown(
	value: unknown,
): CampusMapResult | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value))
		return undefined;
	const record = value as Record<string, unknown>;
	const canvas = record.canvas as CampusMapResult["canvas"] | undefined;
	if (
		!canvas ||
		typeof canvas.width !== "number" ||
		typeof canvas.height !== "number"
	) {
		return undefined;
	}
	return value as CampusMapResult;
}

export default function CampusMapCard({ result }: Props) {
	return (
		<div className="campus-map-card">
			<div className="campus-map-head">
				<div>
					<span>한성대 3D 캠퍼스 맵</span>
					<strong>{result.selectedPlace?.name ?? "장소 후보 확인"}</strong>
				</div>
				<div className="campus-map-actions">
					{result.route && (
						<div className="campus-route-chip">
							<Route size={14} />
							{result.route.distanceMeters}m · {result.route.etaMinutes}분
						</div>
					)}
				</div>
			</div>

			<Suspense fallback={<div className="campus-map-3d-loading">3D 맵을 불러오는 중입니다.</div>}>
				<CampusMap3DDeckView mapResult={result} />
			</Suspense>

			<div className="campus-map-meta">
				{result.entrance && (
					<div>
						<MapPin size={16} />
						<span>{result.entrance.name}</span>
						<small>{result.entrance.description ?? "대표 출입구"}</small>
					</div>
				)}
				{result.route && (
					<div>
						<Navigation size={16} />
						<span>도보 {result.route.etaMinutes}분</span>
						<small>{result.route.distanceMeters}m 기준</small>
					</div>
				)}
				{(result.entrance || result.route) && (
					<div>
						<Accessibility size={16} />
						<span>
							{(result.route?.accessible ?? result.entrance?.accessible)
								? "접근 가능"
								: "계단 구간 포함"}
						</span>
						<small>출입구/보행로 기준</small>
					</div>
				)}
			</div>

			{result.selectedPlace?.representativeFacilities?.length ? (
				<div className="campus-facilities">
					{result.selectedPlace.representativeFacilities.map((facility) => (
						<span key={facility}>{facility}</span>
					))}
				</div>
			) : null}

			{result.route?.steps?.length ? (
				<ol className="campus-route-steps">
					{result.route.steps.map((step) => (
						<li key={step}>{step}</li>
					))}
				</ol>
			) : null}
		</div>
	);
}
