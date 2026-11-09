# Computer disk usage report

Measured on 2026-11-06. Sizes are approximate binary units from `du` and `df`.
Files can change during a scan. Some system directories were unreadable without
administrator access; these are measured accessible totals, not a complete audit.

## Drive

- Main filesystem: 233 GiB total, initially 210 GiB used, 12 GiB available (95%).
- After Next.js compiler cache cleanup: approximately 209 GiB used, 13 GiB available.
- Home directory: approximately 172 GiB before cleanup.
- Snap loop mounts reporting 100% are read-only application images; the main
  filesystem is the relevant free-space measurement.

## Largest consumers

Rows overlap where a parent directory and its contents are both listed. Do not
add all rows together.

| Location | Approximate size | Findings / cleanup considerations |
| --- | ---: | --- |
| `~/Downloads` | 40 GiB | Telegram Desktop downloads account for 38 GiB. Review media before deleting. |
| `~/Desktop/Global/projects` | 28 GiB | Worldz-payment was about 12 GiB; wahala-alert-ng is 6.8 GiB. |
| `~/snap` | 18 GiB | App profiles/data: Brave 8.5 GiB, Telegram 2.6 GiB, Discord 1.6 GiB. Preserve profiles and sessions. |
| `~/.local` | 16 GiB | Includes pnpm, OpenCode and Trash below. |
| `/var/lib/snapd` | 14 GiB | Installed Snap packages and associated data; use Snap tools to manage revisions. |
| `worldz-payment/target` | 9.7 GiB | Rust build output: debug dependencies 7.7 GiB, incremental compilation 930 MiB, build scripts 657 MiB. Regenerable, but removal requires recompilation. |
| `~/.config` | 9.1 GiB | Chrome 6.2 GiB, VS Code 1.3 GiB. Contains settings and profiles, not just caches. |
| `~/.docker` | 8.1 GiB | Desktop data accounts for 8 GiB. Inspect images, containers and volumes before pruning; volumes may contain databases. |
| `~/.rustup` | 7.6 GiB | Installed Rust toolchains; remove only versions no longer needed. |
| `~/Android` | 6.5 GiB | Android SDK/tooling. Manage unused packages through SDK tools. |
| `~/.var/app/org.tenacityaudio.Tenacity/cache/tmp/tenacity-newking` | 6.2 GiB | Audio editor temporary data; may include unsaved/recoverable work. Save sessions and close Tenacity before considering cleanup. |
| `~/.local/share/opencode` | 6.2 GiB | Mostly top-level application data, not the log/snapshot subdirectories. Preserve history unless intentionally clearing it. |
| `~/.local/share/pnpm/store` | 5.7 GiB | Package store; prune unreferenced packages using pnpm rather than deleting installed dependencies. |
| `~/.gradle` | 5–5.8 GiB | Changed during the scan; caches account for 3.9–4.7 GiB. Build caches can be regenerated. |
| `~/.android` | 3.1 GiB | Android configuration/emulator data; inspect before removing. |
| `~/.npm` | 2.9 GiB | npm download cache 2.1 GiB; npx cache 815 MiB. Regenerable. |
| `~/.cache` | 2.7 GiB | Chrome cache 1.5 GiB and dotslash cache 789 MiB are the largest entries. |
| `~/.local/share/Trash` | 1.5 GiB | Empty only after confirming discarded files are no longer needed. |
| `/var/log` | 1.6 GiB | System logs; use system logging retention tools. |

Chrome's profile directory also includes a 2.67 GiB on-device model under
`~/.config/google-chrome/OptGuideOnDeviceModel`. Brave has two revision-specific
profile directories of about 3.24 GiB each; do not delete profile directories as
if they were ordinary caches.

## Next.js findings and changes

The scan found two `.next` directories outside skipped dependency/tool/cache/media
folders: worldz-payment (905 MiB initially) and Quai-Merchant (181 MiB, unchanged).
This is not an exhaustive scan inside all excluded directories.

Worldz-payment's compiler caches used approximately 778 MiB:

- Development Turbopack cache: 429 MiB.
- Production Turbopack cache: 124 MiB.
- Webpack cache: 226 MiB.
- SWC cache: 12 KiB.

Cleared only these four compiler cache directories. `.next` is now approximately
127 MiB, an 86% reduction. Existing production/development output, runtime caches,
image caches, source files and node_modules were preserved.

Disabled `experimental.turbopackFileSystemCacheForDev` and
`experimental.turbopackFileSystemCacheForBuild` in `frontend/next.config.ts`.
These settings trade warm restarts/builds for less persistent compiler storage;
they do not cap all `.next` output or alter application caching. See the
[official Next.js cache documentation](https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopackFileSystemCache).

Added `npm run clean:cache` in `frontend` for future compiler cache cleanup.
Stop build/development processes before running it. Explicit Webpack builds can
still create Webpack caches; the cleanup command removes those too.

Validation: TypeScript check passed; Next.js production configuration loader
accepted both cache settings and confirmed they are disabled. No full production
build was run, avoiding unnecessary build output during this storage task.

No personal media, Rust output, package stores, browser profiles, Docker data,
Trash or other projects were deleted or modified.

## Subsequent approved cleanup

After the user approved cleanup, removed the following regenerable files:

| Cleanup | Recovered approximately |
| --- | ---: |
| This project's `target/debug` | 9.37 GiB |
| npm `_cacache` and npx `_npx` | 2.86 GiB |
| Gradle `caches` | 4.63 GiB |
| Unused pnpm packages via `pnpm store prune` | 5.57 GiB |
| Selected app/tool caches | 0.94 GiB |

Approximately **23.4 GiB** recovered in this subsequent cleanup. Main filesystem
now reports **186 GiB used, 36 GiB available, 85% usage**. pnpm removed 250,827
files and 3,706 packages; its store shrank from 5,795 MiB to 91 MiB.

Selected caches: dotslash, pip, pnpm metadata, node-gyp, TypeScript, thumbnails
and Yarn. Read-only directories within the user-owned dotslash cache needed their
owner write permission restored before removal. Chrome was running, so its cache
was skipped. No running Rust or Gradle build was detected during cleanup.

Rust release/WASM output and installed node_modules were preserved. Personal
media, browser profiles, Docker data, audio-editor temporary work, Trash and
other projects were not deleted. Subsequent builds may take longer and require
dependency downloads. No rebuild was run during cleanup.
