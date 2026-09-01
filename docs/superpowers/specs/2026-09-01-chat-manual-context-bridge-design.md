# Chat ↔ Manual Context Bridge Design

## Goal

Connect Chat and Manual so both surfaces can continue the same subject through a stable reference while Ledger/Runtime remains the only source of business truth.

## Scope

This phase adds only the context bridge required to prove:

- Chat → Reference → Manual Detail → latest Truth.
- Manual Detail → Reference → Chat Context.
- Action → Commit → Readback → refreshed Detail.
- Back → the prior context on the originating surface.

Intent expansion and full Chat business wiring begin only after these flows pass.

## Governing Model

`Chat = conversation about the subject`

`Manual = tangible work on the subject`

`Ledger / Runtime = truth of the subject`

`Reference = bridge between surfaces`

Only a stable reference crosses the bridge. A balance, amount, lifecycle status, title, due date, or other business snapshot never crosses as authority.

## Reference Contract

The bridge uses one canonical record reference:

```js
{
  version: 1,
  owner: 'LEDGER' | 'CALENDAR',
  recordId: 'non-empty durable record identifier'
}
```

The reference contract:

- accepts only the supported owner values and a non-empty `recordId`;
- is immutable after validation;
- contains no amount, status, title, due date, balance, or record snapshot;
- resolves the current record through the existing Manual facade and Runtime state;
- derives the current record type from the resolved record rather than trusting a copied type;
- rejects invalid, missing, or stale references;
- fails closed and never guesses, substitutes, or creates a record.

`subject` is display context only. It may accompany a reference when Manual opens Chat, but it grants no authority and is never used to resolve or mutate a record.

## Components

### Reference contract

`greenfield/context-reference.mjs` owns validation and fail-closed resolution. It is a pure bridge boundary and does not persist state or create a store.

### Manual surface

`ui/manual-finance-ui.mjs` gains a reference-based entry point. It resolves the reference, reads fresh Truth, selects the existing Detail renderer, and exposes only actions valid for the resolved current record.

The current Detail reference remains active while an action runs. After the existing Ledger/Runtime mutation path completes, Manual resolves the same reference again and rerenders that Detail. A missing record is an error; stale caller data is never rendered as fallback Truth.

Manual Detail adds `Ask about this`, which sends display subject plus the same reference to Chat without copying business fields as authority.

### Chat surface

`ui/master-input.mjs` keeps an in-memory active subject reference alongside its existing in-memory input/recovery state. It does not create durable chat history or bridge persistence.

When opened from Manual, Chat shows which subject is active and includes the validated reference in the next interpretation context. The active subject can be cleared explicitly or replaced by another validated subject.

When a Chat result contains a proven durable record identity, Chat may expose:

- `Peek`: resolve the reference and show a short current preview without leaving Chat.
- `Open`: send the reference to Manual Detail.

Peek content is derived from a fresh resolve and is never stored as Truth.

### Navigation and context

`ui/app.mjs` coordinates surface transitions through callbacks using references. Existing top-level navigation remains unchanged.

Each surface retains only its own existing UI state needed to return:

- Chat: current text, result/waiting state, active subject reference, focus, and scroll position.
- Manual: active house/detail reference and scroll position.

Back returns to the originating surface state instead of routing to Manual Home. No new navigation store or persistence is introduced.

## Data Flow

### Chat to Manual

1. Chat obtains a proven record identity from durable readback or an already active validated subject.
2. Chat creates a reference containing only `version`, `owner`, and `recordId`.
3. Peek resolves and renders fresh current data in Chat, or Open sends the reference to Manual.
4. Manual validates and resolves the reference through current Runtime Truth.
5. Manual opens the matching existing Detail renderer.
6. A Manual action uses the same existing Manual facade → Ledger Gateway/Runtime path.
7. Commit is followed by durable readback.
8. Manual resolves the original reference again and refreshes the same Detail.
9. Back restores the prior Chat state.

### Manual to Chat

1. Manual Detail already holds the validated current reference.
2. `Ask about this` sends display subject plus reference to Chat.
3. Chat stores the active reference only in existing in-memory UI state and presents the subject context.
4. The next interpretation request includes the stable reference context.
5. Full Intent mutation wiring remains outside this phase.
6. Returning to Manual reopens the same reference and resolves fresh Truth.

## Ledger Boundary

Both surfaces retain the same management path:

`Chat UI / Manual UI → existing Manual or Intent facade → Runtime command authority → durable commit → readback`

Forbidden:

- Chat calling Core or domain command handlers directly.
- Manual mutation bypassing its existing facade/Runtime path.
- Chat-only business mutation logic.
- A new bridge data store or persistence layer.
- Copying business snapshots across surfaces as Truth.

## Error Handling

- Malformed reference: reject before navigation or resolve.
- Unsupported owner: reject before lookup.
- Missing/stale record: close Peek/Detail action path, show a safe not-found state, and perform no mutation.
- Owner/record mismatch: fail closed; do not search other owners.
- Resolve/readback failure after a possible mutation: do not claim success and retain the reference for retry/readback.
- Back target unavailable: remain on the current safe surface rather than reset to an unrelated home.

## Testing

Automated tests must prove:

- reference validation accepts only the canonical data-only contract;
- amounts/statuses/snapshots cannot cross the reference boundary;
- invalid, missing, stale, and wrong-owner references fail closed;
- Chat Open reaches the exact Manual Detail and reads current Truth;
- Manual Ask opens Chat with the exact subject reference;
- Manual action uses the existing mutation authority, commits, reads back, and refreshes the same Detail;
- Back restores the prior Chat and Manual context without an unnecessary navigation reset;
- no duplicate record, wrong record, Truth copy, bridge store, direct Core call, mutation bypass, or fake success exists;
- the full existing Greenfield regression suite remains green.

## Explicit Non-Scope

- Top-level navigation redesign.
- Forcing Income, Outcome, Calendar, or Ledger into tabs.
- Full adaptive layout work.
- Reminder, Repeat, or other new product features.
- New Manual functions.
- New persistence for context or Chat history.
- Full Intent/business wiring beyond carrying the validated active reference context.

## Stop Condition

This phase passes only when all four owner-specified flows are proven without Truth copy, duplicate/wrong records, context loss, unnecessary navigation reset, Ledger bypass, or fake success. At that point implementation stops and the next Intent/full-wiring phase receives the proven bridge.
