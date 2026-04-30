import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

// ---------------------------------------------------------------------------
// SpinDeck ESLint config.
// ---------------------------------------------------------------------------
// jsx-a11y is wired in here as our WCAG 2.2 AA compliance gate. The rules
// turned on below cover the bullets we care about for accessibility:
//
//   • alt-text                          — every <img> has alt text
//   • label-has-associated-control      — every <label> binds to its input
//   • heading-has-content               — no empty <h1>..<h6>
//   • click-events-have-key-events      — clickable non-buttons get keys
//   • no-static-element-interactions    — flags onClick on plain divs/spans
//   • anchor-is-valid                   — <a> without href can't be a button
//
// Adding/removing rules: prefer the recommended config from jsx-a11y; only
// override below when we have a deliberate reason.
// ---------------------------------------------------------------------------

export default defineConfig([
  // supabase/functions runs in Deno (different runtime, different rules);
  // it's not part of the React bundle and shouldn't be lint-coupled to it.
  globalIgnores(['dist', 'docs', 'supabase/functions']),
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
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/label-has-associated-control': [
        'error',
        {
          // Our <Textarea> wraps a real <textarea>; the rule only
          // recognizes native form controls by default, so list it.
          controlComponents: ['Textarea'],
          // Either htmlFor or wrapping the input both satisfy the rule.
          assert: 'either',
        },
      ],
      'jsx-a11y/heading-has-content': 'error',
      'jsx-a11y/click-events-have-key-events': 'error',
      'jsx-a11y/no-static-element-interactions': 'error',
      'jsx-a11y/anchor-is-valid': 'error',
    },
  },
])
