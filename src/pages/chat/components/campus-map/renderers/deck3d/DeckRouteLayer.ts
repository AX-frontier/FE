import type { CampusMapRoute } from "../../types/campusMap";

export type DeckRouteFeature = {
	path: [number, number, number][];
	color: [number, number, number];
};

export function toDeckRouteFeature(route?: CampusMapRoute | null): DeckRouteFeature | null {
	const path = route?.geometry?.local3d;
	if (!path?.length) return null;
	return {
		path,
		color: route?.accessible ? [15, 118, 110] : [225, 29, 72],
	};
}
