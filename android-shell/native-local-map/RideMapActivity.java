package com.yggdrasil.lighthouse;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.TextView;

import org.maplibre.android.MapLibre;
import org.maplibre.android.camera.CameraPosition;
import org.maplibre.android.geometry.LatLng;
import org.maplibre.android.maps.MapView;
import org.maplibre.android.maps.Style;
import org.maplibre.android.style.layers.CircleLayer;
import org.maplibre.android.style.layers.FillLayer;
import org.maplibre.android.style.layers.LineLayer;
import org.maplibre.android.style.sources.GeoJsonSource;
import org.maplibre.android.style.sources.VectorSource;
import org.maplibre.geojson.Point;

import static org.maplibre.android.style.layers.PropertyFactory.circleColor;
import static org.maplibre.android.style.layers.PropertyFactory.circleRadius;
import static org.maplibre.android.style.layers.PropertyFactory.circleStrokeColor;
import static org.maplibre.android.style.layers.PropertyFactory.circleStrokeWidth;
import static org.maplibre.android.style.layers.PropertyFactory.fillColor;
import static org.maplibre.android.style.layers.PropertyFactory.lineColor;
import static org.maplibre.android.style.layers.PropertyFactory.lineWidth;

public final class RideMapActivity extends Activity {
  private MapView mapView;

  private boolean hasPoint(String prefix) {
    return getIntent().hasExtra(prefix + "Lat") && getIntent().hasExtra(prefix + "Lng");
  }

  private LatLng point(String prefix) {
    if (!hasPoint(prefix)) return null;
    return new LatLng(
      getIntent().getDoubleExtra(prefix + "Lat", 0d),
      getIntent().getDoubleExtra(prefix + "Lng", 0d)
    );
  }

  private void addFill(Style style, String id, String sourceLayer, int color) {
    FillLayer layer = new FillLayer(id, "basemap");
    layer.setSourceLayer(sourceLayer);
    layer.setProperties(fillColor(color));
    style.addLayer(layer);
  }

  private void addRoads(Style style) {
    LineLayer layer = new LineLayer("roads", "basemap");
    layer.setSourceLayer("roads");
    layer.setProperties(lineColor(Color.rgb(120, 120, 120)), lineWidth(1.4f));
    style.addLayer(layer);
  }

  private void addPoint(Style style, String id, LatLng point, int color) {
    if (point == null) return;
    String sourceId = id + "-source";
    style.addSource(new GeoJsonSource(sourceId, Point.fromLngLat(point.getLongitude(), point.getLatitude())));
    CircleLayer layer = new CircleLayer(id, sourceId);
    layer.setProperties(
      circleColor(color),
      circleRadius(9f),
      circleStrokeColor(Color.WHITE),
      circleStrokeWidth(3f)
    );
    style.addLayer(layer);
  }

  private void fitJob(org.maplibre.android.maps.MapLibreMap map, LatLng pickup, LatLng dropoff) {
    if (pickup != null && dropoff != null) {
      double lat = (pickup.getLatitude() + dropoff.getLatitude()) / 2d;
      double lng = (pickup.getLongitude() + dropoff.getLongitude()) / 2d;
      double span = Math.max(Math.abs(pickup.getLatitude() - dropoff.getLatitude()), Math.abs(pickup.getLongitude() - dropoff.getLongitude()));
      double zoom = span < 0.01d ? 14d : span < 0.03d ? 12.5d : span < 0.10d ? 10.5d : 9d;
      map.setCameraPosition(new CameraPosition.Builder().target(new LatLng(lat, lng)).zoom(zoom).build());
    } else {
      LatLng target = pickup != null ? pickup : dropoff;
      if (target != null) map.setCameraPosition(new CameraPosition.Builder().target(target).zoom(14d).build());
    }
  }

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    String packagePath = getIntent().getStringExtra("packagePath");
    if (packagePath == null || packagePath.trim().isEmpty()) {
      finish();
      return;
    }

    MapLibre.getInstance(this);
    FrameLayout root = new FrameLayout(this);
    mapView = new MapView(this);
    root.addView(mapView, new FrameLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      ViewGroup.LayoutParams.MATCH_PARENT
    ));

    TextView attribution = new TextView(this);
    attribution.setText(getIntent().getStringExtra("attribution"));
    attribution.setTextSize(11f);
    attribution.setTextColor(Color.DKGRAY);
    attribution.setBackgroundColor(Color.argb(210, 255, 255, 255));
    attribution.setPadding(12, 8, 12, 8);
    FrameLayout.LayoutParams attributionLayout = new FrameLayout.LayoutParams(
      ViewGroup.LayoutParams.WRAP_CONTENT,
      ViewGroup.LayoutParams.WRAP_CONTENT
    );
    attributionLayout.gravity = android.view.Gravity.BOTTOM | android.view.Gravity.START;
    root.addView(attribution, attributionLayout);

    setContentView(root);
    mapView.onCreate(savedInstanceState);

    final LatLng pickup = point("pickup");
    final LatLng dropoff = point("dropoff");

    mapView.getMapAsync(map -> {
      String base = "{\"version\":8,\"sources\":{},\"layers\":[{\"id\":\"background\",\"type\":\"background\",\"paint\":{\"background-color\":\"#f4f1ea\"}}]}";
      map.setStyle(new Style.Builder().fromJson(base), style -> {
        style.addSource(new VectorSource("basemap", "pmtiles://file://" + packagePath));
        addFill(style, "earth", "earth", Color.rgb(244, 241, 234));
        addFill(style, "landuse", "landuse", Color.rgb(228, 235, 218));
        addFill(style, "water", "water", Color.rgb(180, 214, 235));
        addFill(style, "buildings", "buildings", Color.rgb(218, 211, 201));
        addRoads(style);
        addPoint(style, "pickup", pickup, Color.rgb(30, 136, 229));
        addPoint(style, "dropoff", dropoff, Color.rgb(229, 57, 53));
        fitJob(map, pickup, dropoff);
      });
    });
  }

  @Override protected void onStart() { super.onStart(); if (mapView != null) mapView.onStart(); }
  @Override protected void onResume() { super.onResume(); if (mapView != null) mapView.onResume(); }
  @Override protected void onPause() { if (mapView != null) mapView.onPause(); super.onPause(); }
  @Override protected void onStop() { if (mapView != null) mapView.onStop(); super.onStop(); }
  @Override public void onLowMemory() { super.onLowMemory(); if (mapView != null) mapView.onLowMemory(); }
  @Override protected void onDestroy() { if (mapView != null) mapView.onDestroy(); super.onDestroy(); }
  @Override protected void onSaveInstanceState(Bundle outState) {
    super.onSaveInstanceState(outState);
    if (mapView != null) mapView.onSaveInstanceState(outState);
  }
}
