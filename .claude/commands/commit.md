---
allowed-tools: Bash(git add:*), Bash(git status:*), Bash(git commit:*), Bash(git diff:*), Bash(git log:*), Bash(git branch:*)
description: Analyze the task's changes and create a git commit
---

## Context

- Current branch: !`git branch --show-current`
- Current git status: !`git status`
- Unstaged changes: !`git diff`
- Staged changes: !`git diff --cached`
- Recent commits for style reference: !`git log --oneline -5`

## Task

### Guard: check the branch first

If the current branch is `development` or `main`, **stop: do not commit.** Work reaches them through a pull request
(`CONTRIBUTING.md`). Offer to run `/feature_branch`; uncommitted changes carry over to the new branch.

Continue only on a feature branch (`<person>/<topic>` or `hotfix/<topic>`).

### Then commit

1. Review all changes, staged and unstaged.
2. **Stage only the files belonging to this task**, by name: `git add path/one path/two`.
   Never `git add -A` or `git add .`. If it is not obvious which files belong to the task, ask.
3. Write the message from the diff:
   - Conventional prefix: `feat:`, `fix:`, `refactor:`, `docs:`, `style:`, `test:`, `chore:`
   - First line: concise summary, at most 72 characters
   - Body: why, not just what. Match the recent commits.
   - No `Co-Authored-By` or other AI attribution line.
4. Create the commit.
5. Report which files were committed and which were deliberately left unstaged.

Do not ask for a commit message: analyze the changes and write one.
