/**
 * Generator for the scaffolded project's `.gitignore`.
 *
 * Covers Node, Wrangler local cache, and environment files. Kept conservative
 * — no opinions about lockfile preferences (the user picks their package
 * manager) or editor folders (per-editor patterns belong in a global ignore).
 */

export function renderGitignore(): string {
  return `# Dependencies
node_modules/

# Wrangler local cache (do not commit; contains bundled output and tmp files)
.wrangler/

# Environment variables (commit \`.env.example\` instead)
.env
.env.local
.env.*.local

# Logs
*.log
npm-debug.log*
pnpm-debug.log*
yarn-debug.log*
yarn-error.log*

# macOS
.DS_Store
`;
}
