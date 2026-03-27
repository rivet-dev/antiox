<p align="center">
  <img src=".github/media/antiox.svg" alt="antiox" />
</p>

<h3 align="center">Antiox</h3>

<h3 align="center">Zero-Cost Rust and Tokio-like primitives for TypeScript</h3>

<p align="center">
  No custom DSL, no wrapper types, no extra allocations, and no dependencies.<br />
  Just the control flow and concurrency patterns you miss from Rust, mapped onto native JS primitives.<br />
  <i>Because let's be honest, you wish you were writing Rust instead.</i>
</p>

<p align="center">
  <a href="https://github.com/rivet-dev/antiox">GitHub</a> — <a href="https://www.npmjs.com/package/antiox">npm</a>
</p>

> **Pre-release:** This library is used in production but the API is subject to change.

```
npm install antiox
```

This library intentionally does **not** implement `Result`, `Option`, or `match`. These require wrapper objects on every call, which adds allocation overhead that defeats the purpose. TypeScript's `T | null`, union types, and `switch` already cover these patterns at zero cost.

## Overview

The biggest win from antiox is **channels** and **streams** — primitives that give you structured concurrency and backpressure without callbacks, event emitters, or custom DSLs. Combine them with tasks to build actor-like patterns:

```typescript
import { channel } from "antiox/sync/mpsc";
import { oneshot, OneshotSender } from "antiox/sync/oneshot";
import { spawn } from "antiox/task";

type Msg =
  | { type: "increment"; amount: number }
  | { type: "get"; resTx: OneshotSender<number> };

const [tx, rx] = channel<Msg>(32);

// Actor loop
spawn(async () => {
  let count = 0;
  for await (const msg of rx) {
    switch (msg.type) {
      case "increment":
        count += msg.amount;
        break;
      case "get":
        msg.resTx.send(count);
        break;
    }
  }
});

// Fire-and-forget
await tx.send({ type: "increment", amount: 5 });

// Request-response via oneshot channel
const [resTx, resRx] = oneshot<number>();
await tx.send({ type: "get", resTx });
const value = await resRx;
```

Bounded channels give you backpressure, `for await` gives you clean shutdown on disconnect, and oneshot channels give you typed request-response — all without locks or shared mutable state.

## Modules

<!-- MODULE_TABLE_START -->
| Module | Rust Equivalent | Minified | Gzip |
|--------|-----------------|----------|------|
| [`antiox/panic`](#antioxpanic) | [`std::panic!`, `std::todo!`, `std::unreachable!`](https://doc.rust-lang.org/std/) | 273 B | 199 B |
| [`antiox/sync/mpsc`](#antioxsyncmpsc) | [`tokio::sync::mpsc`](https://docs.rs/tokio/latest/tokio/sync/mpsc/) | 5.1 KB | 1.4 KB |
| [`antiox/sync/oneshot`](#antioxsynconeshot) | [`tokio::sync::oneshot`](https://docs.rs/tokio/latest/tokio/sync/oneshot/) | 1.7 KB | 625 B |
| [`antiox/sync/watch`](#antioxsyncwatch) | [`tokio::sync::watch`](https://docs.rs/tokio/latest/tokio/sync/watch/) | 1.7 KB | 677 B |
| [`antiox/sync/broadcast`](#antioxsyncbroadcast) | [`tokio::sync::broadcast`](https://docs.rs/tokio/latest/tokio/sync/broadcast/) | 2.4 KB | 936 B |
| [`antiox/sync/semaphore`](#antioxsyncsemaphore) | [`tokio::sync::Semaphore`](https://docs.rs/tokio/latest/tokio/sync/struct.Semaphore.html) | 2.0 KB | 845 B |
| [`antiox/sync/notify`](#antioxsyncnotify) | [`tokio::sync::Notify`](https://docs.rs/tokio/latest/tokio/sync/struct.Notify.html) | 934 B | 466 B |
| [`antiox/sync/mutex`](#antioxsyncmutex) | [`tokio::sync::Mutex`](https://docs.rs/tokio/latest/tokio/sync/struct.Mutex.html) | 1.4 KB | 606 B |
| [`antiox/sync/rwlock`](#antioxsyncrwlock) | [`tokio::sync::RwLock`](https://docs.rs/tokio/latest/tokio/sync/struct.RwLock.html) | 2.2 KB | 778 B |
| [`antiox/sync/barrier`](#antioxsyncbarrier) | [`tokio::sync::Barrier`](https://docs.rs/tokio/latest/tokio/sync/struct.Barrier.html) | 1.1 KB | 528 B |
| [`antiox/sync/select`](#antioxsyncselect) | [`tokio::select!`](https://docs.rs/tokio/latest/tokio/macro.select.html) | 338 B | 260 B |
| [`antiox/sync/once_cell`](#antioxsynconcecell) | [`tokio::sync::OnceCell`](https://docs.rs/tokio/latest/tokio/sync/struct.OnceCell.html) | 699 B | 355 B |
| [`antiox/sync/cancellation_token`](#antioxsynccancellationtoken) | [`tokio_util::sync::CancellationToken`](https://docs.rs/tokio-util/latest/tokio_util/sync/struct.CancellationToken.html) | 623 B | 357 B |
| [`antiox/sync/drop_guard`](#antioxsyncdropguard) | [`tokio_util::sync::DropGuard`](https://docs.rs/tokio-util/latest/tokio_util/sync/struct.DropGuard.html) | 200 B | 169 B |
| [`antiox/sync/priority_channel`](#antioxsyncprioritychannel) | Priority channel | 2.6 KB | 1.0 KB |
| [`antiox/task`](#antioxtask) | [`tokio::task`](https://docs.rs/tokio/latest/tokio/task/) | 2.0 KB | 932 B |
| [`antiox/time`](#antioxtime) | [`tokio::time`](https://docs.rs/tokio/latest/tokio/time/) | 936 B | 530 B |
| [`antiox/stream`](#antioxstream) | [`tokio_stream` / `futures::stream`](https://docs.rs/tokio-stream/latest/tokio_stream/) | 10.4 KB | 3.0 KB |
| [`antiox/collections/deque`](#antioxcollectionsdeque) | [`std::collections::VecDeque`](https://doc.rust-lang.org/std/collections/struct.VecDeque.html) | 1.3 KB | 493 B |
| [`antiox/collections/binary_heap`](#antioxcollectionsbinaryheap) | [`std::collections::BinaryHeap`](https://doc.rust-lang.org/std/collections/struct.BinaryHeap.html) | 994 B | 492 B |
<!-- MODULE_TABLE_END -->

## Documentation

<details>
<summary><code>antiox/sync/mpsc</code></summary>

Multi-producer, single-consumer channels with backpressure and disconnection detection. Mirrors `tokio::sync::mpsc`.

```typescript
import { channel, unboundedChannel } from "antiox/sync/mpsc";

// Bounded channel with backpressure
const [tx, rx] = channel<string>(32);

await tx.send("hello");
const msg = await rx.recv(); // "hello"

// Clone senders for multi-producer
const tx2 = tx.clone();
await tx2.send("from tx2");

// Async iteration
for await (const msg of rx) {
  console.log(msg);
}

// Unbounded channel (never blocks on send)
const [utx, urx] = unboundedChannel<number>();
utx.send(42); // sync, never blocks
```

</details>

<details>
<summary><code>antiox/task</code></summary>

Task spawning with cooperative cancellation via AbortSignal. Mirrors `tokio::task`.

```typescript
import { spawn, JoinSet, yieldNow } from "antiox/task";

// Spawn a task (returns awaitable JoinHandle)
const handle = spawn(async (signal) => {
  const res = await fetch("https://example.com", { signal });
  return res.text();
});

const result = await handle;

// Abort a task
handle.abort();

// JoinSet for managing multiple tasks
const set = new JoinSet<number>();
set.spawn(async () => 1);
set.spawn(async () => 2);
set.spawn(async () => 3);

for await (const result of set) {
  console.log(result); // 1, 2, 3 (in completion order)
}

// Yield to event loop
await yieldNow();
```

</details>

<details>
<summary><code>antiox/panic</code></summary>

Diverging functions for halting execution. Mirrors `panic!`, `todo!`, and `unreachable!` from Rust.

```typescript
import { panic, todo, unreachable } from "antiox/panic";

// Halt with a message
if (!isValid) panic("invariant violated");

// Stub unfinished code
function processEvent(event: Event): Result {
  switch (event.type) {
    case "click": return handleClick(event);
    case "hover": todo("hover support");
  }
}

// Exhaustive type checking
type Direction = "north" | "south" | "east" | "west";

function move(dir: Direction) {
  switch (dir) {
    case "north": return [0, 1];
    case "south": return [0, -1];
    case "east": return [1, 0];
    case "west": return [-1, 0];
    default: unreachable(dir); // compile error if cases missed
  }
}
```

</details>

<details>
<summary><code>antiox/sync/oneshot</code></summary>

Single-use channel. Send exactly one value. Receiver is awaitable.

```typescript
import { oneshot } from "antiox/sync/oneshot";

const [tx, rx] = oneshot<string>();
tx.send("done");
const value = await rx; // "done"
```

</details>

<details>
<summary><code>antiox/sync/watch</code></summary>

Single-value broadcast. One sender updates a value, many receivers observe changes.

```typescript
import { watch } from "antiox/sync/watch";

const [tx, rx] = watch("initial");
const rx2 = tx.subscribe();

tx.send("updated");
await rx.changed();
console.log(rx.borrowAndUpdate()); // "updated"
```

</details>

<details>
<summary><code>antiox/sync/broadcast</code></summary>

Multi-producer, multi-consumer bounded channel. Every receiver gets every message.

```typescript
import { broadcast } from "antiox/sync/broadcast";

const [tx, rx1] = broadcast<string>(16);
const rx2 = tx.subscribe();

tx.send("hello");
console.log(await rx1.recv()); // "hello"
console.log(await rx2.recv()); // "hello"
```

</details>

<details>
<summary><code>antiox/sync/semaphore</code></summary>

Counting semaphore for limiting concurrency.

```typescript
import { Semaphore } from "antiox/sync/semaphore";

const sem = new Semaphore(3);
const permit = await sem.acquire();
// ... do work ...
permit.release();
```

</details>

<details>
<summary><code>antiox/sync/notify</code></summary>

Simplest synchronization primitive. Wake one or all waiters.

```typescript
import { Notify } from "antiox/sync/notify";

const notify = new Notify();
// In one task:
await notify.notified();
// In another:
notify.notifyOne();
```

</details>

<details>
<summary><code>antiox/sync/mutex</code></summary>

Async mutex guaranteeing exclusive access across await points.

```typescript
import { Mutex } from "antiox/sync/mutex";

const mutex = new Mutex({ count: 0 });
const guard = await mutex.lock();
guard.value = { count: guard.value.count + 1 };
guard.release();
```

</details>

<details>
<summary><code>antiox/sync/rwlock</code></summary>

Multiple concurrent readers OR one exclusive writer.

```typescript
import { RwLock } from "antiox/sync/rwlock";

const lock = new RwLock({ data: "hello" });
const reader = await lock.read();
console.log(reader.value);
reader.release();

const writer = await lock.write();
writer.value = { data: "world" };
writer.release();
```

</details>

<details>
<summary><code>antiox/sync/barrier</code></summary>

N tasks wait, all released when the Nth arrives.

```typescript
import { Barrier } from "antiox/sync/barrier";

const barrier = new Barrier(3);
const result = await barrier.wait();
if (result.isLeader()) console.log("I'm the leader");
```

</details>

<details>
<summary><code>antiox/sync/select</code></summary>

Race multiple async branches, cancel losers. TypeScript narrows the result type.

```typescript
import { select } from "antiox/sync/select";
import { sleep } from "antiox/time";

const result = await select({
  msg: (signal) => rx.recv(),
  timeout: (signal) => sleep(5000, signal),
});

if (result.key === "msg") {
  console.log(result.value); // narrowed type
}
```

</details>

<details>
<summary><code>antiox/time</code></summary>

Timer primitives with AbortSignal integration.

```typescript
import { sleep, timeout, interval, TimeoutError } from "antiox/time";

await sleep(1000);

try {
  const data = await timeout(5000, fetchData());
} catch (e) {
  if (e instanceof TimeoutError) console.log("timed out");
}

for await (const tick of interval(1000)) {
  console.log(`Tick ${tick}`);
  if (tick >= 4) break;
}
```

</details>

<details>
<summary><code>antiox/stream</code></summary>

Async stream combinators. All functions take and return `AsyncIterable<T>`. Zero wrapper objects.

```typescript
import { map, filter, bufferUnordered, collect, pipe, merge, chunks } from "antiox/stream";

const results = await collect(
  bufferUnordered(
    map(urls, (url) => fetch(url)),
    10,
  ),
);

const processed = pipe(
  source,
  (s) => filter(s, (x) => x > 0),
  (s) => map(s, (x) => x * 2),
  (s) => chunks(s, 10),
);

for await (const item of merge(stream1, stream2, stream3)) {
  console.log(item);
}
```

</details>

## Filling the Gaps

Rust crates that antiox doesn't cover, and what to use instead in TypeScript:

| Rust | TypeScript Replacement | Why |
|------|----------------------|-----|
| `Result` / `Option` | [better-result](https://github.com/user/better-result) | Typed Result/Option without wrapper overhead |
| `tracing` | [pino](https://github.com/pinojs/pino) | Structured logging, zero-overhead when disabled |
| `serde` | [zod](https://github.com/colinhacks/zod) | Schema validation and parsing |
| `reqwest` | Native `fetch` | Built into the runtime |
| `anyhow` / `thiserror` | Native `Error` + `cause` | TS union types + `instanceof` |

## Who's using this?

- [RivetKit](https://github.com/rivet-dev/rivet)

## Wish List

- `tokio-console`-like observability
- `pino` integration

## Why not Effect?

[Effect](https://effect.website) is excellent, but antiox exists for a different niche:

- **Lightweight enough to ship inside libraries.** Effect's runtime is too heavy as a transitive dependency end users didn't opt into.
- **Mirrors Rust/Tokio APIs.** Same structure, naming, and control flow across both codebases — the TypeScript reads like the Rust it was ported from.
- **No new DSL.** Plain `async`/`await`, `AbortSignal`, and `AsyncIterator`. No wrapper types, no effect system, no generator-based control flow.

## License

MIT
