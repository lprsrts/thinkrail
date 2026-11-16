import { describe, expect, test } from "bun:test";
import {
	brushClick,
	brushDrag,
	brushGrip,
	clampView,
	fitView,
	overviewUnit,
	overviewX,
	panView,
	STEP_UNITS,
	StepScale,
	stepTicks,
	TimeScale,
	ticks,
	viewAround,
	viewContaining,
	zoomView,
} from "./scale";

const START = 1_000_000;
const HOUR = 3_600_000;
const gaps = [{ t0: START + 60_000, t1: START + HOUR, cause: "user" as const }];

describe("TimeScale", () => {
	test("is the identity without compression", () => {
		const scale = new TimeScale(START, START + HOUR + 60_000, gaps, null);
		expect(scale.breaks).toEqual([]);
		expect(scale.toUnit(START + 30_000)).toBe(30_000);
		expect(scale.toTime(30_000)).toBe(START + 30_000);
	});

	test("squeezes long idle stretches into labelled breaks and maps back exactly", () => {
		const end = START + HOUR + 60_000;
		const scale = new TimeScale(START, end, gaps, 2 * 60_000);
		expect(scale.breaks).toHaveLength(1);
		const [gap] = scale.breaks;
		expect(gap?.cause).toBe("user");
		expect(gap?.u0).toBe(60_000);
		const width = (gap?.u1 ?? 0) - (gap?.u0 ?? 0);
		expect(width).toBe(5_000);
		expect(scale.max).toBe(60_000 + width + 60_000);
		for (const time of [START, START + 30_000, START + HOUR + 10_000, end])
			expect(scale.toTime(scale.toUnit(time))).toBeCloseTo(time, 6);
	});

	test("leaves short idle stretches alone", () => {
		const scale = new TimeScale(START, START + HOUR + 60_000, gaps, 2 * HOUR);
		expect(scale.breaks).toEqual([]);
	});

	test("an empty session still has a span", () => {
		const scale = new TimeScale(START, START, [], 60_000);
		expect(scale.max).toBeGreaterThan(scale.min);
	});
});

describe("views", () => {
	const scale = new TimeScale(START, START + 100_000, [], null);

	test("fit pads the whole session and zoom keeps the point under the cursor", () => {
		const fit = fitView(scale);
		expect(fit.u0).toBeLessThan(0);
		expect(fit.u1).toBeGreaterThan(100_000);
		const zoomed = zoomView(scale, { u0: 0, u1: 100_000 }, 25_000, 0.5);
		expect(zoomed).toEqual({ u0: 12_500, u1: 62_500 });
	});

	test("clamping keeps a minimum span and stays near the session", () => {
		expect(clampView(scale, { u0: 10, u1: 20 }).u1 - clampView(scale, { u0: 10, u1: 20 }).u0).toBe(
			200,
		);
		const far = panView(scale, { u0: 0, u1: 10_000 }, 1_000_000);
		expect(far.u1).toBeLessThanOrEqual(100_000 * 1.04);
		expect(clampView(scale, { u0: -1e9, u1: 1e9 })).toEqual(fitView(scale));
	});

	test("around a call zooms with padding; containing a time only pans", () => {
		const around = viewAround(scale, START + 40_000, START + 50_000, 0.5);
		expect(around).toEqual({ u0: 35_000, u1: 55_000 });
		const view = { u0: 0, u1: 10_000 };
		expect(viewContaining(scale, view, START + 5_000)).toBe(view);
		const moved = viewContaining(scale, view, START + 60_000);
		expect(moved.u1 - moved.u0).toBe(10_000);
		expect(moved.u0).toBeLessThan(60_000);
		expect(moved.u1).toBeGreaterThan(60_000);
	});
});

describe("ticks", () => {
	test("fall on round steps at least 60px apart and never inside a break", () => {
		const scale = new TimeScale(START, START + HOUR + 60_000, gaps, 2 * 60_000);
		const view = fitView(scale);
		const list = ticks(scale, view, 1000, 0);
		expect(list.length).toBeGreaterThan(2);
		for (const [index, tick] of list.entries()) {
			const previous = list[index - 1];
			if (previous) expect(tick.x - previous.x).toBeGreaterThanOrEqual(58);
			expect(scale.breaks.some((gap) => tick.time > gap.t0 && tick.time < gap.t1)).toBe(false);
		}
		expect(list[0]?.day).toBe(true);
	});
});

describe("StepScale", () => {
	test("gives every model call one step, whatever the time between calls", () => {
		const starts = [START + 1_000, START + 2_000, START + HOUR];
		const scale = new StepScale(starts, START, START + HOUR + 60_000);
		expect(scale.min).toBe(0);
		expect(scale.max).toBe(4 * STEP_UNITS);
		expect(scale.toUnit(START + 1_000)).toBe(STEP_UNITS);
		expect(scale.toUnit(START + HOUR)).toBe(3 * STEP_UNITS);
		expect(scale.toUnit(START + 1_500)).toBe(1.5 * STEP_UNITS);
		expect(scale.toTime(2 * STEP_UNITS)).toBe(START + 2_000);
		expect(scale.breaks).toEqual([]);
	});

	test("ticks count steps at a round interval", () => {
		const view = { u0: 0, u1: 100 * STEP_UNITS };
		const marks = stepTicks(view, 1000);
		expect(marks[0]).toEqual({ x: 0, step: 1 });
		expect(marks.every((mark, at) => at === 0 || mark.x - (marks[at - 1]?.x ?? 0) >= 84)).toBe(
			true,
		);
		expect(stepTicks(view, 0)).toEqual([]);
	});
});

describe("the overview brush", () => {
	const scale = new TimeScale(START, START + 100_000, [], null);
	const view = { u0: 20_000, u1: 40_000 };
	const width = 1000;

	test("maps overview pixels to axis units over the whole session", () => {
		expect(overviewX(scale, width, 50_000)).toBe(500);
		expect(overviewUnit(scale, width, 250)).toBe(25_000);
	});

	test("grabs an edge, the brush or a new range by where it is pressed", () => {
		expect(brushGrip(scale, view, width, 201).kind).toBe("start");
		expect(brushGrip(scale, view, width, 398).kind).toBe("end");
		expect(brushGrip(scale, view, width, 300)).toEqual({ kind: "move", x0: 300, view });
		expect(brushGrip(scale, view, width, 700)).toEqual({ kind: "new", x0: 700, moved: false });
	});

	test("drags an edge or the whole brush, and draws a new range past the threshold", () => {
		expect(brushDrag(scale, view, width, { kind: "start" }, 100)).toEqual({
			u0: 10_000,
			u1: 40_000,
		});
		expect(brushDrag(scale, view, width, { kind: "end" }, 600)).toEqual({ u0: 20_000, u1: 60_000 });
		expect(brushDrag(scale, view, width, { kind: "move", x0: 300, view }, 400)).toEqual({
			u0: 30_000,
			u1: 50_000,
		});
		const grip = { kind: "new" as const, x0: 700, moved: false };
		expect(brushDrag(scale, view, width, grip, 702)).toBeNull();
		expect(brushDrag(scale, view, width, grip, 800)).toEqual({ u0: 70_000, u1: 80_000 });
		expect(grip.moved).toBe(true);
	});

	test("a click without a drag recentres the brush; a drag does not", () => {
		expect(brushClick(scale, view, width, { kind: "new", x0: 700, moved: false })).toEqual({
			u0: 60_000,
			u1: 80_000,
		});
		expect(brushClick(scale, view, width, { kind: "new", x0: 700, moved: true })).toBeNull();
		expect(brushClick(scale, view, width, { kind: "start" })).toBeNull();
	});
});
