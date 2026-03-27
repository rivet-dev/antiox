# CLAUDE.md

## Overview

**antiox** - "I Wish I Was Writing Rust" (Anti Oxide)

Small utilities for Rust/Tokio-like primitives in TypeScript. Zero overhead, no custom DSL. API matches Rust/Tokio wherever possible.

## Git

- Use single-line conventional commit messages. No co-authors.
- Example: `git commit -m "feat(sync): add broadcast channel"`

## API Reference

Before implementing or modifying any module, always look up the corresponding Tokio or Rust std docs first to verify correct type names, method signatures, and semantics:
- Tokio: https://docs.rs/tokio/latest/tokio/
- Rust std: https://doc.rust-lang.org/std/
- tokio-stream: https://docs.rs/tokio-stream/latest/tokio_stream/

Types within each module must match Tokio/Rust naming exactly. Each module is namespaced by its import path, so use `Sender`/`Receiver`/`channel()` (not `OneshotSender`/`oneshotChannel`). The barrel export `mod.ts` uses aliases to disambiguate.

## Module Structure

Mirrors Tokio/Rust module hierarchy. Sorted alphabetically by export path. Keep this order consistent across `README.md` module table, documentation sections, and this list.

```
antiox/collections/binary_heap  → std::collections::BinaryHeap
antiox/collections/deque        → std::collections::VecDeque
antiox/panic                    → std::panic!, std::todo!, std::unreachable!
antiox/stream                   → tokio_stream / futures::stream
antiox/sync/barrier             → tokio::sync::Barrier
antiox/sync/broadcast           → tokio::sync::broadcast
antiox/sync/cancellation_token  → tokio_util::sync::CancellationToken
antiox/sync/drop_guard          → tokio_util::sync::DropGuard
antiox/sync/mpsc                → tokio::sync::mpsc
antiox/sync/mutex               → tokio::sync::Mutex
antiox/sync/notify              → tokio::sync::Notify
antiox/sync/once_cell           → tokio::sync::OnceCell
antiox/sync/oneshot             → tokio::sync::oneshot
antiox/sync/rwlock              → tokio::sync::RwLock
antiox/sync/select              → tokio::select!
antiox/sync/semaphore           → tokio::sync::Semaphore
antiox/sync/watch               → tokio::sync::watch
antiox/task                     → tokio::task (spawn, JoinHandle, JoinSet, joinAll, tryJoinAll)
antiox/time                     → tokio::time (sleep, timeout, timeoutAt, interval)
```

Each module is a separate subpath export in `package.json` and a separate entry point in `tsup.config.ts`.

## Build

```bash
pnpm build       # Build all modules
pnpm check-types # Type check
pnpm test        # Run tests
```

## Documentation

- Keep `README.md` up to date when adding or changing modules.
- Keep `COMPATIBILITY.md` up to date when adding, removing, or modifying any API. Every exported function, class, and method must be tracked against its Rust equivalent. Mark new items as implemented, and document why anything is intentionally skipped.

## Code Style

- camelCase for method/function names (TypeScript convention)
- Structure and semantics match Tokio/Rust APIs
- Function and type names must match their Rust/Tokio equivalents (e.g., `inspect` not `tap`, `flatMap` not `concatMap`). If a Rust name conflicts with a JS builtin (e.g., `then` conflicts with Promise thenables), use the closest alternative and leave a comment explaining why. Always look up the Rust docs before naming.
- Zero runtime dependencies
- Dual ESM/CJS output via tsup
- No section separator comments (`// ====...`)
- No file-level header comments or module-level docblocks
- No JSDoc that restates the function/class name (e.g., `/** Sends a value */ send()`)
- No `@internal` annotations
- Only add comments that explain non-obvious logic (sentinel values, fairness policies, workarounds)

## Testing

- Every module in `src/` must have a corresponding test file in `tests/` with the same path structure.
- Tests should be adversarial. Cover edge cases:
  - Close/dispose idempotency (calling close() or Symbol.dispose twice)
  - Operations on closed/disposed resources (send after close, recv after dispose)
  - Falsy values as valid data (0, "", false, null, undefined)
  - FIFO ordering guarantees
  - Concurrent access (multiple waiters, multiple producers)
  - Boundary conditions (capacity 0, capacity 1, empty collections, single element)
  - Error propagation and error type correctness (name, message, instanceof)
  - Symbol.dispose behavior on all disposable types
- Test names should be descriptive enough to not need comments.

## Writing Style

- Never use em dashes. Use commas, semicolons, parentheses, or separate sentences instead.
