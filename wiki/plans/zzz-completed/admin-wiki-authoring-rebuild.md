# Admin Wiki Authoring Rebuild

[← All plans](index.md) · **Status:** Implemented

Replace the legacy AdventurePlan admin flow with a per-adventure wiki authoring surface where chat is primary, key-field editing is secondary, and canonical source writes go to S3.

## Decisions
- Default adventure improvement is the first scope; creating new adventures stays deferred.
- Admin chat applies changes directly to canonical wiki source instead of creating draft review queues.
- `content/settings/{settingId}/...` on S3 is the canonical admin source; repo-local content is a bootstrap and dev fallback.
- Direct editing is limited to key fields for markdown and character JSON, not raw source editing.
- Every chat, key-field, or restore write creates an S3-backed authoring revision that can restore the full draft or a selected file.

## Implementation shape
- Add complete source-tree loading, revision restore, and change-set writes for wiki adventures.
- Compile the gameplay runtime from S3 source when available, falling back to migrated repo-local content.
- Replace the admin dashboard entry with `/admin/wiki-adventures` and per-adventure editor routes.
- Keep validation visible after each chat or key-field save.

## Validation
Focused admin-authoring check, migrated adventure bridge checks, TypeScript, build, and route smoke where practical.
