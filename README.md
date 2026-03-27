# antiox

**I Wish I Was Writing Rust** (Anti Oxide)

Small utilities for Rust and Tokio-like primitives in TypeScript. Zero overhead, no custom DSL. API matches Rust/Tokio wherever possible.

## Install

```bash
npm install antiox
```

## Modules

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

## License

Apache-2.0
