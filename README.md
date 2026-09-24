# Todo App

A modern, responsive todo application built with vanilla JavaScript, HTML, and CSS.

## Features

- ✅ Add, complete, and delete tasks
- 📋 Filter tasks by status (All, Active, Completed)
- 💾 Persistent storage using localStorage
- 🎨 Beautiful gradient UI with smooth animations
- ♿ Fully accessible with ARIA labels
- 📱 Responsive design

## Project Structure

```
├── public/
│   └── index.html          # Main HTML file
├── src/
│   ├── css/
│   │   └── styles.css      # Stylesheet with design tokens
│   └── js/
│       └── app.js          # Todo app logic
├── package.json            # Project metadata
└── README.md              # This file
```

## Best Practices Applied

### Architecture
- **Class-based component** - TodoApp class encapsulates all logic
- **Separation of concerns** - HTML structure, CSS styling, JS behavior are separate
- **DOM caching** - Queries are cached for performance
- **Event delegation** - Efficient event handling

### Code Quality
- **No external dependencies** - Pure vanilla JavaScript
- **Accessible markup** - ARIA labels and semantic HTML
- **Input sanitization** - XSS prevention with `escapeHtml()`
- **Error handling** - Graceful fallbacks

### UI/UX
- **CSS Variables** - Easy theming with design tokens
- **Mobile responsive** - Works on all device sizes
- **Smooth animations** - Slide-in effect for new tasks
- **Clear visual feedback** - Hover states, focus states

### Performance
- **localStorage** - Data persists across sessions
- **Efficient rendering** - Only updates what changed
- **Optimized CSS** - Using flexbox and native features

## How to Run

```bash
npm run dev
# or
python3 -m http.server 8000
```

Then open `http://localhost:8000/public/` in your browser.

## Usage

1. Type a task in the input field
2. Press Enter or click "Add"
3. Click the checkbox to mark tasks complete
4. Click the × button to delete tasks
5. Use filter buttons to view specific task types
6. Tasks are automatically saved to browser storage
