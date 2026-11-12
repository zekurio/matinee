import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

// The app has the version of the whole repository, from the root
// package.json, which `just tag` sets. The version code packs it as
// major, minor, patch, two digits for each of the last two.
val matineeVersion: String =
    providers
        .fileContents(rootProject.layout.projectDirectory.file("../../package.json"))
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

android {
    namespace = "io.github.zekurio.matinee"
    // Keep in step with platformVersion in nix/android.nix: AGP finds API
    // 37 as the SDK's android-37.0.
    compileSdk = 37

    defaultConfig {
        applicationId = "io.github.zekurio.matinee"
        minSdk = 26
        targetSdk = 36
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
    sourceSets.getByName("main").res.directories.add(rootProject.file("../../brand/android/res").path)

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

    // A release builds an APK for each ABI, a quarter the size, beside the
    // universal one that runs on all of them. One app serves phones,
    // tablets, and TVs, so these are all the APKs there are. Debug builds
    // stay one APK. A bundle splits by ABI itself, and with splits on AGP
    // fails to shrink its resources
    // (https://issuetracker.google.com/issues/402800800).
    splits {
        abi {
            val tasks = gradle.startParameter.taskNames.map { it.lowercase() }
            isEnable = tasks.any { "release" in it } && tasks.none { "bundle" in it }
            reset()
            include("arm64-v8a", "armeabi-v7a", "x86", "x86_64")
            isUniversalApk = true
        }
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
    // Installs the baseline profiles Compose and the other libraries ship, so
    // ART compiles their hot code ahead of time on a sideloaded APK too.
    // Without it every screen starts out interpreted, and transitions drop frames.
    implementation(libs.androidx.profileinstaller)
    implementation(libs.androidx.browser)
    implementation(libs.androidx.camera.camera2)
    implementation(libs.androidx.camera.compose)
    implementation(libs.androidx.camera.lifecycle)
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
    implementation(libs.libmpv)

    implementation(libs.coil.compose)
    implementation(libs.coil.network.okhttp)

    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.okhttp)
    implementation(libs.zxing.core)

    testImplementation(libs.junit)
}
