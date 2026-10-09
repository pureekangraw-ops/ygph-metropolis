plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.big.gobrowser"
    compileSdk = 36

    buildFeatures {
        buildConfig = true
    }

    // Exact checkout revision and run ID are embedded in the APK for visible provenance.
    val sourceRevision = System.getenv("OBSERVATORY_SOURCE_SHA")
        ?.takeIf { it.matches(Regex("[0-9a-f]{40}")) } ?: "UNKNOWN"
    val buildRunId = System.getenv("OBSERVATORY_BUILD_RUN_ID")
        ?.takeIf { it.matches(Regex("[0-9]+")) } ?: "LOCAL"

    defaultConfig {
        applicationId = "com.big.gobrowser"
        minSdk = 26
        targetSdk = 36
        versionCode = 5
        versionName = "0.4.2"
        buildConfigField("String", "SOURCE_COMMIT", "\"$sourceRevision\"")
        buildConfigField("String", "BUILD_RUN_ID", "\"$buildRunId\"")
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("org.maplibre.gl:android-sdk-opengl:13.6.1")
    implementation("org.mozilla.geckoview:geckoview-nightly-omni:153.0.20260615093007")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-ktx:1.10.0")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.6.1")
    androidTestImplementation("androidx.test:rules:1.6.1")
}
