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
