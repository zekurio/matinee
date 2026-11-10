buildscript {
    dependencies {
        // AGP compiles Kotlin itself; this picks the compiler it uses, which
        // the Compose and serialization plugins below have to match.
        classpath(libs.kotlin.gradle.plugin)
    }
}

plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.kotlin.serialization) apply false
}
