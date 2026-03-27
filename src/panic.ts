export function panic(message?: string): never {
	throw new Error(message ?? "explicit panic");
}

export function todo(message?: string): never {
	panic(message ? `not yet implemented: ${message}` : "not yet implemented");
}

export function unreachable(x: never): never {
	panic(`unreachable: ${x}`);
}
