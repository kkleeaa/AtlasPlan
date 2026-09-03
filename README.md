AtlasPlan

AtlasPlan is an educational planning application designed to help teachers organize individualized learning support in a simple, warm, and privacy-conscious workspace.

The interface is inspired by Atlas, the app's friendly koala mascot, and uses soft pastel colors, rounded components, animal illustrations, and accessible typography.

## Main features

- **Teacher dashboard** with active student profiles, editable daily objectives, and recent activity.
- **Student profiles** using nicknames, initials, and animal avatars instead of real names.
- **PIA plan analysis** with privacy filtering, anonymization, and structured summaries.
- **Teaching packages** available to all teachers without prices or diagnosis-based filtering.
- **Individual student schedules** with editable lessons, linked objectives, drag-and-drop support, and completion indicators.
- **Qualitative progress tracking** focused on results achieved by each child.
- **Parent reports** with a separate preview for every student, plus print and PDF export options.
- **Communication table module** integrated into the main application.
- **Atlas AI assistant** and OpenAI-powered tools where an API key is provided.
- **Responsive design** for desktop, tablet, and mobile layouts.

## Privacy approach

AtlasPlan is designed to minimize the exposure of children's personal information:

- Student profiles use pseudonyms and initials.
- Medical diagnoses are removed from visible summaries.
- Uploaded filenames are not used as student names.
- PIA content is filtered to emphasize practical learning needs and strengths.
- The OpenAI API key is kept only in the current browser tab's memory by the main interface.
- A privacy consent checkbox is required before opening the application.

> [!IMPORTANT]
> This repository is a prototype. Before using it with real student information, add a secure backend, authentication, encrypted storage, access controls, and a formal privacy/security review. Browser-side API calls are not appropriate for production secrets.

## Technology

- HTML5
- CSS3
- Vanilla JavaScript
- SVG illustrations
- OpenAI API integration in the communication module

No frontend framework or build step is required.

## Run locally

Because the application loads local JSON and component files, serve it through a local HTTP server instead of opening `index.html` directly.

### Using Python

```bash
cd main
python server.py
```

Then open:

```text
http://127.0.0.1:4174/
```

The included development server also provides the same-origin API bridge required by all five communication-table modules. A basic static server can display the interface, but it cannot run AI material generation.

## API key

When the application starts:

1. Enter your OpenAI API key.
2. Read and accept the privacy notice.
3. Select **Hap aplikacionin**.

Never commit an API key to GitHub. If a key has been shared publicly, revoke it immediately and create a new one.

## Project structure

```text
hackathon/
├── main/
│   ├── assets/                         # Images, SVG illustrations, icons and videos
│   ├── components/
│   │   └── tabela-komunikimi/module/   # Communication table module
│   ├── css/                            # Global application styling
│   ├── data/                           # Local prototype data
│   ├── js/                             # Application logic and views
│   └── index.html                      # Main entry point
├── module/                             # Original module source
└── README.md
```

## Language

The complete user interface is written in Albanian. Code identifiers and documentation may use English where helpful for contributors.

## Current status
AtlasPlan is an educational hackathon prototype. It is intended for demonstration and continued development, not production use with sensitive student data.
