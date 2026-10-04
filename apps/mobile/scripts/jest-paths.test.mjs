import { test } from 'node:test';
import assert from 'node:assert/strict';
import config from '../jest.config.cjs';

test('ESM remend transform matches Windows and POSIX paths without widening to other modules', () => {
  const entry = Object.entries(config.transform).find(([pattern, transformer]) => pattern.includes('remend') && transformer === 'babel-jest');
  assert.ok(entry, 'remend must have its own Babel transform');
  const [pattern] = entry;
  const regex = new RegExp(pattern);
  assert.ok(regex.test('C:\\workspace\\node_modules\\remend\\dist\\index.js'));
  assert.ok(regex.test('/workspace/node_modules/remend/dist/index.js'));
  assert.equal(regex.test('/workspace/node_modules/other/dist/index.js'), false);
});

test('RN responder transform matches only the installed Pressability entry on both path styles', () => {
  const entry = Object.entries(config.transform).find(([pattern, transformer]) => pattern.includes('Pressability') && transformer === 'babel-jest');
  assert.ok(entry, 'gesture consumers must use the installed responder state machine');
  const regex = new RegExp(entry[0]);
  assert.ok(regex.test('C:\\workspace\\node_modules\\react-native\\Libraries\\Pressability\\Pressability.js'));
  assert.ok(regex.test('/workspace/node_modules/react-native/Libraries/Pressability/Pressability.js'));
  assert.equal(regex.test('/workspace/node_modules/react-native/Libraries/Pressability/HoverState.js'), false);
  assert.equal(regex.test('/workspace/node_modules/other/Pressability.js'), false);
});
