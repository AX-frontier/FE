import { canvasToLocal3d, GUIDE_HEIGHT, GUIDE_WIDTH } from "./coordinateTransform";
import type { CampusMapPlace, CampusMapPoint, CampusMapResultLike, NormalizedCampusMap } from "../types/campusMap";

const GUIDE_SHAPES: Record<string, { center: CampusMapPoint; polygon: CampusMapPoint[] }> = {
	"sangsang-cube": shape([185, 48], [[118, 22], [258, 22], [268, 76], [166, 78], [166, 58], [118, 58]]),
	"exploration-hall": shape([154, 145], [[70, 112], [250, 112], [250, 178], [70, 178]]),
	"haksong-hall": shape([302, 188], [[252, 110], [330, 124], [330, 266], [252, 266]]),
	rotc: shape([66, 244], [[30, 178], [90, 194], [104, 306], [48, 320]]),
	"truth-hall": shape([282, 316], [[170, 286], [386, 286], [386, 348], [170, 348]]),
	"woochon-hall": shape([590, 328], [[424, 292], [726, 292], [726, 366], [424, 366]]),
	"sangsang-hall": shape([452, 438], [[394, 356], [525, 356], [525, 535], [394, 535], [394, 494], [370, 494], [370, 393], [394, 393]]),
	"future-hall": shape([622, 486], [[525, 424], [705, 424], [705, 550], [525, 550]]),
	"research-hall": shape([270, 564], [[145, 532], [405, 532], [405, 606], [145, 606]]),
	"jiseon-hall": shape([260, 678], [[160, 644], [362, 644], [362, 708], [160, 708]]),
	"engineering-a": shape([274, 796], [[165, 760], [382, 760], [382, 828], [165, 828], [155, 810], [155, 778]]),
	"engineering-b": shape([125, 906], [[82, 820], [158, 820], [158, 996], [82, 996]]),
	"sangsang-village": shape([388, 905], [[332, 820], [434, 820], [434, 998], [332, 998]]),
	"creativity-hall": shape([612, 662], [[548, 604], [682, 604], [682, 720], [630, 720], [630, 690], [548, 690]]),
	"insung-hall": shape([622, 742], [[550, 706], [705, 706], [705, 792], [550, 792]]),
	"naksan-hall": shape([768, 688], [[715, 606], [818, 606], [818, 805], [715, 805]]),
	"main-gate": shape([792, 506], [[762, 480], [812, 480], [812, 532], [762, 532]]),
	"middle-gate": shape([552, 250], [[524, 228], [584, 228], [584, 270], [524, 270]]),
	"south-gate": shape([650, 1018], [[612, 996], [688, 996], [688, 1034], [612, 1034]]),
	"futsal-tennis": shape([248, 445], [[190, 365], [305, 365], [305, 525], [190, 525]]),
	uigwajeong: shape([502, 628], [[482, 606], [528, 606], [528, 650], [482, 650]]),
	"sangsang-park-plus": shape([274, 790], [[184, 780], [364, 780], [364, 812], [184, 812]]),
	"naksan-park": shape([606, 900], [[520, 775], [735, 792], [732, 935], [648, 1004], [548, 988], [472, 888]]),
	library: shape([622, 486], [[555, 452], [684, 452], [684, 516], [555, 516]]),
	"student-union": shape([622, 742], [[582, 724], [676, 724], [676, 762], [582, 762]]),
};

export function normalizeMapResult(mapResult: CampusMapResultLike): NormalizedCampusMap {
	const places = (mapResult.places ?? []).map(normalizePlace);
	const routeLocal3d =
		mapResult.route?.geometry?.local3d ??
		(mapResult.route?.path ?? []).map((point) => canvasToLocal3d(normalizePoint(point)));
	return {
		width: GUIDE_WIDTH,
		height: GUIDE_HEIGHT,
		places,
		selectedPlaceId: mapResult.selectedPlace?.id,
		routeLocal3d,
	};
}

export function normalizePlace(place: CampusMapPlace): CampusMapPlace {
	const guide = GUIDE_SHAPES[place.id];
	const polygonCanvas = place.geometry?.polygonCanvas?.map(([x, y]) => ({ x, y }));
	const centerCanvas = place.geometry?.centerCanvas;
	const center = guide?.center ?? centerCanvas ?? place.center ?? { x: 0, y: 0 };
	const polygon = guide?.polygon ?? polygonCanvas ?? place.polygon ?? [];
	const height = place.render3d?.height_m ?? place.height_m ?? place.height ?? 18;
	return {
		...place,
		center,
		polygon,
		render3d: {
			...place.render3d,
			height_m: height,
			floor_count: place.render3d?.floor_count ?? place.floor_count ?? place.floorCount ?? 5,
		},
	};
}

function normalizePoint(point: CampusMapPoint): CampusMapPoint {
	return { x: point.x, y: point.y };
}

function shape(center: [number, number], polygon: [number, number][]) {
	return {
		center: { x: center[0], y: center[1] },
		polygon: polygon.map(([x, y]) => ({ x, y })),
	};
}
