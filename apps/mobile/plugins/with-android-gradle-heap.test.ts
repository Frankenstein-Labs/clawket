const { GRADLE_JVMARGS, applyGradleHeap } = require('./with-android-gradle-heap.js') as {
  GRADLE_JVMARGS: string;
  applyGradleHeap: (properties: Array<{ type: string; key?: string; value?: string }>) => Array<{ type: string; key?: string; value?: string }>;
};

describe('withAndroidGradleHeap', () => {
  it('raises the Gradle daemon heap so release packaging does not run out of memory', () => {
    expect(GRADLE_JVMARGS).toContain('-Xmx4096m');
  });

  it('adds the jvmargs property when the generated file does not define it', () => {
    const output = applyGradleHeap([{ type: 'property', key: 'android.useAndroidX', value: 'true' }]);
    expect(output[0]).toEqual({ type: 'property', key: 'org.gradle.jvmargs', value: GRADLE_JVMARGS });
  });

  it('overrides an existing jvmargs value without duplicating the key', () => {
    const output = applyGradleHeap([{ type: 'property', key: 'org.gradle.jvmargs', value: '-Xmx2048m' }]);
    expect(output.filter((item) => item.key === 'org.gradle.jvmargs')).toHaveLength(1);
    expect(output[0].value).toBe(GRADLE_JVMARGS);
  });
});
