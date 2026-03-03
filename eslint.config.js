// @ts-check
const tseslint = require('@typescript-eslint/eslint-plugin');
const tsparser = require('@typescript-eslint/parser');

module.exports = [
	{
		files: ['src/**/*.ts'],
		languageOptions: {
			parser: tsparser,
			ecmaVersion: 2022,
			sourceType: 'module',
		},
		plugins: {
			'@typescript-eslint': tseslint,
		},
		rules: {
			'no-throw-literal': 'warn',
			'curly': 'warn',
			'eqeqeq': 'warn',
			'semi': ['warn', 'always'],
			'no-unused-expressions': 'warn',
		},
	},
	{
		ignores: ['out/**', 'dist/**', '**/*.d.ts'],
	},
];
