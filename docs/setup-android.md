## Android Setup

- [Plugin Installation and Configuration for React Native 0.76 version and above](#plugin-installation-and-configuration-for-react-native-060-version-and-above-android)
- [Code Signing setup](#code-signing-setup)

In order to integrate CodePush into your Android project, please perform the following steps:

### Plugin Installation and Configuration for React Native 0.76 version and above (Android)

1. In your `android/app/build.gradle` file, add the `codepush.gradle` file as an additional build task definition to the end of the file:

   ```gradle
   ...
   apply from: "../../node_modules/@appsonair/react-native-code-push/android/codepush.gradle"
   ...
   ```

2. Update the `MainApplication` file to use CodePush via the following changes:

   For React Native 0.76 and above: update the `MainApplication.kt`

   **Important! : PackageList must be instantiated only one in application lifetime.**

   ```kotlin
   ...
   // 1. Import the plugin class.
   import com.microsoft.codepush.react.CodePush

   class MainApplication : Application(), ReactApplication {
      override val reactNativeHost: ReactNativeHost =
          object : DefaultReactNativeHost(this) {
              override fun getPackages(): List<ReactPackage> = PackageList(this).packages.apply {
                // Packages that cannot be autolinked yet can be added manually here, for example:
                // add(MyReactNativePackage())
               }

              // 2. Override the getJSBundleFile method in order to let
              // the CodePush runtime determine where to get the JS
              // bundle location from on each app start
              override fun getJSBundleFile(): String {
                return CodePush.getJSBundleFile()
              }
       };
   }
   ```

3. Add the Deployment key to `strings.xml`:

   To let the CodePush runtime know which deployment it should query for updates, open your app's `strings.xml` file and add a new string named `CodePushDeploymentKey`, whose value is the key of the deployment you want to configure this app against. You can retrieve this value by running `appsonair-codepush deployment list <appName> -k` in the CodePush CLI (the `-k` flag is necessary since keys aren't displayed by default) and copying the value of the `Key` column which corresponds to the deployment you want to use.

   Your `strings.xml` should looks like this:

   ```xml
    <resources>
        <string name="app_name">AppName</string>
        <string moduleConfig="true" name="CodePushDeploymentKey">DeploymentKey</string>
    </resources>
   ```

### Code Signing setup

Starting with CLI version **2.1.0** you can self sign bundles during release and verify its signature before installation of update. For more info about Code Signing please refer to [relevant code-push documentation section](https://github.com/microsoft/code-push/tree/v3.0.1/cli#code-signing). In order to use Public Key for Code Signing you need to do following steps:

Add `CodePushPublicKey` string item to `/path_to_your_app/android/app/src/main/res/values/strings.xml`. It may looks like this:

```xml
<resources>
   <string name="app_name">my_app</string>
   <string name="CodePushPublicKey">-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtPSR9lkGzZ4FR0lxF+ZA
P6jJ8+Xi5L601BPN4QESoRVSrJM08roOCVrs4qoYqYJy3Of2cQWvNBEh8ti3FhHu
tiuLFpNdfzM4DjAw0Ti5hOTfTixqVBXTJPYpSjDh7K6tUvp9MV0l5q/Ps3se1vud
M1/X6g54lIX/QoEXTdMgR+SKXvlUIC13T7GkDHT6Z4RlwxkWkOmf2tGguRcEBL6j
ww7w/3g0kWILz7nNPtXyDhIB9WLH7MKSJWdVCZm+cAqabUfpCFo7sHiyHLnUxcVY
OTw3sz9ceaci7z2r8SZdsfjyjiDJrq69eWtvKVUpredy9HtyALtNuLjDITahdh8A
zwIDAQAB
-----END PUBLIC KEY-----</string>
</resources>
```
