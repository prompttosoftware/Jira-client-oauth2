// rollup.config.mjs

import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import pkg from './package.json' with { type: 'json' };

// Automatically determine external dependencies
const external = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.peerDependencies || {}),
  /^node:.*/, // Handles all node built-ins like 'node:fs', 'node:path'
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
    plugins: [
      // 1. Run TypeScript plugin FIRST
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
        declarationMap: false,
        exclude: ['**/*.test.ts', '**/*.spec.ts', 'tests/**/*']
      }),
      // 2. Resolve node modules
      nodeResolve({
        preferBuiltins: true,
      }),
      // 3. Convert CommonJS to ES modules
      commonjs()
    ]
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
    plugins: [
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
        declarationMap: false,
        exclude: ['**/*.test.ts', '**/*.spec.ts', 'tests/**/*']
      }),
      nodeResolve({
        preferBuiltins: true,
      }),
      commonjs()
    ]
  }
];
