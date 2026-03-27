import { defineConfig } from "tsup";

export default defineConfig({
	entry: [
		"src/mod.ts",
		"src/sync/mpsc.ts",
		"src/task.ts",
		"src/unreachable.ts",
	],
	format: ["esm", "cjs"],
	dts: true,
	clean: true,
	splitting: true,
});
