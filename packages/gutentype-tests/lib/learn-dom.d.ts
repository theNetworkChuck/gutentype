// lesson-types.test.ts imports @keybr/test-env-browser for its DOM, so tsc reads that package's source; these are
// the ambient module declarations its own tsconfig supplies (script files, so they can only be referenced).
/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="../../test-env-browser/lib/jsdom.d.ts" />
/// <reference path="../../test-env-browser/lib/confusing-browser-globals.d.ts" />
