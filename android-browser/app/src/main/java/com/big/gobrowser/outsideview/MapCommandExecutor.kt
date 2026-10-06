package com.big.gobrowser.outsideview

import java.util.UUID

class MapCommandExecutor(private val store: MapStateStore, private val renderer: MapRenderer, private val scope: ExecutionScope, private val clock: () -> Long = { System.currentTimeMillis() }) {
    @Synchronized fun submit(command: MapCommand): MapReceipt {
        val journal = store.load(); val errors = validate(command, journal.state, clock()).toMutableList()
        if (scope == ExecutionScope.LIVE_DISABLED) errors += "live execution disabled"
        if (errors.isNotEmpty()) return MapReceipt(command.commandId, if (errors.any { it.contains("conflict") }) MapReceiptStatus.CONFLICT else MapReceiptStatus.REJECTED, errors.joinToString(";"), journal.state.revision)
        val next = reduce(journal.state, command).copy(revision = journal.state.revision + 1)
        val token = UUID.randomUUID().toString(); val pending = PendingRender(command, next.revision, token)
        store.commit(journal.copy(state = next, pending = pending, hashes = journal.hashes + (command.commandId to command.hashCode().toString())))
        if (!renderer.foregroundReady) return MapReceipt(command.commandId, MapReceiptStatus.PENDING, "renderer-not-ready", next.revision, token)
        dispatch(pending, next)
        return MapReceipt(command.commandId, MapReceiptStatus.PENDING, "awaiting-render-confirmation", next.revision, token)
    }
    @Synchronized fun resume() { val j=store.load(); j.pending?.let { if (renderer.foregroundReady) dispatch(it, j.state) } }
    @Synchronized fun confirm(c: RenderConfirmation): MapReceipt {
        val j=store.load(); val p=j.pending ?: return MapReceipt(c.commandId, MapReceiptStatus.FAILED, "no-pending", j.state.revision)
        if (p.command.commandId != c.commandId || p.revision != c.revision || p.token != c.token || c.styleGeneration != renderer.styleGeneration || c.error != null) return MapReceipt(c.commandId, MapReceiptStatus.PENDING, "confirmation-mismatch", j.state.revision, p.token)
        val receipt=MapReceipt(c.commandId, MapReceiptStatus.APPLIED, null, c.revision, c.token, c.confirmedFeatureIds)
        store.commit(j.copy(pending=null, receipts=j.receipts + (c.commandId to receipt))); return receipt
    }
    private fun dispatch(p: PendingRender, state: MapState) = renderer.render(RenderRequest(p.command.commandId,p.revision,renderer.styleGeneration,p.token,state)) { confirm(it) }
    private fun reduce(s: MapState, c: MapCommand): MapState = when(c.action) {
        MapAction.UPSERT_ZONE -> s.copy(zones=s.zones + (c.zone!!.id to c.zone))
        MapAction.UPSERT_GRID -> s.copy(grids=s.grids + (c.grid!!.id to c.grid))
        MapAction.UPSERT_PIN -> s.copy(pins=s.pins + (c.pin!!.id to c.pin))
        MapAction.NOTE -> s.copy(notes=s.notes + (c.target!!.id to c.note!!))
        MapAction.RECOMMEND -> s.copy(recommendations=s.recommendations + c.target!!.id)
        MapAction.HIGHLIGHT -> s.copy(highlights=s.highlights + c.target!!.id)
        MapAction.FOCUS -> s.copy(focused=c.target!!.id)
        MapAction.REMOVE -> s.copy(zones=s.zones - c.target!!.id, grids=s.grids - c.target!!.id, pins=s.pins - c.target!!.id)
        MapAction.CLEAR -> when(c.scope) { "pins" -> s.copy(pins=emptyMap()); "grids" -> s.copy(grids=emptyMap()); "zones" -> s.copy(zones=emptyMap()); else -> s.copy(pins=emptyMap(),grids=emptyMap(),zones=emptyMap()) }
        MapAction.ROUTE -> s
    }
}
