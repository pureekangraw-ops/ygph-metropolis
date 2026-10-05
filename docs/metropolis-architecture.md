# Metropolis Architecture Contract

**Status:** foundation contract  
**Scope:** connection environment and City Hall boundaries  
**Contract:** `0.1.0`

## One sentence

**Metropolis connects independent operational systems into one environment. City Hall manages work intake, return, records and data without owning another system's live operation.**

## Topology

```text
METROPOLIS
├── CITY HALL
├── FACTORY
├── PRISM / APP
└── RAIL NETWORK
```

City Hall is one system inside Metropolis. Hall failure does not imply Factory or PRISM failure. Factory failure does not imply Hall failure. A Metropolis or entry failure can affect travel across the network while each operational system continues its own local operation.

## City Hall loop

```text
CITY HALL
  ↓
HERMES       intake / registration / index
  ↓
WORK SYSTEM  work identity / lifecycle / checkpoint / handoff
  ↓
STATION      connection point
  ↓
RAIL         destination-specific connection
  ↓
OATH         transport / receipt / readback
  ↓
OWNER SYSTEM operation in its own domain
  ↓
RAIL / OATH  result and evidence return
  ↓
MIMIR        return / organization / index / update
  ↓
CITY HALL
```

Work System, Station, Rail, OATH and Data Management are system components, not Agents. HERMES and MIMIR are Hall employees. GO and LIGHT are Agents that travel through Metropolis; they are not Hall employees and Hall is not a mandatory chokepoint.

## Truth boundaries

- Each Owner System owns operational truth for its own domain.
- Work System owns work identity, lifecycle and continuity; it does not copy operational state.
- Current state is obtained from the Owner System through live readback.
- Historical state is represented by Records, Evidence and Lineage.
- There is no Central Board that mirrors current state from every system.
- Data Management stores durable information and can report `MATCH`, `DRIFT`, `CONFLICT` or `UNKNOWN`; it does not choose a winner or silently repair an Owner System.

## Connection vocabulary

- **Station:** a connection point that groups access to a destination.
- **Rail:** a destination-specific connection, associated with a credential reference.
- **OATH:** the transport envelope moving over a Rail; it does not select truth or authority.
- **Owner System:** the system that performs and reports its own operation.

Credential values never belong in a Rail contract. Rails carry safe credential references only.

## Implementation guardrails

1. Keep City Hall and Owner Systems deployable independently.
2. Keep Work identity separate from Owner operational state.
3. Require live Owner readback before treating an operation as complete.
4. Treat reconciliation as observation and classification, not automatic conflict resolution.
5. Preserve `UNKNOWN` when the Owner or connection cannot be read.
6. Add a new route only through an explicit Station/Rail/OATH contract.
