// rollup.config.mjs

import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import pkg from './package.json' with { type: 'json' };

const external = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.peerDependencies || {}),
  /^node:.*/,
];

const plugins = [
  typescript({
    tsconfig: './tsconfig.json',
    exclude: ['**/*.test.ts', '**/*.spec.ts', 'tests/**/*']
  }),
  nodeResolve({ preferBuiltins: true }),
  commonjs()
];

export default [
  // CommonJS build
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/cjs/index.js',
      format: 'cjs',
      exports: 'named',
      sourcemap: true
    },
    external,
    plugins
  },
  // ES Module build
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/esm/index.js',
      format: 'es',
      sourcemap: true
    },
    external,
    plugins
  }
];
