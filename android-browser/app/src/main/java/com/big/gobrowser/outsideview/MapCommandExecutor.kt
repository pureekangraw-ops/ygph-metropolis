package com.big.gobrowser.outsideview

import java.util.UUID

class MapCommandExecutor(private val store:MapStateStore,private val renderer:MapRenderer,private val scope:ExecutionScope,private val clock:()->Long={System.currentTimeMillis()}) {
    @Synchronized fun submit(command:MapCommand):MapReceipt {
        val j=store.load();val hash=MapCommandCodec.canonical(command)
        j.hashes[command.commandId]?.let {
            if(it!=hash)return MapReceipt(command.commandId,MapReceiptStatus.REJECTED,"command-id-reused-with-different-payload",j.state.revision)
            return j.receipts[command.commandId]?:MapReceipt(command.commandId,MapReceiptStatus.PENDING,"already-accepted",j.pending?.revision?:j.state.revision,j.pending?.token)
        }
        val errors=validate(command,j.state,clock()).toMutableList();if(scope==ExecutionScope.LIVE_DISABLED)errors+="live execution disabled"
        if(errors.isNotEmpty())return MapReceipt(command.commandId,if(errors.any{it.contains("conflict")})MapReceiptStatus.CONFLICT else MapReceiptStatus.REJECTED,errors.joinToString(";"),j.state.revision)
        if(j.pending!=null)return MapReceipt(command.commandId,MapReceiptStatus.REJECTED,"pending-render-busy",j.state.revision)
        val next=reduce(j.state,command).copy(revision=j.state.revision+1);val pending=PendingRender(command,next.revision,UUID.randomUUID().toString())
        store.commit(j.copy(state=next,pending=pending,hashes=j.hashes+(command.commandId to hash)))
        if(!renderer.foregroundReady)return MapReceipt(command.commandId,MapReceiptStatus.PENDING,"renderer-not-ready",next.revision,pending.token)
        dispatch(pending,next)
        return store.load().receipts[command.commandId]?:MapReceipt(command.commandId,MapReceiptStatus.PENDING,"awaiting-render-confirmation",next.revision,pending.token)
    }
    @Synchronized fun resume(){val j=store.load();j.pending?.let{if(renderer.foregroundReady)dispatch(it,j.state)}}
    @Synchronized fun confirm(c:RenderConfirmation):MapReceipt {
        val j=store.load();val p=j.pending?:return MapReceipt(c.commandId,MapReceiptStatus.FAILED,"no-pending",j.state.revision)
        if(p.command.commandId!=c.commandId||p.revision!=c.revision||p.token!=c.token||c.styleGeneration!=renderer.styleGeneration)return MapReceipt(c.commandId,MapReceiptStatus.PENDING,"confirmation-mismatch",j.state.revision,p.token)
        val r=if(c.error!=null)MapReceipt(c.commandId,MapReceiptStatus.FAILED,c.error,c.revision,c.token) else MapReceipt(c.commandId,MapReceiptStatus.APPLIED,null,c.revision,c.token,c.confirmedFeatureIds,c.camera?.center(),c.cameraZoom)
        store.commit(j.copy(pending=null,receipts=j.receipts+(c.commandId to r),renderedRevision=if(r.status==MapReceiptStatus.APPLIED)c.revision else j.renderedRevision));return r
    }
    private fun dispatch(p:PendingRender,s:MapState)=renderer.render(RenderRequest(p.command.commandId,p.revision,renderer.styleGeneration,p.token,s,if(p.command.action==MapAction.FOCUS)p.command.target else null)){confirm(it)}
    private fun reduce(s:MapState,c:MapCommand):MapState=when(c.action){MapAction.UPSERT_ZONE->s.copy(zones=s.zones+(c.zone!!.id to c.zone));MapAction.UPSERT_GRID->s.copy(grids=s.grids+(c.grid!!.id to c.grid));MapAction.UPSERT_PIN->s.copy(pins=s.pins+(c.pin!!.id to c.pin));MapAction.NOTE->s.copy(notes=s.notes+(c.target!!.id to c.note!!));MapAction.RECOMMEND->s.copy(recommendations=s.recommendations+c.target!!.id);MapAction.HIGHLIGHT->s.copy(highlights=s.highlights+c.target!!.id);MapAction.FOCUS->s.copy(focused=c.target!!.id);MapAction.REMOVE->s.copy(zones=s.zones-c.target!!.id,grids=s.grids-c.target!!.id,pins=s.pins-c.target!!.id);MapAction.CLEAR->when(c.scope){"pins"->s.copy(pins=emptyMap());"grids"->s.copy(grids=emptyMap());"zones"->s.copy(zones=emptyMap());else->s.copy(pins=emptyMap(),grids=emptyMap(),zones=emptyMap())};MapAction.ROUTE->s}
}
