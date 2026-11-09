import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "io.github.zekurio.matinee"
    // Keep in step with platformVersion in nix/android.nix: AGP finds API
    // 37 as the SDK's android-37.0.
    compileSdk = 37

    defaultConfig {
        applicationId = "io.github.zekurio.matinee"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
    }

    // Release signing reads a keystore.properties kept outside the repo,
    // named by MATINEE_KEYSTORE_PROPERTIES, with storeFile, storePassword,
    // keyAlias, and keyPassword. Without one, release builds use the debug
    // key, which is fine for sideloading but not for a store.
    val keystoreProperties = System.getenv("MATINEE_KEYSTORE_PROPERTIES")?.let(::file)
    signingConfigs {
        if (keystoreProperties?.exists() == true) {
            val properties = Properties().apply { keystoreProperties.inputStream().use(::load) }
            create("release") {
                storeFile = file(properties.getProperty("storeFile"))
                storePassword = properties.getProperty("storePassword")
                keyAlias = properties.getProperty("keyAlias")
                keyPassword = properties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            // Compose runs several times slower in a debuggable app, enough
            // to stall every page transition. Pass -Pmatinee.debuggable to
            // attach a debugger or the Layout Inspector.
            isDebuggable = providers.gradleProperty("matinee.debuggable").isPresent
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    // Lists the app's languages for Android's per-app language setting, from
    // the values-* folders and res/resources.properties.
    androidResources {
        generateLocaleConfig = true
    }

    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
}

dependencies {
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.foundation)
    implementation(libs.compose.material3)
    implementation(libs.compose.ui.tooling.preview)
    debugImplementation(libs.compose.ui.tooling)

    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.browser)
    implementation(libs.androidx.core)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.work)

    implementation(libs.media3.exoplayer)
    implementation(libs.media3.exoplayer.hls)
    implementation(libs.media3.datasource.okhttp)
    implementation(libs.media3.ui.compose)
    implementation(libs.media3.session)
    implementation(libs.media3.ffmpeg.decoder)

    implementation(libs.coil.compose)
    implementation(libs.coil.network.okhttp)

    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.okhttp)

    testImplementation(libs.junit)
}
