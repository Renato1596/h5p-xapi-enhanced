# H5P xAPI Enhanced Tracker — WordPress Plugin

A WordPress plugin that adds **detailed xAPI tracking** to H5P content, sending rich statements to any LRS with a built-in admin settings page.

---

## Prerequisites

Before installing this plugin, you need the **official community H5P plugin for WordPress** already installed and active.

There are two H5P plugins available for WordPress — they are **not interchangeable**:

| Plugin | Source | Compatible |
|--------|--------|:----------:|
| **H5P** by H5P Group (community plugin) | [wordpress.org/plugins/h5p](https://wordpress.org/plugins/h5p/) | ✅ Yes |
| H5P block editor plugin (Gutenberg) | Pre-installed in some WP versions | ❌ No |

Install the community plugin first: **Dashboard → Plugins → Add New** → search "H5P" → install the one by **H5P Group** (50,000+ installs) → Activate.

---

## Why this plugin exists

H5P sends xAPI statements natively, but coverage is minimal:

| Content Type      | Native xAPI | What is missing |
|-------------------|:-----------:|-----------------|
| Interactive Video | ✅ partial | play, pause, seek, 25/50/75% milestones, time-on-task per question |
| Game Map          | ✅ partial | node navigation, time spent per node |
| Virtual Tour      | ✅ partial | scene navigation, hotspot clicks, time per scene |
| All others        | ✅ partial | `result.duration` missing from most statements |

This plugin adds all of the above, plus cleans up activity IDs and contextActivities hierarchy across all content types.

---

## How it works

H5P in WordPress runs inside an `<iframe>`. The `H5P.externalDispatcher` — the only xAPI interception point — lives inside that iframe. You cannot reach it from the parent WordPress page.

This plugin uses the official `h5p_alter_library_scripts` filter to inject scripts **inside** the H5P bundle before it renders. From there the tracker has direct access to `H5P`, `H5P.instances`, and `H5PIntegration` (which contains the logged-in WordPress user's data for the xAPI actor).

```
WordPress page
└── <iframe>
    ├── H5P runtime
    ├── H5P.InteractiveVideo / GameMap / ThreeImage...
    ├── js/config.js     ← injected by this plugin (LRS credentials + actor)
    └── js/tracker.js    ← injected by this plugin (tracking logic)
```

The `config.js` file is generated as a static file on the server every time you save the settings page. No dynamic PHP endpoints are involved during playback.

---

## Statements generated

### Interactive Video (`H5P.InteractiveVideo`) — Video xAPI Profile

| Event | Verb | Key result data |
|-------|------|-----------------|
| Played | `https://w3id.org/xapi/video/verbs/played` | playback position |
| Paused | `https://w3id.org/xapi/video/verbs/paused` | `duration` (watch time), progress, segments |
| Seeked | `https://w3id.org/xapi/video/verbs/seeked` | time-from, time-to |
| 25/50/75% milestone | `http://adlnet.gov/expapi/verbs/progressed` | `duration` to milestone, progress value |
| Video completed | `http://adlnet.gov/expapi/verbs/experienced` | `duration` (total effective watch time) |
| Question answered | *(native, pass-through)* | `duration` added (time from display to answer) |

### Game Map (`H5P.GameMap`)

| Event | Verb | Key result data |
|-------|------|-----------------|
| Node entered | `https://w3id.org/xapi/adl/verbs/navigated-in` | node ID and name |
| Node left | `http://adlnet.gov/expapi/verbs/experienced` | `duration` (time in node) |

### Virtual Tour (`H5P.ThreeImage`)

| Event | Verb | Key result data |
|-------|------|-----------------|
| Tour opened | `http://adlnet.gov/expapi/verbs/attempted` | tour activity |
| Scene entered | `http://adlnet.gov/expapi/verbs/attempted` | scene ID and name |
| Scene left | `http://adlnet.gov/expapi/verbs/completed` | `duration` (time in scene) |
| Hotspot / info clicked | `http://adlnet.gov/expapi/verbs/interacted` | hotspot name, time in scene |
| Tour closed (Exit button) | `http://adlnet.gov/expapi/verbs/experienced` | total `duration`, scenes visited count |

All other H5P content types: native statements forwarded to the LRS via pass-through, with actor added where missing and `result.duration` added to `completed` statements.

---

## Activity ID cleanup

H5P generates activity IDs like:
```
https://yoursite.com/wp-admin/admin-ajax.php?action=h5p_embed&id=1?subContentId=c0e6e211-...
```

This plugin rewrites them to clean, stable IRIs:
```
https://yoursite.com/page-where-h5p-is-embedded#h5p-1
https://yoursite.com/page-where-h5p-is-embedded#h5p-1/c0e6e211-...
```

It also fixes `contextActivities` to include the full hierarchy:
- `parent` → immediate container (e.g. the SingleChoiceSet containing the question)
- `grouping[0]` → the H5P content (Interactive Video, Game Map, etc.)
- `grouping[1]` → the WordPress page where the content is embedded
- `category` → H5P library identifier (unchanged)

---

## Installation

### 1. Upload the plugin

**Dashboard → Plugins → Add New → Upload Plugin** → select `h5p-xapi-enhanced.zip` → **Install Now** → **Activate**.

### 2. Configure

Go to **Settings → H5P xAPI Tracker** and enter:

- **LRS Endpoint** — xAPI base URL (e.g. `https://your-lrs.io/xapi`, no trailing slash)
- **LRS Username** — Basic Auth key or username
- **LRS Password** — Basic Auth secret or password

Click **Verify LRS Connection** to test immediately — no need to save first.

Click **Save Settings** — this generates `js/config.js` with your credentials. **You must save at least once for tracking to work.**

### 3. (Optional) Override via wp-config.php

For production deployments where credentials should not be in the database:

```php
define( 'H5PXAPI_LRS_ENDPOINT', 'https://your-lrs.io/xapi' );
define( 'H5PXAPI_LRS_USERNAME', 'your-username' );
define( 'H5PXAPI_LRS_PASSWORD', 'your-password' );
```

When constants are defined, the settings page fields are disabled and show a notice.

---

## Automatic updates from GitHub

This plugin uses [plugin-update-checker](https://github.com/YahnisElsts/plugin-update-checker) to receive updates directly from GitHub Releases — exactly like plugins from the WordPress.org directory.

When a new release is published at [github.com/Renato1596/h5p-xapi-enhanced](https://github.com/Renato1596/h5p-xapi-enhanced), WordPress will show the standard "Update Available" notification in the Plugins page.

---

## File structure

```
h5p-xapi-enhanced/
├── h5p-xapi-enhanced.php        ← main plugin file
├── js/
│   ├── tracker.js               ← tracking logic
│   └── config.js                ← auto-generated on settings save
└── plugin-update-checker/       ← update library
```

---

## Extending to other platforms

`tracker.js` is platform-agnostic — it only uses H5P's internal API. To port to another platform:

- **Moodle (mod_hvp)**: implement `local_h5pxapi_hvp_scripts()` in a local plugin's `lib.php`
- **Moodle (mod_h5pactivity)**: use a `postMessage` listener in the parent page
- **ILIAS**: create a UIHook plugin injecting scripts into the H5P template
- **Standalone**: include `tracker.js` directly in `index.html` — no injection needed

`tracker.js` is unchanged in all cases. Only the connector layer differs.

---

*Part of the xAPI Specialization course for Instructional Designers — Module 3: Advanced xAPI tracking with H5P*
