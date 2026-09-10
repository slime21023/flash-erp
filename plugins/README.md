Local FlashERP add-ons live in this directory and load at backend startup.

Each add-on is a directory named by its id with:

- `manifest.json` containing `apiVersion: "1"`, the normal module manifest fields, and a JavaScript `entry` inside the directory.
- The entry module exporting a setup function or `{ setup, dispose }`.

Set `FLASHERP_ENABLED_PLUGINS` to a comma-separated allowlist when only some local add-ons should load. Deployment or removal requires a backend restart.
