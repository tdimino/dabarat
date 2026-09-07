"""HTML template assembly — reads static CSS/JS and builds the page shell."""

import html
import json
import os
import threading

_STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
_JS_DIR = os.path.join(_STATIC_DIR, "js")
_CSS_DIR = os.path.join(_STATIC_DIR, "css")

_JS_MODULES = [
    "state.js", "utils.js", "theme.js", "render.js",
    "frontmatter.js", "variables.js", "tags.js", "tabs.js",
    "annotations.js", "diff.js", "editor.js", "history-ui.js",
    "lightbox.js", "home.js",
    "polling.js", "init.js",
]

_CSS_MODULES = [
    "theme-variables.css", "base-layout.css", "typography.css",
    "annotations.css", "status-print.css", "responsive.css",
    "palette.css", "frontmatter.css", "variables-panel.css",
    "diff.css", "editor.css", "history-ui.css",
    "lightbox.css", "home.css",
]


def _read_static(filename):
    with open(os.path.join(_STATIC_DIR, filename)) as f:
        return f.read()


def _concat_modules(directory, modules):
    parts = []
    for mod in modules:
        with open(os.path.join(directory, mod)) as f:
            parts.append(f"/* ── {mod} ── */\n{f.read()}")
    return "\n\n".join(parts)


_BUNDLE_PATHS = (
    [os.path.join(_CSS_DIR, m) for m in _CSS_MODULES]
    + [os.path.join(_JS_DIR, m) for m in _JS_MODULES]
    + [os.path.join(_STATIC_DIR, "palette.js")]
)
_bundle_lock = threading.Lock()
_bundle = {"stamp": None, "css": "", "js": "", "palette": ""}


def _get_bundle():
    """Concatenated CSS/JS, rebuilt only when a module's mtime moves.

    31 stats per request (~50 µs) instead of 31 reads + ~550 KB of string
    assembly; editable installs still pick up edits on the next request,
    so there is no dev/installed split to remember."""
    try:
        stamp = max(os.stat(p).st_mtime_ns for p in _BUNDLE_PATHS)
    except OSError:
        stamp = None
    with _bundle_lock:
        if stamp is None or _bundle["stamp"] != stamp:
            _bundle["css"] = _concat_modules(_CSS_DIR, _CSS_MODULES)
            _bundle["js"] = _concat_modules(_JS_DIR, _JS_MODULES)
            _bundle["palette"] = _read_static("palette.js")
            _bundle["stamp"] = stamp
        return _bundle["css"], _bundle["js"], _bundle["palette"]


def get_html(title="dabarat", default_author="Tom", server_theme="", server_justify=False, port=3031):
    css, js, palette_js = _get_bundle()

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}</title>
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link rel="preconnect" href="https://cdnjs.cloudflare.com" crossorigin>
<link rel="preconnect" href="https://unpkg.com" crossorigin>
<link rel="preconnect" href="https://esm.sh" crossorigin>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<!-- Classic scripts stay parser-blocking on purpose: the inline bundle at
     the end of <body> uses marked/hljs at parse time, and defer would run
     these after it. They are pinned (no more @latest resolution round
     trips) and cached after the first load. -->
<!-- Pinned + SRI: a swapped CDN file runs same-origin against the file API
     (/api/save, /api/shutdown), so every classic script and stylesheet
     carries its sha384. Bump the hash with the version (curl | openssl
     dgst -sha384 -binary | base64). The esm.sh/Motion dynamic imports
     cannot carry SRI this way — residual, noted in the security review. -->
<script src="https://cdn.jsdelivr.net/npm/marked@15.0.12/marked.min.js" integrity="sha384-948ahk4ZmxYVYOc+rxN1H2gM1EJ2Duhp7uHtZ4WSLkV4Vtx5MUqnV+l7u9B+jFv+" crossorigin="anonymous"></script>
<script src="https://cdn.jsdelivr.net/npm/marked-footnote@1.4.0/dist/index.umd.min.js" integrity="sha384-U2JaaoXhDznoUlBasI0QYYOcShh12YmdJKK0MMebphXwGi+wTXwp0hB7lk3YKtgH" crossorigin="anonymous"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.4.15/purify.min.js" integrity="sha384-uUMu9JDY09vBzRf9SPcK2VgUj+W/70J6Soc+Dded5P474ElQ63iv9j5N3DE7Kp3N" crossorigin="anonymous"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js" integrity="sha384-F/bZzf7p3Joyp5psL90p/p89AZJsndkSoGwRpXcZhleCWhd8SnRuoYo4d0yirjJp" crossorigin="anonymous"></script>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600&family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Victor+Mono:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">
<!-- Hebrew families load on demand: render.js injects #dabarat-hebrew-fonts on the first document containing Hebrew (see ensureHebrewFonts) -->
<!-- Phosphor: the two weight stylesheets directly, not the JS package that
     redirected through the unpkg root and injected them anyway -->
<link rel="stylesheet" href="https://unpkg.com/@phosphor-icons/web@2.1.1/src/regular/style.css" integrity="sha384-6p9AefaqUhEVheRlj1mpAkbngHXy9mbYMrIdcIt4Jlc9lOLIablJq3bBsLOjGwZ7" crossorigin="anonymous">
<link rel="stylesheet" href="https://unpkg.com/@phosphor-icons/web@2.1.1/src/fill/style.css" integrity="sha384-pPVoXE8ft+zxKtxIDDI7SfTK6y95NHm4qa+hKEg/hs8VkjW5IP+9/dGOPCbDpUPl" crossorigin="anonymous">
<script src="https://cdn.jsdelivr.net/npm/@twemoji/api@17.0.3/dist/twemoji.min.js" integrity="sha384-Y5xukbGJwykbHHkTbLJykYLcBPFxrwipTbEh0puxhkz9CZ90raTPGe2Ks4vCxsYU" crossorigin="anonymous"></script>
<!-- Vibrant.js loads on demand (theme.js loadVibrant) — only the image-theme command needs it -->
<script type="module">
  try {{
    const {{ animate, stagger, spring }} = await import("https://cdn.jsdelivr.net/npm/@motionone/dom@10.18.0/+esm");
    window.Motion = {{ animate, stagger, spring }};
  }} catch (e) {{ /* Motion One unavailable — CSS fallback animations remain */ }}
</script>
<script type="module">
  /* Tiptap is loaded the first time edit mode is entered — twelve ESM
     imports no longer sit in every read-only page load. The promise is
     memoized; enterEditMode awaits it and falls back to the textarea on
     failure. */
  window.loadTiptap = () => {{
    if (window.Tiptap) return Promise.resolve(window.Tiptap);
    if (window._tiptapLoading) return window._tiptapLoading;
    window._tiptapLoading = (async () => {{
      const base = "https://esm.sh/@tiptap/";
      const [{{ Editor }}, StarterKit, {{ Markdown }}, TaskList, TaskItem, Table, TableRow,
             TableCell, TableHeader, Placeholder, Link, Image] = await Promise.all([
        import(base + "core@2.27.2"),
        import(base + "starter-kit@2.27.2").then(m => m.default),
        import("https://esm.sh/tiptap-markdown@0.8.10"),
        import(base + "extension-task-list@2.27.2").then(m => m.default),
        import(base + "extension-task-item@2.27.2").then(m => m.default),
        import(base + "extension-table@2.27.2").then(m => m.default),
        import(base + "extension-table-row@2.27.2").then(m => m.default),
        import(base + "extension-table-cell@2.27.2").then(m => m.default),
        import(base + "extension-table-header@2.27.2").then(m => m.default),
        import(base + "extension-placeholder@2.27.2").then(m => m.default),
        import(base + "extension-link@2.27.2").then(m => m.default),
        import(base + "extension-image@2.27.2").then(m => m.default),
      ]);
      window.Tiptap = {{ Editor, StarterKit, Markdown, TaskList, TaskItem,
                         Table, TableRow, TableCell, TableHeader, Placeholder, Link, Image }};
      return window.Tiptap;
    }})().catch((e) => {{ window._tiptapLoading = null; throw e; }});
    return window._tiptapLoading;
  }};
</script>
<script>(function(){{var v=['ink','vellum','mocha','latte','rose-pine','rose-pine-dawn','tokyo-storm','tokyo-light','_custom'];var p=new URLSearchParams(window.location.search);var qt=p.get('theme');var st={json.dumps(server_theme)};var t=(qt&&v.indexOf(qt)!==-1)?qt:localStorage.getItem('dabarat-theme')||localStorage.getItem('mdpreview-theme')||(st&&v.indexOf(st)!==-1?st:'')||'mocha';if(v.indexOf(t)===-1)t='mocha';document.documentElement.setAttribute('data-theme',t);try{{if(localStorage.getItem('dabarat-gutter-hidden')==='1')document.documentElement.classList.add('gutter-hidden')}}catch(e){{}}if(p.get('export')==='1')document.documentElement.dataset.export='1';var dd=p.get('date');if(dd)document.documentElement.dataset.date=dd;if(t==='_custom'){{try{{var a=localStorage.getItem('dabarat-custom-active')||localStorage.getItem('mdpreview-custom-active');if(a){{var th=JSON.parse(localStorage.getItem('dabarat-custom-themes')||localStorage.getItem('mdpreview-custom-themes')||'[]');for(var i=0;i<th.length;i++){{if(th[i].id===a&&th[i].variables){{var s=document.createElement('style');s.id='custom-theme-style';var r='';var vr=th[i].variables;for(var k in vr){{if(vr.hasOwnProperty(k))r+=k+':'+vr[k]+';'}}s.textContent='[data-theme="_custom"]{{'+r+'}}';document.head.appendChild(s);break}}}}}}}}catch(e){{document.documentElement.setAttribute('data-theme','mocha')}}}}}})()</script>
<style>
{css}
</style>
<script>
  window.DABARAT_CONFIG = {{ defaultAuthor: {json.dumps(default_author)}, justify: {json.dumps(bool(server_justify))}, port: {json.dumps(int(port))} }};
</script>
</head>
<body>
  <nav id="toc" aria-label="Document outline">
    <div id="toc-chrome">
      <button id="toc-toggle" title="Collapse (Cmd+\\)" onclick="toggleToc()"><i class="ph ph-caret-left"></i></button>
      <span class="chrome-spacer"></span>
      <div class="chrome-controls">
        <div class="chrome-group">
          <button class="ctrl-btn" onclick="adjustFont(-1)" title="Smaller"><i class="ph ph-minus"></i></button>
          <span id="font-size-display">15</span>
          <button class="ctrl-btn" onclick="adjustFont(1)" title="Larger"><i class="ph ph-plus"></i></button>
        </div>
        <div class="chrome-group">
          <i class="ph-fill ph-moon theme-icon icon-moon"></i>
          <div class="theme-switch">
            <input type="checkbox" id="theme-toggle" aria-label="Light theme" onchange="toggleTheme(event)">
            <label class="slider" for="theme-toggle"></label>
          </div>
          <i class="ph-fill ph-sun theme-icon icon-sun"></i>
        </div>
      </div>
    </div>
    <div id="toc-label">Index</div>
    <div id="toc-scroll">
      <ul id="toc-list"></ul>
    </div>
  </nav>
  <div id="toc-resize-handle"></div>
  <button id="toc-restore" title="Show sidebar (Cmd+\\)" onclick="toggleToc()"><i class="ph ph-caret-right"></i></button>

  <main id="main-area">
    <div id="tab-bar-wrapper"><div id="tab-bar" role="tablist" aria-label="Open documents"></div></div>
    <article id="content" aria-live="off"></article>
    <div id="diff-view" style="display:none">
      <div class="diff-header">
        <div class="diff-header-half">
          <span class="diff-filename" id="diff-left-name"></span>
          <span class="diff-badge diff-badge-current">Current</span>
        </div>
        <div class="diff-header-half">
          <span class="diff-filename" id="diff-right-name"></span>
          <span class="diff-badge diff-badge-compare">Compare</span>
        </div>
        <button class="btn diff-close-btn" id="diff-close-btn" title="Back to the document (Esc)">
          <i class="ph ph-x" aria-hidden="true"></i>Exit compare<kbd>Esc</kbd>
        </button>
      </div>
      <div class="diff-fm-bar" id="diff-fm-bar" style="display:none"></div>
      <div class="diff-stats-bar" id="diff-stats-bar"></div>
      <div class="diff-panels">
        <div class="diff-panel" id="diff-panel-left"></div>
        <div class="diff-resize-handle" id="diff-resize-handle"></div>
        <div class="diff-panel" id="diff-panel-right"></div>
      </div>
    </div>
    <div id="edit-view" style="display:none">
      <div class="edit-toolbar" role="toolbar" aria-label="Formatting">
        <span class="edit-mode-badge"><i class="ph ph-pencil-simple"></i> Editing</span>
        <button class="edit-fmt-btn" data-cmd="bold" title="Bold (Cmd+B)" aria-label="Bold"><i class="ph ph-text-bolder"></i></button>
        <button class="edit-fmt-btn" data-cmd="italic" title="Italic (Cmd+I)" aria-label="Italic"><i class="ph ph-text-italic"></i></button>
        <button class="edit-fmt-btn" data-cmd="strike" title="Strikethrough" aria-label="Strikethrough"><i class="ph ph-text-strikethrough"></i></button>
        <button class="edit-fmt-btn" data-cmd="link" title="Link" aria-label="Link"><i class="ph ph-link"></i></button>
        <span class="edit-toolbar-sep" role="separator"></span>
        <button class="edit-fmt-btn" data-cmd="heading" title="Heading" aria-label="Heading"><i class="ph ph-text-h"></i></button>
        <button class="edit-fmt-btn" data-cmd="bulletList" title="Bullet List" aria-label="Bullet list"><i class="ph ph-list-bullets"></i></button>
        <button class="edit-fmt-btn" data-cmd="orderedList" title="Numbered List" aria-label="Numbered list"><i class="ph ph-list-numbers"></i></button>
        <button class="edit-fmt-btn" data-cmd="taskList" title="Task List" aria-label="Task list"><i class="ph ph-check-square"></i></button>
        <span class="edit-toolbar-sep" role="separator"></span>
        <button class="edit-fmt-btn" data-cmd="code" title="Inline Code" aria-label="Inline code"><i class="ph ph-code"></i></button>
        <button class="edit-fmt-btn" data-cmd="codeBlock" title="Code Block" aria-label="Code block"><i class="ph ph-code-block"></i></button>
        <button class="edit-fmt-btn" data-cmd="blockquote" title="Blockquote" aria-label="Blockquote"><i class="ph ph-quotes"></i></button>
        <button class="edit-fmt-btn" data-cmd="horizontalRule" title="Horizontal Rule" aria-label="Horizontal rule"><i class="ph ph-minus"></i></button>
        <span class="spacer"></span>
        <span id="edit-status">Saved</span>
        <button id="edit-save-btn" title="Save (Cmd+S)"><i class="ph ph-floppy-disk"></i> Save</button>
        <button id="edit-discard-btn" title="Close (Cmd+Shift+E)"><i class="ph ph-x"></i> Close</button>
      </div>
      <div class="edit-body">
        <div id="tiptap-editor"></div>
      </div>
    </div>
  </main>

  <aside id="annotations-gutter" aria-label="Annotations and variables">
    <div class="ann-gutter-header">
      <div class="gutter-tabs">
        <button class="gutter-tab active" data-tab="notes" onclick="switchGutterTab('notes')">
          <i class="ph ph-chat-circle-dots"></i><span>Notes</span>
          <span class="gutter-tab-count" id="ann-gutter-count">0</span>
        </button>
        <button class="gutter-tab" data-tab="variables" onclick="switchGutterTab('variables')">
          <i class="ph ph-brackets-curly"></i><span>Vars</span>
          <span class="gutter-tab-count" id="var-gutter-count"></span>
        </button>
      </div>
      <button class="ann-gutter-close" id="ann-gutter-close" title="Hide notes" aria-label="Hide notes"><i class="ph ph-x"></i></button>
    </div>
    <div id="gutter-panel-notes">
      <div id="annotation-form" style="display:none;">
        <div class="ann-type-picker">
          <button class="ann-type-btn selected" data-type="comment"><i class="ph ph-chat-dots"></i>Comment</button>
          <button class="ann-type-btn" data-type="question"><i class="ph ph-question"></i>Question</button>
          <button class="ann-type-btn" data-type="suggestion"><i class="ph ph-lightbulb"></i>Suggestion</button>
          <button class="ann-type-btn" data-type="important"><i class="ph ph-flag"></i>Important</button>
          <button class="ann-type-btn" data-type="bookmark"><i class="ph ph-bookmark-simple"></i>Bookmark</button>
        </div>
        <div class="ann-form-label">Author</div>
        <input type="text" id="ann-author-input" value="">
        <div class="ann-form-label">Comment</div>
        <textarea id="ann-body-input" placeholder="Add a comment..." rows="3"></textarea>
        <div class="ann-form-actions">
          <button class="ann-btn-primary" id="ann-submit-btn">Comment</button>
          <button class="ann-btn-ghost" id="ann-cancel-btn">Cancel</button>
        </div>
      </div>
      <div id="annotations-list"></div>
    </div>
    <div id="gutter-panel-variables" style="display:none;">
      <div id="variables-toolbar"></div>
      <div id="variables-list"></div>
      <div id="variables-preview-bar" style="display:none;"></div>
    </div>
  </aside>

  <div id="annotate-carousel" role="toolbar" aria-label="Annotate selection">
    <button class="carousel-btn" data-type="comment"><i class="ph ph-chat-dots"></i><span>Comment</span></button>
    <button class="carousel-btn" data-type="question"><i class="ph ph-question"></i><span>Question</span></button>
    <button class="carousel-btn" data-type="suggestion"><i class="ph ph-lightbulb"></i><span>Suggest</span></button>
    <button class="carousel-btn" data-type="important"><i class="ph ph-flag"></i><span>Flag</span></button>
    <button class="carousel-btn" data-type="bookmark"><i class="ph ph-bookmark-simple"></i><span>Bookmark</span></button>
  </div>
  <div id="float-column">
    <button id="annotations-toggle" title="Notes"><span class="float-btn-label">Notes</span><i class="ph ph-chat-circle-dots"></i><span class="ann-count" id="ann-count-badge">0</span></button>
    <button id="edit-toggle" title="Edit (⇧⌘E)" onclick="enterEditMode()"><span class="float-btn-label">Edit</span><i class="ph ph-pencil-simple"></i></button>
    <button id="history-toggle" title="Version History (⇧⌘H)" onclick="openVersionPanel()"><span class="float-btn-label">History</span><i class="ph ph-clock-counter-clockwise"></i></button>
    <button id="justify-toggle" title="Justify text" onclick="toggleJustify()"><span class="float-btn-label">Justify</span><i class="ph ph-text-align-justify"></i></button>
  </div>

  <div id="version-panel">
    <div class="version-panel-header">
      <div class="version-panel-headings">
        <span class="version-panel-label"><i id="version-panel-icon" class="ph ph-clock-counter-clockwise"></i><span id="version-panel-title" role="heading" aria-level="2">History</span><span id="version-count-badge"></span></span>
        <span id="version-panel-filename"></span>
      </div>
      <button class="version-panel-close" onclick="closeVersionPanel()" title="Close"><i class="ph ph-x"></i></button>
    </div>
    <div class="version-timeline" id="version-timeline"></div>
  </div>

  <div id="lightbox-overlay" class="lightbox" aria-hidden="true">
    <button class="lightbox-close" aria-label="Close"><i class="ph ph-x"></i></button>
    <div class="lightbox-stage">
      <img id="lightbox-img" src="" alt="">
    </div>
    <div class="lightbox-caption" id="lightbox-caption"></div>
    <div class="lightbox-nav">
      <button class="lightbox-prev" aria-label="Previous"><i class="ph ph-caret-left"></i></button>
      <span class="lightbox-counter" id="lightbox-counter"></span>
      <button class="lightbox-next" aria-label="Next"><i class="ph ph-caret-right"></i></button>
    </div>
  </div>

  <div id="status">
    <button id="instance-indicator" title="Windows — click to list" aria-haspopup="dialog" aria-expanded="false"><i class="ph ph-stack"></i><span class="instance-port"></span><span class="instance-count"></span></button>
    <button id="status-copy-path" title="Copy path" onclick="navigator.clipboard.writeText(document.getElementById('status-filepath').textContent).then(()=>{{const i=this.querySelector('i');i.className='ph ph-check';this.classList.add('copied');setTimeout(()=>{{i.className='ph ph-copy';this.classList.remove('copied')}},1200)}}).catch(()=>{{}})"><i class="ph ph-copy"></i></button>
    <span class="filepath" id="status-filepath"></span>
    <button id="status-export-pdf" title="Export PDF" onclick="CommandPalette._runById('export-pdf')"><i class="ph ph-file-pdf"></i></button>
    <span id="word-count"></span>
    <span id="status-tags"></span>
    <span class="updated"><span class="dot"></span><span id="last-updated">connecting...</span></span>
  </div>

  <script>
{js}
  </script>
  <script>
{palette_js}
  </script>
</body>
</html>"""
