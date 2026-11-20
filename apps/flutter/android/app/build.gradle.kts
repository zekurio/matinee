import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Every part of Matinee has the version in the repository's root
// package.json, which `just tag` sets, so pubspec.yaml has none. The
// version code packs it as major, minor, patch, two digits for each of the
// last two, the same code the Kotlin app used, so this APK updates it.
val matineeVersion: String =
    providers
        .fileContents(rootProject.layout.projectDirectory.file("../../../package.json"))
        .asText
        .map { json ->
            Regex(""""version"\s*:\s*"([^"]+)"""").find(json)?.groupValues?.get(1)
                ?: throw GradleException("The root package.json has no version")
        }.get()
val matineeVersionCode: Int =
    Regex("""^(\d+)\.(\d+)\.(\d+)$""").find(matineeVersion)?.destructured?.let { (major, minor, patch) ->
        require(minor.toInt() < 100 && patch.toInt() < 100) {
            "Version $matineeVersion: minor and patch must stay under 100 to fit the version code"
        }
        major.toInt() * 10000 + minor.toInt() * 100 + patch.toInt()
    } ?: throw GradleException("Version $matineeVersion in the root package.json isn't major.minor.patch")

// Android AAR from edde746/mpv-build at 6dbda06021b128b7adc30161bf7870977e575135.
val mpvRevision = "d633bbc71269"
val media3Version = "1.11.1"

repositories {
    exclusiveContent {
        forRepository {
            ivy {
                name = "mpv-build"
                url = uri("https://github.com/edde746/mpv-build/releases/download/binaries-f78e66727714")
                patternLayout { artifact("[artifact]-[revision].[ext]") }
                metadataSources { artifact() }
            }
        }
        filter { includeModule("edde746", "mpv-android") }
    }
}

dependencies {
    implementation("edde746:mpv-android:$mpvRevision@aar")
    implementation("androidx.media3:media3-exoplayer:$media3Version")
    implementation("androidx.media3:media3-exoplayer-hls:$media3Version")
    implementation("androidx.media3:media3-datasource-okhttp:$media3Version")
    implementation("androidx.media3:media3-ui:$media3Version")
    implementation("org.jellyfin.media3:media3-ffmpeg-decoder:1.9.0+1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.11.0")
    // Reads the QR code a TV shows to sign it in, as the Kotlin app did.
    implementation("androidx.camera:camera-camera2:1.6.2")
    implementation("androidx.camera:camera-lifecycle:1.6.2")
    implementation("com.google.zxing:core:3.5.4")
    // Downloads: one resumable job per file, which outlives the app and a reboot.
    implementation("androidx.work:work-runtime-ktx:2.11.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    // The downloads' logic, apart from Android, on the JVM.
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20250517")
}

android {
    namespace = "io.github.zekurio.matinee"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        applicationId = "io.github.zekurio.matinee"
        // Android 8.0, as the Kotlin app had it.
        minSdk = 26
        targetSdk = flutter.targetSdkVersion
        versionCode = matineeVersionCode
        versionName = matineeVersion
    }

    // Release signing reads a keystore.properties kept outside the repo,
    // named by MATINEE_KEYSTORE_PROPERTIES, with storeFile, storePassword,
    // keyAlias, and keyPassword. Without the variable, release builds use
    // the debug key, which is fine for sideloading but not for a release.
    // With it set and the file missing the build fails, so the release
    // workflow can't publish an APK signed with a runner's debug key.
    val keystoreProperties = System.getenv("MATINEE_KEYSTORE_PROPERTIES")?.takeIf { it.isNotBlank() }?.let(::file)
    if (keystoreProperties?.exists() == false) {
        throw GradleException("MATINEE_KEYSTORE_PROPERTIES names $keystoreProperties, which doesn't exist")
    }
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

    // Use the canonical adaptive icon and its themed layer from brand/.
    sourceSets.getByName("main").res.directories.add(rootProject.file("../../../brand/android/res").path)

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
        }
        release {
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
