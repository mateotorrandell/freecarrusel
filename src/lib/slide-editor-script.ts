/**
 * Editing runtime injected into the slide iframe in edit mode ONLY.
 *
 * The preview and export paths never see this — they keep `sandbox=""` with no
 * scripts. Here the iframe runs with `allow-scripts` but WITHOUT
 * `allow-same-origin`, so the document sits in an opaque origin: it cannot
 * reach the parent DOM, cookies, or storage. The only channel is postMessage.
 *
 * Contract with the parent:
 *   iframe -> parent   { source: "oc-editor", type: "ready" | "select" | "change" }
 *   parent -> iframe   { source: "oc-host", type: "style" | "text" | "delete" | "duplicate" | "deselect" | "serialize" }
 */
export const SLIDE_EDITOR_SCRIPT = String.raw`
(function () {
  var selected = null;
  var dragging = null;
  var resizing = null;
  var HL = "__oc_hl__";
  // The last non-empty text selection made inside the selected block. Clicking
  // a colour swatch in the toolbar takes focus out of the iframe, which wipes
  // the live selection — without this cache every range edit would fall back to
  // recolouring the whole block.
  var lastRange = null;

  function post(msg) {
    msg.source = "oc-editor";
    parent.postMessage(msg, "*");
  }

  // ---- serialization -------------------------------------------------------
  // Strip every trace of the editor before handing HTML back to the app, so
  // what we save is exactly what preview and export will render.
  function serialize() {
    var clone = document.body.cloneNode(true);
    // The editing runtime lives in the body too — strip every trace of it,
    // including this very script tag.
    clone.querySelectorAll("#" + HL + ", #__oc_editor_style__, script").forEach(function (n) {
      n.remove();
    });
    clone.querySelectorAll("[data-oc-sel]").forEach(function (n) {
      n.removeAttribute("data-oc-sel");
    });
    clone.querySelectorAll("[contenteditable]").forEach(function (n) {
      n.removeAttribute("contenteditable");
    });
    return clone.innerHTML;
  }

  var lastEmitted = null;

  function emitChange(transient) {
    var html = serialize();
    // Selecting a block or leaving inline editing used to emit a "change" that
    // changed nothing, which armed a save and marked the slide dirty for no
    // reason. Only report real edits.
    if (html === lastEmitted) return;
    lastEmitted = html;
    post({ type: "change", html: html, transient: !!transient });
    if (!transient) emitLayers();
  }

  // ---- layer tree ---------------------------------------------------------
  // Nested markup is hard to reach by clicking alone (a headline is often a
  // wrapper around spans). The tree gives every node a direct way in.
  // Machinery and non-visual markup never belong in a layer list.
  var SKIP = { SCRIPT: 1, STYLE: 1, BR: 1, LINK: 1, META: 1, TEMPLATE: 1, HR: 1 };

  // Tags that only decorate text. A heading built as
  // "Programar<br>dejó de ser<span>escribir</span>" is a TEXT block to the
  // user, not a container — treating it as a group is what hid the text field.
  var INLINE = { SPAN: 1, B: 1, I: 1, EM: 1, STRONG: 1, U: 1, SMALL: 1, BR: 1, A: 1, MARK: 1, SUP: 1, SUB: 1 };

  function isTextBlock(el) {
    if (!(el.textContent || "").trim()) return false;
    for (var j = 0; j < el.children.length; j++) {
      if (!INLINE[el.children[j].tagName]) return false;
    }
    return true;
  }

  // <br> is a line break to the user. Flattening it away produced jammed text
  // like "Programardejo de ser" in the editor field.
  function textOf(el) {
    var out = "";
    (function walk(n) {
      for (var i = 0; i < n.childNodes.length; i++) {
        var c = n.childNodes[i];
        if (c.nodeType === 3) out += c.nodeValue;
        else if (c.nodeType === 1) {
          if (c.tagName === "BR") out += "\n";
          else walk(c);
        }
      }
    })(el);
    return out.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim();
  }

  /** True when the block styles part of its text with nested tags. */
  function hasInlineChildren(el) {
    for (var j = 0; j < el.children.length; j++) {
      if (el.children[j].tagName !== "BR") return true;
    }
    return false;
  }

  function kindOf(el, depth) {
    var tag = el.tagName.toLowerCase();
    if (tag === "img") return "image";
    if (tag === "svg") return "icon";
    if (isTextBlock(el)) return "text";
    // The outermost element IS the slide background — Canva lists it, and it's
    // the only way to recolour the canvas or set its opacity.
    if (depth === 0) return "background";
    var cs = getComputedStyle(el);
    // Decoration: a box that paints something (gradient, image, colour, border)
    // but holds no text. The grid overlay and the gradient blob are these, and
    // dropping them from the list made them unreachable.
    var paints =
      (cs.backgroundImage && cs.backgroundImage !== "none") ||
      (cs.backgroundColor && cs.backgroundColor !== "rgba(0, 0, 0, 0)" && cs.backgroundColor !== "transparent") ||
      (cs.borderTopWidth && parseFloat(cs.borderTopWidth) > 0);
    if (paints && !(el.textContent || "").trim()) return "shape";
    return "group";
  }

  // The name shown in the layer list and the properties header. A design that
  // tags its blocks with data-label reads like Canva; without it we fall back
  // to the copy itself, and only then to a generic name chosen by the panel.
  function labelFor(el, kind) {
    var lbl = el.getAttribute && el.getAttribute("data-label");
    if (lbl) return lbl;
    if (kind === "image") {
      var src = el.getAttribute("src") || "";
      return el.getAttribute("alt") || src.split("/").pop() || "";
    }
    if (kind === "icon" || kind === "background" || kind === "shape") return "";
    var txt = textOf(el).replace(/\s+/g, " ").trim();
    return txt ? txt.slice(0, 30) : "";
  }

  function buildTree(el, depth, out) {
    // Last child paints on top, so the list is built back-to-front reversed:
    // the first row is the frontmost element.
    for (var i = el.children.length - 1; i >= 0; i--) {
      var c = el.children[i];
      if (c.id === HL || c.id === "__oc_editor_style__") continue;
      if (SKIP[c.tagName]) continue;

      var kind = kindOf(c, depth);

      // Fold away only true plumbing: a box with no size AND nothing painted.
      // Decorative layers (grid, gradient) are kept — they're part of the design.
      var rect = c.getBoundingClientRect();
      var isHidden = c.style.display === "none";
      if (!isHidden && kind === "group" && (rect.width < 2 || rect.height < 2)) {
        buildTree(c, depth, out);
        continue;
      }

      if (!c.__ocUid) c.__ocUid = "e" + ++uidSeq;
      out.push({
        uid: c.__ocUid,
        kind: kind,
        label: labelFor(c, kind),
        depth: depth,
        isText: kind === "text",
        // A hidden layer keeps its place in the list so it can be brought back.
        hidden: isHidden,
        // Only siblings can swap places, so the panel greys out the ends.
        canUp: !!c.nextElementSibling,
        canDown: !!c.previousElementSibling
      });
      if (out.length > 200) return out; // pathological markup guard

      // Text blocks, icons and shapes are leaves; only containers open up.
      if (kind === "group" || kind === "background") buildTree(c, depth + 1, out);
    }
    return out;
  }

  function emitLayers() {
    post({ type: "layers", layers: buildTree(document.body, 0, []) });
  }

  // ---- selection -----------------------------------------------------------
  function isEditableTarget(el) {
    return el && el !== document.body && el !== document.documentElement;
  }

  /**
   * Inline tags are formatting inside a text block, not layers of their own.
   * Clicking the accent word must select the whole headline — picking the
   * <span> is what made "escribir" behave like a separate text.
   */
  function resolveTarget(el) {
    var node = el;
    while (
      node &&
      node.parentElement &&
      INLINE[node.tagName] &&
      isEditableTarget(node.parentElement) &&
      isTextBlock(node.parentElement)
    ) {
      node = node.parentElement;
    }
    return node;
  }

  var uidSeq = 0;

  function describe(el) {
    var cs = getComputedStyle(el);
    var rect = el.getBoundingClientRect();
    // A block counts as text when its only element children are inline
    // decorations; a real container reports no text so editing can't wipe it.
    var onlyText = isTextBlock(el);
    // A stable identity for this element, kept as a JS property so it never
    // reaches the serialized HTML. The panel keys its text field on this: keying
    // on metrics instead made the field remount mid-keystroke (the width changes
    // as you type) and swallow characters.
    if (!el.__ocUid) el.__ocUid = "e" + ++uidSeq;

    return {
      uid: el.__ocUid,
      // A human role, not a tag name — the UI never shows markup.
      kind: kindOf(el, el.parentElement === document.body ? 0 : 1),
      label: labelFor(el, kindOf(el, el.parentElement === document.body ? 0 : 1)),
      // Wrappers report no text: concatenating their stray text nodes produced
      // nonsense like "Programardejó de ser", and editing it would wipe children.
      text: onlyText ? textOf(el) : "",
      isTextNode: onlyText,
      // Editing the text of a block with inline tags flattens them, so the
      // panel can warn instead of silently eating the accent colour.
      hasInlineFormatting: onlyText && hasInlineChildren(el),
      fontFamily: (cs.fontFamily || "").split(",")[0].replace(/['"]/g, "").trim(),
      fontSize: parseFloat(cs.fontSize) || 0,
      fontWeight: cs.fontWeight,
      lineHeight: cs.lineHeight,
      letterSpacing: cs.letterSpacing,
      textAlign: cs.textAlign,
      color: rgbToHex(cs.color),
      // Decorative layers (grids, gradient washes) live in background-image.
      // The panel needs it to offer "recolour the pattern" instead of a solid
      // fill that would paint straight over the whole slide.
      backgroundImage: cs.backgroundImage === "none" ? "" : cs.backgroundImage,
      // Together these say whether a gradient is a repeating PATTERN (a grid,
      // sized in px and tiled) or a single wash over the box (a scrim). They
      // need opposite controls, and treating a scrim as a pattern is what
      // flattened it into a solid colour.
      backgroundSize: cs.backgroundSize,
      backgroundRepeat: cs.backgroundRepeat,
      src: el.getAttribute("src") || "",
      fontStyle: cs.fontStyle,
      textDecoration: cs.textDecorationLine || cs.textDecoration || "",
      background: rgbToHex(cs.backgroundColor),
      opacity: cs.opacity,
      borderRadius: parseFloat(cs.borderRadius) || 0,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      // Offsets from the element's own style, not the viewport rect — these are
      // what the X/Y fields write back, so they must round-trip with dragging.
      offsetX: Math.round(parseFloat(cs.left) || 0),
      offsetY: Math.round(parseFloat(cs.top) || 0),
      position: cs.position,
      // Box in the slide's own coordinate space; the app scales it to place
      // the floating toolbar above the selection.
      rect: {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      },
      editing: !!el.isContentEditable
    };
  }

  // Returns "" for transparent so the panel can say "transparent" instead of
  // claiming the element has a white background it doesn't have.
  function rgbToHex(v) {
    if (!v || v === "transparent") return "";
    if (v.indexOf("#") === 0) return v;
    var m = v.match(/rgba?\(([^)]+)\)/);
    if (!m) return "";
    var p = m[1].split(",").map(function (x) { return parseFloat(x.trim()); });
    if (p.length > 3 && p[3] === 0) return "";
    return "#" + p.slice(0, 3).map(function (n) {
      var h = Math.round(n).toString(16);
      return h.length === 1 ? "0" + h : h;
    }).join("");
  }

  // ---- text ranges ---------------------------------------------------------
  /**
   * The range the toolbar should act on: the live selection when there is one,
   * otherwise the last one we saw inside this block. Returns null when there's
   * nothing highlighted, which is the signal to fall back to the whole block.
   */
  function usableRange() {
    var s = getSelection();
    if (s && s.rangeCount > 0 && !s.isCollapsed && selected &&
        selected.contains(s.getRangeAt(0).commonAncestorContainer)) {
      return s.getRangeAt(0);
    }
    if (lastRange && selected &&
        lastRange.commonAncestorContainer &&
        lastRange.commonAncestorContainer.isConnected &&
        selected.contains(lastRange.commonAncestorContainer) &&
        String(lastRange).length > 0) {
      return lastRange;
    }
    return null;
  }

  /**
   * Paint styles onto exactly the highlighted characters by wrapping them in a
   * span. execCommand was the old route; it only knew a handful of properties
   * and dropped the range the moment focus left the iframe.
   */
  function wrapRange(r, styles) {
    // Re-styling text that is already its own span updates that span instead of
    // nesting another one inside it — otherwise repeated tweaks pile up spans.
    var host = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement;
    if (host && host !== selected && INLINE[host.tagName] &&
        host.textContent === String(r) && selected.contains(host)) {
      applyStyles(host, styles);
      return host;
    }
    var span = document.createElement("span");
    applyStyles(span, styles);
    try {
      r.surroundContents(span);
    } catch (err) {
      // The range cuts across element boundaries; move the contents by hand.
      span.appendChild(r.extractContents());
      r.insertNode(span);
    }
    // Keep the same characters highlighted so the next click keeps working.
    var nr = document.createRange();
    nr.selectNodeContents(span);
    var s = getSelection();
    s.removeAllRanges();
    s.addRange(nr);
    lastRange = nr.cloneRange();
    return span;
  }

  function applyStyles(el, styles) {
    Object.keys(styles).forEach(function (k) {
      var v = styles[k];
      if (v === "" || v === null || v === undefined) el.style.removeProperty(hyphen(k));
      else el.style.setProperty(hyphen(k), String(v));
    });
  }

  /** describe(), but reporting the formatting of the highlighted run. */
  function describeRange(el, r) {
    var d = describe(el);
    var node = r.startContainer;
    var host = node.nodeType === 1 ? node : node.parentElement;
    if (host) {
      var cs = getComputedStyle(host);
      d.color = rgbToHex(cs.color);
      d.fontSize = parseFloat(cs.fontSize) || d.fontSize;
      d.fontWeight = cs.fontWeight;
      d.fontStyle = cs.fontStyle;
      d.textDecoration = cs.textDecorationLine || cs.textDecoration || "";
    }
    d.selectedText = String(r);
    return d;
  }

  document.addEventListener("selectionchange", function () {
    var s = getSelection();
    if (!s || s.rangeCount === 0 || s.isCollapsed || !selected) return;
    var r = s.getRangeAt(0);
    if (!selected.contains(r.commonAncestorContainer)) return;
    lastRange = r.cloneRange();
    // Report the run's own formatting so the toolbar's B / I / U light up for
    // what's highlighted rather than for the block as a whole.
    post({ type: "select", element: describeRange(selected, r) });
  });

  // Eight drag handles, named by the edges they move.
  var HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
  var CURSORS = {
    nw: "nwse-resize", n: "ns-resize", ne: "nesw-resize", e: "ew-resize",
    se: "nwse-resize", s: "ns-resize", sw: "nesw-resize", w: "ew-resize"
  };

  function buildBox() {
    var box = document.createElement("div");
    box.id = HL;
    box.style.cssText =
      "position:fixed;pointer-events:none;z-index:2147483647;" +
      "outline:2px solid #e94560;outline-offset:1px;border-radius:2px;";
    HANDLES.forEach(function (h) {
      var d = document.createElement("div");
      d.setAttribute("data-oc-handle", h);
      d.style.cssText =
        "position:absolute;width:10px;height:10px;background:#fff;" +
        "border:2px solid #e94560;border-radius:2px;pointer-events:auto;" +
        "cursor:" + CURSORS[h] + ";box-sizing:border-box;";
      if (h.indexOf("n") === 0) d.style.top = "-6px";
      if (h.indexOf("s") === 0) d.style.bottom = "-6px";
      if (h === "e" || h === "w") d.style.top = "calc(50% - 5px)";
      if (h === "n" || h === "s") d.style.left = "calc(50% - 5px)";
      if (h.indexOf("w") >= 0) d.style.left = "-6px";
      if (h.indexOf("e") >= 0) d.style.right = "-6px";
      box.appendChild(d);
    });
    document.body.appendChild(box);
    return box;
  }

  function highlight(el) {
    var box = document.getElementById(HL) || buildBox();
    if (!el) { box.style.display = "none"; return; }
    var r = el.getBoundingClientRect();
    box.style.display = "block";
    box.style.left = r.left + "px";
    box.style.top = r.top + "px";
    box.style.width = r.width + "px";
    box.style.height = r.height + "px";

    // A full-bleed element (the background) had its outline drawn just OUTSIDE
    // the slide, where the canvas clips it — so selecting the background looked
    // like nothing happened. Draw it inwards instead, and drop the resize grips:
    // the background is the slide, it doesn't get resized.
    var full =
      r.left <= 1 && r.top <= 1 &&
      r.width >= window.innerWidth - 1 &&
      r.height >= window.innerHeight - 1;
    box.style.outlineOffset = full ? "-3px" : "1px";
    var grips = box.querySelectorAll("[data-oc-handle]");
    for (var i = 0; i < grips.length; i++) {
      grips[i].style.display = full ? "none" : "block";
    }
  }

  function select(el) {
    if (selected) selected.removeAttribute("data-oc-sel");
    // A cached range only belongs to the block it was made in.
    if (el !== selected) lastRange = null;
    selected = el;
    if (el) {
      el.setAttribute("data-oc-sel", "1");
      highlight(el);
      post({ type: "select", element: describe(el) });
    } else {
      highlight(null);
      post({ type: "select", element: null });
    }
  }

  // ---- pointer interaction -------------------------------------------------
  document.addEventListener("mousedown", function (e) {
    var el = e.target;

    // Handles live in the overlay, not the slide — resize instead of select.
    var handle = el && el.getAttribute && el.getAttribute("data-oc-handle");
    if (handle && selected) {
      e.preventDefault();
      e.stopPropagation();
      var cs0 = getComputedStyle(selected);
      var r0 = selected.getBoundingClientRect();
      resizing = {
        el: selected,
        dir: handle,
        startX: e.clientX,
        startY: e.clientY,
        w: r0.width,
        h: r0.height,
        r0: { left: r0.left, top: r0.top, right: r0.right, bottom: r0.bottom },
        pos: cs0.position === "static" ? "relative" : cs0.position,
        baseLeft: parseFloat(cs0.left) || 0,
        baseTop: parseFloat(cs0.top) || 0
      };
      return;
    }

    if (!isEditableTarget(el)) { select(null); return; }
    if (el.isContentEditable) return; // let the caret work

    // Dragging always wins on mousedown. Entering text editing here instead
    // meant a selected block could never be moved again — you fell into the
    // caret every time. Double click is what opens the text (see below).
    e.preventDefault();
    el = resolveTarget(el);
    select(el);

    var cs = getComputedStyle(el);
    var startX = e.clientX, startY = e.clientY;
    var pos = cs.position === "static" ? "relative" : cs.position;
    var baseLeft = parseFloat(cs.left) || 0;
    var baseTop = parseFloat(cs.top) || 0;
    dragging = { el: el, startX: startX, startY: startY, pos: pos, baseLeft: baseLeft, baseTop: baseTop, moved: false };
  }, true);

  document.addEventListener("mousemove", function (e) {
    if (resizing) {
      var rdx = e.clientX - resizing.startX;
      var rdy = e.clientY - resizing.startY;
      var d = resizing.dir;
      var el2 = resizing.el;
      var nw = resizing.w, nh = resizing.h;

      if (d.indexOf("e") >= 0) nw = resizing.w + rdx;
      if (d.indexOf("w") >= 0) nw = resizing.w - rdx;
      if (d.indexOf("s") >= 0) nh = resizing.h + rdy;
      if (d.indexOf("n") >= 0) nh = resizing.h - rdy;

      el2.style.width = Math.max(8, Math.round(nw)) + "px";
      el2.style.height = Math.max(8, Math.round(nh)) + "px";

      // Resizing anchors the edge OPPOSITE the grip: drag the right edge and
      // the left one stays put. Measuring where the box actually landed is what
      // makes this hold — these blocks sit in flex layouts, so changing a size
      // re-flows the whole column and the element slides somewhere new. Offsets
      // computed from the starting numbers drifted, which is why resizing felt
      // like it was moving the element instead of resizing it.
      var r1 = el2.getBoundingClientRect();
      var fixLeft = d.indexOf("w") >= 0 ? resizing.r0.right - r1.right
                                        : resizing.r0.left - r1.left;
      var fixTop = d.indexOf("n") >= 0 ? resizing.r0.bottom - r1.bottom
                                       : resizing.r0.top - r1.top;
      if (Math.abs(fixLeft) > 0.5 || Math.abs(fixTop) > 0.5) {
        el2.style.position = resizing.pos;
        el2.style.left = Math.round(resizing.baseLeft + fixLeft) + "px";
        el2.style.top = Math.round(resizing.baseTop + fixTop) + "px";
      }
      highlight(el2);
      return;
    }
    if (!dragging) { return; }
    var dx = e.clientX - dragging.startX;
    var dy = e.clientY - dragging.startY;
    if (!dragging.moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
    dragging.moved = true;
    dragging.el.style.position = dragging.pos;
    dragging.el.style.left = dragging.baseLeft + dx + "px";
    dragging.el.style.top = dragging.baseTop + dy + "px";
    highlight(dragging.el);
  }, true);

  document.addEventListener("mouseup", function () {
    if (resizing) {
      post({ type: "select", element: describe(resizing.el) });
      emitChange();
      resizing = null;
      return;
    }
    if (dragging && dragging.moved) {
      post({ type: "select", element: describe(dragging.el) });
      emitChange();
    }
    dragging = null;
  }, true);

  // Escape walks up the tree — nested elements are otherwise hard to escape,
  // and reaching the slide background means selecting the outermost wrapper.
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape" || !selected) return;
    var p = selected.parentElement;
    if (p && isEditableTarget(p)) { e.preventDefault(); select(p); }
    else select(null);
  }, true);

  // Right click selects and asks the app to open its context menu at that point.
  // The menu is rendered by React outside the iframe so it can escape the slide
  // bounds; coordinates are mapped through the iframe's scale on that side.
  document.addEventListener("contextmenu", function (e) {
    var el = resolveTarget(e.target);
    if (!isEditableTarget(el)) return;
    e.preventDefault();
    select(el);
    post({ type: "contextmenu", x: e.clientX, y: e.clientY, element: describe(el) });
  }, true);

  // Double click starts inline text editing.
  document.addEventListener("dblclick", function (e) {
    var el = resolveTarget(e.target);
    if (!isEditableTarget(el)) return;
    e.preventDefault();
    el.setAttribute("contenteditable", "true");
    el.focus();
    // Drop the caret where the pointer is instead of selecting the whole block.
    // Selecting everything meant the next drag couldn't narrow it down, so you
    // could never format just a few words.
    var s = getSelection();
    s.removeAllRanges();
    var caret = document.caretRangeFromPoint
      ? document.caretRangeFromPoint(e.clientX, e.clientY)
      : null;
    if (caret) {
      s.addRange(caret);
    } else {
      var r = document.createRange();
      r.selectNodeContents(el);
      s.addRange(r);
    }
    post({ type: "editing", editing: true });
  }, true);

  document.addEventListener("focusout", function (e) {
    if (e.target && e.target.removeAttribute && e.target.isContentEditable) {
      e.target.removeAttribute("contenteditable");
      emitChange();
      if (e.target === selected) post({ type: "select", element: describe(e.target) });
    }
  }, true);

  window.addEventListener("scroll", function () { if (selected) highlight(selected); }, true);
  window.addEventListener("resize", function () { if (selected) highlight(selected); });

  // ---- commands from the app ----------------------------------------------
  window.addEventListener("message", function (e) {
    var d = e.data;
    if (!d || d.source !== "oc-host") return;

    if (d.type === "deselect") { select(null); return; }
    if (d.type === "serialize") { emitChange(); return; }
    if (d.type === "layers") { emitLayers(); return; }

    // Start inline editing from the panel, so rich blocks are edited where
    // their formatting survives.
    if (d.type === "editText" && selected) {
      selected.setAttribute("contenteditable", "true");
      selected.focus();
      var rr = document.createRange();
      rr.selectNodeContents(selected);
      var ss = getSelection();
      ss.removeAllRanges();
      ss.addRange(rr);
      post({ type: "editing", editing: true });
      return;
    }

    // Select straight from the layer tree.
    if (d.type === "selectUid") {
      var all = document.body.querySelectorAll("*");
      for (var i = 0; i < all.length; i++) {
        if (all[i].__ocUid === d.uid) {
          select(all[i]);
          all[i].scrollIntoView({ block: "nearest" });
          return;
        }
      }
      return;
    }

    // --- layer commands: they take a uid so they work straight from the list,
    // without forcing a selection first ---
    if (d.type === "toggleHidden" || d.type === "move" ||
        d.type === "reorder" || d.type === "removeUid") {
      var all = document.body.querySelectorAll("*");
      var node = null;
      for (var k = 0; k < all.length; k++) {
        if (all[k].__ocUid === d.uid) { node = all[k]; break; }
      }
      if (!node) return;

      if (d.type === "toggleHidden") {
        // Hidden, not deleted: the markup stays so the eye can bring it back.
        node.style.display = node.style.display === "none" ? "" : "none";
      } else if (d.type === "removeUid") {
        if (selected === node) select(null);
        node.remove();
      } else if (d.type === "reorder") {
        var target = null;
        for (var j = 0; j < all.length; j++) {
          if (all[j].__ocUid === d.targetUid) { target = all[j]; break; }
        }
        // Only siblings can be restacked; moving a layer into another container
        // would silently change what it's positioned against.
        if (!target || target === node || target.parentNode !== node.parentNode) return;
        // The list runs front to back, so dropping ABOVE a row means painting
        // in front of it — which is LATER in the document.
        if (d.above) node.parentNode.insertBefore(node, target.nextSibling);
        else node.parentNode.insertBefore(node, target);
      } else {
        // "up" in the list is toward the front, which is LATER in the DOM.
        var sib = d.dir === "up" ? node.nextElementSibling : node.previousElementSibling;
        if (!sib) return;
        if (d.dir === "up") node.parentNode.insertBefore(sib, node);
        else node.parentNode.insertBefore(node, sib);
      }
      if (selected === node) highlight(node);
      emitChange();
      return;
    }

    if (!selected) return;

    if (d.type === "style") {
      // Two scopes, and the UI says which it means: the quick bar above the
      // canvas edits the HIGHLIGHTED RUN (that's how one block holds several
      // colours), the properties panel always edits the whole block.
      var r = d.scope === "range" ? usableRange() : null;
      if (r) {
        wrapRange(r, d.styles);
        highlight(selected);
        post({ type: "select", element: describeRange(selected, usableRange() || r) });
        emitChange(d.transient);
        return;
      }

      Object.keys(d.styles).forEach(function (k) {
        var v = d.styles[k];
        if (v === "" || v === null || v === undefined) selected.style.removeProperty(hyphen(k));
        else selected.style.setProperty(hyphen(k), String(v));
      });
      highlight(selected);
      post({ type: "select", element: describe(selected) });
      emitChange(d.transient);
      return;
    }

    if (d.type === "setSrc") {
      selected.setAttribute("src", String(d.value));
      // The natural size changes with the file; drop any stale explicit box so
      // the new photo isn't stretched into the old one's frame.
      highlight(selected);
      post({ type: "select", element: describe(selected) });
      emitChange();
      return;
    }

    if (d.type === "text") {
      // Refuse to rewrite a block that carries inline colours — doing so is
      // what turned the accent word white. Those are edited on the canvas,
      // where contentEditable keeps every run intact.
      if (hasInlineChildren(selected)) return;
      // Rebuild line breaks as <br> so what the user typed survives a round trip.
      var lines = String(d.text).split("\n");
      selected.innerHTML = "";
      for (var li = 0; li < lines.length; li++) {
        if (li > 0) selected.appendChild(document.createElement("br"));
        selected.appendChild(document.createTextNode(lines[li]));
      }
      highlight(selected);
      emitChange();
      return;
    }

    if (d.type === "delete") {
      var gone = selected;
      select(null);
      gone.remove();
      emitChange();
      return;
    }

    if (d.type === "duplicate") {
      var copy = selected.cloneNode(true);
      copy.removeAttribute("data-oc-sel");
      selected.parentNode.insertBefore(copy, selected.nextSibling);
      emitChange();
      return;
    }

    // Clipboard lives in the app, not the OS: the sandboxed frame has no
    // clipboard access, and we only ever move slide markup around anyway.
    if (d.type === "copy") {
      post({ type: "clipboard", html: selected.outerHTML });
      return;
    }

    if (d.type === "cut") {
      post({ type: "clipboard", html: selected.outerHTML });
      var cutEl = selected;
      select(null);
      cutEl.remove();
      emitChange();
      return;
    }

    if (d.type === "paste" && typeof d.html === "string") {
      var tmp = document.createElement("div");
      tmp.innerHTML = d.html;
      var node = tmp.firstElementChild;
      if (node) {
        node.removeAttribute("data-oc-sel");
        selected.parentNode.insertBefore(node, selected.nextSibling);
        select(node);
        emitChange();
      }
      return;
    }

    // Hand the app the element's markup so it can hand it to the AI.
    if (d.type === "describe") {
      post({
        type: "elementHtml",
        html: selected.outerHTML,
        element: describe(selected)
      });
      return;
    }
  });

  function hyphen(k) {
    return k.replace(/[A-Z]/g, function (m) { return "-" + m.toLowerCase(); });
  }

  var st = document.createElement("style");
  st.id = "__oc_editor_style__";
  st.textContent =
    "*{cursor:default!important}" +
    "[contenteditable=true]{cursor:text!important;outline:2px dashed #e94560!important}";
  document.head.appendChild(st);

  // Baseline for the no-op guard: this is the document as loaded.
  lastEmitted = serialize();
  post({ type: "ready" });
  emitLayers();
})();
`;
