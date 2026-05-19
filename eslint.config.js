import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';
import tseslint from 'typescript-eslint';
import js from '@eslint/js';

export default [
  {
    ignores: ['dist/**/*']
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  firebaseRulesPlugin.configs['flat/recommended'],
  {
    files: ['**/*.{js,mjs,cjs,ts,jsx,tsx}'],
    rules: {
      'no-unused-vars': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn'
    }
  }
];
