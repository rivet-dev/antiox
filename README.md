<p align="center">
  <img src=".github/media/antiox.svg" alt="antiox" />
</p>

<h2 align="center">Antiox</h2>

<h3 align="center">Zero-Cost Rust and Tokio-like primitives for TypeScript (Anti Oxide)</h3>

<p align="center">
  No custom DSL, no wrapper types, no extra allocations.<br />
  Just the control flow and concurrency patterns you miss from Rust, mapped onto native JS primitives.<br />
  <i>Because let's be honest, you wish you were writing Rust instead.</i>
</p>

<p align="center">
  <a href="https://github.com/rivet-dev/antiox">GitHub</a> — <a href="https://www.npmjs.com/package/antiox">npm</a>
</p>

```
npm install antiox
```

This library intentionally does **not** implement `Result`, `Option`, or `match`. These require wrapper objects on every call, which adds allocation overhead that defeats the purpose. TypeScript's `T | null`, union types, and `switch` already cover these patterns at zero cost.

## The Actor Model with Channels + Tasks

Channels and tasks are the building blocks for implementing actors in TypeScript. Spawn a task as the actor's event loop, give it an mpsc receiver, and send messages to it through the sender:

```typescript
import { channel } from "antiox/sync/mpsc";
import { spawn } from "antiox/task";

type Msg =
  | { type: "increment"; amount: number }
  | { type: "get"; resolve: (value: number) => void };

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
        msg.resolve(count);
        break;
    }
  }
});

// Send fire-and-forget messages
await tx.send({ type: "increment", amount: 5 });

// Request-response using a promise as a oneshot channel
const value = await new Promise<number>((resolve) =>
  tx.send({ type: "get", resolve })
);
```

This pattern gives you serialized access to mutable state without locks, backpressure via bounded channels, and clean shutdown via channel disconnection. The request-response variant embeds a Promise resolve function in the message as a lightweight oneshot channel, so callers can `await` a reply from the actor.

## Modules

| Module | Mirrors | Docs |
|--------|---------|------|
| [`antiox/panic`](#antioxpanic) | `std::panic!`, `std::todo!`, `std::unreachable!` | [std](https://doc.rust-lang.org/std/) |
| [`antiox/sync/mpsc`](#antioxsyncmpsc) | `tokio::sync::mpsc` | [docs.rs](https://docs.rs/tokio/latest/tokio/sync/mpsc/) |
| [`antiox/sync/oneshot`](#antioxsynconeshot) | `tokio::sync::oneshot` | [docs.rs](https://docs.rs/tokio/latest/tokio/sync/oneshot/) |
| [`antiox/sync/watch`](#antioxsyncwatch) | `tokio::sync::watch` | [docs.rs](https://docs.rs/tokio/latest/tokio/sync/watch/) |
| [`antiox/sync/broadcast`](#antioxsyncbroadcast) | `tokio::sync::broadcast` | [docs.rs](https://docs.rs/tokio/latest/tokio/sync/broadcast/) |
| [`antiox/sync/semaphore`](#antioxsyncsemaphore) | `tokio::sync::Semaphore` | [docs.rs](https://docs.rs/tokio/latest/tokio/sync/struct.Semaphore.html) |
| [`antiox/sync/notify`](#antioxsyncnotify) | `tokio::sync::Notify` | [docs.rs](https://docs.rs/tokio/latest/tokio/sync/struct.Notify.html) |
| [`antiox/sync/mutex`](#antioxsyncmutex) | `tokio::sync::Mutex` | [docs.rs](https://docs.rs/tokio/latest/tokio/sync/struct.Mutex.html) |
| [`antiox/sync/rwlock`](#antioxsyncrwlock) | `tokio::sync::RwLock` | [docs.rs](https://docs.rs/tokio/latest/tokio/sync/struct.RwLock.html) |
| [`antiox/sync/barrier`](#antioxsyncbarrier) | `tokio::sync::Barrier` | [docs.rs](https://docs.rs/tokio/latest/tokio/sync/struct.Barrier.html) |
| [`antiox/sync/select`](#antioxsyncselect) | `tokio::select!` | [docs.rs](https://docs.rs/tokio/latest/tokio/macro.select.html) |
| [`antiox/task`](#antioxtask) | `tokio::task` | [docs.rs](https://docs.rs/tokio/latest/tokio/task/) |
| [`antiox/time`](#antioxtime) | `tokio::time` | [docs.rs](https://docs.rs/tokio/latest/tokio/time/) |
| [`antiox/stream`](#antioxstream) | `tokio_stream` / `futures::stream` | [docs.rs](https://docs.rs/tokio-stream/latest/tokio_stream/) |

---

### `antiox/sync/mpsc`

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

### `antiox/task`

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

### `antiox/panic`

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

### `antiox/sync/oneshot`

Single-use channel. Send exactly one value. Receiver is awaitable.

```typescript
import { oneshot } from "antiox/sync/oneshot";

const [tx, rx] = oneshot<string>();
tx.send("done");
const value = await rx; // "done"
```

### `antiox/sync/watch`

Single-value broadcast. One sender updates a value, many receivers observe changes.

```typescript
import { watch } from "antiox/sync/watch";

const [tx, rx] = watch("initial");
const rx2 = tx.subscribe();

tx.send("updated");
await rx.changed();
console.log(rx.borrowAndUpdate()); // "updated"
```

### `antiox/sync/broadcast`

Multi-producer, multi-consumer bounded channel. Every receiver gets every message.

```typescript
import { broadcast } from "antiox/sync/broadcast";

const [tx, rx1] = broadcast<string>(16);
const rx2 = tx.subscribe();

tx.send("hello");
console.log(await rx1.recv()); // "hello"
console.log(await rx2.recv()); // "hello"
```

### `antiox/sync/semaphore`

Counting semaphore for limiting concurrency.

```typescript
import { Semaphore } from "antiox/sync/semaphore";

const sem = new Semaphore(3);
const permit = await sem.acquire();
// ... do work ...
permit.release();
```

### `antiox/sync/notify`

Simplest synchronization primitive. Wake one or all waiters.

```typescript
import { Notify } from "antiox/sync/notify";

const notify = new Notify();
// In one task:
await notify.notified();
// In another:
notify.notifyOne();
```

### `antiox/sync/mutex`

Async mutex guaranteeing exclusive access across await points.

```typescript
import { Mutex } from "antiox/sync/mutex";

const mutex = new Mutex({ count: 0 });
const guard = await mutex.lock();
guard.value = { count: guard.value.count + 1 };
guard.release();
```

### `antiox/sync/rwlock`

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

### `antiox/sync/barrier`

N tasks wait, all released when the Nth arrives.

```typescript
import { Barrier } from "antiox/sync/barrier";

const barrier = new Barrier(3);
const result = await barrier.wait();
if (result.isLeader()) console.log("I'm the leader");
```

### `antiox/sync/select`

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

### `antiox/time`

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

### `antiox/stream`

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

## Related Libraries

Rust equivalents that antiox does not cover, with recommended JS alternatives:

| Rust | JS Replacement | Why |
|------|---------------|-----|
| `tracing` | [pino](https://github.com/pinojs/pino) | Structured logging, zero-overhead when disabled |
| `serde` | [zod](https://github.com/colinhacks/zod) | Schema validation and parsing |
| `reqwest` | Native `fetch` | Built into the runtime |
| `anyhow` / `thiserror` | Native `Error` + `cause` | TS union types + `instanceof` |

## Who's using this?

- [RivetKit](https://github.com/rivet-dev/rivet)

## Why not Effect?

[Effect](https://effect.website) is an excellent library. It describes itself as "the missing standard library for TypeScript," and that's a fair claim. It provides typed error handling, fiber-based concurrency, streams, resource safety, dependency injection, and much more. If you're building an application in TypeScript and want Rust-level rigor, Effect is worth serious consideration.

That said, antiox exists because of a narrow use case where Effect isn't the right fit:

**This library is shipped as a dependency inside other libraries.** Effect's core runtime starts at ~25 KB gzipped (or ~6 KB in v4 beta), which is reasonable for an application but heavy for a transitive dependency that end users didn't opt into. Effect's `Micro` module (~5 KB) was designed for exactly this library-embedding scenario, but it excludes the concurrency primitives we need here (Queue, Semaphore, and other fiber coordination tools are only available in the full runtime).

**We mirror code between Rust and TypeScript.** Several of our internal systems have near-identical implementations in both languages. Keeping the same structure, naming, and control flow patterns (channels, JoinSet, spawn) across both codebases reduces cognitive overhead when switching between them. antiox maps Rust/Tokio primitives onto native JS constructs with minimal abstraction, so the TypeScript reads like the Rust it was ported from.

**No new DSL to learn.** antiox uses plain `async`/`await`, `AbortSignal`, and `AsyncIterator`. There are no wrapper types, no custom effect system, and no generator-based control flow. If you know Rust's concurrency model and TypeScript's async primitives, you already know how to use this library.

Effect is the right choice for most TypeScript projects that need these capabilities. antiox is for the specific case where you need lightweight Rust-shaped concurrency primitives that can ship inside a library without burdening downstream consumers.

## License

MIT
