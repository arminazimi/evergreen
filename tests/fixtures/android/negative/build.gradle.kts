// compileSdk = 19
/* minSdk = 14 */
val compileSdkVersion = 34

android {
    namespace = "com.example.lookalike"
    compileSdk = compileSdkVersion

    defaultConfig {
        minSdk = libs.versions.minSdk.get().toInt()
        targetSdk = project.property("targetSdk").toString().toInt()
        versionName = "targetSdk = 16"
    }
}
