import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'
import jsxA11y from 'eslint-plugin-jsx-a11y'

export default defineConfig([
  globalIgnores([
    'dist',
    // Módulo cerrado recibido para la oficina; se consume sin modificar.
    'src/agent-office-viva/vendor/**',
    'src/agent-office-viva/OfficeViva.tsx',
    // Implementación anterior retenida hasta la validación funcional del módulo cerrado.
    'src/agent-office-viva/engine.ts',
    'src/agent-office-viva/OfficeVivaCanvas.tsx',
    'src/agent-office-viva/hud/**',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      jsxA11y.flatConfigs.recommended,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // Regla estricta para contrastes
      'jsx-a11y/no-distracting-elements': 'error',
    }
  },
])
