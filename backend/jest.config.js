// AMENDED 2026-09-27 (tech-stack.md v1.1, QA-01 test script): backend never
// had a test runner configured at all before this. ts-jest is on
// csmju2030-standards' allowed_dev_tooling list.
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  moduleFileExtensions: ['js', 'json', 'ts'],
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
};
