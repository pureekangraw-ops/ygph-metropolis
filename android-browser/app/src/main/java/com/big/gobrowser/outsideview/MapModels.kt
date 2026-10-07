package com.big.gobrowser.outsideview

import java.math.BigDecimal
import java.security.MessageDigest
import java.util.Locale

private fun canonicalNumber(value: Double): String {
    require(value.isFinite()) { "coordinate must be finite" }
    val normalized = if (value == 0.0) 0.0 else value
    return BigDecimal.valueOf(normalized).stripTrailingZeros().toPlainString()
}

data class Point(val longitude: Double, val latitude: Double) {
    init {
        require(longitude.isFinite() && latitude.isFinite()) { "point must be finite" }
        require(longitude in -180.0..180.0) { "longitude out of range" }
        require(latitude in -90.0..90.0) { "latitude out of range" }
    }
}

data class Bounds(val west: Double, val south: Double, val east: Double, val north: Double) {
    init {
        listOf(west, south, east, north).forEach { require(it.isFinite()) { "bounds must be finite" } }
        require(west in -180.0..180.0 && east in -180.0..180.0) { "longitude out of range" }
        require(south in -90.0..90.0 && north in -90.0..90.0) { "latitude out of range" }
        require(west <= east && south <= north) { "bounds must be ordered" }
    }
    fun contains(point: Point): Boolean = point.longitude in west..east && point.latitude in south..north
    fun intersects(other: Bounds): Boolean = west <= other.east && east >= other.west && south <= other.north && north >= other.south
    fun center(): Point = Point((west + east) / 2.0, (south + north) / 2.0)
}

enum class EvidenceStatus { VERIFIED, APPROXIMATE, UNKNOWN }

data class Evidence(
    val coordinate: EvidenceStatus = EvidenceStatus.UNKNOWN,
    val source: String? = null,
    val observedAt: Long? = null,
    val availableUntil: Long? = null
) {
    fun isAvailable(now: Long): Boolean = availableUntil == null || now <= availableUntil
    fun canCreateExactPoint(now: Long): Boolean = coordinate == EvidenceStatus.VERIFIED && source.orEmpty().isNotBlank() && isAvailable(now)
}

data class Zone(
    val id: String,
    val label: String,
    val bounds: Bounds? = null,
    val polygon: List<Point> = emptyList(),
    val parentId: String? = null,
    val geometryKnown: Boolean = bounds != null || polygon.size >= 3
) {
    init { require(id.isNotBlank() && label.isNotBlank()) }
    fun contains(point: Point): Boolean = when {
        polygon.size >= 3 -> pointInPolygon(point, polygon)
        bounds != null -> bounds.contains(point)
        else -> false
    }
}

data class Grid(
    val id: String,
    val zoneId: String,
    val bounds: Bounds,
    val uncertain: Boolean = false,
    val label: String? = null
)

data class Pin(
    val id: String,
    val label: String,
    val point: Point,
    val gridId: String,
    val evidence: Evidence,
    val zoneId: String? = null,
    val note: String? = null
)

enum class MapAction { UPSERT_ZONE, UPSERT_GRID, UPSERT_PIN, NOTE, RECOMMEND, HIGHLIGHT, FOCUS, REMOVE, CLEAR, ROUTE }

data class MapTarget(val id: String, val kind: String)

data class MapCommand(
    val commandId: String,
    val action: MapAction,
    val target: MapTarget? = null,
    val zone: Zone? = null,
    val grid: Grid? = null,
    val pin: Pin? = null,
    val note: String? = null,
    val expectedRevision: Long? = null,
    val scope: String? = null,
    val presentation: String? = null
)

data class MapState(
    val zones: Map<String, Zone> = emptyMap(),
    val grids: Map<String, Grid> = emptyMap(),
    val pins: Map<String, Pin> = emptyMap(),
    val notes: Map<String, String> = emptyMap(),
    val recommendations: Set<String> = emptySet(),
    val highlights: Set<String> = emptySet(),
    val focused: String? = null,
    val revision: Long = 0L
)

enum class MapReceiptStatus { PENDING, APPLIED, REJECTED, CONFLICT, FAILED }
data class MapReceipt(
    val commandId: String,
    val status: MapReceiptStatus,
    val reason: String? = null,
    val revision: Long = 0L,
    val rendererToken: String? = null,
    val confirmedFeatureIds: Set<String> = emptySet()
)
data class PendingRender(val command: MapCommand, val revision: Long, val token: String)
data class MapJournal(
    val state: MapState,
    val pending: PendingRender? = null,
    val hashes: Map<String, String> = emptyMap(),
    val receipts: Map<String, MapReceipt> = emptyMap(),
    val version: Int = 1
)

enum class ExecutionScope { TEST, LOCAL_OWNER, LIVE_DISABLED }
data class RenderRequest(val commandId: String, val revision: Long, val styleGeneration: Long, val token: String, val state: MapState)
data class RenderConfirmation(
    val commandId: String,
    val revision: Long,
    val styleGeneration: Long,
    val token: String,
    val confirmedFeatureIds: Set<String>,
    val presentation: String? = null,
    val camera: Bounds? = null,
    val error: String? = null
)

fun gridId(zoneId: String, bounds: Bounds): String {
    val canonical = "[\"${zoneId.replace("\\", "\\\\").replace("\"", "\\\"")}\",${canonicalNumber(bounds.west)},${canonicalNumber(bounds.south)},${canonicalNumber(bounds.east)},${canonicalNumber(bounds.north)}]"
    val digest = MessageDigest.getInstance("SHA-256").digest(canonical.toByteArray(Charsets.UTF_8))
    return "grid:epsg4326:" + digest.joinToString("") { "%02x".format(Locale.ROOT, it) }
}

fun validate(command: MapCommand, state: MapState, now: Long): List<String> {
    val errors = mutableListOf<String>()
    if (command.commandId.isBlank()) errors += "commandId required"
    if (command.expectedRevision != null && command.expectedRevision != state.revision) errors += "expectedRevision conflict"
    when (command.action) {
        MapAction.UPSERT_ZONE -> {
            val zone = command.zone ?: run { errors += "zone required"; null }
            if (zone != null && zone.polygon.isNotEmpty() && zone.polygon.first() != zone.polygon.last()) errors += "polygon must be closed"
            if (zone != null && zone.parentId == zone.id) errors += "zone cannot parent itself"
        }
        MapAction.UPSERT_GRID -> {
            val grid = command.grid ?: run { errors += "grid required"; null }
            if (grid != null) {
                if (grid.id != gridId(grid.zoneId, grid.bounds)) errors += "grid identity mismatch"
                val zone = state.zones[grid.zoneId] ?: command.zone
                if (zone == null) errors += "zone missing"
                else if (zone.bounds != null && !zone.bounds.intersects(grid.bounds)) errors += "grid outside zone"
            }
        }
        MapAction.UPSERT_PIN -> {
            val pin = command.pin ?: run { errors += "pin required"; null }
            if (pin != null) {
                if (!pin.evidence.canCreateExactPoint(now)) errors += "exact pin needs current coordinate evidence"
                val grid = state.grids[pin.gridId]
                if (grid == null) errors += "grid missing" else if (!grid.bounds.contains(pin.point)) errors += "pin outside grid"
            }
        }
        MapAction.NOTE -> if (command.target == null || command.note == null) errors += "note target and value required"
        MapAction.RECOMMEND, MapAction.HIGHLIGHT, MapAction.FOCUS -> if (command.target == null) errors += "target required"
        MapAction.REMOVE -> if (command.target == null) errors += "target required"
        MapAction.CLEAR -> if (command.scope == null || command.scope !in setOf("pins", "grids", "zones", "all")) errors += "clear scope invalid"
        MapAction.ROUTE -> errors += "route disabled"
    }
    return errors
}

private fun pointInPolygon(point: Point, polygon: List<Point>): Boolean {
    var inside = false
    var j = polygon.lastIndex
    for (i in polygon.indices) {
        val a = polygon[i]; val b = polygon[j]
        val crosses = (a.latitude > point.latitude) != (b.latitude > point.latitude)
        if (crosses && point.longitude < (b.longitude - a.longitude) * (point.latitude - a.latitude) / (b.latitude - a.latitude) + a.longitude) inside = !inside
        j = i
    }
    return inside
}
