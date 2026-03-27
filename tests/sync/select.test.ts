import { describe, it, expect } from "vitest";
import { select } from "../../src/sync/select";

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("select", () => {
	it("first to resolve wins", async () => {
		const result = await select({
			fast: async (_signal) => {
				await delay(10);
				return "fast";
			},
			slow: async (_signal) => {
				await delay(200);
				return "slow";
			},
		});

		expect(result.key).toBe("fast");
		expect(result.value).toBe("fast");
	});

	it("losing branches get aborted", async () => {
		const signals: Record<string, AbortSignal> = {};

		const result = await select({
			winner: async (signal) => {
				signals.winner = signal;
				return "done";
			},
			loser: async (signal) => {
				signals.loser = signal;
				await new Promise((_resolve) => {});
				return "never";
			},
		});

		expect(result.key).toBe("winner");

		await delay(10);
		expect(signals.loser.aborted).toBe(true);
	});

	it("rejection propagates", async () => {
		await expect(
			select({
				fail: async (_signal) => {
					throw new Error("boom");
				},
				slow: async (_signal) => {
					await delay(200);
					return "ok";
				},
			}),
		).rejects.toThrow("boom");
	});

	it("biased by key order when multiple ready synchronously", async () => {
		const result = await select({
			first: async (_signal) => "a",
			second: async (_signal) => "b",
			third: async (_signal) => "c",
		});

		expect(result.key).toBe("first");
		expect(result.value).toBe("a");
	});

	it("single branch returns immediately", async () => {
		const result = await select({
			only: async (_signal) => 42,
		});

		expect(result.key).toBe("only");
		expect(result.value).toBe(42);
	});

	it("winner's signal is also aborted after resolution", async () => {
		let winnerSignal: AbortSignal | undefined;

		await select({
			winner: async (signal) => {
				winnerSignal = signal;
				return "done";
			},
			loser: async (_signal) => {
				await new Promise((_resolve) => {});
				return "never";
			},
		});

		await delay(10);
		expect(winnerSignal!.aborted).toBe(true);
	});

	it("all branches reject: first rejection propagates", async () => {
		await expect(
			select({
				a: async (_signal) => {
					throw new Error("error-a");
				},
				b: async (_signal) => {
					throw new Error("error-b");
				},
			}),
		).rejects.toThrow("error-a");
	});

	it("fast rejection beats slow resolution", async () => {
		await expect(
			select({
				fail: async (_signal) => {
					throw new Error("fast-fail");
				},
				succeed: async (_signal) => {
					await delay(100);
					return "ok";
				},
			}),
		).rejects.toThrow("fast-fail");
	});

	it("fast resolution beats slow rejection", async () => {
		const result = await select({
			succeed: async (_signal) => "ok",
			fail: async (_signal) => {
				await delay(100);
				throw new Error("slow-fail");
			},
		});

		expect(result.key).toBe("succeed");
		expect(result.value).toBe("ok");
	});

	it("branch returning undefined is a valid winner", async () => {
		const result = await select({
			undef: async (_signal) => undefined,
			slow: async (_signal) => {
				await delay(100);
				return "slow";
			},
		});

		expect(result.key).toBe("undef");
		expect(result.value).toBeUndefined();
	});

	it("branch returning null is a valid winner", async () => {
		const result = await select({
			nil: async (_signal) => null,
			slow: async (_signal) => {
				await delay(100);
				return "slow";
			},
		});

		expect(result.key).toBe("nil");
		expect(result.value).toBeNull();
	});

	it("abort signal is usable for cooperative cancellation", async () => {
		let loserIterations = 0;

		const result = await select({
			winner: async (_signal) => {
				await delay(30);
				return "won";
			},
			loser: async (signal) => {
				while (!signal.aborted) {
					loserIterations++;
					await delay(5);
				}
				return "cancelled";
			},
		});

		expect(result.key).toBe("winner");
		expect(loserIterations).toBeGreaterThan(0);
	});
});
