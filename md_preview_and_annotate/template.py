"""HTML template assembly — reads static CSS/JS and builds the page shell."""

import json
import os

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


def get_html(title="dabarat", default_author="Tom"):
    css = _concat_modules(_CSS_DIR, _CSS_MODULES)
    js = _concat_modules(_JS_DIR, _JS_MODULES)
    palette_js = _read_static("palette.js")

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Victor+Mono:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">
<script src="https://unpkg.com/@phosphor-icons/web@2.1.1"></script>
<script src="https://cdn.jsdelivr.net/npm/@twemoji/api@latest/dist/twemoji.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/vibrant.js/1.0.0/Vibrant.min.js"></script>
<script type="module">
  try {{
    const {{ animate, stagger, spring }} = await import("https://cdn.jsdelivr.net/npm/@motionone/dom@10.18.0/+esm");
    window.Motion = {{ animate, stagger, spring }};
  }} catch (e) {{ /* Motion One unavailable — CSS fallback animations remain */ }}
</script>
<script>(function(){{var v=['mocha','latte','rose-pine','rose-pine-dawn','tokyo-storm','tokyo-light','_custom'];var t=localStorage.getItem('dabarat-theme')||localStorage.getItem('mdpreview-theme')||'mocha';if(v.indexOf(t)===-1)t='mocha';document.documentElement.setAttribute('data-theme',t);if(t==='_custom'){{try{{var a=localStorage.getItem('dabarat-custom-active')||localStorage.getItem('mdpreview-custom-active');if(a){{var th=JSON.parse(localStorage.getItem('dabarat-custom-themes')||localStorage.getItem('mdpreview-custom-themes')||'[]');for(var i=0;i<th.length;i++){{if(th[i].id===a&&th[i].variables){{var s=document.createElement('style');s.id='custom-theme-style';var r='';var vr=th[i].variables;for(var k in vr){{if(vr.hasOwnProperty(k))r+=k+':'+vr[k]+';'}}s.textContent='[data-theme="_custom"]{{'+r+'}}';document.head.appendChild(s);break}}}}}}}}catch(e){{document.documentElement.setAttribute('data-theme','mocha')}}}}}})()</script>
<style>
{css}
</style>
<script>
  window.DABARAT_CONFIG = {{ defaultAuthor: {json.dumps(default_author)} }};
</script>
</head>
<body>
  <nav id="toc">
    <div id="toc-chrome">
      <button id="toc-toggle" title="Collapse" onclick="toggleToc()"><i class="ph ph-caret-left"></i></button>
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
            <input type="checkbox" id="theme-toggle" onchange="toggleTheme(event)">
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
  <button id="toc-restore" title="Show sidebar" onclick="toggleToc()"><i class="ph ph-caret-right"></i></button>

  <div id="main-area">
    <div id="tab-bar"></div>
    <div id="content"></div>
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
        <button class="diff-close-btn" id="diff-close-btn" title="Exit diff (Esc)">
          <i class="ph ph-x"></i>
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
      <div class="edit-toolbar">
        <span class="edit-toolbar-label">Edit</span>
        <span class="spacer"></span>
        <span id="edit-status">Saved</span>
        <button id="edit-save-btn" title="Save (Cmd+S)"><i class="ph ph-floppy-disk"></i> Save</button>
        <button id="edit-discard-btn" title="Discard & Exit (Cmd+E)"><i class="ph ph-x"></i> Close</button>
      </div>
      <div class="edit-body">
        <div class="edit-gutter"><canvas id="edit-gutter-canvas" width="4" height="0"></canvas></div>
        <textarea id="edit-textarea" spellcheck="true" placeholder="Start writing..."></textarea>
      </div>
    </div>
  </div>

  <div id="annotations-gutter">
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
      <button class="ann-gutter-close" id="ann-gutter-close" title="Close"><i class="ph ph-x"></i></button>
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
  </div>

  <div id="annotate-carousel">
    <button class="carousel-btn" data-type="comment"><i class="ph ph-chat-dots"></i><span>Comment</span></button>
    <button class="carousel-btn" data-type="question"><i class="ph ph-question"></i><span>Question</span></button>
    <button class="carousel-btn" data-type="suggestion"><i class="ph ph-lightbulb"></i><span>Suggest</span></button>
    <button class="carousel-btn" data-type="important"><i class="ph ph-flag"></i><span>Flag</span></button>
    <button class="carousel-btn" data-type="bookmark"><i class="ph ph-bookmark-simple"></i><span>Bookmark</span></button>
  </div>
  <button id="annotations-toggle" title="Annotations"><i class="ph ph-chat-circle-dots"></i><span class="ann-count" id="ann-count-badge">0</span></button>

  <div id="version-panel">
    <div class="version-panel-header">
      <span class="version-panel-label">History</span>
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
    <span class="filepath" id="status-filepath"></span>
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
