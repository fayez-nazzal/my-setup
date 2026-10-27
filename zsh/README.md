# zsh

## Install

The installer links these. By hand:

```sh
ln -sfn ~/my-setup/zsh/.zshenv   ~/.zshenv
ln -sfn ~/my-setup/zsh/.zprofile ~/.zprofile
ln -sfn ~/my-setup/zsh/.zshrc    ~/.zshrc
ln -sfn ~/my-setup/zsh/.config/zsh ~/.config/zsh
```

The installer does not change your login shell. On Linux run
`chsh -s "$(command -v zsh)"` and log in again.

## How it loads

1. `.zshenv` runs in every shell.
2. `.zprofile` runs in login shells and loads `profile.d/*.zsh`: Homebrew,
   PATH, Corretto 21 `JAVA_HOME`, and OrbStack when present.
3. `.zshrc` runs in interactive shells and loads `rc.d/*.zsh` in name order:
   GPG terminal setup, prompt, tool setup, history, key bindings, aliases,
   completion, and zoxide.

Each file is loaded once, so sourcing again is safe.

The optional `java-home` installer choice requires Amazon Corretto 21 and
`zsh-config`. Its `profile.d/30-java-home.zsh` finds a Corretto 21 JDK by its
release metadata, sets `JAVA_HOME`, and prepends its `bin` directory to PATH
in login shells. It does not modify other JDK installations; no machine-specific
path is written.

## OMP credentials

`omp` starts in a subshell and reads the scoped OMP service-account token from
the OS credential store once, at launch (`_keychain_secret` in
`rc.d/65-secrets.zsh`). It checks the token with `op whoami` before starting
OMP, then exports `OP_SERVICE_ACCOUNT_TOKEN` to OMP and reads the Perplexity
key from the `OMP` vault once, also at launch. An inherited
`PERPLEXITY_API_KEY` is ignored. The other OMP keys resolve from the `op://`
references in `models.yml` and `mcp.json` with that token, with no further
prompts. The calling shell never receives the token. Shells never run
`op signin`, and `omp` never signs into your personal 1Password account. If the
token is missing, empty, malformed, revoked, or cannot authenticate, or `op`
is absent, OMP does not start; there is no
personal or plaintext fallback. A Perplexity lookup failure warns, and OMP still
starts; `web_search` then reports the missing key.

The exported variables are visible to OMP's bash tool. The `bash.patterns` deny
rules in `.omp/agent/config.yml` limit commands; they do not hide environment
variables.

On macOS the token item is created with no trusted applications (`-T ""`), so
macOS asks for Keychain access on each read; `omp` reads it once per launch.
Choose **Allow**. Do not choose **Always Allow**: it adds `/usr/bin/security` to
the item's access list and later launches stop prompting. Deny, or dismissing
the prompt, stops `omp` before it starts.

### Repair or create the OMP token (macOS)

Run this in your own terminal, not an agent's non-interactive shell:

```sh
zsh ~/my-setup/bin/omp-setup-credentials
```

This explicitly signs into your personal 1Password account for setup only,
creates a service account restricted to `OMP:read_items`, and saves the token
directly to Keychain. It verifies all five credential references below before
replacing the launch token. No token is printed, written to a file, or passed
as a process argument. The previous token is backed up in another Keychain
item; the command prints that item's name. If validation fails, the original
item remains unchanged and the candidate token stays in Keychain.

The launch item is recreated with `-T ""`: updating it with `-U` does **not**
remove an existing trusted-application grant. Afterward, open a new shell,
start `omp`, and choose **Allow**, not **Always Allow**. Revoke the obsolete
service account in 1Password after verifying the replacement.

`failed to DecodeSACredentials` / `unexpected end of JSON input` means the
stored token is malformed or truncated. Unlocking Keychain only grants access
to the stored value; it cannot repair that value. A trusted `/usr/bin/security`
entry explains missing access prompts independently of token validity.

Clipbolt is separate: its MCP URL is `http://localhost:3002/api/mcp`. It needs
the local Clipbolt MCP service running at that endpoint; it does not use the
OMP service-account token. Repairing credentials cannot start that service.
The Excalidraw `!command` header, in contrast, needs the OMP token: when its
`op read` fails, OMP omits the header and the server returns HTTP 401.

### Manual OMP token storage

Store the token once, outside argv and the checkout:

- macOS: `/usr/bin/security add-generic-password -a "$(id -un)" -s my-setup.omp.service-account -T "" -w`
  (enter the complete service-account token at the prompt, not your Keychain
  password; do not pass the token as an argument). For replacements, prefer
  the recovery command above: it validates and backs up before recreating the item.
- Linux: `secret-tool store --label='OMP service account' service my-setup.omp.service-account account "$(id -un)"`
  after installing `libsecret-tools` and keeping a Secret Service keyring unlocked.

Vault setup: the `OMP` vault holds the items OMP reads: `OMP ANTHROPIC`,
`OMP OPENAI`, `OpenRouter API Key - omp`, `OMP EXCALIDRAW`, and
`Perplexity Web Search`. Move them out of `Personal` (or recreate them with the
same titles and fields). Create the service account with only the read grant it
needs: `op service-account create "OMP runtime" --vault OMP:read_items`.

`omp` always reads `op://OMP/Perplexity Web Search/password`, ignoring an
inherited `PERPLEXITY_API_KEY`, and passes the key only to OMP's command
environment. If that item alone is unavailable, `web_search` reports it;
OMP still starts after its service-account authentication succeeds.

Limits: `.omp/agent/config.yml` denies bash commands that invoke `op`
(`bash.patterns` with `approval: deny`). That reduces what OMP's bash tool can do
with the token; it is not a sandbox. Interpreters, copied binaries, and other
same-user code can still reach the token or the keys. `security.enabled` only
turns on OMP's security scans and `security://`; it does not isolate commands.
Terminals opened before this change may still export `PERPLEXITY_API_KEY` or
`OP_*` session variables; open a new shell or unset them.

## Claude credentials

`claude` (`rc.d/71-claude.zsh`) reads its own Keychain item,
`my-setup.claude.excalidraw`, once at launch and exports it as
`MY_SETUP_CLAUDE_EXCALIDRAW_KEY` to the Claude process only. The Excalidraw MCP
entry in `~/.claude.json` uses `headersHelper`
`"$HOME/.local/bin/claude-excalidraw-header"`, which reads that variable. Claude
never uses the OMP token or `op`. If the key is missing, Claude still starts,
and the Excalidraw MCP server fails to authenticate. Store the key once, from a
hidden prompt:
`/usr/bin/security add-generic-password -a "$(id -un)" -s my-setup.claude.excalidraw -T "" -w`.


## Local settings

Put machine-only settings and secrets in `~/.config/zsh/local.zsh`. It loads
last and git ignores it.

## Tools it uses

starship, thefuck, fzf, fd, bat, eza, zoxide, zsh-abbr, killport, Volta,
pnpm, and the GitHub tools in [`../tools`](../tools/README.md). Each one is
optional; a missing tool is skipped. The installer offers all of them.

On Debian, `fd` installs as `fdfind` and `bat` may install as `batcat`. The
installer recognizes both.
