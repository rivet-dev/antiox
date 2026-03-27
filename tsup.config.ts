import { defineConfig } from "tsup";

const entry = [
	"src/mod.ts",
	"src/panic.ts",
	"src/sync/mpsc.ts",
	"src/sync/oneshot.ts",
	"src/sync/watch.ts",
	"src/sync/broadcast.ts",
	"src/sync/semaphore.ts",
	"src/sync/notify.ts",
	"src/sync/mutex.ts",
	"src/sync/rwlock.ts",
	"src/sync/barrier.ts",
	"src/sync/select.ts",
	"src/sync/once_cell.ts",
	"src/sync/cancellation_token.ts",
	"src/sync/drop_guard.ts",
	"src/task.ts",
	"src/time.ts",
	"src/stream.ts",
	"src/collections/deque.ts",
	"src/collections/binary_heap.ts",
];

export default defineConfig([
	{
		entry,
		format: ["esm"],
		dts: true,
		clean: true,
		splitting: true,
		minify: true,
	},
	{
		entry,
		format: ["cjs"],
		dts: true,
		clean: false,
		splitting: false,
		minify: true,
	},
]);
