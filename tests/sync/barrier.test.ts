import { describe, it, expect } from "vitest";
import { Barrier, BarrierWaitResult } from "../../src/sync/barrier";

describe("Barrier", () => {
	it("N tasks wait, all released together", async () => {
		const n = 5;
		const barrier = new Barrier(n);
		const arrived: number[] = [];

		const tasks = Array.from({ length: n }, (_, i) =>
			barrier.wait().then((result) => {
				arrived.push(i);
				return result;
			}),
		);

		const results = await Promise.all(tasks);
		expect(arrived).toHaveLength(n);
		expect(results).toHaveLength(n);
	});

	it("exactly one leader per generation", async () => {
		const n = 4;
		const barrier = new Barrier(n);

		const tasks = Array.from({ length: n }, () => barrier.wait());
		const results = await Promise.all(tasks);

		const leaders = results.filter((r) => r.isLeader());
		expect(leaders).toHaveLength(1);

		const nonLeaders = results.filter((r) => !r.isLeader());
		expect(nonLeaders).toHaveLength(n - 1);
	});

	it("barrier is reusable (second wave also works)", async () => {
		const n = 3;
		const barrier = new Barrier(n);

		const wave1 = Array.from({ length: n }, () => barrier.wait());
		const results1 = await Promise.all(wave1);
		expect(results1.filter((r) => r.isLeader())).toHaveLength(1);

		const wave2 = Array.from({ length: n }, () => barrier.wait());
		const results2 = await Promise.all(wave2);
		expect(results2.filter((r) => r.isLeader())).toHaveLength(1);
	});

	it("barrier of size 1 resolves immediately with leader", async () => {
		const barrier = new Barrier(1);
		const result = await barrier.wait();
		expect(result.isLeader()).toBe(true);
	});

	it("barrier of size 1 is reusable", async () => {
		const barrier = new Barrier(1);

		for (let i = 0; i < 5; i++) {
			const result = await barrier.wait();
			expect(result.isLeader()).toBe(true);
		}
	});

	it("constructor throws for size 0", () => {
		expect(() => new Barrier(0)).toThrow(RangeError);
	});

	it("constructor throws for negative size", () => {
		expect(() => new Barrier(-1)).toThrow(RangeError);
		expect(() => new Barrier(-100)).toThrow(RangeError);
	});

	it("leader is always the last arrival", async () => {
		const n = 5;
		const barrier = new Barrier(n);
		const results: BarrierWaitResult[] = [];

		// Arrive n-1 tasks first; they should all be pending
		const pendingTasks = Array.from({ length: n - 1 }, () => barrier.wait());

		// The last arrival triggers the barrier and is the leader
		const lastResult = await barrier.wait();
		expect(lastResult.isLeader()).toBe(true);

		const earlierResults = await Promise.all(pendingTasks);
		for (const r of earlierResults) {
			expect(r.isLeader()).toBe(false);
		}
	});

	it("three+ generations all work correctly", async () => {
		const n = 3;
		const barrier = new Barrier(n);

		for (let gen = 0; gen < 5; gen++) {
			const tasks = Array.from({ length: n }, () => barrier.wait());
			const results = await Promise.all(tasks);

			const leaders = results.filter((r) => r.isLeader());
			expect(leaders).toHaveLength(1);
			expect(results).toHaveLength(n);
		}
	});

	it("incomplete wave blocks until all arrive", async () => {
		const n = 3;
		const barrier = new Barrier(n);
		let resolved = false;

		const p1 = barrier.wait().then((r) => {
			resolved = true;
			return r;
		});
		const p2 = barrier.wait().then((r) => {
			resolved = true;
			return r;
		});

		// Only 2 of 3 arrived, should not resolve
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(resolved).toBe(false);

		// Third arrival completes the wave
		const r3 = await barrier.wait();
		const [r1, r2] = await Promise.all([p1, p2]);
		expect(resolved).toBe(true);

		const all = [r1, r2, r3];
		expect(all.filter((r) => r.isLeader())).toHaveLength(1);
		expect(all.filter((r) => !r.isLeader())).toHaveLength(2);
	});

	it("barrier with large N", async () => {
		const n = 100;
		const barrier = new Barrier(n);

		const tasks = Array.from({ length: n }, () => barrier.wait());
		const results = await Promise.all(tasks);

		expect(results).toHaveLength(n);
		expect(results.filter((r) => r.isLeader())).toHaveLength(1);
	});

	it("BarrierWaitResult isLeader returns consistent value", () => {
		const leader = new BarrierWaitResult(true);
		const nonLeader = new BarrierWaitResult(false);

		expect(leader.isLeader()).toBe(true);
		expect(leader.isLeader()).toBe(true);
		expect(nonLeader.isLeader()).toBe(false);
		expect(nonLeader.isLeader()).toBe(false);
	});

	it("second generation starts fresh after first completes", async () => {
		const n = 2;
		const barrier = new Barrier(n);

		// Complete first generation
		const gen1 = Array.from({ length: n }, () => barrier.wait());
		await Promise.all(gen1);

		// Start second generation with only 1 arrival; should block
		let gen2Resolved = false;
		const gen2p1 = barrier.wait().then((r) => {
			gen2Resolved = true;
			return r;
		});

		await new Promise((resolve) => setTimeout(resolve, 30));
		expect(gen2Resolved).toBe(false);

		// Complete second generation
		const gen2r2 = await barrier.wait();
		await gen2p1;
		expect(gen2Resolved).toBe(true);
		expect(gen2r2.isLeader()).toBe(true);
	});
});
