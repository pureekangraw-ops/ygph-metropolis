package com.big.gobrowser.browser;

import java.util.LinkedHashMap;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/** Per-document frame captures and their exact native port; no URL-based frame identity. */
public final class GeckoFrameLedger<T, P> {
  public static final class Frame<T, P> {
    public final String id, documentId, captureId;
    public final T page;
    public final P port;
    Frame(String id, String documentId, String captureId, T page, P port) {
      this.id=id; this.documentId=documentId; this.captureId=captureId; this.page=page; this.port=port;
    }
  }
  private final LinkedHashMap<String, Frame<T, P>> frames = new LinkedHashMap<>();
  private String captureId = UUID.randomUUID().toString();
  public void observe(String frameId, String documentId, String localCaptureId, T page, P port, boolean topLevel) {
    if (frameId.isEmpty() || documentId.isEmpty() || localCaptureId.isEmpty() || topLevel != "frame-0".equals(frameId)) return;
    Frame<T, P> previous = frames.get(frameId);
    if (topLevel && previous != null && !previous.documentId.equals(documentId)) frames.clear();
    if (!topLevel && frames.size() >= 64 && !frames.containsKey(frameId)) return;
    boolean changed = previous == null || !previous.captureId.equals(localCaptureId) || !previous.documentId.equals(documentId);
    frames.put(frameId, new Frame<>(frameId,documentId,localCaptureId,page,port));
    if (changed) captureId=UUID.randomUUID().toString();
  }
  public String captureId() { return captureId; }
  public Frame<T, P> top() { return frames.get("frame-0"); }
  public List<Frame<T, P>> frames() { return new ArrayList<>(frames.values()); }
  public Frame<T, P> route(String aggregateCaptureId, String frameId) { return captureId.equals(aggregateCaptureId) && top()!=null ? frames.get(frameId) : null; }
  public void disconnect(P port) {
    if (frames.values().removeIf(frame -> frame.port == port)) captureId=UUID.randomUUID().toString();
  }
}
