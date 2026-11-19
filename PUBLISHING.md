# Publish Fire Stick Easy Buttons

## Create the GitHub repository

1. Sign in to GitHub and choose New repository.
2. Name it fire-stick-easy-buttons.
3. Set the description to Large touch remote buttons and an A–Z app launcher for Fire TV in Home Assistant.
4. Choose Public so Marketplace can download the project.
5. Create the repository.
6. Upload the contents of this folder into the repository root. The JavaScript, hacs.json, README.md, LICENSE, example.yaml, preview.svg, and PUBLISHING.md belong directly in the root. Include card.test.cjs and .github/workflows.
7. Add topics such as home-assistant, hacs, lovelace, fire-tv, and dashboard. Keep Issues enabled.

Only upload this package folder. Review every file in the upload list before submitting.

## Test your first installation

1. Open your Home Assistant Marketplace.
2. Choose Add from link and paste your repository URL.
3. Install it as Dashboard content.
4. Reload the browser and add the card.
5. Select the Fire Stick entity from Android Debug Bridge.
6. Try Home, arrows, OK, Back, play/pause, and a few app launches.
7. Confirm app discovery, alphabetical order, phone sizing, and Chromebook touch controls.
8. Take a screenshot showing sample app names and controls. Replace preview.svg in the README with your screenshot after reviewing it for personal information.

The GitHub Validate workflow checks JavaScript syntax, automated behavior tests, and Marketplace package structure. Review any reported failures before release.

## Publish version 1.0.0

1. Open the repository's Releases page and choose Draft a new release.
2. Create the tag v1.0.0 on the default branch.
3. Use Fire Stick Easy Buttons 1.0.0 as the release title.
4. Describe the remote buttons, app discovery, and supported setup.
5. Attach fire-stick-easy-buttons.js to the release.
6. Publish the release.

At this point users can install it by adding your repository URL to Marketplace.

## Request inclusion in Marketplace search

1. Read the current catalog rules at https://contributors.home-assistant.io/marketplace/guides/catalog/.
2. Confirm the validation workflow passes and your repository meets all current catalog requirements.
3. Follow that guide to submit the repository to the catalog as a dashboard plugin.
4. Respond to review feedback. Catalog maintainers decide when to accept it.

A GitHub release and a custom repository installation do not automatically put the card in Marketplace search.

## Future updates

Edit the JavaScript and directions, increment VERSION, rerun the checks, and publish a new version tag and release asset. Marketplace uses the release version to offer updates.

