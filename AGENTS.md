# Repo guidelines for Codex agents

This file contains instructions for Codex or other automated agents contributing to **oLegal**.

## Repository overview

oLegal is a Next.js 15 application written in TypeScript. The project uses Tailwind CSS and shadcn components. Source files live primarily under the `app/` and `lib/` folders. Styling is handled via Tailwind and global CSS in `app/globals.css`.

Most of the codebase is formatted with Prettier using the configuration in `.prettierrc.json`. ESLint rules are defined in `eslint.config.mjs`.

## Contribution workflow

1. Install dependencies with `npm install` if they are not already present.
2. Make code or documentation changes as needed.
3. **Always format your changes** using Prettier before committing:
   ```bash
   npx prettier -w <files>
   ```
4. Run the following checks before each commit:
   ```bash
   npm run lint
   npm run type-check
   ```
5. Commit with a clear, present‑tense message summarizing the change.

## Coding conventions

- TypeScript and TSX files should have no semicolons (see `.prettierrc.json`).
- Use two spaces for indentation.
- Prefer named exports over default exports.
- Keep functions small and focused.
- Document complex logic with comments.

## Documentation

When updating or adding documentation, keep lines under 120 characters where possible. Include code blocks for commands and configuration snippets. Cross-reference other documents in the repository when relevant (for example, link to `INSTALL.md` for environment setup).

## Testing

The repository currently does not include automated unit tests, but linting and TypeScript checks are required. Future additions may include more extensive tests. Ensure the existing checks pass before committing.
