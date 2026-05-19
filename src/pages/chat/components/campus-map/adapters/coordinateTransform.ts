import type { CampusMapPoint } from "../types/campusMap";

export const GUIDE_WIDTH = 840;
export const GUIDE_HEIGHT = 1040;
const ORIGIN_X = GUIDE_WIDTH / 2;
const ORIGIN_Y = GUIDE_HEIGHT / 2;
const SCALE_M_PER_PX = 0.5;

export function canvasToLocal(point: CampusMapPoint): [number, number] {
	return [
		round((point.x - ORIGIN_X) * SCALE_M_PER_PX),
		round((ORIGIN_Y - point.y) * SCALE_M_PER_PX),
	];
}

export function canvasToLocal3d(point: CampusMapPoint, z = 0.2): [number, number, number] {
	const [x, y] = canvasToLocal(point);
	return [x, y, z];
}

export function localToCanvas([x, y]: [number, number]): CampusMapPoint {
	return {
		x: x / SCALE_M_PER_PX + ORIGIN_X,
		y: ORIGIN_Y - y / SCALE_M_PER_PX,
	};
}

function round(value: number): number {
	return Math.round(value * 1000) / 1000;
}
