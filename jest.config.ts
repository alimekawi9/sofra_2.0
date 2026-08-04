import type { Config } from 'jest'
import nextJest from 'next/jest'

const createJestConfig = nextJest({ dir: './' })

const config: Config = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  // Scratch worktrees under .claude/ hold stale copies of the source and test
  // files; jest was picking them up and running old tests against current code.
  testPathIgnorePatterns: ['/node_modules/', '/.next/', '/.claude/'],
}

export default createJestConfig(config)
