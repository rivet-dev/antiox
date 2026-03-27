# Compatibility

Tracks API compatibility between antiox modules and their Rust/Tokio equivalents.

Legend: **Yes** = implemented, **No** = not implemented (with reason), **N/A** = not applicable to JavaScript.

## `antiox/panic` vs `std::panic!`, `std::todo!`, `std::unreachable!`

| Rust | antiox | Status |
|------|--------|--------|
| `panic!()` | `panic()` | Yes |
| `todo!()` | `todo()` | Yes |
| `unreachable!()` | `unreachable()` | Yes (takes `never` for exhaustiveness checking) |

## `antiox/sync/mpsc` vs `tokio::sync::mpsc`

### Functions

| Rust | antiox | Status |
|------|--------|--------|
| `channel()` | `channel()` | Yes |
| `unbounded_channel()` | `unboundedChannel()` | Yes |

### Sender

| Rust | antiox | Status |
|------|--------|--------|
| `send()` | `send()` | Yes |
| `try_send()` | `trySend()` | Yes |
| `is_closed()` | `isClosed()` | Yes |
| `closed()` | `closed()` | Yes |
| `reserve()` | `reserve()` | Yes |
| `clone()` | `clone()` | Yes |
| `capacity()` | `capacity()` | Yes |
| `blocking_send()` | - | N/A: JS is single-threaded, no blocking variant needed |
| `send_timeout()` | - | No: not yet implemented |
| `downgrade()` / `WeakSender` | - | No: JS has garbage collection, weak references not needed for channel lifetime |
| `Permit` (borrowed) | - | N/A: JS has no borrowing; `OwnedPermit` covers this use case |
| `OwnedPermit` | `OwnedPermit` | Yes |

### Receiver

| Rust | antiox | Status |
|------|--------|--------|
| `recv()` | `recv()` | Yes |
| `try_recv()` | `tryRecv()` | Yes |
| `close()` | `close()` | Yes |
| `async iteration` | `Symbol.asyncIterator` | Yes |
| `blocking_recv()` | - | N/A: JS is single-threaded |
| `recv_many()` | - | No: not yet implemented |

### UnboundedSender / UnboundedReceiver

Same coverage as bounded variants above, minus `capacity()` and `reserve()` (not applicable to unbounded channels).

## `antiox/sync/oneshot` vs `tokio::sync::oneshot`

| Rust | antiox | Status |
|------|--------|--------|
| `channel()` | `oneshot()` | Yes (named `oneshot()` in barrel export to disambiguate) |
| `Sender::send()` | `OneshotSender.send()` | Yes |
| `Sender::is_closed()` | `OneshotSender.isClosed()` | Yes |
| `Sender::closed()` | `OneshotSender.closed()` | Yes |
| `Receiver` (await) | `OneshotReceiver.then()` | Yes (implements PromiseLike) |
| `Receiver::try_recv()` | `OneshotReceiver.tryRecv()` | Yes |
| `Receiver::close()` | `OneshotReceiver.close()` | Yes |
| `Receiver::blocking_recv()` | - | N/A: JS is single-threaded |

## `antiox/sync/watch` vs `tokio::sync::watch`

### Sender

| Rust | antiox | Status |
|------|--------|--------|
| `send()` | `send()` | Yes |
| `send_if_modified()` | `sendIfModified()` | Yes |
| `borrow()` | `borrow()` | Yes |
| `subscribe()` | `subscribe()` | Yes |
| `is_closed()` | `isClosed()` | Yes |
| `closed()` | - | No: not yet implemented |
| `send_modify()` | - | No: not yet implemented |
| `send_replace()` | - | No: not yet implemented |
| `receiver_count()` | - | No: not yet implemented |
| `sender_count()` | - | No: not yet implemented |

### Receiver

| Rust | antiox | Status |
|------|--------|--------|
| `borrow()` | `borrow()` | Yes |
| `borrow_and_update()` | `borrowAndUpdate()` | Yes |
| `changed()` | `changed()` | Yes |
| `has_changed()` | - | No: not yet implemented |
| `clone()` | `clone()` | Yes |
| `mark_changed()` | - | No: not yet implemented |
| `mark_unchanged()` | - | No: not yet implemented |
| `wait_for()` | - | No: not yet implemented |

## `antiox/sync/broadcast` vs `tokio::sync::broadcast`

### Sender

| Rust | antiox | Status |
|------|--------|--------|
| `send()` | `send()` | Yes |
| `subscribe()` | `subscribe()` | Yes |
| `receiver_count()` | `receiverCount()` | Yes |
| `clone()` | `clone()` | Yes |
| `len()` | - | No: not yet implemented |
| `is_empty()` | - | No: not yet implemented |
| `sender_count()` | - | No: not yet implemented |
| `downgrade()` / `WeakSender` | - | No: JS has garbage collection |

### Receiver

| Rust | antiox | Status |
|------|--------|--------|
| `recv()` | `recv()` | Yes |
| `try_recv()` | `tryRecv()` | Yes |
| `clone()` | `clone()` | Yes |
| `async iteration` | `Symbol.asyncIterator` | Yes |
| `blocking_recv()` | - | N/A: JS is single-threaded |
| `len()` | - | No: not yet implemented |
| `is_empty()` | - | No: not yet implemented |

## `antiox/sync/semaphore` vs `tokio::sync::Semaphore`

| Rust | antiox | Status |
|------|--------|--------|
| `new()` | `new Semaphore()` | Yes |
| `acquire()` | `acquire()` | Yes |
| `acquire_many()` | `acquireMany()` | Yes |
| `try_acquire()` | `tryAcquire()` | Yes |
| `try_acquire_many()` | `tryAcquireMany()` | Yes |
| `available_permits()` | `availablePermits()` | Yes |
| `close()` | `close()` | Yes |
| `is_closed()` | `isClosed()` | Yes |
| `add_permits()` | - | No: not yet implemented |
| `forget_permits()` | - | No: not yet implemented |
| `acquire_owned()` | - | N/A: JS has no ownership model |
| `acquire_many_owned()` | - | N/A: JS has no ownership model |
| `try_acquire_owned()` | - | N/A: JS has no ownership model |
| `try_acquire_many_owned()` | - | N/A: JS has no ownership model |

## `antiox/sync/notify` vs `tokio::sync::Notify`

| Rust | antiox | Status |
|------|--------|--------|
| `new()` | `new Notify()` | Yes |
| `notify_one()` | `notifyOne()` | Yes |
| `notify_waiters()` | `notifyWaiters()` | Yes |
| `notified()` | `notified()` | Yes |
| `notify_last()` | - | No: not yet implemented |

## `antiox/sync/mutex` vs `tokio::sync::Mutex`

| Rust | antiox | Status |
|------|--------|--------|
| `new()` | `new Mutex()` | Yes |
| `lock()` | `lock()` | Yes |
| `try_lock()` | `tryLock()` | Yes |
| `blocking_lock()` | - | N/A: JS is single-threaded |
| `lock_owned()` | - | N/A: JS has no ownership model |
| `try_lock_owned()` | - | N/A: JS has no ownership model |
| `get_mut()` | - | N/A: JS has no borrowing; use lock() instead |
| `into_inner()` | - | N/A: JS has no ownership model |

## `antiox/sync/rwlock` vs `tokio::sync::RwLock`

| Rust | antiox | Status |
|------|--------|--------|
| `new()` | `new RwLock()` | Yes |
| `read()` | `read()` | Yes |
| `write()` | `write()` | Yes |
| `try_read()` | `tryRead()` | Yes |
| `try_write()` | `tryWrite()` | Yes |
| `blocking_read()` | - | N/A: JS is single-threaded |
| `blocking_write()` | - | N/A: JS is single-threaded |
| `read_owned()` | - | N/A: JS has no ownership model |
| `write_owned()` | - | N/A: JS has no ownership model |
| `get_mut()` | - | N/A: JS has no borrowing |
| `into_inner()` | - | N/A: JS has no ownership model |
| `with_max_readers()` | - | No: not yet implemented |

## `antiox/sync/barrier` vs `tokio::sync::Barrier`

| Rust | antiox | Status |
|------|--------|--------|
| `new()` | `new Barrier()` | Yes |
| `wait()` | `wait()` | Yes |
| `BarrierWaitResult::is_leader()` | `BarrierWaitResult.isLeader()` | Yes |

Full compatibility.

## `antiox/sync/select` vs `tokio::select!`

| Rust | antiox | Status |
|------|--------|--------|
| `select!` macro | `select()` | Yes (function taking promise-returning branches instead of macro syntax) |

The JS implementation uses `AbortSignal` for cooperative cancellation of losing branches, similar to how Tokio's `select!` drops losing futures.

## `antiox/sync/once_cell` vs `tokio::sync::OnceCell`

| Rust | antiox | Status |
|------|--------|--------|
| `new()` | `new OnceCell()` | Yes |
| `get()` | `get()` | Yes |
| `set()` | `set()` | Yes |
| `get_or_init()` | `getOrInit()` | Yes |
| `get_or_try_init()` | `getOrTryInit()` | Yes |
| `initialized()` | `isInitialized()` | Yes |
| `get_mut()` | - | N/A: JS has no borrowing |
| `into_inner()` | - | N/A: JS has no ownership model |
| `take()` | - | No: not yet implemented |

## `antiox/sync/cancellation_token` vs `tokio_util::sync::CancellationToken`

| Rust | antiox | Status |
|------|--------|--------|
| `new()` | `new CancellationToken()` | Yes |
| `cancel()` | `cancel()` | Yes |
| `is_cancelled()` | `isCancelled()` | Yes |
| `cancelled()` | `cancelled()` | Yes |
| `child_token()` | `child()` | Yes |
| `drop_guard()` | - | No: use `DropGuard` separately |
| `run_until_cancelled()` | - | No: not yet implemented |

## `antiox/sync/drop_guard` vs `tokio_util::sync::DropGuard`

| Rust | antiox | Status |
|------|--------|--------|
| `new()` | `new DropGuard()` | Yes |
| `disarm()` | `disarm()` | Yes |
| `Drop` trait | `Symbol.dispose` | Yes |

Full compatibility.

## `antiox/task` vs `tokio::task`

| Rust | antiox | Status |
|------|--------|--------|
| `spawn()` | `spawn()` | Yes |
| `yield_now()` | `yieldNow()` | Yes |
| `JoinHandle` | `JoinHandle` | Yes |
| `JoinHandle::abort()` | `JoinHandle.abort()` | Yes |
| `JoinHandle::is_finished()` | `JoinHandle.isFinished()` | Yes |
| `JoinSet` | `JoinSet` | Yes |
| `JoinSet::spawn()` | `JoinSet.spawn()` | Yes |
| `JoinSet::join_next()` | `JoinSet.joinNext()` | Yes |
| `JoinSet::abort_all()` | `JoinSet.abortAll()` | Yes |
| `JoinError` | `JoinError` | Yes |
| `join_all()` (futures) | `joinAll()` | Yes |
| `try_join_all()` (futures) | `tryJoinAll()` | Yes |
| `spawn_blocking()` | - | N/A: JS is single-threaded; use Web Workers directly |
| `spawn_local()` | - | N/A: JS tasks are already local to the event loop |
| `block_in_place()` | - | N/A: JS is single-threaded |
| `AbortHandle` | - | No: `JoinHandle.abort()` covers the primary use case |
| `LocalSet` | - | N/A: JS tasks are already local |
| `task::Id` | - | No: not yet implemented |
| `JoinSet::try_join_next()` | - | No: not yet implemented |
| `JoinSet::join_all()` | - | No: not yet implemented |
| `JoinSet::len()` | `JoinSet.size` | Yes |

## `antiox/time` vs `tokio::time`

| Rust | antiox | Status |
|------|--------|--------|
| `sleep()` | `sleep()` | Yes |
| `timeout()` | `timeout()` | Yes |
| `timeout_at()` | `timeoutAt()` | Yes |
| `interval()` | `interval()` | Yes |
| `Instant` | - | N/A: JS uses `Date.now()` and `performance.now()` |
| `sleep_until()` | - | No: use `sleep()` with calculated duration or `timeoutAt()` |
| `interval_at()` | - | No: not yet implemented |
| `MissedTickBehavior` | - | No: not yet implemented |
| `advance()` / `pause()` / `resume()` | - | N/A: test utilities, use `vi.useFakeTimers()` instead |

## `antiox/stream` vs `futures::StreamExt` + `tokio_stream::StreamExt`

### Transformation

| Rust | antiox | Status |
|------|--------|--------|
| `map()` | `map()` | Yes |
| `then()` | `andThen()` | Yes (renamed: `then` conflicts with JS Promise thenables) |
| `filter()` | `filter()` | Yes |
| `filter_map()` | `filterMap()` | Yes |
| `enumerate()` | `enumerate()` | Yes |
| `inspect()` | `inspect()` | Yes |
| `scan()` | `scan()` | Yes |
| `flat_map()` | `flatMap()` | Yes |
| `flatten()` | `flatten()` | Yes |
| `map_while()` | `mapWhile()` | Yes |

### Flow Control

| Rust | antiox | Status |
|------|--------|--------|
| `take()` | `take()` | Yes |
| `skip()` | `skip()` | Yes |
| `take_while()` | `takeWhile()` | Yes |
| `skip_while()` | `skipWhile()` | Yes |
| `take_until()` | `takeUntil()` | Yes |
| `fuse()` | - | N/A: JS async iterators are already fused by spec (once done, always done) |
| `cycle()` | - | No: dangerous with async iterators (unbounded memory if source is consumed) |
| `peekable()` | `peekable()` | Yes |

### Aggregation

| Rust | antiox | Status |
|------|--------|--------|
| `collect()` | `collect()` | Yes |
| `fold()` | `fold()` | Yes |
| `count()` | `count()` | Yes |
| `any()` | `any()` | Yes |
| `all()` | `all()` | Yes |
| `for_each()` | `forEach()` | Yes |
| `for_each_concurrent()` | `forEachConcurrent()` | Yes |
| `unzip()` | - | No: not yet implemented |

### Combination

| Rust | antiox | Status |
|------|--------|--------|
| `chain()` | `chain()` | Yes |
| `zip()` | `zip()` | Yes |
| `merge()` | `merge()` | Yes |

### Buffering

| Rust | antiox | Status |
|------|--------|--------|
| `buffered()` | `buffered()` | Yes |
| `buffer_unordered()` | `bufferUnordered()` | Yes |
| `chunks()` | `chunks()` | Yes |
| `chunks_timeout()` | `chunksTimeout()` | Yes |
| `throttle()` | `throttle()` | Yes |
| `timeout()` | `timeout()` | Yes |
| `ready_chunks()` | - | N/A: relies on poll-based readiness model, not applicable to JS async iterators |
| `timeout_repeating()` | - | No: not yet implemented |
| `flatten_unordered()` | - | No: not yet implemented |
| `flat_map_unordered()` | - | No: not yet implemented |

### Not Applicable

| Rust | Reason |
|------|--------|
| `next()` | N/A: native JS async iterator protocol |
| `into_future()` | N/A: Rust-specific stream-to-future conversion |
| `poll_next_unpin()` | N/A: poll-based, no equivalent in JS |
| `select_next_some()` | N/A: poll-based |
| `by_ref()` | N/A: Rust borrowing concept |
| `forward()` | N/A: Sink trait concept |
| `boxed()` / `boxed_local()` | N/A: Rust trait object boxing |
| `left_stream()` / `right_stream()` | N/A: Rust `Either` type |
| `catch_unwind()` | N/A: Rust panic handling |
| `split()` | N/A: Stream+Sink separation |
| `concat()` | N/A: Rust `Extend` trait |
| `StreamMap` | No: not yet implemented |

### JS-Specific Additions

| antiox | Reason |
|--------|--------|
| `pipe()` | JS has no method chaining on iterables like Rust's StreamExt trait methods. The TC39 pipe operator proposal is stuck at Stage 2. This is a workaround for composing stream operators without deep nesting. |

## `antiox/collections/deque` vs `std::collections::VecDeque`

| Rust | antiox | Status |
|------|--------|--------|
| `new()` / `with_capacity()` | `new Deque()` | Yes |
| `push_back()` | `push()` | Yes |
| `push_front()` | `pushFront()` | Yes |
| `pop_back()` | `pop()` | Yes |
| `pop_front()` | `shift()` | Yes (named `shift` to match JS Array convention) |
| `front()` | `peekFront()` | Yes |
| `back()` | `peekBack()` | Yes |
| `len()` | `length` | Yes |
| `is_empty()` | `isEmpty()` | Yes |
| `clear()` | `clear()` | Yes |
| `iter()` | `Symbol.iterator` | Yes |
| `get()` / `get_mut()` | - | No: not yet implemented |
| `insert()` | - | No: not yet implemented |
| `remove()` | - | No: not yet implemented |
| `contains()` | - | No: not yet implemented |
| `retain()` | - | No: not yet implemented |
| `rotate_left()` / `rotate_right()` | - | No: not yet implemented |
| `swap()` | - | No: not yet implemented |
| `drain()` | - | No: not yet implemented |
| `split_off()` | - | No: not yet implemented |
| `append()` | - | No: not yet implemented |
| `truncate()` | - | No: not yet implemented |
| `binary_search()` | - | No: not yet implemented |
| `capacity()` / `reserve()` / `shrink_to_fit()` | - | No: not yet implemented (internal ring buffer grows automatically) |
| `as_slices()` / `make_contiguous()` | - | N/A: JS arrays are not slices |
| `range()` / `range_mut()` | - | N/A: Rust borrowing concept |

## `antiox/collections/binary_heap` vs `std::collections::BinaryHeap`

| Rust | antiox | Status |
|------|--------|--------|
| `new()` / `with_capacity()` | `new BinaryHeap()` | Yes (accepts custom comparator) |
| `push()` | `push()` | Yes |
| `pop()` | `pop()` | Yes |
| `peek()` | `peek()` | Yes |
| `len()` | `length` | Yes |
| `is_empty()` | `isEmpty()` | Yes |
| `clear()` | `clear()` | Yes |
| `iter()` | `Symbol.iterator` | Yes |
| `peek_mut()` | - | No: not yet implemented |
| `into_sorted_vec()` | `toArray()` | Partial: `toArray()` returns heap-ordered, not sorted |
| `drain()` | - | No: not yet implemented |
| `drain_sorted()` | - | No: not yet implemented |
| `retain()` | - | No: not yet implemented |
| `append()` | - | No: not yet implemented |
| `capacity()` / `reserve()` / `shrink_to_fit()` | - | No: not yet implemented |
| `into_vec()` / `as_slice()` | - | N/A: JS has no slice/ownership distinction |
