import { defineConfig } from "tsup";

export default defineConfig({
	entry: [
		"src/mod.ts",
		"src/panic.ts",
		"src/sync/mpsc.ts",
		"src/task.ts",
	],
	format: ["esm", "cjs"],
	dts: true,
	clean: true,
	splitting: true,
});
