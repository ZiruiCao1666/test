# Calendar beginner split

This folder is a fresh split for beginners. It does not touch your current `client/app/(home)/calendar.jsx`, and it does not depend on the old `client/features/calendar` folder.

## Why this split

The current screen is carrying too many jobs in one file:

1. Connect to Canvas
2. Switch between calendar and overview
3. Create and manage custom tasks
4. Show item detail

For a beginner, the easiest split is by page function, not by tiny helper type.

## Files

- `CalendarScreenSimple.jsx`
  The shell file. It only puts the big sections together.
- `CalendarConnectSection.jsx`
  School name, token, connect button, clear button.
- `CalendarOverviewSection.jsx`
  Calendar / overview tabs, cards, and one simple detail modal.
- `CalendarTaskSection.jsx`
  Task form and task list.

## Recommended migration order

1. Keep all existing state and handlers inside the old `calendar.jsx` first.
2. Move only the JSX for the connect card into `CalendarConnectSection.jsx`.
3. Move the overview and calendar cards into `CalendarOverviewSection.jsx`.
4. Move the task form and task list into `CalendarTaskSection.jsx`.
5. Only after the UI is stable, extract repeated state logic into a custom hook.

## Important idea

For beginners, do not split everything at once.

- First split the big JSX blocks.
- Then pass props down from the old screen.
- Then, when the screen still works, extract logic.

That order is much safer than trying to move state, networking, helpers, and UI at the same time.
