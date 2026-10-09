const { withGradleProperties } = require('expo/config-plugins');

// Release builds merge native debug metadata and package the APK inside a single Gradle
// daemon. Expo's default heap is small enough that :app:mergeReleaseNativeDebugMetadata
// fails with "Java heap space", which also aborts :app:packageRelease. Raise the daemon
// heap so the packaged APK is produced without a signed-in operator.
const GRADLE_JVMARGS = '-Xmx4096m -XX:MaxMetaspaceSize=1024m';

function applyGradleHeap(properties) {
  const existing = properties.find(
    (item) => item.type === 'property' && item.key === 'org.gradle.jvmargs',
  );
  if (existing) {
    existing.value = GRADLE_JVMARGS;
  } else {
    properties.unshift({ type: 'property', key: 'org.gradle.jvmargs', value: GRADLE_JVMARGS });
  }
  return properties;
}

function withAndroidGradleHeap(config) {
  return withGradleProperties(config, (nextConfig) => {
    nextConfig.modResults = applyGradleHeap(nextConfig.modResults);
    return nextConfig;
  });
}

module.exports = withAndroidGradleHeap;
module.exports.GRADLE_JVMARGS = GRADLE_JVMARGS;
module.exports.applyGradleHeap = applyGradleHeap;
