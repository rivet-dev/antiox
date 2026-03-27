/**
 * Exhaustive type check utility. Mirrors `std::unreachable!`.
 *
 * Use in the `default` branch of a switch statement or the final `else`
 * of an if/else chain to guarantee at compile time that all variants are
 * handled. If a variant is added later and the call site is not updated,
 * TypeScript will report a type error because `x` will no longer be `never`.
 */
export function unreachable(x: never): never {
	throw new Error(`Unreachable: ${x}`);
}
