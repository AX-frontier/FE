export type CampusMapPoint = {
	x: number;
	y: number;
	lat?: number | null;
	lng?: number | null;
};

export type CampusMapPlace = {
	id: string;
	name: string;
	category: string;
	center?: CampusMapPoint;
	polygon?: CampusMapPoint[];
	geometry?: {
		centerCanvas?: CampusMapPoint;
		polygonCanvas?: [number, number][];
		footprintLocal?: [number, number][];
	};
	render3d?: {
		height_m?: number;
		base_z_m?: number;
		min_height_m?: number;
		floor_count?: number;
	};
	height?: number;
	height_m?: number;
	floorCount?: number;
	floor_count?: number;
};

export type CampusMapRoute = {
	distanceMeters: number;
	etaMinutes: number;
	accessible: boolean;
	path?: CampusMapPoint[];
	pathNodeIds?: string[];
	pathEdgeIds?: string[];
	geometry?: {
		canvas?: [number, number][];
		local2d?: [number, number][];
		local3d?: [number, number, number][];
	};
};

export type CampusMapResultLike = {
	campusId: string;
	schemaVersion?: string;
	mode: "place" | "route" | "entrance" | "candidates" | "none";
	canvas?: { width: number; height: number };
	places?: CampusMapPlace[];
	selectedPlace?: CampusMapPlace | null;
	route?: CampusMapRoute | null;
};

export type NormalizedCampusMap = {
	width: number;
	height: number;
	places: CampusMapPlace[];
	selectedPlaceId?: string;
	routeLocal3d: [number, number, number][];
};
