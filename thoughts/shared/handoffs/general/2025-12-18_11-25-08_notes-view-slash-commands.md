---
date: 2025-12-18T11:25:08-0600
researcher: claude
git_commit: fc1301c
branch: main
repository: memex-for-my-thoughts
topic: "Notes View, Slash Commands, and Keyboard Shortcuts Implementation"
tags: [implementation, tiptap, notes, slash-commands, keyboard-shortcuts, convex]
status: complete
last_updated: 2025-12-18
last_updated_by: claude
type: implementation_strategy
---

# Handoff: Notes View with TipTap Editor, Slash Commands, and Keyboard Shortcuts

## Task(s)

### Completed
1. **Phase 1: Notes View & TipTap Editor** - Implemented full Notion-like notes view
   - Added "Notes" tab to view toggle (desktop and mobile)
   - Created NotesSidebar, NoteEditor, and NotesView components
   - Added `listNotes` and `findNoteByTitle` Convex queries
   - Wiki-links (`[[text]]`) navigate to existing notes or create new ones

2. **Phase 2: Slash Commands** - Added Notion-style `/` commands to editor
   - Commands: Text, H1, H2, H3, Bullet List, Numbered List, Quote, Code Block, Divider
   - Filterable by typing (e.g., `/head` filters to headings)
   - Keyboard navigation (arrow keys, Enter, Escape)

3. **Keyboard Shortcuts** - Added vim-style `g` leader key shortcuts
   - `g c` = Chat, `g v` = Canvas, `g n` = Notes
   - `g h` / `g l` = Previous/Next view
   - `g o` = New chat, `g n n` = New note, `g t` = Toggle theme

## Critical References
- `thoughts/shared/plans/phase1-notes-view-plan.md` - Original implementation plan
- `thoughts/shared/plans/phase2-slash-commands-plan.md` - Slash commands plan

## Recent changes
- `src/components/notes/NotesSidebar.tsx` - New file, sidebar for browsing notes
- `src/components/notes/NoteEditor.tsx` - New file, TipTap editor with wiki-links
- `src/components/notes/NotesView.tsx` - New file, container component
- `src/components/notes/CommandList.tsx` - New file, slash command menu UI
- `src/lib/tiptap/slash-commands.tsx` - New file, TipTap extension for `/` commands
- `src/lib/tiptap/wiki-link.ts` - Fixed TypeScript types, added `@tiptap/core` dependency
- `src/app/page.tsx` - Added Notes view, keyboard shortcuts with tinykeys
- `src/app/globals.css` - Added Notion-like editor styles, tippy.js styles
- `convex/canvas.ts` - Added `listNotes` and `findNoteByTitle` queries

## Learnings

### TipTap SSR Hydration
- Must set `immediatelyRender: false` in useEditor options for Next.js to avoid hydration mismatches
- See `src/components/notes/NoteEditor.tsx:71`

### TipTap Commands
- Use `setHeading({ level: 1 })` not `setNode("heading", { level: 1 })` for proper block conversion
- Use `setBlockquote()` and `setCodeBlock()` instead of toggle variants for cleaner slash command behavior
- The `@tiptap/core` package must be explicitly installed (not just starter-kit)

### Slash Commands with TipTap Suggestion
- TipTap's `@tiptap/suggestion` handles the hard parts (detection, filtering, keyboard nav)
- Use tippy.js for popup positioning - must style `.tippy-box` with `background: transparent !important`
- Register the React component for rendering via a setter function to avoid circular deps
- See `src/lib/tiptap/slash-commands.tsx:91-93` for the pattern

### Keyboard Shortcuts in Browser
- `react-hotkeys-hook` does NOT support key sequences like `g c` - only single combos
- `tinykeys` properly supports sequences with space-separated syntax: `"g c"`, `"g n n"`
- tinykeys has TypeScript export issues - use `// @ts-ignore` for the import
- Disable shortcuts in form fields with careful event handling (tinykeys handles this by default)

### Wiki-Link Navigation with Convex
- Can't call mutations inside TipTap extension callbacks directly
- Pattern: Set state (`pendingLinkTitle`), use conditional `useQuery` to find note, handle result in `useEffect`
- See `src/components/notes/NoteEditor.tsx:27-63` for the async navigation pattern

### Convex Query Pattern for Notes
- Filter notes by type in query: `nodes.filter((node) => node.type === "note")`
- Extract title from content: first line, strip `#` prefix and HTML tags
- Case-insensitive title matching for wiki-links

## Artifacts
- `src/components/notes/NotesSidebar.tsx` - Notes list sidebar
- `src/components/notes/NoteEditor.tsx` - TipTap editor component
- `src/components/notes/NotesView.tsx` - Main notes view container
- `src/components/notes/CommandList.tsx` - Slash command dropdown menu
- `src/lib/tiptap/slash-commands.tsx` - Slash command TipTap extension
- `src/lib/tiptap/wiki-link.ts` - Wiki-link TipTap extension (updated)
- `convex/canvas.ts:165-195` - `listNotes` and `findNoteByTitle` queries
- `src/app/globals.css:351-530` - Editor and command menu styles
- `thoughts/shared/plans/phase1-notes-view-plan.md` - Implementation plan
- `thoughts/shared/plans/phase2-slash-commands-plan.md` - Slash commands plan

## Action Items & Next Steps

### Potential Improvements
1. **Wiki-link Autocomplete** - When typing `[[`, show dropdown of existing note titles
2. **Backlinks Panel** - Show which notes link to the current note
3. **Canvas ↔ Notes Integration** - Navigate between canvas nodes and notes view
4. **Mobile Notes Sidebar** - Add mobile-optimized sidebar toggle for notes view
5. **Note Search** - Add search/filter in NotesSidebar

### Known Issues
- Pre-existing TypeScript errors in `convex/voiceNotes.ts` and `src/components/voice/VoiceRecorder.tsx` (voiceNotes table not in API types)
- New notes created via `g n n` shortcut don't auto-select in sidebar (need to pass ID back)

## Other Notes

### Package Dependencies Added
- `@tiptap/core` - Required for wiki-link extension
- `tippy.js` - Popup positioning for slash command menu  
- `tinykeys` - Keyboard shortcut sequences

### File Structure
```
src/components/notes/
├── CommandList.tsx    # Slash command dropdown UI
├── NoteEditor.tsx     # TipTap editor with wiki-links + slash commands
├── NotesSidebar.tsx   # Notes list with create/delete
└── NotesView.tsx      # Container combining sidebar + editor

src/lib/tiptap/
├── slash-commands.tsx # TipTap extension for / commands
└── wiki-link.ts       # TipTap extension for [[wiki-links]]
```

### Keyboard Shortcuts Reference
| Shortcut | Action |
|----------|--------|
| `g c` | Go to Chat |
| `g v` | Go to Canvas |
| `g n` | Go to Notes |
| `g n n` | Create new note |
| `g h` | Previous view |
| `g l` | Next view |
| `g o` | Open new chat |
| `g t` | Toggle theme |
