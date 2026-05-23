import { AmbientLight, COORDINATE_SYSTEM, DirectionalLight, LightingEffect, OrbitView } from "@deck.gl/core";
import { BitmapLayer, PathLayer, PolygonLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { ScenegraphLayer } from "@deck.gl/mesh-layers";
import DeckGL from "@deck.gl/react";
import { canvasToLocal } from "../../adapters/coordinateTransform";
import { normalizeMapResult } from "../../adapters/normalizeMapResult";
import { buildVWorldCampusTiles, hasVWorldKey } from "../../providers/vworld";
import type { CampusMapPlace, CampusMapResultLike } from "../../types/campusMap";

type Props = {
	mapResult: CampusMapResultLike;
};

type BuildingFeature = {
	id: string;
	name: string;
	polygon: [number, number][];
	roof: [number, number, number][];
	center: [number, number, number];
	signPosition: [number, number, number];
	roofCenter: [number, number, number];
	height: number;
	selected: boolean;
	fillColor: [number, number, number, number];
	roofColor: [number, number, number, number];
	labelOffset: [number, number];
	labelPriority: number;
};

type RouteFeature = {
	path: [number, number, number][];
	accessible: boolean;
};

type GateFeature = {
	id: string;
	name: string;
	markerPosition: [number, number, number];
	labelPosition: [number, number, number];
};

type OutdoorFeature = {
	id: string;
	name: string;
	polygon: [number, number][];
	center: [number, number, number];
	fillColor: [number, number, number, number];
};

type WalkwayFeature = {
	path: [number, number, number][];
	color: [number, number, number, number];
	width: number;
};

type RoofDetailFeature = {
	id: string;
	polygon: [number, number, number][];
	color: [number, number, number, number];
};

type BuildingLineFeature = {
	id: string;
	path: [number, number, number][];
	color: [number, number, number, number];
	width: number;
};

type DetailVolumeFeature = {
	id: string;
	name: string;
	polygon: [number, number][];
	height: number;
	color: [number, number, number, number];
	lineColor: [number, number, number, number];
};

type SurfacePathFeature = {
	path: [number, number, number][];
	color: [number, number, number, number];
	width: number;
};

type GroundLabelFeature = {
	id: string;
	name: string;
	position: [number, number, number];
	color: [number, number, number, number];
	background: [number, number, number, number];
	size: number;
};

type BuildingModelConfig = {
	url: string;
	bounds: {
		min: readonly [number, number, number];
		max: readonly [number, number, number];
	};
	orientation: [number, number, number];
	minHeight: number;
	placeIds?: readonly string[];
};

const ambientLight = new AmbientLight({ color: [255, 255, 255], intensity: 1.8 });
const directionalLight = new DirectionalLight({
	color: [255, 255, 255],
	intensity: 1.4,
	direction: [-3, -4, -6],
});

const lightingEffect = new LightingEffect({ ambientLight, directionalLight });
const LABEL_CHARACTER_SET =
	"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789()/-+ .←↑↓↖한성대학교상상관큐브탐구학송진리우촌미래연구지선공학동빌리지창의인성낙산정문중후남군단풋살테니스장파크플러스의화매점장책로";

const GUIDE_WALKWAYS: WalkwayFeature[] = [
	walkway([[552, 250], [552, 328], [590, 328], [452, 438], [425, 542], [270, 564], [164, 532], [154, 145], [185, 48]], [226, 232, 240, 175], 2.4),
	walkway([[66, 244], [132, 268], [164, 532], [88, 600], [170, 732], [125, 906]], [226, 232, 240, 165], 2.4),
	walkway([[154, 145], [302, 188], [282, 316], [452, 438], [590, 328]], [226, 232, 240, 155], 2.2),
	walkway([[452, 438], [622, 486], [792, 506], [700, 556], [612, 662], [622, 742]], [226, 232, 240, 170], 2.4),
	walkway([[270, 564], [502, 628], [612, 662], [768, 688]], [226, 232, 240, 145], 2),
	walkway([[270, 564], [260, 682], [274, 796], [388, 905], [586, 900], [650, 1018]], [226, 232, 240, 165], 2.2),
	walkway([[274, 796], [260, 712], [125, 906]], [226, 232, 240, 150], 2.1),
];

const BUILDING_MODEL_CONFIGS: Record<string, BuildingModelConfig> = {
	"truth-hall": {
		url: "/models/truth-hall.glb",
		bounds: {
			min: [-0.9508343935012817, -0.61509108543396, -0.5554260015487671],
			max: [0.9487075805664062, 0.6188217401504517, 0.5538468360900879],
		},
		orientation: [0, 0, 90],
		minHeight: 18,
	},
	"future-hall": {
		url: "/models/future-hall.glb",
		bounds: {
			min: [-0.9508780241012573, -0.43585410714149475, -0.6883870363235474],
			max: [0.947085976600647, 0.43437302112579346, 0.6861690282821655],
		},
		orientation: [0, 0, 90],
		minHeight: 18,
	},
	"sangsang-hall": {
		url: "/models/sangsang-hall.glb",
		bounds: {
			min: [-0.9507250189781189, -0.902379035949707, -0.6749051809310913],
			max: [0.9488130211830139, 0.9004121422767639, 0.6720909476280212],
		},
		orientation: [0, 90, 90],
		minHeight: 22,
	},
	"woochon-hall": {
		url: "/models/woochon-hall.glb",
		bounds: {
			min: [-0.9605649709701538, -0.4031071066856384, -0.5493951439857483],
			max: [0.9489669799804688, 0.3975161015987396, 0.5419819951057434],
		},
		orientation: [0, 0, 90],
		minHeight: 18,
	},
	"exploration-hall": {
		url: "/models/exploration-hall.glb",
		bounds: {
			min: [-0.9507432579994202, -0.4629625082015991, -0.5599758625030518],
			max: [0.9488511681556702, 0.4638557732105255, 0.5571703910827637],
		},
		orientation: [0, 0, 90],
		minHeight: 18,
	},
	"haksong-hall": {
		url: "/models/haksong-hall.glb",
		bounds: {
			min: [-0.6349769830703735, -0.40412214398384094, -0.950805127620697],
			max: [0.6297810077667236, 0.39528509974479675, 0.9489611387252808],
		},
		orientation: [0, 0, 90],
		minHeight: 18,
	},
	"sangsang-cube": {
		url: "/models/sangsang-cube.glb",
		bounds: {
			min: [-0.9283520579338074, -0.5580354332923889, -0.9504767060279846],
			max: [0.9263394474983215, 0.557437539100647, 0.9473657011985779],
		},
		orientation: [0, 0, 90],
		minHeight: 18,
	},
	"sangsang-village": {
		url: "/models/sangsang-village.glb",
		bounds: {
			min: [-0.9508219957351685, -0.4798911511898041, -0.7230710983276367],
			max: [0.9488019943237305, 0.47761815786361694, 0.7250319719314575],
		},
		orientation: [0, 0, 90],
		minHeight: 18,
	},
	"insung-hall": {
		url: "/models/insung-hall.glb",
		bounds: {
			min: [-0.6382279992103577, -0.9506951570510864, -0.4804469347000122],
			max: [0.6364120244979858, 0.9482720494270325, 0.4803599417209625],
		},
		orientation: [0, 0, 90],
		minHeight: 18,
	},
	"research-hall": {
		url: "/models/research-hall.glb",
		bounds: {
			min: [-0.9506296515464783, -0.5827442407608032, -0.43181854486465454],
			max: [0.9488799571990967, 0.5758600234985352, 0.43050023913383484],
		},
		orientation: [0, 0, 90],
		minHeight: 18,
	},
	"creativity-hall": {
		url: "/models/creativity-hall.glb",
		bounds: {
			min: [-0.9507799744606018, -0.4484410285949707, -0.4099830090999603],
			max: [0.9488319754600525, 0.4618220925331116, 0.40808311104774475],
		},
		orientation: [0, 0, 90],
		minHeight: 18,
	},
	"jiseon-hall": {
		url: "/models/jiseon-hall.glb",
		bounds: {
			min: [-0.9508219957351685, -0.43341201543807983, -0.4197610318660736],
			max: [0.9488360285758972, 0.4282720386981964, 0.4169020354747772],
		},
		orientation: [0, 0, 90],
		minHeight: 18,
	},
	rotc: {
		url: "/models/rotc.glb",
		bounds: {
			min: [-0.9508159756660461, -0.571579098701477, -0.6622670292854309],
			max: [0.9488360285758972, 0.5690619945526123, 0.6607589721679688],
		},
		orientation: [0, 0, 90],
		minHeight: 18,
	},
	"naksan-hall": {
		url: "/models/naksan-hall.glb",
		bounds: {
			min: [-0.7241169810295105, -0.5538601279258728, -0.9507421851158142],
			max: [0.722108006477356, 0.5526120662689209, 0.948961079120636],
		},
		orientation: [0, 0, 90],
		minHeight: 18,
	},
	"engineering-complex": {
		url: "/models/engineering-hall.glb",
		bounds: {
			min: [-0.9538896679878235, -0.5361486673355103, -0.9486950635910034],
			max: [0.9493897557258606, 0.5309489369392395, 0.946942925453186],
		},
		orientation: [0, 0, 90],
		minHeight: 18,
		placeIds: ["engineering-a", "engineering-b"],
	},
};

const BUILDING_MODEL_PLACE_IDS = new Set(
	Object.entries(BUILDING_MODEL_CONFIGS).flatMap(([id, config]) => config.placeIds ?? [id]),
);

const SURFACE_PATHS: SurfacePathFeature[] = [
	surfacePath([[70, 94], [76, 170], [110, 214], [150, 298], [164, 532], [212, 616], [260, 712], [274, 768], [388, 875]], [255, 255, 255, 205], 4.2, 0.18),
	surfacePath([[386, 348], [452, 438], [525, 438], [705, 424], [792, 506]], [255, 255, 255, 210], 5.2, 0.19),
	surfacePath([[405, 606], [502, 628], [612, 662], [622, 742], [650, 1018]], [255, 255, 255, 195], 3.6, 0.18),
	surfacePath([[165, 760], [274, 796], [332, 820], [388, 905]], [255, 255, 255, 200], 3.6, 0.18),
	surfacePath([[525, 535], [590, 328], [726, 366]], [255, 255, 255, 185], 3.4, 0.18),
	surfacePath([[705, 550], [682, 604], [715, 606], [818, 606]], [236, 239, 241, 190], 5.8, 0.17),
	surfacePath([[625, 768], [616, 842], [600, 918], [650, 1018]], [255, 255, 255, 220], 4.8, 0.2),
	surfacePath([[350, 535], [374, 510], [392, 488], [408, 464], [425, 542]], [255, 255, 255, 230], 4.8, 0.24),
];

const COURT_LINES: SurfacePathFeature[] = [
	surfacePath([[198, 382], [296, 382], [296, 516], [198, 516], [198, 382]], [255, 255, 255, 205], 1.4, 0.3),
	surfacePath([[247, 382], [247, 516]], [255, 255, 255, 170], 1, 0.31),
	surfacePath([[198, 449], [296, 449]], [255, 255, 255, 170], 1, 0.31),
	surfacePath([[214, 382], [214, 516]], [242, 114, 122, 150], 1.1, 0.32),
	surfacePath([[280, 382], [280, 516]], [242, 114, 122, 150], 1.1, 0.32),
	surfacePath([[230, 392], [230, 506]], [255, 255, 255, 155], 0.8, 0.33),
	surfacePath([[264, 392], [264, 506]], [255, 255, 255, 155], 0.8, 0.33),
	surfacePath([[354, 532], [378, 508]], [203, 213, 225, 230], 1.2, 0.5),
	surfacePath([[362, 522], [386, 498]], [203, 213, 225, 230], 1.2, 0.5),
	surfacePath([[370, 512], [394, 488]], [203, 213, 225, 230], 1.2, 0.5),
	surfacePath([[378, 502], [402, 478]], [203, 213, 225, 230], 1.2, 0.5),
];

const DETAIL_VOLUMES: DetailVolumeFeature[] = [
	volumeDetail("sangsang-main-entry", "상상관 입구", [[386, 488], [410, 488], [410, 512], [386, 512]], 4.2, [20, 184, 166, 210]),
	volumeDetail("future-main-entry", "미래관 입구", [[530, 520], [558, 520], [558, 546], [530, 546]], 3.2, [226, 232, 240, 220]),
	volumeDetail("woochon-inner-entry", "우촌관 연결부", [[560, 360], [602, 360], [602, 382], [560, 382]], 3.4, [55, 65, 70, 215]),
	volumeDetail("research-elevator", "연구관 내부 엘리베이터", [[244, 570], [264, 570], [264, 590], [244, 590]], 3.8, [245, 158, 11, 200]),
	volumeDetail("research-sangsang-stairs", "연구관-상상관 계단", [[368, 510], [398, 482], [406, 492], [376, 520]], 2.8, [226, 232, 240, 220]),
	volumeDetail("creativity-entry", "창의관 입구", [[568, 690], [614, 690], [614, 710], [568, 710]], 3.8, [226, 232, 240, 210]),
	volumeDetail("insung-entry", "인성관 입구", [[580, 706], [628, 706], [628, 724], [580, 724]], 3.8, [226, 232, 240, 210]),
	volumeDetail("engineering-stairs", "공학관 계단", [[292, 828], [320, 828], [320, 864], [292, 864]], 4.8, [148, 163, 184, 220]),
	volumeDetail("village-entry", "상상빌리지 입구", [[334, 820], [362, 820], [362, 858], [334, 858]], 4.5, [148, 163, 184, 220]),
];

export default function CampusMap3DDeckView({ mapResult }: Props) {
	const normalized = normalizeMapResult(mapResult);
	const selectedId = normalized.selectedPlaceId;
	const buildings = normalized.places
		.filter((place) => place.category === "building" && place.polygon?.length)
		.map((place) => toBuildingFeature(place, selectedId));
	const modelBuildings = buildings.filter((building) => usesScenegraphModel(building));
	const polygonBuildings = buildings.filter((building) => !usesScenegraphModel(building));
	const gates = normalized.places
		.filter((place) => place.category === "gate")
		.map(toGateFeature);
	const outdoorAreas = normalized.places
		.filter((place) => place.category === "outdoor" && place.polygon?.length)
		.map(toOutdoorFeature);
	const roofDetails = polygonBuildings.flatMap(toRoofDetails);
	const floorBands = polygonBuildings.flatMap(toFloorBands);
	const verticalEdges = polygonBuildings.flatMap(toVerticalEdges);
	const buildingLabels = buildings.filter((building) => !building.selected && building.labelPriority >= 2);
	const selectedBuildingLabels = buildings.filter((building) => building.selected);
	const groundLabels = toGroundLabels(outdoorAreas);
	const vworldTiles = buildVWorldCampusTiles();
	const vworldEnabled = hasVWorldKey() && vworldTiles.length > 0;
	const vworldTileLayers = vworldTiles.map((tile) => (
		new BitmapLayer({
			id: `campus-${tile.id}`,
			image: tile.image,
			bounds: tile.bounds,
			coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
			opacity: 0.68,
			visible: vworldEnabled,
		})
	));
	const routeFeature = normalized.routeLocal3d.length > 1
		? [{ path: normalized.routeLocal3d, accessible: Boolean(mapResult.route?.accessible) }]
		: [];
	const buildingModelLayers = Object.entries(BUILDING_MODEL_CONFIGS).flatMap(([modelId, config]) => {
		const placeIds = config.placeIds ?? [modelId];
		const sourceBuildings = modelBuildings.filter((building) => placeIds.includes(building.id));
		if (!sourceBuildings.length) return [];
		const modelBuilding = mergeBuildingsForModel(modelId, config, sourceBuildings);
		return [
			new ScenegraphLayer<BuildingFeature>({
				id: `campus-${modelId}-glb-3d`,
				data: [modelBuilding],
				scenegraph: config.url,
				coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
				getPosition: (item) => [item.roofCenter[0], item.roofCenter[1], 0],
				getOrientation: config.orientation,
				getScale: (item) => yUpModelScale(item, config),
				getTranslation: (item) => yUpModelTranslation(item, config),
				getColor: [255, 255, 255, 255],
				sizeScale: 1,
				pickable: true,
				_lighting: "pbr",
			}),
		];
	});

	const layers = [
		...vworldTileLayers,
		new PolygonLayer({
			id: "campus-ground-3d",
			data: [
				{
					polygon: [
						[-225, 262],
						[-20, 258],
						[58, 160],
						[192, 154],
						[205, 0],
						[150, -245],
						[-55, -260],
						[-145, -160],
						[-200, 104],
					],
				},
			],
			coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
			getPolygon: (area) => area.polygon,
			getFillColor: vworldEnabled ? [143, 184, 156, 28] : [143, 184, 156, 72],
			getLineColor: [255, 255, 255, 160],
			lineWidthMinPixels: 1,
		}),
		new PolygonLayer<OutdoorFeature>({
			id: "campus-outdoor-areas-3d",
			data: outdoorAreas,
			coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
			extruded: false,
			pickable: true,
			getPolygon: (area) => area.polygon,
			getFillColor: (area) => area.fillColor,
			getLineColor: [255, 255, 255, 180],
			lineWidthMinPixels: 1,
		}),
		new PathLayer<WalkwayFeature>({
			id: "campus-guide-walkways-3d",
			data: GUIDE_WALKWAYS,
			coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
			getPath: (walkway) => walkway.path,
			getColor: (walkway) => walkway.color,
			getWidth: (walkway) => walkway.width,
			widthMinPixels: 3,
			rounded: true,
			jointRounded: true,
		}),
		new PathLayer<SurfacePathFeature>({
			id: "campus-white-walkways-3d",
			data: SURFACE_PATHS,
			coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
			getPath: (path) => path.path,
			getColor: (path) => path.color,
			getWidth: (path) => path.width,
			widthMinPixels: 2,
			rounded: true,
			jointRounded: true,
		}),
		new PathLayer<SurfacePathFeature>({
			id: "campus-court-lines-3d",
			data: COURT_LINES,
			coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
			getPath: (path) => path.path,
			getColor: (path) => path.color,
			getWidth: (path) => path.width,
			widthMinPixels: 1,
			rounded: true,
			jointRounded: true,
		}),
		new PolygonLayer<BuildingFeature>({
			id: "campus-buildings-3d",
			data: polygonBuildings,
			coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
			extruded: true,
			wireframe: false,
			pickable: true,
			getPolygon: (building) => building.polygon,
			getElevation: (building) => building.height,
			getFillColor: (building) => building.selected ? [153, 246, 228, 245] : building.fillColor,
			getLineColor: (building) => building.selected ? [15, 118, 110, 255] : [255, 255, 255, 140],
			lineWidthMinPixels: 1,
			material: {
				ambient: 0.6,
				diffuse: 0.7,
				shininess: 24,
				specularColor: [180, 220, 210],
			},
		}),
		new PolygonLayer<DetailVolumeFeature>({
			id: "campus-building-detail-volumes-3d",
			data: DETAIL_VOLUMES,
			coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
			extruded: true,
			pickable: true,
			getPolygon: (detail) => detail.polygon,
			getElevation: (detail) => detail.height,
			getFillColor: (detail) => detail.color,
			getLineColor: (detail) => detail.lineColor,
			lineWidthMinPixels: 1,
			material: {
				ambient: 0.72,
				diffuse: 0.64,
				shininess: 18,
				specularColor: [230, 245, 250],
			},
		}),
		new PolygonLayer<BuildingFeature>({
			id: "campus-roofs-3d",
			data: polygonBuildings,
			coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
			extruded: false,
			getPolygon: (building) => building.roof,
			getFillColor: (building) => building.selected ? [190, 255, 240, 245] : building.roofColor,
			getLineColor: [255, 255, 255, 130],
			lineWidthMinPixels: 1,
		}),
		new PolygonLayer<RoofDetailFeature>({
			id: "campus-roof-details-3d",
			data: roofDetails,
			coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
			extruded: false,
			getPolygon: (detail) => detail.polygon,
			getFillColor: (detail) => detail.color,
			getLineColor: [255, 255, 255, 150],
			lineWidthMinPixels: 1,
		}),
		new PathLayer<BuildingFeature>({
			id: "campus-building-roof-lines-3d",
			data: polygonBuildings,
			coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
			getPath: (building) => [...building.roof, building.roof[0]],
			getColor: (building) => building.selected ? [15, 118, 110, 255] : [17, 24, 39, 220],
			getWidth: 1.1,
			widthMinPixels: 1,
			rounded: true,
		}),
		...buildingModelLayers,
		new PathLayer<BuildingLineFeature>({
			id: "campus-building-floor-bands-3d",
			data: floorBands,
			coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
			getPath: (line) => line.path,
			getColor: (line) => line.color,
			getWidth: (line) => line.width,
			widthMinPixels: 1,
			rounded: true,
		}),
		new PathLayer<BuildingLineFeature>({
			id: "campus-building-vertical-edges-3d",
			data: verticalEdges,
			coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
			getPath: (line) => line.path,
			getColor: (line) => line.color,
			getWidth: (line) => line.width,
			widthMinPixels: 1,
			rounded: true,
		}),
		new TextLayer<GroundLabelFeature>({
			id: "campus-ground-labels-3d",
			data: groundLabels,
			coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
			getPosition: (label) => label.position,
			getText: (label) => label.name,
			getSize: (label) => label.size,
			getColor: (label) => label.color,
			getTextAnchor: "middle",
			getAlignmentBaseline: "center",
			background: true,
			getBackgroundColor: (label) => label.background,
			backgroundPadding: [5, 3],
			characterSet: LABEL_CHARACTER_SET,
			fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif",
			fontWeight: 900,
			billboard: true,
		}),
		new PathLayer<RouteFeature>({
			id: "campus-route-3d",
			data: routeFeature,
			coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
			getPath: (route) => route.path,
			getColor: (route) => route.accessible ? [15, 118, 110, 255] : [37, 99, 235, 255],
			getWidth: 4,
			widthMinPixels: 5,
			rounded: true,
			jointRounded: true,
		}),
		new ScatterplotLayer<GateFeature>({
			id: "campus-gate-markers-3d",
			data: gates,
			coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
			getPosition: (gate) => gate.markerPosition,
			getRadius: 4.2,
			radiusUnits: "meters",
			getFillColor: [37, 99, 235, 220],
			getLineColor: [255, 255, 255, 255],
			lineWidthMinPixels: 2,
			pickable: true,
		}),
		new TextLayer<GateFeature>({
			id: "campus-gate-labels-3d",
			data: gates,
			coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
			getPosition: (gate) => gate.labelPosition,
			getText: (gate) => gate.name,
			getSize: 10.5,
			getColor: [255, 255, 255, 255],
			getTextAnchor: "middle",
			getAlignmentBaseline: "center",
			background: true,
			getBackgroundColor: [0, 61, 165, 230],
			backgroundPadding: [6, 4],
			characterSet: LABEL_CHARACTER_SET,
			fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif",
			fontWeight: 950,
			billboard: true,
			pickable: true,
		}),
		new TextLayer<BuildingFeature>({
			id: "campus-building-labels-3d",
			data: buildingLabels,
			coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
			getPosition: (building) => building.signPosition,
			getText: (building) => shortName(building.name),
			getSize: (building) => building.labelPriority >= 3 ? 8.5 : 7.5,
			getColor: (building) => building.selected ? [8, 47, 42, 255] : [255, 255, 255, 245],
			getPixelOffset: [0, 0],
			getTextAnchor: "middle",
			getAlignmentBaseline: "center",
			background: true,
			getBackgroundColor: (building) => building.selected ? [209, 250, 229, 230] : [15, 23, 42, 215],
			backgroundPadding: [5, 3],
			characterSet: LABEL_CHARACTER_SET,
			fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif",
			fontWeight: 900,
			billboard: true,
		}),
		new TextLayer<BuildingFeature>({
			id: "campus-selected-building-label-3d",
			data: selectedBuildingLabels,
			coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
			getPosition: (building) => building.signPosition,
			getText: (building) => shortName(building.name),
			getSize: 11,
			getColor: [8, 47, 42, 255],
			getPixelOffset: [0, 0],
			getTextAnchor: "middle",
			getAlignmentBaseline: "center",
			background: true,
			getBackgroundColor: [209, 250, 229, 235],
			backgroundPadding: [8, 5],
			characterSet: LABEL_CHARACTER_SET,
			fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif",
			fontWeight: 950,
			billboard: true,
		}),
	];

	return (
		<div className="campus-map-3d-view" aria-label="한성대 3D 캠퍼스 맵">
			<div className="campus-map-3d-deck">
				<DeckGL
					views={new OrbitView({ controller: true })}
					initialViewState={{
						target: [0, 0, 0],
						zoom: 0.78,
						rotationX: 42,
						rotationOrbit: -22,
					}}
					controller
					effects={[lightingEffect]}
					layers={layers}
					getTooltip={({ object }) => object && "name" in object ? String(object.name) : null}
				/>
			</div>
			<p className="campus-map-3d-caption">
				{vworldEnabled
					? "VWorld WMTS 배경지도 위에 한성대 graph 기반 3D 캠퍼스맵을 겹쳐 렌더링합니다."
					: "건물은 층 라인, 입구 캐노피, 옥상 설비를 포함한 수동 모델링 레이어로 렌더링합니다."}
			</p>
		</div>
	);
}

function toGateFeature(place: CampusMapPlace): GateFeature {
	const centerPoint = place.center ?? { x: 0, y: 0 };
	const [x, y] = canvasToLocal(centerPoint);
	const [labelDx, labelDy] = gateLabelOffset(place.id);
	return {
		id: place.id,
		name: gateName(place),
		markerPosition: [x, y, 7],
		labelPosition: [x + labelDx, y + labelDy, 15],
	};
}

function gateLabelOffset(id: string): [number, number] {
	if (id === "main-gate") return [22, 0];
	if (id === "middle-gate") return [0, 18];
	if (id === "south-gate") return [0, -22];
	return [0, 14];
}

function gateName(place: CampusMapPlace): string {
	if (place.id === "main-gate") return "← 정문";
	if (place.id === "middle-gate") return "↓ 중문";
	if (place.id === "south-gate") return "↖ 후문";
	return place.name.replace("정문(안내실)", "정문");
}

function toOutdoorFeature(place: CampusMapPlace): OutdoorFeature {
	const centerPoint = place.center ?? { x: 0, y: 0 };
	const [centerX, centerY] = canvasToLocal(centerPoint);
	return {
		id: place.id,
		name: place.name,
		polygon: (place.polygon ?? []).map((point) => canvasToLocal(point)),
		center: [centerX, centerY, 0.15],
		fillColor: outdoorColor(place.id),
	};
}

function toBuildingFeature(place: CampusMapPlace, selectedId?: string): BuildingFeature {
	const centerPoint = place.center ?? { x: 0, y: 0 };
	const [centerX, centerY] = canvasToLocal(centerPoint);
	const height = Math.max(4, place.render3d?.height_m ?? place.height_m ?? place.height ?? 18);
	const polygon = (place.polygon ?? []).map((point) => canvasToLocal(point));
	return {
		id: place.id,
		name: place.name,
		polygon,
		roof: polygon.map(([x, y]) => [x, y, height + 0.2]),
		center: [centerX, centerY, height + labelLift(place.id)],
		signPosition: labelPosition(place.id, centerX, centerY, height),
		roofCenter: [centerX, centerY, height + 0.35],
		height,
		selected: place.id === selectedId,
		fillColor: buildingColor(place.id),
		roofColor: roofColor(place.id),
		labelOffset: labelOffset(),
		labelPriority: labelPriority(place.id),
	};
}

function toRoofDetails(building: BuildingFeature): RoofDetailFeature[] {
	const [x, y, z] = building.roofCenter;
	if (building.height < 9) return [];
	const sizes = roofDetailSizes(building.id);
	return sizes.map((detail, index) => ({
		id: `${building.id}-roof-core-${index}`,
		polygon: rect3d(x + detail.dx, y + detail.dy, z + 0.35 + index * 0.04, detail.w, detail.h),
		color: detail.color ?? (building.selected ? [15, 118, 110, 190] : [30, 41, 59, 165]),
	}));
}

function toFloorBands(building: BuildingFeature): BuildingLineFeature[] {
	const floorCount = Math.max(2, Math.min(12, Math.round(building.height / 4.2)));
	const lines: BuildingLineFeature[] = [];
	for (let floor = 1; floor < floorCount; floor += 1) {
		const z = (building.height / floorCount) * floor;
		const alpha = building.selected ? 190 : 135;
		lines.push({
			id: `${building.id}-floor-band-${floor}`,
			path: closePath3d(building.polygon, z),
			color: building.id === "future-hall" || building.id === "woochon-hall"
				? [15, 23, 42, alpha]
				: [226, 232, 240, alpha],
			width: floor % 2 === 0 ? 0.52 : 0.38,
		});
	}
	return lines;
}

function toVerticalEdges(building: BuildingFeature): BuildingLineFeature[] {
	return building.polygon.map(([x, y], index) => ({
		id: `${building.id}-edge-${index}`,
		path: [[x, y, 0.25], [x, y, building.height + 0.45]],
		color: building.selected ? [13, 148, 136, 210] : [15, 23, 42, 150],
		width: building.selected ? 0.85 : 0.55,
	}));
}

function usesScenegraphModel(building: BuildingFeature): boolean {
	return BUILDING_MODEL_PLACE_IDS.has(building.id);
}

function mergeBuildingsForModel(modelId: string, config: BuildingModelConfig, buildings: BuildingFeature[]): BuildingFeature {
	if (buildings.length === 1) return buildings[0];
	const xs = buildings.flatMap((building) => building.polygon.map(([x]) => x));
	const ys = buildings.flatMap((building) => building.polygon.map(([, y]) => y));
	const minX = Math.min(...xs);
	const maxX = Math.max(...xs);
	const minY = Math.min(...ys);
	const maxY = Math.max(...ys);
	const centerX = (minX + maxX) / 2;
	const centerY = (minY + maxY) / 2;
	const height = Math.max(config.minHeight, ...buildings.map((building) => building.height));
	const polygon: [number, number][] = [
		[minX, minY],
		[maxX, minY],
		[maxX, maxY],
		[minX, maxY],
	];
	return {
		...buildings[0],
		id: modelId,
		name: buildings.map((building) => building.name).join(" / "),
		polygon,
		roof: polygon.map(([x, y]) => [x, y, height + 0.2]),
		center: [centerX, centerY, height + 12],
		signPosition: [centerX, centerY, height + 16],
		roofCenter: [centerX, centerY, height + 0.35],
		height,
		selected: buildings.some((building) => building.selected),
	};
}

function yUpModelScale(building: BuildingFeature, config: BuildingModelConfig): [number, number, number] {
	const bounds = footprintBounds(building.polygon);
	const [modelWidth, modelHeight, modelDepth] = modelSize(config.bounds);
	return [
		bounds.width / modelWidth,
		Math.max(config.minHeight, building.height) / modelHeight,
		bounds.depth / modelDepth,
	];
}

function yUpModelTranslation(building: BuildingFeature, config: BuildingModelConfig): [number, number, number] {
	const [scaleX, scaleY, scaleZ] = yUpModelScale(building, config);
	const [centerX, , centerZ] = modelCenter(config.bounds);
	return [
		-centerX * scaleX,
		centerZ * scaleZ,
		-config.bounds.min[1] * scaleY,
	];
}

function footprintBounds(polygon: [number, number][]): { width: number; depth: number } {
	const xs = polygon.map(([x]) => x);
	const ys = polygon.map(([, y]) => y);
	return {
		width: Math.max(...xs) - Math.min(...xs),
		depth: Math.max(...ys) - Math.min(...ys),
	};
}

function modelSize(bounds: BuildingModelConfig["bounds"]): [number, number, number] {
	return [
		bounds.max[0] - bounds.min[0],
		bounds.max[1] - bounds.min[1],
		bounds.max[2] - bounds.min[2],
	];
}

function modelCenter(bounds: BuildingModelConfig["bounds"]): [number, number, number] {
	return [
		(bounds.min[0] + bounds.max[0]) / 2,
		(bounds.min[1] + bounds.max[1]) / 2,
		(bounds.min[2] + bounds.max[2]) / 2,
	];
}

function buildingColor(id: string): [number, number, number, number] {
	if (id.includes("engineering")) return [92, 116, 122, 235];
	if (id === "sangsang-hall") return [38, 49, 55, 245];
	if (id === "future-hall") return [46, 55, 60, 242];
	if (id === "woochon-hall") return [46, 55, 60, 242];
	if (id === "naksan-hall") return [50, 56, 60, 240];
	return [46, 55, 60, 238];
}

function roofColor(id: string): [number, number, number, number] {
	if (id === "future-hall") return [68, 78, 84, 238];
	if (id === "woochon-hall") return [68, 78, 84, 238];
	if (id.includes("engineering")) return [132, 162, 168, 230];
	if (id === "sangsang-hall") return [66, 84, 91, 240];
	return [68, 78, 84, 235];
}

function outdoorColor(id: string): [number, number, number, number] {
	if (id === "futsal-tennis") return [116, 170, 126, 145];
	if (id === "naksan-park") return [111, 158, 112, 150];
	if (id === "uigwajeong") return [238, 202, 126, 190];
	return [142, 181, 152, 145];
}

function labelOffset(): [number, number] {
	return [0, 0];
}

function labelLift(id: string): number {
	const lifts: Record<string, number> = {
		"engineering-a": 16,
		"engineering-b": 16,
		"jiseon-hall": 15,
		"research-hall": 14,
		"future-hall": 13,
		"woochon-hall": 13,
		"sangsang-village": 14,
		rotc: 12,
	};
	return lifts[id] ?? 11;
}

function labelPosition(id: string, centerX: number, centerY: number, height: number): [number, number, number] {
	const offsets: Record<string, [number, number, number]> = {
		"engineering-b": [0, 0, 22],
		"engineering-a": [0, 0, 21],
		"sangsang-village": [0, 0, 28],
		"jiseon-hall": [0, 0, 20],
		"research-hall": [0, 0, 20],
		"sangsang-hall": [0, 0, 22],
		"future-hall": [0, 0, 20],
		"woochon-hall": [0, 0, 20],
		"creativity-hall": [0, 0, 21],
		"insung-hall": [0, 0, 21],
		"naksan-hall": [0, 0, 21],
		rotc: [0, 0, 20],
	};
	const [dx, dy, lift] = offsets[id] ?? [0, 0, 15];
	return [centerX + dx, centerY + dy, height + lift];
}

function labelPriority(id: string): number {
	const priorities: Record<string, number> = {
		"sangsang-hall": 4,
		"future-hall": 4,
		"woochon-hall": 4,
		"naksan-hall": 4,
		"research-hall": 3,
		"truth-hall": 3,
		"engineering-a": 3,
		"engineering-b": 3,
		"creativity-hall": 3,
		"insung-hall": 3,
		"jiseon-hall": 2,
		"exploration-hall": 2,
		"haksong-hall": 2,
		"sangsang-village": 2,
		rotc: 2,
		"sangsang-cube": 2,
	};
	return priorities[id] ?? 1;
}

function roofDetailSizes(id: string): Array<{ dx: number; dy: number; w: number; h: number; color?: [number, number, number, number] }> {
	const dark: [number, number, number, number] = [30, 41, 59, 168];
	const light: [number, number, number, number] = [226, 232, 240, 190];
	const blueGlass: [number, number, number, number] = [125, 211, 252, 145];
	const byBuilding: Record<string, Array<{ dx: number; dy: number; w: number; h: number; color?: [number, number, number, number] }>> = {
		"sangsang-hall": [
			{ dx: -12, dy: -4, w: 14, h: 8, color: dark },
			{ dx: 10, dy: 18, w: 12, h: 7, color: dark },
			{ dx: -20, dy: 22, w: 8, h: 18, color: [64, 84, 88, 185] },
		],
		"future-hall": [
			{ dx: -18, dy: -18, w: 16, h: 8, color: light },
			{ dx: 20, dy: 14, w: 18, h: 7, color: dark },
			{ dx: 4, dy: 0, w: 10, h: 10, color: blueGlass },
		],
		"woochon-hall": [
			{ dx: -42, dy: 0, w: 18, h: 8, color: light },
			{ dx: 38, dy: 0, w: 20, h: 8, color: light },
		],
		"naksan-hall": [
			{ dx: 8, dy: -30, w: 18, h: 8, color: dark },
			{ dx: 0, dy: 28, w: 18, h: 8, color: dark },
		],
		"engineering-a": [
			{ dx: -32, dy: 2, w: 13, h: 7, color: dark },
			{ dx: 34, dy: -2, w: 15, h: 7, color: light },
		],
		"engineering-b": [
			{ dx: 0, dy: -34, w: 11, h: 7, color: dark },
			{ dx: 0, dy: 36, w: 11, h: 7, color: light },
		],
		"sangsang-village": [
			{ dx: 0, dy: -34, w: 12, h: 8, color: dark },
			{ dx: 0, dy: 34, w: 12, h: 8, color: light },
		],
	};
	return byBuilding[id] ?? [{ dx: 0, dy: 0, w: 10, h: 7, color: dark }];
}

function toGroundLabels(areas: OutdoorFeature[]): GroundLabelFeature[] {
	return areas
		.filter((area) => area.id === "futsal-tennis" || area.id === "naksan-park" || area.id === "sangsang-park-plus" || area.id === "uigwajeong")
		.map((area) => ({
			id: `${area.id}-ground-label`,
			name: area.id === "naksan-park" ? "뒷길 산책로" : shortName(area.name),
			position: [area.center[0], area.center[1], 2.2],
			color: [22, 101, 52, 245],
			background: area.id === "uigwajeong" ? [254, 240, 138, 215] : [220, 252, 231, 215],
			size: area.id === "uigwajeong" ? 7.5 : 8.5,
		}));
}

function rect3d(x: number, y: number, z: number, width: number, height: number): [number, number, number][] {
	return [
		[x - width / 2, y - height / 2, z],
		[x + width / 2, y - height / 2, z],
		[x + width / 2, y + height / 2, z],
		[x - width / 2, y + height / 2, z],
	];
}

function closePath3d(polygon: [number, number][], z: number): [number, number, number][] {
	return [...polygon, polygon[0]].map(([x, y]) => [x, y, z + 0.25]);
}

function volumeDetail(
	id: string,
	name: string,
	points: [number, number][],
	height: number,
	color: [number, number, number, number],
): DetailVolumeFeature {
	return {
		id,
		name,
		polygon: points.map(([x, y]) => canvasToLocal({ x, y })),
		height,
		color,
		lineColor: [15, 23, 42, 170],
	};
}

function walkway(points: [number, number][], color: [number, number, number, number], width: number): WalkwayFeature {
	return {
		path: points.map(([x, y]) => {
			const [localX, localY] = canvasToLocal({ x, y });
			return [localX, localY, 0.35];
		}),
		color,
		width,
	};
}

function surfacePath(points: [number, number][], color: [number, number, number, number], width: number, z: number): SurfacePathFeature {
	return {
		path: points.map(([x, y]) => {
			const [localX, localY] = canvasToLocal({ x, y });
			return [localX, localY, z];
		}),
		color,
		width,
	};
}

function shortName(name: string): string {
	return name
		.replace("정문(안내실)", "정문")
		.replace("공학관A동", "공학A")
		.replace("공학관B동", "공학B")
		.replace("학술정보관", "도서관")
		.replace("상상파크 플러스", "상상파크+");
}
