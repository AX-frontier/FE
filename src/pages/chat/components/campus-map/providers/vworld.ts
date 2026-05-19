type VWorldTile = {
	id: string;
	image: string;
	bounds: [number, number, number, number];
};

const VWORLD_KEY = import.meta.env.VITE_VWORLD_API_KEY as string | undefined;
const VWORLD_BASEMAP_ENABLED = import.meta.env.VITE_VWORLD_BASEMAP_ENABLED === "true";
const DEFAULT_ZOOM = 18;
const CAMPUS_BOUNDS = {
	minLat: 37.5811,
	maxLat: 37.584,
	minLng: 127.0088,
	maxLng: 127.0115,
};
const LOCAL_VIEW_BOUNDS = {
	left: -210,
	right: 210,
	bottom: -260,
	top: 260,
};

export function hasVWorldKey(): boolean {
	return VWORLD_BASEMAP_ENABLED && Boolean(VWORLD_KEY?.trim());
}

export function buildVWorldCampusTiles(zoom = DEFAULT_ZOOM): VWorldTile[] {
	if (!hasVWorldKey()) return [];
	const key = encodeURIComponent(VWORLD_KEY?.trim() ?? "");
	const minTileX = lonToTileX(CAMPUS_BOUNDS.minLng, zoom);
	const maxTileX = lonToTileX(CAMPUS_BOUNDS.maxLng, zoom);
	const minTileY = latToTileY(CAMPUS_BOUNDS.maxLat, zoom);
	const maxTileY = latToTileY(CAMPUS_BOUNDS.minLat, zoom);
	const tiles: VWorldTile[] = [];

	for (let x = minTileX; x <= maxTileX; x += 1) {
		for (let y = minTileY; y <= maxTileY; y += 1) {
			const west = tileXToLon(x, zoom);
			const east = tileXToLon(x + 1, zoom);
			const north = tileYToLat(y, zoom);
			const south = tileYToLat(y + 1, zoom);
			const [left, bottom] = geoToLocal(west, south);
			const [right, top] = geoToLocal(east, north);
			tiles.push({
				id: `vworld-${zoom}-${x}-${y}`,
				image: `https://api.vworld.kr/req/wmts/1.0.0/${key}/Base/${zoom}/${y}/${x}.png`,
				bounds: [left, bottom, right, top],
			});
		}
	}

	return tiles;
}

function geoToLocal(lng: number, lat: number): [number, number] {
	const xRatio = (lng - CAMPUS_BOUNDS.minLng) / (CAMPUS_BOUNDS.maxLng - CAMPUS_BOUNDS.minLng);
	const yRatio = (lat - CAMPUS_BOUNDS.minLat) / (CAMPUS_BOUNDS.maxLat - CAMPUS_BOUNDS.minLat);
	return [
		LOCAL_VIEW_BOUNDS.left + xRatio * (LOCAL_VIEW_BOUNDS.right - LOCAL_VIEW_BOUNDS.left),
		LOCAL_VIEW_BOUNDS.bottom + yRatio * (LOCAL_VIEW_BOUNDS.top - LOCAL_VIEW_BOUNDS.bottom),
	];
}

function lonToTileX(lng: number, zoom: number): number {
	return Math.floor(((lng + 180) / 360) * 2 ** zoom);
}

function latToTileY(lat: number, zoom: number): number {
	const latRad = (lat * Math.PI) / 180;
	return Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * 2 ** zoom);
}

function tileXToLon(x: number, zoom: number): number {
	return (x / 2 ** zoom) * 360 - 180;
}

function tileYToLat(y: number, zoom: number): number {
	const n = Math.PI - (2 * Math.PI * y) / 2 ** zoom;
	return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}
