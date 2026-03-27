/**
 * Immediately halt execution with an error. Mirrors `panic!()` from Rust.
 *
 * The underlying primitive for `todo` and `unreachable`. Use directly
 * when you need to bail out of a code path unconditionally.
 *
 * ```typescript
 * if (!isValid) panic("invariant violated");
 * ```
 */
export function panic(message?: string): never {
	throw new Error(message ?? "explicit panic");
}

/**
 * Marks unfinished code. Mirrors `todo!()` from Rust.
 *
 * Throws immediately with "not yet implemented" and an optional message.
 * Typed as `never` so it satisfies any return type, letting you stub out
 * branches during development without type errors.
 *
 * ```typescript
 * function processEvent(event: Event): Result {
 *   switch (event.type) {
 *     case "click": return handleClick(event);
 *     case "hover": todo("hover support");
 *   }
 * }
 * ```
 */
export function todo(message?: string): never {
	panic(message ? `not yet implemented: ${message}` : "not yet implemented");
}

/**
 * Exhaustive type check utility. Mirrors `unreachable!()` from Rust.
 *
 * Use in the `default` branch of a switch statement or the final `else`
 * of an if/else chain to guarantee at compile time that all variants are
 * handled. If a variant is added later and the call site is not updated,
 * TypeScript will report a type error because `x` will no longer be `never`.
 *
 * ```typescript
 * type Direction = "north" | "south" | "east" | "west";
 *
 * function move(dir: Direction) {
 *   switch (dir) {
 *     case "north": return [0, 1];
 *     case "south": return [0, -1];
 *     case "east": return [1, 0];
 *     case "west": return [-1, 0];
 *     default: unreachable(dir);
 *   }
 * }
 * ```
 */
export function unreachable(x: never): never {
	panic(`unreachable: ${x}`);
}
