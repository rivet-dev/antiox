import { describe, it, expect } from "vitest";
import { DropGuard } from "../../src/sync/drop_guard";

describe("DropGuard", () => {
	it("dispose runs the cleanup fn", () => {
		let cleaned = false;
		const guard = new DropGuard(() => {
			cleaned = true;
		});

		expect(cleaned).toBe(false);
		guard[Symbol.dispose]();
		expect(cleaned).toBe(true);
	});

	it("disarm() prevents cleanup", () => {
		let cleaned = false;
		const guard = new DropGuard(() => {
			cleaned = true;
		});

		guard.disarm();
		guard[Symbol.dispose]();
		expect(cleaned).toBe(false);
	});

	it("multiple dispose calls only run fn once", () => {
		let count = 0;
		const guard = new DropGuard(() => {
			count++;
		});

		guard[Symbol.dispose]();
		guard[Symbol.dispose]();
		guard[Symbol.dispose]();
		expect(count).toBe(1);
	});
});
