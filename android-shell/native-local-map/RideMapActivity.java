package com.yggdrasil.lighthouse;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Bundle;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.maplibre.android.MapLibre;
import org.maplibre.android.camera.CameraPosition;
import org.maplibre.android.geometry.LatLng;
import org.maplibre.android.maps.MapLibreMap;
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
  private static final int LOCATION_PERMISSION_REQUEST = 2201;
  private static final String CURRENT_SOURCE = "current-location-source";
  private static final String CURRENT_LAYER = "current-location-layer";

  private MapView mapView;
  private MapLibreMap map;
  private Style mapStyle;
  private LocationManager locationManager;
  private LatLng pickup;
  private LatLng dropoff;
  private LatLng currentLocation;
  private boolean locationRequested = false;
  private android.content.SharedPreferences viewPrefs;

  private static final String VIEW_PREFS = "lighthouse_ride_map_view";

  private final LocationListener locationListener = new LocationListener() {
    @Override public void onLocationChanged(Location location) {
      showCurrentLocation(location);
    }
    @Override public void onProviderEnabled(String provider) {}
    @Override public void onProviderDisabled(String provider) {}
    @Override public void onStatusChanged(String provider, int status, Bundle extras) {}
  };

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

  private void fitJob() {
    if (map == null) return;
    if (pickup != null && dropoff != null) {
      double lat = (pickup.getLatitude() + dropoff.getLatitude()) / 2d;
      double lng = (pickup.getLongitude() + dropoff.getLongitude()) / 2d;
      double span = Math.max(Math.abs(pickup.getLatitude() - dropoff.getLatitude()), Math.abs(pickup.getLongitude() - dropoff.getLongitude()));
      double zoom = span < 0.01d ? 14d : span < 0.03d ? 12.5d : span < 0.10d ? 10.5d : 9d;
      map.setCameraPosition(new CameraPosition.Builder().target(new LatLng(lat, lng)).zoom(zoom).build());
      return;
    }
    LatLng target = pickup != null ? pickup : dropoff;
    if (target != null) {
      map.setCameraPosition(new CameraPosition.Builder().target(target).zoom(14d).build());
      return;
    }
    restoreViewportOrLocate();
  }

  private void restoreViewportOrLocate() {
    if (map == null) return;
    if (viewPrefs != null && viewPrefs.contains("lat") && viewPrefs.contains("lng")) {
      double lat = Double.longBitsToDouble(viewPrefs.getLong("lat", Double.doubleToRawLongBits(13.7563d)));
      double lng = Double.longBitsToDouble(viewPrefs.getLong("lng", Double.doubleToRawLongBits(100.5018d)));
      float zoom = viewPrefs.getFloat("zoom", 13f);
      map.setCameraPosition(new CameraPosition.Builder().target(new LatLng(lat, lng)).zoom(zoom).build());
    } else {
      requestForegroundLocation();
    }
  }

  private void persistViewport() {
    if (map == null || viewPrefs == null || map.getCameraPosition() == null || map.getCameraPosition().target == null) return;
    CameraPosition camera = map.getCameraPosition();
    viewPrefs.edit()
      .putLong("lat", Double.doubleToRawLongBits(camera.target.getLatitude()))
      .putLong("lng", Double.doubleToRawLongBits(camera.target.getLongitude()))
      .putFloat("zoom", (float) camera.zoom)
      .apply();
  }

  private boolean hasCoarseLocation() {
    return checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
  }

  private boolean hasFineLocation() {
    return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
  }

  private void requestForegroundLocation() {
    locationRequested = true;
    if (!hasCoarseLocation()) {
      requestPermissions(new String[]{
        Manifest.permission.ACCESS_COARSE_LOCATION,
        Manifest.permission.ACCESS_FINE_LOCATION
      }, LOCATION_PERMISSION_REQUEST);
      return;
    }
    startLocationUpdates();
  }

  private String chooseLocationProvider() {
    if (locationManager == null) return null;
    if (hasFineLocation() && locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
      return LocationManager.GPS_PROVIDER;
    }
    if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
      return LocationManager.NETWORK_PROVIDER;
    }
    if (locationManager.isProviderEnabled(LocationManager.PASSIVE_PROVIDER)) {
      return LocationManager.PASSIVE_PROVIDER;
    }
    return null;
  }

  private void startLocationUpdates() {
    if (!hasCoarseLocation()) return;
    locationManager = (LocationManager) getSystemService(LOCATION_SERVICE);
    String provider = chooseLocationProvider();
    if (provider == null) return;
    try {
      Location last = locationManager.getLastKnownLocation(provider);
      if (last != null) showCurrentLocation(last);
      locationManager.requestLocationUpdates(provider, 1000L, 5f, locationListener);
    } catch (SecurityException ignored) {
      stopLocationUpdates();
    }
  }

  private void stopLocationUpdates() {
    if (locationManager == null) return;
    try {
      locationManager.removeUpdates(locationListener);
    } catch (SecurityException ignored) {}
  }

  private void showCurrentLocation(Location location) {
    if (location == null) return;
    currentLocation = new LatLng(location.getLatitude(), location.getLongitude());
    if (pickup == null && dropoff == null && map != null) {
      map.setCameraPosition(new CameraPosition.Builder().target(currentLocation).zoom(15d).build());
    }
    if (mapStyle == null) return;

    GeoJsonSource source = mapStyle.getSourceAs(CURRENT_SOURCE);
    Point point = Point.fromLngLat(currentLocation.getLongitude(), currentLocation.getLatitude());
    if (source == null) {
      source = new GeoJsonSource(CURRENT_SOURCE, point);
      mapStyle.addSource(source);
      CircleLayer layer = new CircleLayer(CURRENT_LAYER, CURRENT_SOURCE);
      layer.setProperties(
        circleColor(Color.rgb(46, 125, 50)),
        circleRadius(8f),
        circleStrokeColor(Color.WHITE),
        circleStrokeWidth(3f)
      );
      mapStyle.addLayer(layer);
    } else {
      source.setGeoJson(point);
    }
  }

  private void centerOnCurrentLocation() {
    if (currentLocation != null && map != null) {
      map.setCameraPosition(new CameraPosition.Builder().target(currentLocation).zoom(15d).build());
      return;
    }
    requestForegroundLocation();
  }

  private Button actionButton(String label) {
    Button button = new Button(this);
    button.setText(label);
    button.setAllCaps(false);
    return button;
  }

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    viewPrefs = getSharedPreferences(VIEW_PREFS, MODE_PRIVATE);
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

    LinearLayout controls = new LinearLayout(this);
    controls.setOrientation(LinearLayout.HORIZONTAL);
    controls.setPadding(12, 12, 12, 12);
    Button fitButton = actionButton("ดูจุดงาน");
    Button currentButton = actionButton("ตำแหน่งฉัน");
    controls.addView(fitButton);
    controls.addView(currentButton);
    FrameLayout.LayoutParams controlsLayout = new FrameLayout.LayoutParams(
      ViewGroup.LayoutParams.WRAP_CONTENT,
      ViewGroup.LayoutParams.WRAP_CONTENT
    );
    controlsLayout.gravity = Gravity.TOP | Gravity.END;
    root.addView(controls, controlsLayout);

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
    attributionLayout.gravity = Gravity.BOTTOM | Gravity.START;
    root.addView(attribution, attributionLayout);

    setContentView(root);
    mapView.onCreate(savedInstanceState);

    pickup = point("pickup");
    dropoff = point("dropoff");
    fitButton.setOnClickListener(view -> fitJob());
    currentButton.setOnClickListener(view -> centerOnCurrentLocation());

    mapView.getMapAsync(mapLibreMap -> {
      map = mapLibreMap;
      String base = "{\"version\":8,\"sources\":{},\"layers\":[{\"id\":\"background\",\"type\":\"background\",\"paint\":{\"background-color\":\"#f4f1ea\"}}]}";
      map.setStyle(new Style.Builder().fromJson(base), style -> {
        mapStyle = style;
        style.addSource(new VectorSource("basemap", "pmtiles://file://" + packagePath));
        addFill(style, "earth", "earth", Color.rgb(244, 241, 234));
        addFill(style, "landuse", "landuse", Color.rgb(228, 235, 218));
        addFill(style, "water", "water", Color.rgb(180, 214, 235));
        addFill(style, "buildings", "buildings", Color.rgb(218, 211, 201));
        addRoads(style);
        addPoint(style, "pickup", pickup, Color.rgb(30, 136, 229));
        addPoint(style, "dropoff", dropoff, Color.rgb(229, 57, 53));
        fitJob();
        if (locationRequested && hasCoarseLocation()) startLocationUpdates();
      });
    });
  }

  @Override
  public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    if (requestCode == LOCATION_PERMISSION_REQUEST && hasCoarseLocation()) startLocationUpdates();
  }

  @Override protected void onStart() { super.onStart(); if (mapView != null) mapView.onStart(); }
  @Override protected void onResume() {
    super.onResume();
    if (mapView != null) mapView.onResume();
    if (locationRequested && hasCoarseLocation()) startLocationUpdates();
  }
  @Override protected void onPause() {
    persistViewport();
    stopLocationUpdates();
    if (mapView != null) mapView.onPause();
    super.onPause();
  }
  @Override protected void onStop() { if (mapView != null) mapView.onStop(); super.onStop(); }
  @Override public void onLowMemory() { super.onLowMemory(); if (mapView != null) mapView.onLowMemory(); }
  @Override protected void onDestroy() { stopLocationUpdates(); if (mapView != null) mapView.onDestroy(); super.onDestroy(); }
  @Override protected void onSaveInstanceState(Bundle outState) {
    super.onSaveInstanceState(outState);
    if (mapView != null) mapView.onSaveInstanceState(outState);
  }
}
