# CLAUDE.md

## Overview

**antiox** - "I Wish I Was Writing Rust" (Anti Oxide)

Small utilities for Rust/Tokio-like primitives in TypeScript. Zero overhead, no custom DSL. API matches Rust/Tokio wherever possible.

## Git

- Use single-line conventional commit messages. No co-authors.
- Example: `git commit -m "feat(sync): add broadcast channel"`

## Module Structure

Mirrors Tokio/Rust module hierarchy:

```
antiox/panic       → std::panic!, std::todo!, std::unreachable!
antiox/sync/mpsc   → tokio::sync::mpsc
antiox/task        → tokio::task
```

When adding new modules, follow the same convention. For example:
- `antiox/sync/oneshot` for `tokio::sync::oneshot`
- `antiox/sync/broadcast` for `tokio::sync::broadcast`
- `antiox/sync/watch` for `tokio::sync::watch`
- `antiox/sync/mutex` for `tokio::sync::Mutex`

Each module is a separate subpath export in `package.json` and a separate entry point in `tsup.config.ts`.

## Build

```bash
pnpm build       # Build all modules
pnpm check-types # Type check
```

## Documentation

- Keep `README.md` up to date when adding or changing modules.

## Code Style

- camelCase for method/function names (TypeScript convention)
- Structure and semantics match Tokio/Rust APIs
- Zero runtime dependencies
- Dual ESM/CJS output via tsup
