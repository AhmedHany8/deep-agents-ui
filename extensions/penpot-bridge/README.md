# Deep Agents Penpot Bridge

This Chrome extension enables picking elements inside `https://penpot.app` (including when Penpot is inside an iframe) and sending element dev info + screenshot back to the Deep Agents UI chat input.

## Install

1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder:
   - `extensions/penpot-bridge`

## Use

1. Open Deep Agents UI with the Penpot panel visible.
2. Wait until the Penpot header button changes to **Add element to chat**.
3. Click **Add element to chat**.
4. In the Penpot iframe, click any element.
5. The selected element data appears in the chat input:
   - selector
   - bounds
   - text
   - HTML snippet
   - computed style snapshot
   - screenshot

Press `Esc` while picking to cancel.
