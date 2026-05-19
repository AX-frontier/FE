import type { CampusMapPlace } from "../../types/campusMap";

export type DeckBuildingFeature = {
	id: string;
	name: string;
	footprint: [number, number][];
	height: number;
	selected: boolean;
};

export function toDeckBuildingFeatures(
	places: CampusMapPlace[],
	selectedPlaceId?: string,
): DeckBuildingFeature[] {
	return places
		.filter((place) => place.category === "building")
		.map((place) => ({
			id: place.id,
			name: place.name,
			footprint: place.geometry?.footprintLocal ?? [],
			height: place.render3d?.height_m ?? place.height_m ?? place.height ?? 18,
			selected: place.id === selectedPlaceId,
		}));
}
