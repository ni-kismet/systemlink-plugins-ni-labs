const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');
const eslintConfigPrettier = require('eslint-config-prettier');
const jsdoc = require('eslint-plugin-jsdoc');

module.exports = tseslint.config(
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
    ],
    plugins: {
      jsdoc,
    },
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'app',
          style: 'camelCase',
        },
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: 'app',
          style: 'kebab-case',
        },
      ],
      '@angular-eslint/prefer-standalone': 'off',
      '@angular-eslint/prefer-inject': 'off',
      'no-cond-assign': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-constant-condition': ['error', { checkLoops: 'allExceptWhileTrue' }],
      'no-constructor-return': 'error',
      'no-debugger': 'error',
      'no-dupe-class-members': 'error',
      'no-duplicate-imports': 'error',
      'no-import-assign': 'error',
      'no-promise-executor-return': 'error',
      'no-template-curly-in-string': 'error',
      'no-unmodified-loop-condition': 'error',
      'no-unreachable': 'error',
      'no-unreachable-loop': 'error',
      'no-unsafe-finally': 'error',
      'no-unused-private-class-members': 'error',
      'no-use-before-define': [
        'error',
        {
          functions: false,
        },
      ],
      'no-useless-assignment': 'error',
      'block-scoped-var': 'error',
      'default-case': 'error',
      'default-case-last': 'error',
      eqeqeq: ['error', 'smart'],
      'func-style': ['error', 'declaration'],
      'no-empty': 'error',
      'no-useless-constructor': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'prefer-template': 'error',
      'require-yield': 'error',
      '@typescript-eslint/explicit-member-accessibility': 'error',
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/member-ordering': [
        'error',
        {
          default: [
            'public-static-field',
            'public-instance-field',

            'protected-static-field',
            'protected-instance-field',

            'private-static-field',
            'private-instance-field',

            'public-constructor',
            'private-constructor',

            'public-static-method',
            'public-instance-method',

            'protected-static-method',
            'protected-instance-method',

            'private-static-method',
            'private-instance-method',
          ],
        },
      ],
      'jsdoc/require-jsdoc': [
        'warn',
        {
          publicOnly: true,
          require: {
            ClassDeclaration: true,
            MethodDefinition: true,
            FunctionDeclaration: true,
          },
          contexts: [
            'ExportNamedDeclaration > VariableDeclaration',
            'ExportNamedDeclaration > TSEnumDeclaration',
            'ExportNamedDeclaration > TSTypeAliasDeclaration',
          ],
        },
      ],
      'jsdoc/require-description': ['warn', { contexts: ['any'] }],
    },
  },
  {
    files: ['**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
    rules: {},
  },
  eslintConfigPrettier,
);
