#!/usr/bin/env bash
# gpg for git's gpg.openpgp.program during tool sync: never auto-fetches or imports keys.
# sync.sh points GNUPGHOME at a throwaway keyring holding only the enrolled owner keys.
exec gpg --batch --no-auto-key-retrieve --no-auto-key-import "$@"
