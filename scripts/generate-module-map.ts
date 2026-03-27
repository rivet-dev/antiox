import { readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { resolve, dirname } from "node:path";

const root = resolve(import.meta.dirname, "..");

// Module map: [export path, dist file, rust equivalent, docs url]
const modules: [string, string, string, string][] = [
	["antiox/panic", "dist/panic.js", "`std::panic!`, `std::todo!`, `std::unreachable!`", "https://doc.rust-lang.org/std/"],
	["antiox/sync/mpsc", "dist/sync/mpsc.js", "`tokio::sync::mpsc`", "https://docs.rs/tokio/latest/tokio/sync/mpsc/"],
	["antiox/sync/oneshot", "dist/sync/oneshot.js", "`tokio::sync::oneshot`", "https://docs.rs/tokio/latest/tokio/sync/oneshot/"],
	["antiox/sync/watch", "dist/sync/watch.js", "`tokio::sync::watch`", "https://docs.rs/tokio/latest/tokio/sync/watch/"],
	["antiox/sync/broadcast", "dist/sync/broadcast.js", "`tokio::sync::broadcast`", "https://docs.rs/tokio/latest/tokio/sync/broadcast/"],
	["antiox/sync/semaphore", "dist/sync/semaphore.js", "`tokio::sync::Semaphore`", "https://docs.rs/tokio/latest/tokio/sync/struct.Semaphore.html"],
	["antiox/sync/notify", "dist/sync/notify.js", "`tokio::sync::Notify`", "https://docs.rs/tokio/latest/tokio/sync/struct.Notify.html"],
	["antiox/sync/mutex", "dist/sync/mutex.js", "`tokio::sync::Mutex`", "https://docs.rs/tokio/latest/tokio/sync/struct.Mutex.html"],
	["antiox/sync/rwlock", "dist/sync/rwlock.js", "`tokio::sync::RwLock`", "https://docs.rs/tokio/latest/tokio/sync/struct.RwLock.html"],
	["antiox/sync/barrier", "dist/sync/barrier.js", "`tokio::sync::Barrier`", "https://docs.rs/tokio/latest/tokio/sync/struct.Barrier.html"],
	["antiox/sync/select", "dist/sync/select.js", "`tokio::select!`", "https://docs.rs/tokio/latest/tokio/macro.select.html"],
	["antiox/sync/once_cell", "dist/sync/once_cell.js", "`tokio::sync::OnceCell`", "https://docs.rs/tokio/latest/tokio/sync/struct.OnceCell.html"],
	["antiox/sync/cancellation_token", "dist/sync/cancellation_token.js", "`tokio_util::sync::CancellationToken`", "https://docs.rs/tokio-util/latest/tokio_util/sync/struct.CancellationToken.html"],
	["antiox/sync/drop_guard", "dist/sync/drop_guard.js", "`tokio_util::sync::DropGuard`", "https://docs.rs/tokio-util/latest/tokio_util/sync/struct.DropGuard.html"],
	["antiox/sync/priority_channel", "dist/sync/priority_channel.js", "Priority channel", ""],
	["antiox/task", "dist/task.js", "`tokio::task`", "https://docs.rs/tokio/latest/tokio/task/"],
	["antiox/time", "dist/time.js", "`tokio::time`", "https://docs.rs/tokio/latest/tokio/time/"],
	["antiox/stream", "dist/stream.js", "`tokio_stream` / `futures::stream`", "https://docs.rs/tokio-stream/latest/tokio_stream/"],
	["antiox/collections/deque", "dist/collections/deque.js", "`std::collections::VecDeque`", "https://doc.rust-lang.org/std/collections/struct.VecDeque.html"],
	["antiox/collections/binary_heap", "dist/collections/binary_heap.js", "`std::collections::BinaryHeap`", "https://doc.rust-lang.org/std/collections/struct.BinaryHeap.html"],
];

function collectFiles(entryPath: string): Set<string> {
	const visited = new Set<string>();
	const queue = [entryPath];
	while (queue.length > 0) {
		const file = queue.pop()!;
		if (visited.has(file)) continue;
		visited.add(file);
		const content = readFileSync(file, "utf-8");
		const re = /from\s*"([^"]+)"/g;
		let match;
		while ((match = re.exec(content)) !== null) {
			if (match[1].startsWith(".")) {
				queue.push(resolve(dirname(file), match[1]));
			}
		}
	}
	return visited;
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	return `${(bytes / 1024).toFixed(1)} KB`;
}

// Build table
const rows: string[] = [];
rows.push("| Module | Rust Equivalent | Minified | Gzip |");
rows.push("|--------|-----------------|----------|------|");

for (const [name, distFile, rustEquiv, docsUrl] of modules) {
	const entryPath = resolve(root, distFile);
	const files = collectFiles(entryPath);
	const bufs: Buffer[] = [];
	for (const f of files) bufs.push(readFileSync(f));
	const combined = Buffer.concat(bufs);
	const minSize = formatBytes(combined.length);
	const gzSize = formatBytes(gzipSync(combined).length);
	const equiv = docsUrl ? `[${rustEquiv}](${docsUrl})` : rustEquiv;
	rows.push(`| \`${name}\` | ${equiv} | ${minSize} | ${gzSize} |`);
}

const table = rows.join("\n");

// Replace in README
const readmePath = resolve(root, "README.md");
const readme = readFileSync(readmePath, "utf-8");
const replaced = readme.replace(
	/<!-- MODULE_TABLE_START -->[\s\S]*?<!-- MODULE_TABLE_END -->/,
	`<!-- MODULE_TABLE_START -->\n${table}\n<!-- MODULE_TABLE_END -->`,
);
writeFileSync(readmePath, replaced);
console.log("Updated README.md module table.");
