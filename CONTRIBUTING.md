# Contributing

## Branches

```
feature branch  →  PR into development  →  release PR into main
```

- `main` is production: it deploys to https://drone-simulator-tan.vercel.app. Only Pavel releases to it.
- `development` collects finished work. Changes reach it only through a pull request.
- Every task gets its own branch off the latest `development`, named `<person>/<topic>`:
  one slash, lowercase, hyphens, named after what the change does (`leya/loading-screen`).
  Never a bare `<person>` branch: it would block every `<person>/...` branch.
- Production hotfixes are the only exception: `hotfix/<topic>` off `main`, merged forward into `development` after.

Vercel builds a preview URL for every pushed branch and posts it on the pull request.

## Slash commands (Claude Code)

| Command | What it does |
| --- | --- |
| `/feature_branch <task>` | Starts a task: new `<person>/<topic>` branch off the latest `development` |
| `/commit` | Commits the task's files with a message written from the diff |
| `/commit-push` | Same, then pushes the branch |
| `/push` | Pushes the current branch |
| `/pr_dev [title]` | Opens (or updates) the PR from the branch into `development` |
| `/pr_main [title]` | Opens the release PR from `development` into `main` (for Pavel) |

The commands refuse to commit or push on `development` or `main`.

## Commits

- Stage only the files that belong to the task, by name. Never `git add -A` or `git add .`.
- Conventional prefix (`feat:`, `fix:`, `refactor:`, `docs:`, `style:`, `test:`, `chore:`), first line under
  72 characters, body explains why.
- No AI attribution lines (no `Co-Authored-By: Claude`).

## Merging

- Into `development`: **Squash and merge**.
- Release into `main`: **merge commit, never squash** (squashing makes `main` and `development` diverge).

## Database (Supabase)

There is one Supabase project for every environment (free tier: no preview databases). A migration applied to it
is live for production at once, whatever branch the code is on. So every migration must work with the code
currently on `main` as well as the new code: add things, do not rename or drop until the old code is gone.
Migrations live in `supabase/migrations/`, named with the version Supabase recorded.

## Before a pull request

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build` must pass. Say in the PR how the change was checked
(tests, and what was tried in the browser).
