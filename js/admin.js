(function () {
  var EYE_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  var EYE_OFF_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

  var KITCHEN_OPTIONS = [
    "",
    "Cocina principal",
    "Mesa",
    "Bar",
    "Postres",
    "Mesa de postres",
  ];

  var menuState = null;
  var drawerTarget = null;
  var adminActiveView = "products";
  var expandedLibModId = null;

  /** Catálogo fijo de métodos de pago (debe coincidir con api/save-menu.php y js/products.js). */
  var CHECKOUT_PAY_CATALOG = [
    { id: "efectivo", label: "Efectivo" },
    { id: "pago_online", label: "Pago Online" },
    { id: "transferencia", label: "Transferencia" },
    { id: "pluxee_sodexo", label: "Pluxee (Sodexo)" },
    { id: "ticket_edenred", label: "Ticket Restaurant (Edenred)" },
    { id: "tarjeta", label: "Tarjeta" },
  ];

  function normalizeMenuCheckoutPayment(raw) {
    var src = raw && typeof raw === "object" && Array.isArray(raw.methods) ? raw.methods : [];
    var byId = {};
    var i;
    for (i = 0; i < src.length; i++) {
      var row = src[i];
      if (row && row.id) byId[row.id] = row;
    }
    var legacyGlobal =
      raw && typeof raw.instructions === "string" ? String(raw.instructions).trim().slice(0, 800) : "";
    var methods = CHECKOUT_PAY_CATALOG.map(function (def) {
      var s = byId[def.id];
      var enabled = s && s.enabled === false ? false : true;
      var lab =
        s && s.label && String(s.label).trim()
          ? String(s.label).trim().slice(0, 80)
          : def.label;
      var per =
        s && typeof s.instructions === "string" ? String(s.instructions).slice(0, 800) : "";
      if (def.id === "efectivo" && !per && legacyGlobal) {
        per = legacyGlobal;
      }
      return { id: def.id, label: lab, enabled: enabled, instructions: per };
    });
    return { methods: methods };
  }

  function syncCheckoutPaymentFromDom() {
    if (!menuState || !menuState.checkoutPayment) return;
    menuState.checkoutPayment.methods.forEach(function (m) {
      var cb = document.getElementById("pay-enable-" + m.id);
      if (cb) m.enabled = !!cb.checked;
      var ti = document.getElementById("pay-instr-" + m.id);
      if (ti) m.instructions = ti.value;
    });
  }

  function renderCheckoutPaymentAdmin() {
    var list = document.getElementById("admin-pay-methods-list");
    if (!list || !menuState || !menuState.checkoutPayment) return;
    list.innerHTML = "";
    menuState.checkoutPayment.methods.forEach(function (m) {
      var block = document.createElement("div");
      block.className = "admin-pay-method-block";
      var head = document.createElement("div");
      head.className = "admin-pay-method-block__head";
      var lab = document.createElement("label");
      lab.className = "admin-pay-method-block__toggle";
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.id = "pay-enable-" + m.id;
      cb.checked = !!m.enabled;
      lab.appendChild(cb);
      lab.appendChild(document.createTextNode(" " + m.label));
      head.appendChild(lab);
      block.appendChild(head);
      var ilab = document.createElement("label");
      ilab.className = "admin-pay-method-block__instr-label";
      ilab.setAttribute("for", "pay-instr-" + m.id);
      ilab.textContent = "Instrucciones para el cliente (solo si elige este método)";
      var ti = document.createElement("textarea");
      ti.id = "pay-instr-" + m.id;
      ti.className = "admin-checkout-payment__textarea admin-checkout-payment__textarea--method";
      ti.rows = 3;
      ti.maxLength = 800;
      ti.placeholder = "Ej.: «Presentar vale con monto legible» o «Solo débito».";
      ti.value = m.instructions || "";
      block.appendChild(ilab);
      block.appendChild(ti);
      list.appendChild(block);
    });
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function slugify(s) {
    var base = (s || "")
      .toString()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    return base || "item";
  }

  function uniqueProductId(name) {
    return slugify(name) + "-" + Date.now().toString(36);
  }

  function uniqueCategoryId(name) {
    return slugify(name) + "-" + Date.now().toString(36);
  }

  function uniqueModId() {
    return "mod-" + Date.now().toString(36);
  }

  function uniqueOptId() {
    return "opt-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function ensureModifierGroupDefaults(m) {
    if (!m || typeof m !== "object") return;
    if (!m.id) m.id = uniqueModId();
    if (typeof m.optional !== "boolean") m.optional = false;
    if (!Object.prototype.hasOwnProperty.call(m, "multiSelect")) {
      m.multiSelect = true;
    } else {
      m.multiSelect = !!m.multiSelect;
    }
    var minS = parseInt(String(m.minSelect), 10);
    m.minSelect = isNaN(minS) ? 0 : Math.max(0, Math.min(40, minS));
    var maxS = parseInt(String(m.maxSelect), 10);
    m.maxSelect = isNaN(maxS) ? 0 : Math.max(0, Math.min(40, maxS));
    if (!m.optional && m.multiSelect && m.minSelect < 1) m.minSelect = 1;
    if (!Array.isArray(m.options)) m.options = [];
    m.options.forEach(function (o) {
      if (!o || typeof o !== "object") return;
      if (!o.id) o.id = uniqueOptId();
      if (typeof o.price !== "number") o.price = parseInt(String(o.price), 10) || 0;
      var mq = parseInt(String(o.maxQty), 10);
      o.maxQty = isNaN(mq) ? 99 : Math.max(1, Math.min(99, mq));
      o.status = o.status === "hidden" ? "hidden" : "available";
      if (typeof o.sku !== "string") o.sku = o.sku == null ? "" : String(o.sku);
      if (o.cost != null && o.cost !== "" && !isNaN(Number(o.cost))) {
        o.cost = Math.round(Number(o.cost) * 100) / 100;
      } else {
        delete o.cost;
      }
      if (o.discount != null && o.discount !== "" && !isNaN(Number(o.discount))) {
        o.discount = Math.round(Number(o.discount) * 100) / 100;
      } else {
        delete o.discount;
      }
    });
  }

  function normalizeSearch(s) {
    return (s || "")
      .toString()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function ensureProductDefaults(p) {
    if (!p || typeof p !== "object") return;
    if (!Array.isArray(p.variants)) p.variants = [];
    if (!Array.isArray(p.modifiers)) p.modifiers = [];
    if (!Array.isArray(p.modifierIds)) p.modifierIds = [];
    if (p.pricingMode !== "variants") p.pricingMode = "simple";
    p.status = p.status === "hidden" ? "hidden" : "available";
    p.stockEnabled = !!p.stockEnabled;
    if (p.stockEnabled) {
      if (p.stock == null || p.stock === "" || isNaN(Number(p.stock))) p.stock = 0;
      else p.stock = Math.round(Number(p.stock)) || 0;
      if (p.minStock == null || p.minStock === "" || isNaN(Number(p.minStock))) p.minStock = 0;
      else p.minStock = Math.round(Number(p.minStock)) || 0;
      if (p.stock < 0) p.stock = 0;
      if (p.minStock < 0) p.minStock = 0;
    }
    if (typeof p.imageUrl !== "string") p.imageUrl = "";
    if (typeof p.sku !== "string") p.sku = "";
    if (typeof p.kitchen !== "string") p.kitchen = "";
    p.modifiers.forEach(function (m) {
      ensureModifierGroupDefaults(m);
    });
    if (p.pricingMode === "variants" && p.variants.length) {
      var nums = p.variants.map(function (v) {
        return Math.round(Number(v.price)) || 0;
      });
      p.price = Math.min.apply(null, nums);
    }
  }

  function formatCLP(n) {
    return (
      "$" +
      Math.round(Number(n) || 0)
        .toString()
        .replace(/\B(?=(\d{3})+(?!\d))/g, ".")
    );
  }

  function displayPriceLabel(p) {
    if (!p) return "$0";
    if (p.pricingMode === "variants" && p.variants && p.variants.length) {
      var prices = p.variants.map(function (v) {
        return Math.round(Number(v.price)) || 0;
      });
      var mn = Math.min.apply(null, prices);
      var mx = Math.max.apply(null, prices);
      if (mn === mx) return formatCLP(mn);
      return formatCLP(mn) + " – " + formatCLP(mx);
    }
    return formatCLP(p.price);
  }

  function serializeProduct(p) {
    ensureProductDefaults(p);
    var o = {
      id: String(p.id).trim(),
      name: String(p.name).trim(),
      price: Math.round(Number(p.price)) || 0,
    };
    if (p.description && String(p.description).trim()) {
      o.description = String(p.description).trim();
    }
    if (p.imageUrl && String(p.imageUrl).trim()) {
      o.imageUrl = String(p.imageUrl).trim();
    }
    if (p.sku && String(p.sku).trim()) o.sku = String(p.sku).trim();
    if (p.kitchen && String(p.kitchen).trim()) o.kitchen = String(p.kitchen).trim();
    if (p.status === "hidden") o.status = "hidden";
    if (p.pricingMode === "variants") {
      o.pricingMode = "variants";
      o.variants = (p.variants || []).map(function (v) {
        return {
          name: String(v.name || "").trim(),
          price: Math.round(Number(v.price)) || 0,
        };
      }).filter(function (v) {
        return v.name !== "";
      });
      if (o.variants.length) {
        var pr = o.variants.map(function (x) {
          return x.price;
        });
        o.price = Math.min.apply(null, pr);
      }
    }
    ["discount", "cost", "packaging"].forEach(function (k) {
      if (p[k] != null && p[k] !== "" && !isNaN(Number(p[k]))) {
        o[k] = Math.round(Number(p[k]) * 100) / 100;
      }
    });
    if (p.stockEnabled) {
      o.stockEnabled = true;
      o.stock = Math.max(0, Math.round(Number(p.stock)) || 0);
      o.minStock = Math.max(0, Math.round(Number(p.minStock)) || 0);
    }
    if (p.modifiers && p.modifiers.length) {
      o.modifiers = p.modifiers
        .map(function (m) {
          return serializeModifierGroupPayload(m);
        })
        .filter(function (m) {
          return m.name !== "";
        });
    }
    var validLib = Object.create(null);
    if (menuState && menuState.modifierLibrary) {
      menuState.modifierLibrary.forEach(function (g) {
        if (g && g.id) validLib[g.id] = true;
      });
    }
    if (p.modifierIds && p.modifierIds.length) {
      var mids = [];
      var seenM = Object.create(null);
      p.modifierIds.forEach(function (id) {
        var sid = String(id || "").trim();
        if (!sid || seenM[sid] || !validLib[sid]) return;
        seenM[sid] = true;
        mids.push(sid);
      });
      if (mids.length) o.modifierIds = mids;
    }
    return o;
  }

  function serializeModifierGroupPayload(m) {
    ensureModifierGroupDefaults(m);
    var out = {
      id: String(m.id || uniqueModId()).trim(),
      name: String(m.name || "").trim().slice(0, 150),
      optional: !!m.optional,
      multiSelect: !!m.multiSelect,
      minSelect: Math.max(0, Math.min(40, parseInt(String(m.minSelect), 10) || 0)),
      maxSelect: Math.max(0, Math.min(40, parseInt(String(m.maxSelect), 10) || 0)),
      options: [],
    };
    out.options = (m.options || [])
      .map(function (x) {
        var row = {
          id: String(x.id || uniqueOptId()).trim(),
          name: String(x.name || "").trim().slice(0, 120),
          price: Math.round(Number(x.price)) || 0,
          maxQty: Math.max(1, Math.min(99, parseInt(String(x.maxQty), 10) || 99)),
        };
        if (x.status === "hidden") row.status = "hidden";
        if (x.sku && String(x.sku).trim()) row.sku = String(x.sku).trim().slice(0, 80);
        if (x.cost != null && x.cost !== "" && !isNaN(Number(x.cost))) {
          row.cost = Math.round(Number(x.cost) * 100) / 100;
        }
        if (x.discount != null && x.discount !== "" && !isNaN(Number(x.discount))) {
          row.discount = Math.round(Number(x.discount) * 100) / 100;
        }
        return row;
      })
      .filter(function (x) {
        return x.name !== "";
      });
    return out;
  }

  function validateIds(payload) {
    var seen = Object.create(null);
    var i;
    var j;
    var id;
    for (i = 0; i < payload.categories.length; i++) {
      id = payload.categories[i].id;
      if (seen["c:" + id]) return 'ID de categoría repetido: "' + id + '".';
      seen["c:" + id] = true;
      for (j = 0; j < payload.categories[i].products.length; j++) {
        id = payload.categories[i].products[j].id;
        if (seen["p:" + id]) return 'ID de producto repetido: "' + id + '".';
        seen["p:" + id] = true;
      }
    }
    if (payload.modifierLibrary && payload.modifierLibrary.length) {
      for (i = 0; i < payload.modifierLibrary.length; i++) {
        id = payload.modifierLibrary[i].id;
        if (seen["m:" + id]) return 'ID de grupo de modificador repetido: "' + id + '".';
        seen["m:" + id] = true;
      }
    }
    return null;
  }

  function buildPayload() {
    syncCheckoutPaymentFromDom();
    var curEl = document.getElementById("currency-symbol");
    var currencySymbol =
      curEl && curEl.value.trim() ? curEl.value.trim() : "$";
    var logoEl = document.getElementById("logo-url");
    var logoUrl = logoEl && logoEl.value.trim() ? logoEl.value.trim() : "";
    var cp = menuState.checkoutPayment || normalizeMenuCheckoutPayment(null);
    return {
      logoUrl: logoUrl,
      currencySymbol: currencySymbol,
      checkoutPayment: {
        methods: cp.methods.map(function (m) {
          return {
            id: m.id,
            label: m.label,
            enabled: !!m.enabled,
            instructions: m.instructions != null ? String(m.instructions) : "",
          };
        }),
      },
      modifierLibrary: (menuState.modifierLibrary || [])
        .map(function (m) {
          return serializeModifierGroupPayload(m);
        })
        .filter(function (m) {
          return m.name !== "";
        }),
      categories: menuState.categories.map(function (cat) {
        var out = {
          id: cat.id.trim(),
          name: cat.name.trim(),
          products: cat.products.map(function (p) {
            return serializeProduct(p);
          }),
        };
        if (cat.layout === "row") out.layout = "row";
        return out;
      }),
    };
  }

  function showBanner(type, text) {
    var b = document.getElementById("admin-banner");
    if (!b) return;
    b.hidden = false;
    b.textContent = text;
    b.className = "admin-banner admin-banner--" + type;
  }

  function hideBanner() {
    var b = document.getElementById("admin-banner");
    if (!b) return;
    b.hidden = true;
    b.textContent = "";
  }

  function syncFromInputs(root) {
    if (!menuState) return;
    root.querySelectorAll("[data-cat-idx][data-field]").forEach(function (el) {
      var ci = parseInt(el.getAttribute("data-cat-idx"), 10);
      var cat = menuState.categories[ci];
      if (!cat) return;
      var piAttr = el.getAttribute("data-prod-idx");
      if (piAttr !== null) return;
      var field = el.getAttribute("data-field");
      if (field === "name") cat.name = el.value;
      else if (field === "id") cat.id = el.value;
      else if (field === "layout") cat.layout = el.checked ? "row" : "";
    });
    var cur = document.getElementById("currency-symbol");
    if (cur && cur.value.trim()) menuState.currencySymbol = cur.value.trim();
    var lg = document.getElementById("logo-url");
    if (lg) menuState.logoUrl = lg.value.trim();
  }

  function closeDetails(el) {
    var d = el && el.closest("details");
    if (d) d.open = false;
  }

  function closeProductDrawer() {
    drawerTarget = null;
    var drawer = document.getElementById("product-drawer");
    var back = document.getElementById("drawer-backdrop");
    var inner = document.getElementById("product-drawer-inner");
    if (drawer) {
      drawer.hidden = true;
      drawer.setAttribute("aria-hidden", "true");
    }
    if (back) back.hidden = true;
    if (inner) inner.innerHTML = "";
    document.body.classList.remove("olc-drawer-open");
  }

  function openProductDrawer(ci, pi) {
    if (!menuState || !menuState.categories[ci] || !menuState.categories[ci].products[pi]) {
      return;
    }
    drawerTarget = { ci: ci, pi: pi };
    var p = menuState.categories[ci].products[pi];
    ensureProductDefaults(p);

    var drawer = document.getElementById("product-drawer");
    var back = document.getElementById("drawer-backdrop");
    var inner = document.getElementById("product-drawer-inner");
    if (!drawer || !inner) return;

    inner.innerHTML = "";
    mountDrawerForm(inner, ci, pi);

    drawer.hidden = false;
    drawer.setAttribute("aria-hidden", "false");
    if (back) back.hidden = false;
    document.body.classList.add("olc-drawer-open");
  }

  function refreshProductRow(row, ci, pi) {
    if (!row || !menuState) return;
    var p = menuState.categories[ci] && menuState.categories[ci].products[pi];
    if (!p) return;
    ensureProductDefaults(p);
    var nameEl = row.querySelector(".olc-row-name");
    var subEl = row.querySelector(".olc-row-sub");
    var priceEl = row.querySelector(".olc-row-price-display");
    var thumb = row.querySelector(".olc-thumb");
    var eye = row.querySelector(".olc-row-eye");
    if (nameEl) nameEl.textContent = p.name || "Sin nombre";
    if (subEl) {
      var bits = [];
      if (p.description) bits.push(p.description);
      else bits.push(p.id);
      if (p.sku) bits.push("SKU: " + p.sku);
      subEl.textContent = bits.join(" · ");
    }
    if (priceEl) priceEl.textContent = displayPriceLabel(p);
    if (thumb) {
      if (p.imageUrl && String(p.imageUrl).trim()) {
        thumb.classList.add("olc-thumb--has-img");
        thumb.style.backgroundImage = 'url("' + String(p.imageUrl).trim().replace(/"/g, '\\"') + '")';
      } else {
        thumb.classList.remove("olc-thumb--has-img");
        thumb.style.backgroundImage = "";
      }
    }
    if (eye) {
      eye.innerHTML = p.status === "hidden" ? EYE_OFF_SVG : EYE_SVG;
      eye.title = p.status === "hidden" ? "Oculto en menú público" : "Visible en menú público";
    }
    row.setAttribute(
      "data-search",
      (p.name || "") + " " + (p.description || "") + " " + (p.id || "")
    );
  }

  function mountDrawerForm(host, ci, pi) {
    var p = menuState.categories[ci].products[pi];
    ensureProductDefaults(p);

    function syncPriceFromVariants() {
      if (p.pricingMode !== "variants" || !p.variants.length) return;
      var nums = p.variants.map(function (v) {
        return Math.round(Number(v.price)) || 0;
      });
      p.price = Math.min.apply(null, nums);
    }

    function section(title, hint) {
      var s = document.createElement("div");
      s.className = "d-section";
      var h = document.createElement("h3");
      h.className = "d-section__title";
      h.textContent = title;
      s.appendChild(h);
      if (hint) {
        var hi = document.createElement("p");
        hi.className = "d-section__hint";
        hi.textContent = hint;
        s.appendChild(hi);
      }
      return s;
    }

    var sPhoto = section("Foto del producto", "En sitio estático usa una URL pública de la imagen.");
    var uploadRow = document.createElement("div");
    uploadRow.className = "d-upload-row";
    var fakeBtn = document.createElement("div");
    fakeBtn.className = "d-upload-btn";
    fakeBtn.textContent = "URL imagen";
    var urlWrap = document.createElement("div");
    urlWrap.className = "d-floating";
    urlWrap.style.flex = "1";
    var urlLab = document.createElement("label");
    urlLab.textContent = "Enlace de imagen";
    var urlIn = document.createElement("input");
    urlIn.type = "url";
    urlIn.placeholder = "https://…";
    urlIn.value = p.imageUrl || "";
    urlIn.addEventListener("input", function () {
      p.imageUrl = urlIn.value;
      var row = document.querySelector(
        '.olc-product-row[data-ci="' + ci + '"][data-pi="' + pi + '"]'
      );
      refreshProductRow(row, ci, pi);
    });
    urlWrap.appendChild(urlLab);
    urlWrap.appendChild(urlIn);
    uploadRow.appendChild(fakeBtn);
    uploadRow.appendChild(urlWrap);
    sPhoto.appendChild(uploadRow);
    var iaRow = document.createElement("div");
    iaRow.className = "d-ia-row";
    var ia1 = document.createElement("button");
    ia1.type = "button";
    ia1.className = "d-ia-btn";
    ia1.textContent = "IA · Mejorar imagen";
    var ia2 = document.createElement("button");
    ia2.type = "button";
    ia2.className = "d-ia-btn";
    ia2.textContent = "IA · Generar descripción";
    sPhoto.appendChild(iaRow);
    iaRow.appendChild(ia1);
    iaRow.appendChild(ia2);
    host.appendChild(sPhoto);

    var sBasic = section("Datos básicos", null);
    var fn = document.createElement("div");
    fn.className = "d-floating";
    var fnl = document.createElement("label");
    fnl.textContent = "Nombre";
    var fni = document.createElement("input");
    fni.type = "text";
    fni.value = p.name;
    fni.addEventListener("input", function () {
      p.name = fni.value;
      var row = document.querySelector(
        '.olc-product-row[data-ci="' + ci + '"][data-pi="' + pi + '"]'
      );
      refreshProductRow(row, ci, pi);
    });
    fn.appendChild(fnl);
    fn.appendChild(fni);
    var fd = document.createElement("div");
    fd.className = "d-floating";
    var fdl = document.createElement("label");
    fdl.textContent = "Descripción";
    var fdi = document.createElement("textarea");
    fdi.value = p.description || "";
    fdi.addEventListener("input", function () {
      p.description = fdi.value;
      var row = document.querySelector(
        '.olc-product-row[data-ci="' + ci + '"][data-pi="' + pi + '"]'
      );
      refreshProductRow(row, ci, pi);
    });
    fd.appendChild(fdl);
    fd.appendChild(fdi);
    sBasic.appendChild(fn);
    sBasic.appendChild(fd);
    host.appendChild(sBasic);

    var sPrice = section("Precio(s)", null);
    var tabs = document.createElement("div");
    tabs.className = "d-mode-tabs";
    var tSimple = document.createElement("button");
    tSimple.type = "button";
    tSimple.textContent = "Simple";
    var tVar = document.createElement("button");
    tVar.type = "button";
    tVar.textContent = "Variantes";
    var simpleBlock = document.createElement("div");
    simpleBlock.className = "d-floating";
    var spl = document.createElement("label");
    spl.textContent = "Precio (CLP)";
    var spi = document.createElement("input");
    spi.type = "number";
    spi.min = "0";
    spi.step = "1";
    spi.value = String(p.price);
    spi.addEventListener("input", function () {
      p.price = parseInt(spi.value, 10) || 0;
      var row = document.querySelector(
        '.olc-product-row[data-ci="' + ci + '"][data-pi="' + pi + '"]'
      );
      refreshProductRow(row, ci, pi);
    });
    simpleBlock.appendChild(spl);
    simpleBlock.appendChild(spi);
    var varBlock = document.createElement("div");
    varBlock.hidden = p.pricingMode !== "variants";
    simpleBlock.hidden = p.pricingMode === "variants";

    function setMode(mode) {
      p.pricingMode = mode;
      if (mode === "variants") {
        if (!p.variants.length) {
          p.variants = [
            { name: "Para mesa", price: p.price || 0 },
            { name: "Recojo en local", price: p.price || 0 },
          ];
        }
        syncPriceFromVariants();
        tSimple.classList.remove("is-active");
        tVar.classList.add("is-active");
        simpleBlock.hidden = true;
        varBlock.hidden = false;
      } else {
        tSimple.classList.add("is-active");
        tVar.classList.remove("is-active");
        simpleBlock.hidden = false;
        varBlock.hidden = true;
      }
      renderVariants();
      var row = document.querySelector(
        '.olc-product-row[data-ci="' + ci + '"][data-pi="' + pi + '"]'
      );
      refreshProductRow(row, ci, pi);
    }

    if (p.pricingMode === "variants") {
      tVar.classList.add("is-active");
    } else {
      tSimple.classList.add("is-active");
    }
    tSimple.addEventListener("click", function () {
      setMode("simple");
    });
    tVar.addEventListener("click", function () {
      setMode("variants");
    });
    tabs.appendChild(tSimple);
    tabs.appendChild(tVar);
    sPrice.appendChild(tabs);
    sPrice.appendChild(simpleBlock);

    var varList = document.createElement("div");
    varBlock.appendChild(varList);
    var addVarBtn = document.createElement("button");
    addVarBtn.type = "button";
    addVarBtn.className = "d-btn-small d-btn-small--primary";
    addVarBtn.style.marginTop = "8px";
    addVarBtn.textContent = "+ Variante";
    addVarBtn.addEventListener("click", function () {
      p.variants.push({ name: "", price: 0 });
      renderVariants();
    });
    varBlock.appendChild(addVarBtn);

    function renderVariants() {
      varList.innerHTML = "";
      p.variants.forEach(function (v, vi) {
        var vr = document.createElement("div");
        vr.className = "d-opt-row";
        var vn = document.createElement("input");
        vn.type = "text";
        vn.placeholder = "Nombre variante";
        vn.value = v.name;
        vn.addEventListener("input", function () {
          v.name = vn.value;
          syncPriceFromVariants();
          refreshProductRow(
            document.querySelector(
              '.olc-product-row[data-ci="' + ci + '"][data-pi="' + pi + '"]'
            ),
            ci,
            pi
          );
        });
        var vp = document.createElement("input");
        vp.type = "number";
        vp.min = "0";
        vp.step = "1";
        vp.value = String(v.price);
        vp.addEventListener("input", function () {
          v.price = parseInt(vp.value, 10) || 0;
          syncPriceFromVariants();
          refreshProductRow(
            document.querySelector(
              '.olc-product-row[data-ci="' + ci + '"][data-pi="' + pi + '"]'
            ),
            ci,
            pi
          );
        });
        var vdel = document.createElement("button");
        vdel.type = "button";
        vdel.className = "d-btn-small d-btn-small--danger";
        vdel.textContent = "✕";
        vdel.addEventListener("click", function () {
          p.variants.splice(vi, 1);
          syncPriceFromVariants();
          renderVariants();
          refreshProductRow(
            document.querySelector(
              '.olc-product-row[data-ci="' + ci + '"][data-pi="' + pi + '"]'
            ),
            ci,
            pi
          );
        });
        vr.appendChild(vn);
        vr.appendChild(vp);
        vr.appendChild(vdel);
        varList.appendChild(vr);
      });
    }
    renderVariants();
    sPrice.appendChild(varBlock);
    host.appendChild(sPrice);

    var sExtra = section("Estado y extras", null);
    var rowPills = document.createElement("div");
    rowPills.className = "d-pills";
    var selStat = document.createElement("select");
    selStat.className = "d-pill d-pill--status";
    selStat.style.cursor = "pointer";
    [["available", "Disponible"], ["hidden", "Oculto (no en menú público)"]].forEach(function (opt) {
      var o = document.createElement("option");
      o.value = opt[0];
      o.textContent = opt[1];
      selStat.appendChild(o);
    });
    selStat.value = p.status === "hidden" ? "hidden" : "available";
    selStat.addEventListener("change", function () {
      p.status = selStat.value;
      refreshProductRow(
        document.querySelector(
          '.olc-product-row[data-ci="' + ci + '"][data-pi="' + pi + '"]'
        ),
        ci,
        pi
      );
    });
    rowPills.appendChild(selStat);
    sExtra.appendChild(rowPills);

    var grid = document.createElement("div");
    grid.className = "d-extra-grid";
    [["sku", "SKU"], ["discount", "Descuento"], ["cost", "Costo"], ["packaging", "Embalaje"]].forEach(function (pair) {
      var key = pair[0];
      var lab = pair[1];
      var w = document.createElement("div");
      w.className = "d-floating";
      var l = document.createElement("label");
      l.textContent = lab;
      var inp = document.createElement("input");
      inp.type = "number";
      inp.step = key === "sku" ? "1" : "0.01";
      if (key === "sku") {
        inp.type = "text";
        inp.value = p.sku || "";
        inp.addEventListener("input", function () {
          p.sku = inp.value;
          refreshProductRow(
            document.querySelector(
              '.olc-product-row[data-ci="' + ci + '"][data-pi="' + pi + '"]'
            ),
            ci,
            pi
          );
        });
      } else {
        inp.value = p[key] != null ? String(p[key]) : "";
        inp.addEventListener("input", function () {
          p[key] = inp.value === "" ? null : Number(inp.value);
        });
      }
      w.appendChild(l);
      w.appendChild(inp);
      grid.appendChild(w);
    });
    sExtra.appendChild(grid);
    host.appendChild(sExtra);

    var sStock = section(
      "Control de stock",
      "Cantidad disponible y umbral mínimo por producto. Se guardan en JSON; el menú público puede usarlos para avisos o bloqueos."
    );
    var trow = document.createElement("div");
    trow.className = "d-toggle-row";
    var tlab = document.createElement("span");
    tlab.textContent = "Activar control de stock";
    var sw = document.createElement("label");
    sw.className = "d-switch";
    var swi = document.createElement("input");
    swi.type = "checkbox";
    swi.checked = !!p.stockEnabled;
    var stockFieldsWrap = document.createElement("div");
    stockFieldsWrap.className = "d-stock-fields";

    function renderStockFields() {
      stockFieldsWrap.innerHTML = "";
      if (!p.stockEnabled) {
        stockFieldsWrap.hidden = true;
        return;
      }
      stockFieldsWrap.hidden = false;
      if (p.stock == null || p.stock === "" || isNaN(Number(p.stock))) p.stock = 0;
      if (p.minStock == null || p.minStock === "" || isNaN(Number(p.minStock))) p.minStock = 0;
      p.stock = Math.max(0, Math.round(Number(p.stock)) || 0);
      p.minStock = Math.max(0, Math.round(Number(p.minStock)) || 0);

      var row = document.createElement("div");
      row.className = "d-stock-fields__row";

      var w1 = document.createElement("div");
      w1.className = "d-floating d-floating--stock";
      var l1 = document.createElement("label");
      l1.textContent = "Stock";
      var in1 = document.createElement("input");
      in1.type = "number";
      in1.min = "0";
      in1.step = "1";
      in1.value = String(p.stock);
      in1.addEventListener("input", function () {
        p.stock = parseInt(in1.value, 10);
        if (isNaN(p.stock) || p.stock < 0) p.stock = 0;
      });
      w1.appendChild(l1);
      w1.appendChild(in1);

      var w2 = document.createElement("div");
      w2.className = "d-floating d-floating--minstock";
      var l2 = document.createElement("label");
      l2.textContent = "Stock min.";
      var in2 = document.createElement("input");
      in2.type = "number";
      in2.min = "0";
      in2.step = "1";
      in2.value = String(p.minStock);
      in2.addEventListener("input", function () {
        p.minStock = parseInt(in2.value, 10);
        if (isNaN(p.minStock) || p.minStock < 0) p.minStock = 0;
      });
      w2.appendChild(l2);
      w2.appendChild(in2);

      row.appendChild(w1);
      row.appendChild(w2);
      stockFieldsWrap.appendChild(row);
    }

    swi.addEventListener("change", function () {
      p.stockEnabled = swi.checked;
      if (p.stockEnabled && (p.stock == null || p.stock === "")) p.stock = 0;
      if (p.stockEnabled && (p.minStock == null || p.minStock === "")) p.minStock = 0;
      renderStockFields();
    });
    var swu = document.createElement("span");
    swu.className = "d-switch__ui";
    sw.appendChild(swi);
    sw.appendChild(swu);
    trow.appendChild(tlab);
    trow.appendChild(sw);
    sStock.appendChild(trow);
    sStock.appendChild(stockFieldsWrap);
    renderStockFields();
    host.appendChild(sStock);

    var sLib = section(
      "Modificadores globales (biblioteca)",
      "Activa las categorías creadas en «Modificadores» del menú. El orden en el plato sigue el orden de la biblioteca."
    );
    var libWrap = document.createElement("div");
    libWrap.className = "d-lib-mod-wrap";
    function renderLibAssign() {
      libWrap.innerHTML = "";
      if (!menuState.modifierLibrary || !menuState.modifierLibrary.length) {
        var em = document.createElement("p");
        em.className = "d-section__hint";
        em.textContent =
          "No hay categorías en la biblioteca. Créalas desde «Modificadores» en el menú lateral.";
        libWrap.appendChild(em);
        return;
      }
      menuState.modifierLibrary.forEach(function (g) {
        var row = document.createElement("label");
        row.className = "d-lib-mod-row";
        var cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = p.modifierIds.indexOf(g.id) !== -1;
        cb.addEventListener("change", function () {
          if (cb.checked) {
            if (p.modifierIds.indexOf(g.id) === -1) p.modifierIds.push(g.id);
          } else {
            p.modifierIds = p.modifierIds.filter(function (x) {
              return x !== g.id;
            });
          }
          var set = Object.create(null);
          p.modifierIds.forEach(function (id) {
            set[id] = true;
          });
          p.modifierIds = [];
          menuState.modifierLibrary.forEach(function (gg) {
            if (set[gg.id]) p.modifierIds.push(gg.id);
          });
        });
        var lab = document.createElement("span");
        lab.textContent = g.name || "(sin nombre)";
        row.appendChild(cb);
        row.appendChild(lab);
        libWrap.appendChild(row);
      });
    }
    renderLibAssign();
    sLib.appendChild(libWrap);
    host.appendChild(sLib);

    var sMod = section(
      "Modificadores solo en este producto",
      "Opcional: grupos que no usan la biblioteca (se guardan solo en este plato)."
    );
    var modRoot = document.createElement("div");
    sMod.appendChild(modRoot);
    var addModBtn = document.createElement("button");
    addModBtn.type = "button";
    addModBtn.className = "d-btn-small d-btn-small--primary";
    addModBtn.style.marginTop = "10px";
    addModBtn.textContent = "+ Agregar grupo de modificadores";
    addModBtn.addEventListener("click", function () {
      p.modifiers.push({
        id: uniqueModId(),
        name: "Nuevo grupo",
        optional: true,
        options: [{ name: "Opción 1", price: 0 }],
      });
      renderMods();
    });
    sMod.appendChild(addModBtn);

    function renderMods() {
      modRoot.innerHTML = "";
      p.modifiers.forEach(function (m, mi) {
        ensureModifierGroupDefaults(m);
        var blk = document.createElement("div");
        blk.className = "d-modifier-block";
        var head = document.createElement("div");
        head.className = "d-modifier-block__head";
        var mn = document.createElement("input");
        mn.type = "text";
        mn.placeholder = "Nombre del grupo";
        mn.value = m.name;
        mn.addEventListener("input", function () {
          m.name = mn.value;
        });
        var optCb = document.createElement("label");
        optCb.style.fontSize = "12px";
        optCb.style.display = "flex";
        optCb.style.alignItems = "center";
        optCb.style.gap = "6px";
        var cbx = document.createElement("input");
        cbx.type = "checkbox";
        cbx.checked = !!m.optional;
        cbx.addEventListener("change", function () {
          m.optional = cbx.checked;
        });
        optCb.appendChild(cbx);
        optCb.appendChild(document.createTextNode("Opcional"));
        head.appendChild(mn);
        head.appendChild(optCb);
        blk.appendChild(head);
        var optBox = document.createElement("div");
        m.options.forEach(function (o, oi) {
          var or = document.createElement("div");
          or.className = "d-opt-row";
          var on = document.createElement("input");
          on.type = "text";
          on.placeholder = "Opción";
          on.value = o.name;
          on.addEventListener("input", function () {
            o.name = on.value;
          });
          var op = document.createElement("input");
          op.type = "number";
          op.min = "0";
          op.step = "1";
          op.value = String(o.price);
          op.addEventListener("input", function () {
            o.price = parseInt(op.value, 10) || 0;
          });
          var ob = document.createElement("button");
          ob.type = "button";
          ob.className = "d-btn-small d-btn-small--danger";
          ob.textContent = "✕";
          ob.addEventListener("click", function () {
            m.options.splice(oi, 1);
            renderMods();
          });
          or.appendChild(on);
          or.appendChild(op);
          or.appendChild(ob);
          optBox.appendChild(or);
        });
        blk.appendChild(optBox);
        var modActions = document.createElement("div");
        modActions.style.marginTop = "8px";
        modActions.style.display = "flex";
        modActions.style.flexWrap = "wrap";
        modActions.style.gap = "6px";
        var bOpt = document.createElement("button");
        bOpt.type = "button";
        bOpt.className = "d-btn-small";
        bOpt.textContent = "+ Opción";
        bOpt.addEventListener("click", function () {
          m.options.push({
            id: uniqueOptId(),
            name: "",
            price: 0,
            maxQty: 99,
            status: "available",
          });
          renderMods();
        });
        var bUp = document.createElement("button");
        bUp.type = "button";
        bUp.className = "d-btn-small";
        bUp.textContent = "↑ Grupo";
        bUp.disabled = mi === 0;
        bUp.addEventListener("click", function () {
          if (mi === 0) return;
          var t = p.modifiers[mi - 1];
          p.modifiers[mi - 1] = p.modifiers[mi];
          p.modifiers[mi] = t;
          renderMods();
        });
        var bDn = document.createElement("button");
        bDn.type = "button";
        bDn.className = "d-btn-small";
        bDn.textContent = "↓ Grupo";
        bDn.disabled = mi === p.modifiers.length - 1;
        bDn.addEventListener("click", function () {
          if (mi >= p.modifiers.length - 1) return;
          var t2 = p.modifiers[mi + 1];
          p.modifiers[mi + 1] = p.modifiers[mi];
          p.modifiers[mi] = t2;
          renderMods();
        });
        var bDelG = document.createElement("button");
        bDelG.type = "button";
        bDelG.className = "d-btn-small d-btn-small--danger";
        bDelG.textContent = "Eliminar grupo";
        bDelG.addEventListener("click", function () {
          p.modifiers.splice(mi, 1);
          renderMods();
        });
        modActions.appendChild(bOpt);
        modActions.appendChild(bUp);
        modActions.appendChild(bDn);
        modActions.appendChild(bDelG);
        blk.appendChild(modActions);
        modRoot.appendChild(blk);
      });
    }
    renderMods();
    host.appendChild(sMod);

    var sKit = section(
      "Cocina",
      "Selecciona el área donde elaboras el producto (opcional)."
    );
    var kf = document.createElement("div");
    kf.className = "d-floating";
    var kl = document.createElement("label");
    kl.textContent = "Área / estación";
    var ks = document.createElement("select");
    KITCHEN_OPTIONS.forEach(function (opt) {
      var o = document.createElement("option");
      o.value = opt;
      o.textContent = opt || "— Sin asignar —";
      ks.appendChild(o);
    });
    if (p.kitchen && KITCHEN_OPTIONS.indexOf(p.kitchen) === -1) {
      var ox = document.createElement("option");
      ox.value = p.kitchen;
      ox.textContent = p.kitchen;
      ks.appendChild(ox);
    }
    ks.value = p.kitchen || "";
    ks.addEventListener("change", function () {
      p.kitchen = ks.value;
    });
    kf.appendChild(kl);
    kf.appendChild(ks);
    sKit.appendChild(kf);
    host.appendChild(sKit);
  }

  function renderChips() {
    var host = document.getElementById("admin-category-chips");
    if (!host || !menuState) return;
    host.innerHTML = "";
    menuState.categories.forEach(function (cat, i) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "admin-chip" + (i === 0 ? " is-active" : "");
      btn.setAttribute("role", "tab");
      btn.textContent = cat.name || "Sin nombre";
      btn.addEventListener("click", function () {
        host.querySelectorAll(".admin-chip").forEach(function (c) {
          c.classList.remove("is-active");
        });
        btn.classList.add("is-active");
        var safe = String(cat.id).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        var target = document.querySelector('[data-admin-cat-id="' + safe + '"]');
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
      host.appendChild(btn);
    });
  }

  function applyMenuFilter() {
    var filterEl = document.getElementById("menu-filter");
    var q = filterEl ? normalizeSearch(filterEl.value).trim() : "";
    var root = document.getElementById("admin-root");
    if (!root) return;
    root.querySelectorAll(".olc-product-row").forEach(function (row) {
      var hay = normalizeSearch(row.getAttribute("data-search") || "");
      row.hidden = !!(q && hay.indexOf(q) === -1);
    });
    root.querySelectorAll(".olc-cat").forEach(function (sec) {
      var rows = sec.querySelectorAll(".olc-product-row");
      if (rows.length === 0) {
        sec.hidden = false;
        return;
      }
      var any = false;
      rows.forEach(function (r) {
        if (!r.hidden) any = true;
      });
      sec.hidden = !!(q && !any);
    });
  }

  function render() {
    closeProductDrawer();
    var root = document.getElementById("admin-root");
    if (!root || !menuState) return;

    var curInput = document.getElementById("currency-symbol");
    if (curInput) curInput.value = menuState.currencySymbol || "$";

    root.innerHTML = "";

    renderChips();

    var addCatWrap = document.createElement("div");
    addCatWrap.className = "admin-add-cat-wrap";
    var addCat = document.createElement("button");
    addCat.type = "button";
    addCat.className = "admin-add-cat";
    addCat.textContent = "+ Añadir categoría";
    addCat.addEventListener("click", function () {
      syncFromInputs(root);
      menuState.categories.push({
        id: uniqueCategoryId("nueva"),
        name: "Nueva categoría",
        products: [],
      });
      render();
    });
    addCatWrap.appendChild(addCat);
    root.appendChild(addCatWrap);

    menuState.categories.forEach(function (cat, ci) {
      root.appendChild(buildCategoryBlock(cat, ci, root));
    });

    applyMenuFilter();
    if (adminActiveView === "modifiers") {
      renderModifierLibrary();
    }
    if (adminActiveView === "payment") {
      renderCheckoutPaymentAdmin();
    }
  }

  function stripModifierIdFromProducts(modId) {
    if (!menuState || !menuState.categories) return;
    menuState.categories.forEach(function (cat) {
      (cat.products || []).forEach(function (p) {
        if (!Array.isArray(p.modifierIds)) return;
        p.modifierIds = p.modifierIds.filter(function (id) {
          return id !== modId;
        });
      });
    });
  }

  function countProductsUsingModifier(modId) {
    var n = 0;
    if (!menuState || !menuState.categories) return 0;
    menuState.categories.forEach(function (cat) {
      (cat.products || []).forEach(function (p) {
        if (Array.isArray(p.modifierIds) && p.modifierIds.indexOf(modId) !== -1) n++;
      });
    });
    return n;
  }

  function closeModAssocOverlay() {
    var el = document.getElementById("mod-assoc-overlay");
    if (el) el.remove();
    if (adminActiveView === "modifiers") renderModifierLibrary();
  }

  function openAssociateModifierModal(group) {
    closeModAssocOverlay();
    var modId = group.id;
    var overlay = document.createElement("div");
    overlay.id = "mod-assoc-overlay";
    overlay.className = "mod-assoc-overlay";
    var panel = document.createElement("div");
    panel.className = "mod-assoc-panel";
    panel.addEventListener("click", function (e) {
      e.stopPropagation();
    });
    var h = document.createElement("h2");
    h.className = "mod-assoc-panel__title";
    h.textContent = "Asociar categoría a productos";
    var sub = document.createElement("p");
    sub.className = "mod-assoc-panel__hint";
    sub.textContent =
      "Marca los platos que incluyen «" +
      (group.name || "").replace(/</g, "") +
      "». Pulsa «Guardar» en la barra superior para escribir el JSON.";
    panel.appendChild(h);
    panel.appendChild(sub);

    var scroll = document.createElement("div");
    scroll.className = "mod-assoc-scroll";
    menuState.categories.forEach(function (cat) {
      (cat.products || []).forEach(function (p) {
        ensureProductDefaults(p);
        var row = document.createElement("label");
        row.className = "mod-assoc-row";
        var cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = p.modifierIds.indexOf(modId) !== -1;
        cb.addEventListener("change", function () {
          if (cb.checked) {
            if (p.modifierIds.indexOf(modId) === -1) p.modifierIds.push(modId);
            var set = Object.create(null);
            p.modifierIds.forEach(function (id) {
              set[id] = true;
            });
            p.modifierIds = [];
            (menuState.modifierLibrary || []).forEach(function (gg) {
              if (set[gg.id]) p.modifierIds.push(gg.id);
            });
          } else {
            p.modifierIds = p.modifierIds.filter(function (id) {
              return id !== modId;
            });
          }
        });
        var lab = document.createElement("span");
        lab.textContent = (p.name || "Sin nombre") + " · " + (cat.name || "");
        row.appendChild(cb);
        row.appendChild(lab);
        scroll.appendChild(row);
      });
    });
    panel.appendChild(scroll);

    var foot = document.createElement("div");
    foot.className = "mod-assoc-foot";
    var bClose = document.createElement("button");
    bClose.type = "button";
    bClose.className = "admin-toolbar-btn admin-toolbar-btn--save";
    bClose.textContent = "Listo";
    bClose.addEventListener("click", closeModAssocOverlay);
    foot.appendChild(bClose);
    panel.appendChild(foot);

    overlay.appendChild(panel);
    overlay.addEventListener("click", function () {
      closeModAssocOverlay();
    });
    document.body.appendChild(overlay);
  }

  function setAdminView(view) {
    adminActiveView = view;
    var vp = document.getElementById("admin-view-products");
    var vm = document.getElementById("admin-view-modifiers");
    var vpay = document.getElementById("admin-view-payment");
    var sticky = document.getElementById("admin-sticky-tools");
    var navP = document.getElementById("nav-admin-products");
    var navM = document.getElementById("nav-admin-modifiers");
    var navPay = document.getElementById("nav-admin-payment");
    var crumb = document.getElementById("admin-hero-crumb");
    if (vp) vp.hidden = view !== "products";
    if (vm) vm.hidden = view !== "modifiers";
    if (vpay) vpay.hidden = view !== "payment";
    if (sticky) sticky.hidden = view !== "products";
    if (navP) navP.classList.toggle("is-active", view === "products");
    if (navM) navM.classList.toggle("is-active", view === "modifiers");
    if (navPay) navPay.classList.toggle("is-active", view === "payment");
    if (crumb) {
      if (view === "modifiers") {
        crumb.textContent = "Menú / Modificadores";
      } else if (view === "payment") {
        crumb.textContent = "Menú / Métodos de pago";
      } else {
        crumb.textContent = "Menú / Página de productos";
      }
    }
    if (view === "modifiers") {
      renderModifierLibrary();
    }
    if (view === "payment") {
      renderCheckoutPaymentAdmin();
    }
  }

  function renderModifierLibrary() {
    var host = document.getElementById("admin-modifiers-root");
    var badge = document.getElementById("mod-lib-count");
    if (!host || !menuState) return;
    var lib = menuState.modifierLibrary || [];
    if (badge) badge.textContent = String(lib.length);
    host.innerHTML = "";
    var filterEl = document.getElementById("mod-lib-filter");
    var q = filterEl ? normalizeSearch(filterEl.value).trim() : "";
    var list = document.createElement("div");
    list.className = "mod-lib-list";

    lib.forEach(function (g, gi) {
      if (q && normalizeSearch(g.name || "").indexOf(q) === -1) return;
      var item = document.createElement("div");
      item.className = "mod-lib-item";
      if (expandedLibModId === g.id) item.classList.add("is-open");

      var top = document.createElement("div");
      top.className = "mod-lib-item__top";

      var ttl = document.createElement("div");
      ttl.className = "mod-lib-item__title";
      ttl.textContent = g.name || "(sin nombre)";

      var actions = document.createElement("div");
      actions.className = "mod-lib-item__actions";

      var menu = document.createElement("details");
      menu.className = "olc-menu mod-lib-menu";
      var sum = document.createElement("summary");
      sum.setAttribute("aria-label", "Más opciones");
      sum.textContent = "⋮";
      var panel = document.createElement("div");
      panel.className = "olc-menu__panel";
      var bDel = document.createElement("button");
      bDel.type = "button";
      bDel.className = "olc-menu__danger";
      bDel.textContent = "Eliminar categoría";
      bDel.addEventListener("click", function (e) {
        e.preventDefault();
        if (!confirm("¿Eliminar esta categoría de la biblioteca? Se quitará de todos los productos.")) {
          return;
        }
        stripModifierIdFromProducts(g.id);
        menuState.modifierLibrary.splice(gi, 1);
        if (expandedLibModId === g.id) expandedLibModId = null;
        menu.removeAttribute("open");
        renderModifierLibrary();
      });
      panel.appendChild(bDel);
      menu.appendChild(sum);
      menu.appendChild(panel);

      var btnToggle = document.createElement("button");
      btnToggle.type = "button";
      btnToggle.className = "mod-lib-item__toggle";
      btnToggle.setAttribute("aria-label", "Expandir o contraer");
      btnToggle.textContent = "▼";
      btnToggle.addEventListener("click", function () {
        expandedLibModId = expandedLibModId === g.id ? null : g.id;
        renderModifierLibrary();
      });

      actions.appendChild(menu);
      actions.appendChild(btnToggle);
      top.appendChild(ttl);
      top.appendChild(actions);
      item.appendChild(top);

      var body = document.createElement("div");
      body.className = "mod-lib-item__body";
      ensureModifierGroupDefaults(g);

      var labCat = document.createElement("div");
      labCat.className = "mod-lib-field-label";
      labCat.textContent = "Categoría";
      body.appendChild(labCat);

      var mnRow = document.createElement("div");
      mnRow.className = "mod-lib-name-row";
      var mn = document.createElement("input");
      mn.type = "text";
      mn.className = "mod-lib-cat-name";
      mn.placeholder = "Nombre de la categoría";
      mn.maxLength = 150;
      mn.value = g.name || "";
      var cnt = document.createElement("span");
      cnt.className = "mod-lib-char-count";
      function updNameCnt() {
        cnt.textContent = (mn.value.length || 0) + " / 150";
      }
      mn.addEventListener("input", function () {
        g.name = mn.value;
        ttl.textContent = g.name.trim() || "(sin nombre)";
        updNameCnt();
      });
      updNameCnt();
      mnRow.appendChild(mn);
      mnRow.appendChild(cnt);
      body.appendChild(mnRow);

      var btnAssoc = document.createElement("button");
      btnAssoc.type = "button";
      btnAssoc.className = "admin-toolbar-btn admin-toolbar-btn--save mod-lib-assoc-btn";
      btnAssoc.textContent = "Asociar / Desasociar " + countProductsUsingModifier(g.id);
      btnAssoc.addEventListener("click", function () {
        openAssociateModifierModal(g);
      });
      body.appendChild(btnAssoc);

      var minMaxRow = document.createElement("div");
      minMaxRow.className = "mod-lib-minmax";
      var labMin = document.createElement("span");
      labMin.textContent = "Min";
      var inMin = document.createElement("input");
      inMin.type = "number";
      inMin.min = "0";
      inMin.max = "40";
      inMin.className = "mod-lib-num";
      inMin.value = String(g.minSelect != null ? g.minSelect : 0);
      var labMax = document.createElement("span");
      labMax.textContent = "Max";
      var inMax = document.createElement("input");
      inMax.type = "number";
      inMax.min = "0";
      inMax.max = "40";
      inMax.className = "mod-lib-num";
      inMax.value = String(g.maxSelect != null ? g.maxSelect : 0);
      inMin.addEventListener("input", function () {
        g.minSelect = parseInt(inMin.value, 10) || 0;
        g.minSelect = Math.max(0, Math.min(40, g.minSelect));
      });
      inMax.addEventListener("input", function () {
        g.maxSelect = parseInt(inMax.value, 10) || 0;
        g.maxSelect = Math.max(0, Math.min(40, g.maxSelect));
      });
      function updMinMaxVis() {
        minMaxRow.style.display = g.multiSelect ? "flex" : "none";
      }
      minMaxRow.appendChild(labMin);
      minMaxRow.appendChild(inMin);
      minMaxRow.appendChild(labMax);
      minMaxRow.appendChild(inMax);

      var rqName = "ml-req-" + gi + "-" + String(g.id || "").replace(/[^a-zA-Z0-9_-]/g, "x");
      var rowReq = document.createElement("div");
      rowReq.className = "mod-lib-radio-row";
      var labObl = document.createElement("label");
      labObl.className = "mod-lib-radio";
      var rObl = document.createElement("input");
      rObl.type = "radio";
      rObl.name = rqName;
      rObl.checked = !g.optional;
      var labOpL = document.createElement("label");
      labOpL.className = "mod-lib-radio";
      var rOpt = document.createElement("input");
      rOpt.type = "radio";
      rOpt.name = rqName;
      rOpt.checked = !!g.optional;
      rObl.addEventListener("change", function () {
        if (!rObl.checked) return;
        g.optional = false;
        if (g.multiSelect && g.minSelect < 1) g.minSelect = 1;
        inMin.value = String(g.minSelect);
        updMinMaxVis();
      });
      rOpt.addEventListener("change", function () {
        if (!rOpt.checked) return;
        g.optional = true;
        updMinMaxVis();
      });
      labObl.appendChild(rObl);
      labObl.appendChild(document.createTextNode(" Obligatorio"));
      labOpL.appendChild(rOpt);
      labOpL.appendChild(document.createTextNode(" Opcional"));
      rowReq.appendChild(labObl);
      rowReq.appendChild(labOpL);
      body.appendChild(rowReq);

      var mqName = "ml-mul-" + gi + "-" + String(g.id || "").replace(/[^a-zA-Z0-9_-]/g, "x");
      var rowMul = document.createElement("div");
      rowMul.className = "mod-lib-radio-row";
      var labOne = document.createElement("label");
      labOne.className = "mod-lib-radio";
      var rOne = document.createElement("input");
      rOne.type = "radio";
      rOne.name = mqName;
      rOne.checked = !g.multiSelect;
      var labMul = document.createElement("label");
      labMul.className = "mod-lib-radio";
      var rMul = document.createElement("input");
      rMul.type = "radio";
      rMul.name = mqName;
      rMul.checked = !!g.multiSelect;
      rOne.addEventListener("change", function () {
        if (!rOne.checked) return;
        g.multiSelect = false;
        updMinMaxVis();
      });
      rMul.addEventListener("change", function () {
        if (!rMul.checked) return;
        g.multiSelect = true;
        if (!g.optional && g.minSelect < 1) g.minSelect = 1;
        inMin.value = String(g.minSelect);
        updMinMaxVis();
      });
      labOne.appendChild(rOne);
      labOne.appendChild(document.createTextNode(" Sólo un modificador"));
      labMul.appendChild(rMul);
      labMul.appendChild(document.createTextNode(" Varios"));
      rowMul.appendChild(labOne);
      rowMul.appendChild(labMul);
      body.appendChild(rowMul);

      body.appendChild(minMaxRow);
      updMinMaxVis();

      var optSec = document.createElement("div");
      optSec.className = "mod-lib-field-label mod-lib-field-label--spaced";
      optSec.textContent = "Agregar los modificadores de esta categoría";
      body.appendChild(optSec);

      var optBox = document.createElement("div");
      optBox.className = "mod-lib-opt-list";

      function renderOpts() {
        optBox.innerHTML = "";
        (g.options || []).forEach(function (o, oi) {
          ensureModifierGroupDefaults(g);
          var card = document.createElement("div");
          card.className = "mod-lib-opt-card";
          var row1 = document.createElement("div");
          row1.className = "mod-lib-opt-row1";
          var drag = document.createElement("span");
          drag.className = "mod-lib-drag";
          drag.setAttribute("aria-hidden", "true");
          drag.textContent = "⋮⋮";
          var on = document.createElement("input");
          on.type = "text";
          on.className = "mod-lib-opt-name";
          on.placeholder = "Nombre de modificador";
          on.value = o.name || "";
          on.addEventListener("input", function () {
            o.name = on.value;
          });
          var op = document.createElement("input");
          op.type = "number";
          op.className = "mod-lib-opt-price";
          op.min = "0";
          op.step = "1";
          op.value = String(o.price != null ? o.price : 0);
          op.addEventListener("input", function () {
            o.price = parseInt(op.value, 10) || 0;
          });
          var labMq = document.createElement("label");
          labMq.className = "mod-lib-opt-mq";
          var mqLbl = document.createElement("span");
          mqLbl.textContent = "Cant. max ";
          var mq = document.createElement("input");
          mq.type = "number";
          mq.min = "1";
          mq.max = "99";
          mq.className = "mod-lib-num mod-lib-num--sm";
          mq.value = String(o.maxQty != null ? o.maxQty : 99);
          mq.addEventListener("input", function () {
            o.maxQty = parseInt(mq.value, 10) || 1;
            o.maxQty = Math.max(1, Math.min(99, o.maxQty));
          });
          labMq.appendChild(mqLbl);
          labMq.appendChild(mq);
          var bUpO = document.createElement("button");
          bUpO.type = "button";
          bUpO.className = "d-btn-small";
          bUpO.textContent = "↑";
          bUpO.disabled = oi === 0;
          bUpO.addEventListener("click", function () {
            if (oi === 0) return;
            var t = g.options[oi - 1];
            g.options[oi - 1] = g.options[oi];
            g.options[oi] = t;
            renderOpts();
          });
          var bDnO = document.createElement("button");
          bDnO.type = "button";
          bDnO.className = "d-btn-small";
          bDnO.textContent = "↓";
          bDnO.disabled = oi >= g.options.length - 1;
          bDnO.addEventListener("click", function () {
            if (oi >= g.options.length - 1) return;
            var t2 = g.options[oi + 1];
            g.options[oi + 1] = g.options[oi];
            g.options[oi] = t2;
            renderOpts();
          });
          var bEye = document.createElement("button");
          bEye.type = "button";
          bEye.className = "d-btn-small";
          bEye.title = o.status === "hidden" ? "Oculto en menú público" : "Visible";
          bEye.textContent = o.status === "hidden" ? "Mostrar" : "Ocultar";
          bEye.addEventListener("click", function () {
            o.status = o.status === "hidden" ? "available" : "hidden";
            renderOpts();
          });
          var ob = document.createElement("button");
          ob.type = "button";
          ob.className = "d-btn-small d-btn-small--danger";
          ob.textContent = "✕";
          ob.addEventListener("click", function () {
            g.options.splice(oi, 1);
            renderOpts();
          });
          row1.appendChild(drag);
          row1.appendChild(on);
          row1.appendChild(op);
          row1.appendChild(labMq);
          row1.appendChild(bUpO);
          row1.appendChild(bDnO);
          row1.appendChild(bEye);
          row1.appendChild(ob);
          var row2 = document.createElement("div");
          row2.className = "mod-lib-opt-row2";
          var cLab = document.createElement("span");
          cLab.textContent = "Costo";
          var cIn = document.createElement("input");
          cIn.type = "number";
          cIn.step = "0.01";
          cIn.className = "mod-lib-meta";
          cIn.value = o.cost != null && o.cost !== "" ? String(o.cost) : "";
          cIn.addEventListener("input", function () {
            if (cIn.value === "") delete o.cost;
            else o.cost = Number(cIn.value);
          });
          var dLab = document.createElement("span");
          dLab.textContent = "Desc.";
          var dIn = document.createElement("input");
          dIn.type = "number";
          dIn.step = "0.01";
          dIn.className = "mod-lib-meta";
          dIn.value = o.discount != null && o.discount !== "" ? String(o.discount) : "";
          dIn.addEventListener("input", function () {
            if (dIn.value === "") delete o.discount;
            else o.discount = Number(dIn.value);
          });
          var sLab = document.createElement("span");
          sLab.textContent = "SKU";
          var sIn = document.createElement("input");
          sIn.type = "text";
          sIn.className = "mod-lib-meta mod-lib-meta--sku";
          sIn.value = o.sku || "";
          sIn.addEventListener("input", function () {
            o.sku = sIn.value;
          });
          row2.appendChild(cLab);
          row2.appendChild(cIn);
          row2.appendChild(dLab);
          row2.appendChild(dIn);
          row2.appendChild(sLab);
          row2.appendChild(sIn);
          card.appendChild(row1);
          card.appendChild(row2);
          optBox.appendChild(card);
        });
      }
      renderOpts();

      var modActions = document.createElement("div");
      modActions.style.cssText = "margin-top:10px;display:flex;flex-wrap:wrap;gap:6px;";
      var bOpt = document.createElement("button");
      bOpt.type = "button";
      bOpt.className = "d-btn-small";
      bOpt.textContent = "+ Opción";
      bOpt.addEventListener("click", function () {
        if (!Array.isArray(g.options)) g.options = [];
        g.options.push({
          id: uniqueOptId(),
          name: "",
          price: 0,
          maxQty: 99,
          status: "available",
        });
        renderOpts();
      });
      var bUp = document.createElement("button");
      bUp.type = "button";
      bUp.className = "d-btn-small";
      bUp.textContent = "↑ Categoría";
      bUp.disabled = gi === 0;
      bUp.addEventListener("click", function () {
        if (gi === 0) return;
        var t = lib[gi - 1];
        lib[gi - 1] = lib[gi];
        lib[gi] = t;
        renderModifierLibrary();
      });
      var bDn = document.createElement("button");
      bDn.type = "button";
      bDn.className = "d-btn-small";
      bDn.textContent = "↓ Categoría";
      bDn.disabled = gi >= lib.length - 1;
      bDn.addEventListener("click", function () {
        if (gi >= lib.length - 1) return;
        var t2 = lib[gi + 1];
        lib[gi + 1] = lib[gi];
        lib[gi] = t2;
        renderModifierLibrary();
      });
      modActions.appendChild(bOpt);
      modActions.appendChild(bUp);
      modActions.appendChild(bDn);
      body.appendChild(optBox);
      body.appendChild(modActions);
      item.appendChild(body);
      list.appendChild(item);
    });

    host.appendChild(list);
  }

  function buildCategoryBlock(cat, ci, root) {
    var block = document.createElement("section");
    block.className = "olc-cat";
    block.setAttribute("data-admin-cat-id", cat.id);

    var bar = document.createElement("div");
    bar.className = "olc-cat__bar";

    var titleWrap = document.createElement("div");
    titleWrap.className = "olc-cat__title-wrap";

    var titleIn = document.createElement("input");
    titleIn.type = "text";
    titleIn.className = "olc-cat__title-input";
    titleIn.setAttribute("data-field", "name");
    titleIn.setAttribute("data-cat-idx", String(ci));
    titleIn.value = cat.name;
    titleIn.setAttribute("aria-label", "Nombre de categoría");

    var count = document.createElement("span");
    count.className = "olc-cat__count";
    count.textContent = (cat.products || []).length;

    titleWrap.appendChild(titleIn);
    titleWrap.appendChild(count);

    var btnAddP = document.createElement("button");
    btnAddP.type = "button";
    btnAddP.className = "olc-btn-producto";
    btnAddP.textContent = "+ Producto";
    btnAddP.addEventListener("click", function () {
      syncFromInputs(root);
      var np = {
        id: uniqueProductId("plato"),
        name: "Nuevo plato",
        price: 0,
      };
      ensureProductDefaults(np);
      menuState.categories[ci].products.push(np);
      render();
      openProductDrawer(ci, menuState.categories[ci].products.length - 1);
    });

    var catMenu = document.createElement("details");
    catMenu.className = "olc-menu";
    var catSum = document.createElement("summary");
    catSum.setAttribute("aria-label", "Más opciones de categoría");
    catSum.textContent = "⋮";
    var catPanel = document.createElement("div");
    catPanel.className = "olc-menu__panel";

    function addCatMenuItem(label, onClick, danger) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      if (danger) b.className = "olc-menu__danger";
      b.addEventListener("click", function () {
        closeDetails(b);
        onClick();
      });
      catPanel.appendChild(b);
    }

    addCatMenuItem("Subir categoría", function () {
      if (ci === 0) return;
      syncFromInputs(root);
      var arr = menuState.categories;
      var t = arr[ci - 1];
      arr[ci - 1] = arr[ci];
      arr[ci] = t;
      render();
    });

    addCatMenuItem("Bajar categoría", function () {
      if (ci >= menuState.categories.length - 1) return;
      syncFromInputs(root);
      var arr = menuState.categories;
      var t = arr[ci + 1];
      arr[ci + 1] = arr[ci];
      arr[ci] = t;
      render();
    });

    addCatMenuItem(
      "Eliminar categoría",
      function () {
        if (!window.confirm("¿Eliminar esta categoría y todos sus platos?")) return;
        syncFromInputs(root);
        menuState.categories.splice(ci, 1);
        render();
      },
      true
    );

    catMenu.appendChild(catSum);
    catMenu.appendChild(catPanel);

    bar.appendChild(titleWrap);
    bar.appendChild(btnAddP);
    bar.appendChild(catMenu);
    block.appendChild(bar);

    var meta = document.createElement("details");
    meta.className = "olc-cat__meta";
    var metaSum = document.createElement("summary");
    metaSum.textContent = "ID de categoría y vista destacada";
    var metaBody = document.createElement("div");
    metaBody.className = "olc-cat__meta-body";

    var fId = document.createElement("div");
    fId.className = "olc-field";
    fId.innerHTML =
      '<label for="cat-id-' +
      ci +
      '">ID (ancla URL)</label><input id="cat-id-' +
      ci +
      '" type="text" data-field="id" data-cat-idx="' +
      ci +
      '" />';
    fId.querySelector("input").value = cat.id;

    var fLay = document.createElement("div");
    fLay.className = "olc-field olc-field--layout";
    var cb = document.createElement("input");
    cb.type = "checkbox";
    cb.setAttribute("data-field", "layout");
    cb.setAttribute("data-cat-idx", String(ci));
    cb.checked = cat.layout === "row";
    cb.id = "cat-layout-" + ci;
    var lbl = document.createElement("label");
    lbl.htmlFor = cb.id;
    lbl.textContent = "Vista tipo carrusel (fila horizontal)";
    fLay.appendChild(cb);
    fLay.appendChild(lbl);

    metaBody.appendChild(fId);
    metaBody.appendChild(fLay);
    meta.appendChild(metaSum);
    meta.appendChild(metaBody);
    block.appendChild(meta);

    (cat.products || []).forEach(function (p, pi) {
      block.appendChild(buildProductRow(p, ci, pi, root));
    });

    return block;
  }

  function buildProductRow(p, ci, pi, root) {
    ensureProductDefaults(p);
    var row = document.createElement("div");
    row.className = "olc-product-row";
    row.setAttribute("data-ci", String(ci));
    row.setAttribute("data-pi", String(pi));
    row.setAttribute(
      "data-search",
      (p.name || "") + " " + (p.description || "") + " " + (p.id || "")
    );

    var drag = document.createElement("div");
    drag.className = "olc-drag";
    drag.setAttribute("aria-hidden", "true");
    drag.innerHTML = "⋮<br>⋮<br>⋮";

    var thumb = document.createElement("div");
    thumb.className = "olc-thumb";
    if (p.imageUrl && String(p.imageUrl).trim()) {
      thumb.classList.add("olc-thumb--has-img");
      thumb.style.backgroundImage =
        'url("' + String(p.imageUrl).trim().replace(/"/g, '\\"') + '")';
    }

    var main = document.createElement("div");
    main.className = "olc-product-main";
    var nameEl = document.createElement("div");
    nameEl.className = "olc-row-name";
    nameEl.textContent = p.name || "Sin nombre";
    var subEl = document.createElement("div");
    subEl.className = "olc-row-sub";
    subEl.textContent = p.description
      ? p.description.length > 80
        ? p.description.slice(0, 80) + "…"
        : p.description
      : p.id;
    main.appendChild(nameEl);
    main.appendChild(subEl);

    var priceCol = document.createElement("div");
    priceCol.className = "olc-product-price";
    var priceDisp = document.createElement("span");
    priceDisp.className = "olc-row-price-display";
    priceDisp.textContent = displayPriceLabel(p);
    priceCol.appendChild(priceDisp);

    var tools = document.createElement("div");
    tools.className = "olc-row-tools";

    var btnEdit = document.createElement("button");
    btnEdit.type = "button";
    btnEdit.className = "olc-btn-editar";
    btnEdit.textContent = "Editar";
    btnEdit.addEventListener("click", function () {
      syncFromInputs(document.getElementById("admin-root"));
      openProductDrawer(ci, pi);
    });

    var eye = document.createElement("button");
    eye.type = "button";
    eye.className = "olc-icon-btn olc-row-eye";
    eye.setAttribute("aria-label", "Cambiar visibilidad del producto");
    eye.innerHTML = p.status === "hidden" ? EYE_OFF_SVG : EYE_SVG;
    eye.title =
      p.status === "hidden" ? "Oculto en menú público" : "Visible en menú público";
    eye.addEventListener("click", function () {
      syncFromInputs(root);
      var prod =
        menuState &&
        menuState.categories[ci] &&
        menuState.categories[ci].products[pi];
      if (!prod) return;
      prod.status = prod.status === "hidden" ? "available" : "hidden";
      refreshProductRow(row, ci, pi);
    });

    var prodMenu = document.createElement("details");
    prodMenu.className = "olc-menu";
    var prodSum = document.createElement("summary");
    prodSum.setAttribute("aria-label", "Opciones del plato");
    prodSum.textContent = "⋮";
    var prodPanel = document.createElement("div");
    prodPanel.className = "olc-menu__panel";

    function addProdItem(label, fn, danger) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      if (danger) b.className = "olc-menu__danger";
      b.addEventListener("click", function () {
        closeDetails(b);
        fn();
      });
      prodPanel.appendChild(b);
    }

    addProdItem("Subir plato", function () {
      if (pi === 0) return;
      syncFromInputs(root);
      var arr = menuState.categories[ci].products;
      var tmp = arr[pi - 1];
      arr[pi - 1] = arr[pi];
      arr[pi] = tmp;
      render();
    });

    addProdItem("Bajar plato", function () {
      if (pi >= menuState.categories[ci].products.length - 1) return;
      syncFromInputs(root);
      var arr = menuState.categories[ci].products;
      var tmp = arr[pi + 1];
      arr[pi + 1] = arr[pi];
      arr[pi] = tmp;
      render();
    });

    addProdItem(
      "Eliminar plato",
      function () {
        syncFromInputs(root);
        if (
          drawerTarget &&
          drawerTarget.ci === ci &&
          drawerTarget.pi === pi
        ) {
          closeProductDrawer();
        }
        menuState.categories[ci].products.splice(pi, 1);
        render();
      },
      true
    );

    prodMenu.appendChild(prodSum);
    prodMenu.appendChild(prodPanel);

    tools.appendChild(btnEdit);
    tools.appendChild(eye);
    tools.appendChild(prodMenu);

    row.appendChild(drag);
    row.appendChild(thumb);
    row.appendChild(main);
    row.appendChild(priceCol);
    row.appendChild(tools);
    return row;
  }

  function loadMenu() {
    var root = document.getElementById("admin-root");
    var chips = document.getElementById("admin-category-chips");
    hideBanner();
    closeProductDrawer();
    if (chips) chips.innerHTML = "";
    if (root) {
      root.innerHTML = '<p class="admin-loading">Cargando menú…</p>';
    }
    return fetch("api/menu.php", { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("No se pudo cargar el menú (" + r.status + ").");
        return r.json();
      })
      .then(function (data) {
        if (!data || !Array.isArray(data.categories)) {
          throw new Error("Respuesta de menú inválida.");
        }
        menuState = {
          logoUrl: (data.logoUrl && String(data.logoUrl)) || "",
          currencySymbol: data.currencySymbol || "$",
          checkoutPayment: normalizeMenuCheckoutPayment(data.checkoutPayment),
          categories: Array.isArray(data.categories) ? deepClone(data.categories) : [],
          modifierLibrary: Array.isArray(data.modifierLibrary)
            ? deepClone(data.modifierLibrary)
            : [],
        };
        if (!Array.isArray(menuState.modifierLibrary)) menuState.modifierLibrary = [];
        menuState.modifierLibrary.forEach(function (m) {
          ensureModifierGroupDefaults(m);
        });
        menuState.categories.forEach(function (c) {
          if (!Array.isArray(c.products)) c.products = [];
          c.products.forEach(function (p) {
            ensureProductDefaults(p);
          });
        });
        (function applyAdminLogo() {
          var img = document.getElementById("admin-logo");
          var lg = document.getElementById("logo-url");
          var url = (menuState.logoUrl || "").trim();
          if (lg) lg.value = url;
          if (img && url) img.src = url;
        })();
        renderCheckoutPaymentAdmin();
        render();
      })
      .catch(function (e) {
        if (chips) chips.innerHTML = "";
        if (root) {
          root.innerHTML =
            '<p class="admin-loading">' +
            (e.message || "Error al cargar.") +
            "</p>";
        }
        showBanner("error", e.message || "Error al cargar el menú.");
      });
  }

  function saveToServer() {
    var root = document.getElementById("admin-root");
    syncFromInputs(root);
    var payload = buildPayload();
    var err = validateIds(payload);
    if (err) {
      showBanner("error", err);
      return;
    }
    hideBanner();
    var btn = document.getElementById("btn-save");
    if (btn) btn.disabled = true;

    fetch("api/save-menu.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (r) {
        return r
          .json()
          .then(function (body) {
            return { ok: r.ok, body: body };
          })
          .catch(function () {
            return {
              ok: false,
              body: {
                ok: false,
                error:
                  "La respuesta no es JSON. ¿Existe api/save-menu.php y PHP está activo en Apache?",
              },
            };
          });
      })
      .then(function (res) {
        if (res.body && res.body.ok) {
          showBanner(
            "ok",
            res.body && res.body.storage === "mysql"
              ? "Guardado correctamente en MySQL."
              : "Guardado correctamente en data/menu.json."
          );
          menuState.currencySymbol = payload.currencySymbol;
        } else {
          showBanner(
            "error",
            (res.body && res.body.error) ||
              "No se pudo guardar (¿PHP desactivado o ruta incorrecta?)."
          );
        }
      })
      .catch(function () {
        showBanner(
          "error",
          "No hubo respuesta del servidor. Usa «Descargar JSON» o revisa que Apache/PHP esté activo."
        );
      })
      .then(function () {
        if (btn) btn.disabled = false;
      });
  }

  function downloadJson() {
    var root = document.getElementById("admin-root");
    syncFromInputs(root);
    var payload = buildPayload();
    var err = validateIds(payload);
    if (err) {
      showBanner("error", err);
      return;
    }
    var blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "menu.json";
    a.click();
    URL.revokeObjectURL(url);
    showBanner("ok", "Archivo menu.json generado. Cópialo a la carpeta data/ reemplazando el anterior.");
  }

  function init() {
    var root = document.getElementById("admin-root");
    if (root) {
      root.addEventListener("input", function (e) {
        var t = e.target;
        if (!(t instanceof HTMLElement)) return;
        if (!t.matches("[data-cat-idx][data-field]")) return;
        syncFromInputs(root);
        if (
          t.matches('input[data-field="id"]') &&
          !t.hasAttribute("data-prod-idx")
        ) {
          var sec = t.closest(".olc-cat");
          var cix = parseInt(t.getAttribute("data-cat-idx"), 10);
          var cid =
            menuState.categories[cix] && menuState.categories[cix].id;
          if (sec && cid != null) sec.setAttribute("data-admin-cat-id", cid);
        }
        if (t.classList.contains("olc-cat__title-input")) {
          var chipHost = document.getElementById("admin-category-chips");
          var cix = parseInt(t.getAttribute("data-cat-idx"), 10);
          if (chipHost && chipHost.children[cix]) {
            chipHost.children[cix].textContent = t.value.trim() || "Sin nombre";
          }
        }
      });
      root.addEventListener("change", function (e) {
        var t = e.target;
        if (!(t instanceof HTMLElement)) return;
        if (t.matches('input[type="checkbox"][data-field="layout"]')) {
          syncFromInputs(root);
        }
      });
    }

    var filter = document.getElementById("menu-filter");
    if (filter) {
      filter.addEventListener("input", applyMenuFilter);
    }

    var cur = document.getElementById("currency-symbol");
    if (cur) {
      cur.addEventListener("input", function () {
        if (menuState) menuState.currencySymbol = cur.value;
      });
    }

    var back = document.getElementById("drawer-backdrop");
    var btnClose = document.getElementById("drawer-btn-close");
    if (back) {
      back.addEventListener("click", closeProductDrawer);
    }
    if (btnClose) {
      btnClose.addEventListener("click", closeProductDrawer);
    }
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && drawerTarget) {
        closeProductDrawer();
      }
    });

    var navP = document.getElementById("nav-admin-products");
    var navM = document.getElementById("nav-admin-modifiers");
    var navPay = document.getElementById("nav-admin-payment");
    if (navP) {
      navP.addEventListener("click", function (e) {
        e.preventDefault();
        setAdminView("products");
      });
    }
    if (navM) {
      navM.addEventListener("click", function (e) {
        e.preventDefault();
        setAdminView("modifiers");
      });
    }
    if (navPay) {
      navPay.addEventListener("click", function (e) {
        e.preventDefault();
        setAdminView("payment");
      });
    }

    var modF = document.getElementById("mod-lib-filter");
    if (modF) {
      modF.addEventListener("input", function () {
        renderModifierLibrary();
      });
    }

    var btnModCreate = document.getElementById("btn-mod-lib-create");
    if (btnModCreate) {
      btnModCreate.addEventListener("click", function () {
        if (!menuState) return;
        if (!Array.isArray(menuState.modifierLibrary)) menuState.modifierLibrary = [];
        var nid = uniqueModId();
        menuState.modifierLibrary.push({
          id: nid,
          name: "Nueva categoría",
          optional: true,
          options: [{ name: "Opción 1", price: 0 }],
        });
        expandedLibModId = nid;
        renderModifierLibrary();
      });
    }

    loadMenu();

    var btnSave = document.getElementById("btn-save");
    if (btnSave) btnSave.addEventListener("click", saveToServer);

    var btnDl = document.getElementById("btn-download");
    if (btnDl) btnDl.addEventListener("click", downloadJson);

    var btnReload = document.getElementById("btn-reload");
    if (btnReload) btnReload.addEventListener("click", loadMenu);

    var btnUpload = document.getElementById("btn-upload-logo");
    if (btnUpload) {
      btnUpload.addEventListener("click", function () {
        var fileInput = document.getElementById("logo-file");
        var urlInput = document.getElementById("logo-url");
        var img = document.getElementById("admin-logo");
        if (!fileInput || !urlInput) return;
        var file = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
        if (!file) {
          showBanner("error", "Selecciona un archivo de imagen para subir.");
          return;
        }
        hideBanner();
        btnUpload.disabled = true;
        btnUpload.textContent = "Subiendo…";
        var fd = new FormData();
        fd.append("file", file);
        fetch("api/upload-logo.php", { method: "POST", body: fd })
          .then(function (r) {
            return r
              .json()
              .catch(function () {
                throw new Error("La respuesta no es JSON. ¿Está activo PHP en Apache?");
              })
              .then(function (j) {
                if (!r.ok || !j || !j.ok) {
                  throw new Error((j && j.error) || "Error al subir el logo.");
                }
                return j;
              });
          })
          .then(function (j) {
            urlInput.value = j.url;
            if (menuState) menuState.logoUrl = j.url;
            if (img) img.src = j.url;
            showBanner("ok", "Logo subido: " + j.url + " (recuerda Guardar).");
          })
          .catch(function (e) {
            showBanner("error", e.message || "No se pudo subir el logo.");
          })
          .finally(function () {
            btnUpload.disabled = false;
            btnUpload.textContent = "Subir logo";
          });
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
