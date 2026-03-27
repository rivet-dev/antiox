export type SelectResult<T extends Record<string, (signal: AbortSignal) => Promise<any>>> = {
	[K in keyof T]: { key: K; value: Awaited<ReturnType<T[K]>> };
}[keyof T];

export async function select<
	T extends Record<string, (signal: AbortSignal) => Promise<any>>,
>(branches: T): Promise<SelectResult<T>> {
	const parentController = new AbortController();

	const entries = Object.entries(branches) as [keyof T & string, T[keyof T & string]][];

	const wrappedPromises = entries.map(([key, fn]) => {
		const childController = new AbortController();

		parentController.signal.addEventListener("abort", () => {
			childController.abort();
		});

		return fn(childController.signal).then(
			(value) => ({ key, value }) as SelectResult<T>,
			(error) => {
				throw error;
			},
		);
	});

	try {
		const result = await Promise.race(wrappedPromises);
		return result;
	} finally {
		parentController.abort();
	}
}
