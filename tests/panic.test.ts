import { describe, it, expect } from "vitest";
import { panic, todo, unreachable } from "../src/panic";

describe("panic", () => {
	it("throws with default message", () => {
		expect(() => panic()).toThrow("explicit panic");
	});

	it("throws with custom message", () => {
		expect(() => panic("invariant violated")).toThrow("invariant violated");
	});

	it("throws an Error instance", () => {
		expect(() => panic()).toThrow(Error);
	});

	it("throws with empty string message", () => {
		expect(() => panic("")).toThrow("");
	});

	it("uses empty string when provided, not default", () => {
		try {
			panic("");
		} catch (e) {
			expect((e as Error).message).toBe("");
			return;
		}
		expect.fail("should have thrown");
	});

	it("throws with undefined message (falls back to default)", () => {
		try {
			panic(undefined);
		} catch (e) {
			expect((e as Error).message).toBe("explicit panic");
			return;
		}
		expect.fail("should have thrown");
	});
});

describe("todo", () => {
	it("throws not yet implemented", () => {
		expect(() => todo()).toThrow("not yet implemented");
	});

	it("includes custom message", () => {
		expect(() => todo("hover support")).toThrow(
			"not yet implemented: hover support",
		);
	});

	it("throws an Error instance", () => {
		expect(() => todo()).toThrow(Error);
	});

	it("with empty string falls back to bare message (falsy check)", () => {
		expect(() => todo("")).toThrow("not yet implemented");
	});

	it("message does not double-prefix", () => {
		try {
			todo("finish parser");
		} catch (e) {
			expect((e as Error).message).toBe("not yet implemented: finish parser");
			return;
		}
		expect.fail("should have thrown");
	});
});

describe("unreachable", () => {
	it("throws at runtime with the value", () => {
		expect(() => unreachable("oops" as never)).toThrow("unreachable: oops");
	});

	it("throws an Error instance", () => {
		expect(() => unreachable("x" as never)).toThrow(Error);
	});

	it("includes numeric value in message", () => {
		expect(() => unreachable(42 as never)).toThrow("unreachable: 42");
	});

	it("includes undefined in message", () => {
		expect(() => unreachable(undefined as never)).toThrow(
			"unreachable: undefined",
		);
	});

	it("includes null in message", () => {
		expect(() => unreachable(null as never)).toThrow("unreachable: null");
	});

	it("stringifies object values", () => {
		expect(() => unreachable({} as never)).toThrow(
			"unreachable: [object Object]",
		);
	});
});
