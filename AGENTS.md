# Repository instructions

- At the start of each task in this repository, run `git fetch --prune origin` before editing. Check the working tree and build new work on the freshly fetched target branch. Use a separate worktree when needed to preserve existing changes.
- For code or documentation changes, verify the work, commit it on a feature branch, push the branch, and open a pull request by default. If the task already has a pull request, update it. Follow any explicit instruction from the user to keep the work local.
- Follow the project guidance in `CLAUDE.md` and `HANDOVER.md`.
- Add automated coverage for every new feature. Add a Playwright end-to-end test for each new user-facing feature and update its coverage entry in [TESTING.md](TESTING.md). Extend the relevant scenario for behavior changes and add a regression test when fixing a bug. Use the Firebase emulators for browser tests and run `npm test` before opening the pull request.
