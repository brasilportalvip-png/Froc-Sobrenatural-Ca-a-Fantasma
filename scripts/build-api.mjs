import { build } from 'esbuild';

// Bundle ESM dependencies together with CommonJS consumers. Externalizing
// jwks-rsa makes it call require('jose') at startup, which crashes on Node 20.
// Node built-ins still need require() inside some bundled CommonJS modules.
await build({
  entryPoints: ['./src/apiEntry.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  minifyWhitespace: true,
  // Firestore's generated clients resolve protobuf files beside their own
  // package. Keep their directory layout in node_modules intact.
  external: ['@google-cloud/*', '@grpc/*', 'google-gax'],
  outfile: 'api/index.js',
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});
