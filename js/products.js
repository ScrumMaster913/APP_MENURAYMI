(function () {
  const CART_KEY = "intiRaymiCart:v1";
  let menuModifierLibrary = [];
  /** Paso datos domicilio dentro del mismo modal de checkout (no popup aparte). */
  let checkoutDeliveryStep = false;

  function cloneModifierGroup(g) {
    return JSON.parse(JSON.stringify(g));
  }

  function normalizeModifierGroupForClient(g) {
    if (!g || !Array.isArray(g.options)) return;
    g.options.forEach(function (o) {
      if (!o || typeof o !== "object") return;
      if (!o.id) o.id = o.name ? String(o.name) : "opt-" + Math.random().toString(36).slice(2);
      if (o.maxQty == null || isNaN(parseInt(String(o.maxQty), 10))) o.maxQty = 99;
      o.maxQty = Math.max(1, Math.min(99, parseInt(String(o.maxQty), 10) || 99));
      if (o.status !== "hidden") o.status = "available";
    });
  }

  function effectiveModifiers(product, lib) {
    const libArr = Array.isArray(lib) ? lib : [];
    const seen = Object.create(null);
    const out = [];
    const ids = Array.isArray(product.modifierIds) ? product.modifierIds : [];
    ids.forEach(function (id) {
      if (!id || seen[id]) return;
      const found = libArr.find(function (x) {
        return x && x.id === id;
      });
      if (found) {
        seen[id] = true;
        const copy = cloneModifierGroup(found);
        normalizeModifierGroupForClient(copy);
        out.push(copy);
      }
    });
    const inline = Array.isArray(product.modifiers) ? product.modifiers : [];
    inline.forEach(function (m) {
      if (!m || !m.name) return;
      const mid = m.id;
      if (mid && seen[mid]) return;
      if (mid) seen[mid] = true;
      const copy = cloneModifierGroup(m);
      normalizeModifierGroupForClient(copy);
      out.push(copy);
    });
    return out;
  }

  function optionKey(o) {
    if (!o) return "";
    return o.id ? String(o.id) : String(o.name || "");
  }

  function visibleModifierOptions(group) {
    const opts = Array.isArray(group && group.options) ? group.options : [];
    return opts.filter(function (o) {
      return o && o.name && o.status !== "hidden";
    });
  }

  function resolveGroupDefaults(group) {
    const optional = !!group.optional;
    const multiSelect = Object.prototype.hasOwnProperty.call(group, "multiSelect")
      ? !!group.multiSelect
      : true;
    let minS = parseInt(String(group.minSelect), 10);
    if (isNaN(minS)) minS = 0;
    minS = Math.max(0, Math.min(40, minS));
    let maxS = parseInt(String(group.maxSelect), 10);
    if (isNaN(maxS)) maxS = 0;
    maxS = Math.max(0, Math.min(40, maxS));
    if (!optional && multiSelect && minS < 1) minS = 1;
    return { multiSelect: multiSelect, minSelect: minS, maxSelect: maxS, optional: optional };
  }

  function optionMaxQty(o) {
    const mq = parseInt(String(o && o.maxQty), 10);
    if (isNaN(mq) || mq < 1) return 99;
    return Math.min(99, mq);
  }

  function optByKey(group, key) {
    const opts = visibleModifierOptions(group);
    for (let i = 0; i < opts.length; i++) {
      if (optionKey(opts[i]) === key) return opts[i];
    }
    return null;
  }

  function optionLinePrice(o) {
    const p = Math.round(Number(o && o.price)) || 0;
    const d = Math.round(Number(o && o.discount)) || 0;
    return Math.max(0, p - d);
  }

  function formatCLP(amount) {
    return (
      "$" +
      Math.round(Number(amount) || 0)
        .toString()
        .replace(/\B(?=(\d{3})+(?!\d))/g, ".")
    );
  }

  function productPriceLabel(p) {
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

  function productSchemaPrice(p) {
    if (p.pricingMode === "variants" && p.variants && p.variants.length) {
      var prices = p.variants.map(function (v) {
        return Math.round(Number(v.price)) || 0;
      });
      return String(Math.min.apply(null, prices));
    }
    return String(Math.round(Number(p.price)) || 0);
  }

  function isProductHidden(p) {
    return p.status === "hidden";
  }

  function isProductOutOfStock(p) {
    if (!p || !p.stockEnabled) return false;
    const s = parseInt(String(p.stock), 10);
    return !isFinite(s) || s <= 0;
  }

  function maxProductOrderQty(p) {
    if (!p || !p.stockEnabled) return 99;
    const s = parseInt(String(p.stock), 10);
    if (!isFinite(s) || s <= 0) return 0;
    return Math.min(99, s);
  }

  function normalize(s) {
    return (s || "")
      .toString()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function clamp(n, min, max) {
    const x = Number(n);
    if (!isFinite(x)) return min;
    return Math.max(min, Math.min(max, x));
  }

  function safeJsonParse(s, fallback) {
    try {
      return JSON.parse(s);
    } catch (_) {
      return fallback;
    }
  }

  function loadCart() {
    const raw = localStorage.getItem(CART_KEY);
    const data = safeJsonParse(raw, null);
    if (!data || typeof data !== "object") return { items: [], serviceType: "" };
    if (!Array.isArray(data.items)) data.items = [];
    if (typeof data.serviceType !== "string") data.serviceType = "";
    if (typeof data.deliveryName !== "string") data.deliveryName = "";
    if (typeof data.deliveryPhone !== "string") data.deliveryPhone = "";
    return data;
  }

  function saveCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }

  function isDeliveryCart(cart) {
    const raw = String((cart && cart.serviceType) || "");
    const t = raw
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    return t.indexOf("domicilio") !== -1;
  }

  function cartCount(cart) {
    return (cart.items || []).reduce(function (acc, it) {
      return acc + (Number(it.qty) || 0);
    }, 0);
  }

  function cartTotal(cart) {
    return (cart.items || []).reduce(function (acc, it) {
      return acc + (Number(it.total) || 0);
    }, 0);
  }

  function optionTotal(mods) {
    return (mods || []).reduce(function (acc, m) {
      return acc + (Number(m.price) || 0) * (Number(m.qty) || 1);
    }, 0);
  }

  function buildCartItemKey(productId, variantName, mods, notes) {
    const core = {
      productId: productId,
      variantName: variantName || "",
      mods: (mods || []).map(function (m) {
        return { g: m.group, o: m.option, p: m.price, q: m.qty || 1 };
      }),
      notes: notes || "",
    };
    return JSON.stringify(core);
  }

  function upsertCartItem(cart, item) {
    const key = item.key;
    const existing = (cart.items || []).find(function (it) {
      return it.key === key;
    });
    if (existing) {
      existing.qty = clamp((existing.qty || 0) + (item.qty || 1), 1, 99);
      existing.total = existing.qty * existing.unit;
    } else {
      cart.items.push(item);
    }
    return cart;
  }

  function removeCartItem(cart, key) {
    cart.items = (cart.items || []).filter(function (it) {
      return it.key !== key;
    });
    return cart;
  }

  function setCartItemQty(cart, key, qty) {
    const it = (cart.items || []).find(function (x) {
      return x.key === key;
    });
    if (!it) return cart;
    const q = clamp(qty, 0, 99);
    if (q <= 0) return removeCartItem(cart, key);
    it.qty = q;
    it.total = it.qty * it.unit;
    return cart;
  }

  function filterCategories(categories, query) {
    const q = normalize(query).trim();
    if (!q) return categories;
    return categories
      .map(function (cat) {
        const products = (cat.products || []).filter(function (p) {
          if (isProductHidden(p)) return false;
          const hay = normalize(p.name) + " " + normalize(p.description || "");
          return hay.indexOf(q) !== -1;
        });
        return {
          id: cat.id,
          name: cat.name,
          products: products,
          layout: cat.layout,
        };
      })
      .filter(function (cat) {
        return cat.products.length > 0;
      });
  }

  function indexMenu(categories) {
    const map = new Map();
    (categories || []).forEach(function (cat) {
      (cat.products || []).forEach(function (p) {
        if (p && p.id) map.set(p.id, p);
      });
    });
    return map;
  }

  function injectMenuJsonLd(categories, currencySymbol) {
    const existing = document.getElementById("menu-jsonld");
    if (existing) existing.remove();
    const sections = categories.map(function (cat) {
      const items = (cat.products || []).map(function (p) {
        if (isProductHidden(p)) return null;
        return {
          "@type": "MenuItem",
          name: p.name,
          description: p.description || undefined,
          offers: {
            "@type": "Offer",
            price: productSchemaPrice(p),
            priceCurrency: "CLP",
          },
        };
      }).filter(Boolean);
      return {
        "@type": "MenuSection",
        name: cat.name,
        hasMenuItem: items,
      };
    });
    const data = {
      "@context": "https://schema.org",
      "@type": "Menu",
      name: "Inti Raymi Restaurante — Menú",
      hasMenuSection: sections,
    };
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.id = "menu-jsonld";
    script.textContent = JSON.stringify(data);
    document.head.appendChild(script);
  }

  function updateOrderBar(cart) {
    const bar = document.getElementById("order-bar");
    const summaryLine = document.getElementById("order-summary-line");
    const totalEl = document.getElementById("order-total");
    if (!bar || !summaryLine || !totalEl) return;
    const count = cartCount(cart);
    if (count <= 0) {
      bar.hidden = true;
      return;
    }
    bar.hidden = false;
    summaryLine.textContent = count === 1 ? "1 producto" : count + " productos";
    totalEl.textContent = formatCLP(cartTotal(cart));
  }

  function openOverlay(which) {
    const back = document.getElementById("overlay-backdrop");
    if (back) back.hidden = false;
    document.body.classList.add("olc-drawer-open");
    if (which) which.hidden = false;
  }

  function closeAllOverlays() {
    checkoutDeliveryStep = false;
    const back = document.getElementById("overlay-backdrop");
    const pm = document.getElementById("product-modal");
    const cm = document.getElementById("checkout-modal");
    const oosBanner = document.getElementById("product-modal-oos-banner");
    if (back) back.hidden = true;
    if (pm) pm.hidden = true;
    if (cm) cm.hidden = true;
    if (oosBanner) {
      if (oosBanner.__olcExceededTimer) {
        clearTimeout(oosBanner.__olcExceededTimer);
        oosBanner.__olcExceededTimer = null;
      }
      oosBanner.hidden = true;
    }
    document.body.classList.remove("olc-drawer-open");
  }

  function closeOverlays() {
    closeAllOverlays();
  }

  function buildModifierUI(product) {
    const wrap = document.createElement("div");
    const mods = effectiveModifiers(product, menuModifierLibrary);
    const state = {
      mode: product.pricingMode === "variants" ? "variants" : "simple",
      variantName: "",
      variantPrice: null,
      selectionOk: true,
      requiredGroups: {},
      optionalGroups: {},
      singlePick: {},
      notes: "",
      orderQty: 1,
    };

    function getVariantBasePrice() {
      if (state.mode === "variants" && state.variantPrice != null) return state.variantPrice;
      return Math.round(Number(product.price)) || 0;
    }

    function countDistinctPositiveQty(gid, group) {
      const opts = visibleModifierOptions(group);
      const map = state.requiredGroups[gid] || {};
      let c = 0;
      opts.forEach(function (o) {
        const k = optionKey(o);
        if ((map[k] || 0) > 0) c++;
      });
      return c;
    }

    function collectSelectedMods() {
      const out = [];
      mods.forEach(function (g) {
        const gid = String(g.id || g.name);
        const gname = g.name || "Modificadores";
        const rules = resolveGroupDefaults(g);
        const opts = visibleModifierOptions(g);
        if (!rules.multiSelect && !rules.optional) {
          const pk = state.singlePick[gid];
          if (!pk) return;
          const o = optByKey(g, pk);
          if (!o) return;
          out.push({
            group: gname,
            option: o.name,
            price: optionLinePrice(o),
            qty: 1,
            sku: o.sku || "",
          });
          return;
        }
        if (!rules.multiSelect && rules.optional) {
          const pk = state.singlePick[gid];
          if (!pk) return;
          const o = optByKey(g, pk);
          if (!o) return;
          out.push({
            group: gname,
            option: o.name,
            price: optionLinePrice(o),
            qty: 1,
            sku: o.sku || "",
          });
          return;
        }
        if (rules.multiSelect && rules.optional) {
          const set = state.optionalGroups[gid];
          if (!set) return;
          opts.forEach(function (o) {
            const k = optionKey(o);
            if (!set.has(k)) return;
            out.push({
              group: gname,
              option: o.name,
              price: optionLinePrice(o),
              qty: 1,
              sku: o.sku || "",
            });
          });
          return;
        }
        const qtyMap = state.requiredGroups[gid] || {};
        opts.forEach(function (o) {
          const k = optionKey(o);
          const qty = qtyMap[k] || 0;
          if (qty <= 0) return;
          out.push({
            group: gname,
            option: o.name,
            price: optionLinePrice(o),
            qty: qty,
            sku: o.sku || "",
          });
        });
      });
      return out;
    }

    function computeUnitPrice() {
      return getVariantBasePrice() + optionTotal(collectSelectedMods());
    }

    function ensureAllValid() {
      let ok = true;
      mods.forEach(function (group) {
        const gid = String(group.id || group.name);
        const rules = resolveGroupDefaults(group);
        const opts = visibleModifierOptions(group);
        if (!opts.length) return;

        if (!rules.multiSelect && !rules.optional) {
          if (!state.singlePick[gid]) ok = false;
          return;
        }
        if (!rules.multiSelect && rules.optional) {
          return;
        }
        if (rules.multiSelect && rules.optional) {
          const set = state.optionalGroups[gid] || new Set();
          const n = set.size;
          if (n < rules.minSelect) ok = false;
          if (rules.maxSelect > 0 && n > rules.maxSelect) ok = false;
          return;
        }
        const n = countDistinctPositiveQty(gid, group);
        if (n < rules.minSelect) ok = false;
        if (rules.maxSelect > 0 && n > rules.maxSelect) ok = false;
      });
      state.selectionOk = ok;
      return ok;
    }

    const groupErrorByGid = {};

    function groupValidationMessage(group) {
      const gid = String(group.id || group.name);
      const rules = resolveGroupDefaults(group);
      const opts = visibleModifierOptions(group);
      if (!opts.length) {
        if (!rules.multiSelect && !rules.optional && !state.singlePick[gid]) {
          return "Seleccione una opción";
        }
        return null;
      }
      if (!rules.multiSelect && !rules.optional) {
        if (!state.singlePick[gid]) return "Seleccione una opción";
        return null;
      }
      if (!rules.multiSelect && rules.optional) {
        return null;
      }
      if (rules.multiSelect && rules.optional) {
        const set = state.optionalGroups[gid] || new Set();
        const n = set.size;
        if (n < rules.minSelect) {
          if (rules.minSelect === 1) return "Seleccione mínimo 1 opción";
          return "Seleccione mínimo " + rules.minSelect + " opciones";
        }
        if (rules.maxSelect > 0 && n > rules.maxSelect) {
          return "Seleccione como máximo " + rules.maxSelect + " opciones";
        }
        return null;
      }
      const n = countDistinctPositiveQty(gid, group);
      if (n < rules.minSelect) {
        if (rules.minSelect === 1) return "Seleccione mínimo 1 opción";
        return "Seleccione mínimo " + rules.minSelect + " opciones";
      }
      if (rules.maxSelect > 0 && n > rules.maxSelect) {
        return "Seleccione como máximo " + rules.maxSelect + " opciones";
      }
      return null;
    }

    function clearGroupErrors() {
      Object.keys(groupErrorByGid).forEach(function (k) {
        const el = groupErrorByGid[k];
        if (el) {
          el.hidden = true;
          el.textContent = "";
        }
      });
    }

    function showAddValidationErrors() {
      ensureAllValid();
      let first = null;
      mods.forEach(function (group) {
        const gid = String(group.id || group.name);
        const el = groupErrorByGid[gid];
        if (!el) return;
        const msg = groupValidationMessage(group);
        if (msg) {
          el.textContent = msg;
          el.hidden = false;
          if (!first) first = el;
        } else {
          el.hidden = true;
          el.textContent = "";
        }
      });
      if (first) {
        first.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }

    mods.forEach(function (group) {
      const gid = String(group.id || group.name);
      const rules = resolveGroupDefaults(group);
      const opts = visibleModifierOptions(group);
      if (!rules.multiSelect && !rules.optional) {
        state.singlePick[gid] = opts.length ? optionKey(opts[0]) : "";
      } else if (!rules.multiSelect && rules.optional) {
        state.singlePick[gid] = "";
      } else if (rules.multiSelect && rules.optional) {
        state.optionalGroups[gid] = new Set();
      } else {
        state.requiredGroups[gid] = {};
        opts.forEach(function (o) {
          state.requiredGroups[gid][optionKey(o)] = 0;
        });
      }
    });

    const title = document.createElement("h3");
    title.className = "prod-modal-title";
    title.textContent = product.name;
    wrap.appendChild(title);

    const price = document.createElement("p");
    price.className = "prod-modal-price";
    price.textContent = productPriceLabel(product);
    wrap.appendChild(price);

    function refreshPriceCta() {
      clearGroupErrors();
      price.textContent = formatCLP(computeUnitPrice());
      setCtaLabel();
    }

    if (product.stockEnabled) {
      const st = Math.max(0, parseInt(String(product.stock), 10) || 0);
      const mn = Math.max(0, parseInt(String(product.minStock), 10) || 0);
      const info = document.createElement("p");
      info.className = "prod-modal-stock";
      if (st <= 0) {
        info.textContent = "Producto agotado.";
        info.classList.add("prod-modal-stock--out");
      } else {
        info.textContent = st + " disponible" + (st === 1 ? "" : "s");
        if (mn > 0 && st <= mn) {
          info.textContent += " · Por debajo del mínimo (" + mn + ")";
          info.classList.add("prod-modal-stock--low");
        }
      }
      wrap.appendChild(info);
    }

    if (product.description) {
      const desc = document.createElement("p");
      desc.className = "prod-modal-desc";
      desc.textContent = product.description;
      wrap.appendChild(desc);
    }

    if (product.pricingMode === "variants" && Array.isArray(product.variants) && product.variants.length) {
      const g = document.createElement("div");
      g.className = "mod-group";
      const head = document.createElement("div");
      head.className = "mod-group__head";
      const h = document.createElement("p");
      h.className = "mod-group__title";
      h.textContent = "Selecciona el tipo de servicio";
      const tag = document.createElement("span");
      tag.className = "mod-group__tag";
      tag.textContent = "Obligatorio";
      head.appendChild(h);
      head.appendChild(tag);
      g.appendChild(head);

      product.variants.forEach(function (v, i) {
        const row = document.createElement("label");
        row.className = "mod-check";
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = "variant";
        radio.checked = i === 0;
        if (i === 0) {
          state.variantName = v.name;
          state.variantPrice = Math.round(Number(v.price)) || 0;
        }
        radio.addEventListener("change", function () {
          state.variantName = v.name;
          state.variantPrice = Math.round(Number(v.price)) || 0;
          refreshPriceCta();
        });
        const text = document.createElement("div");
        text.style.flex = "1";
        text.innerHTML =
          '<div class=\"mod-option__name\">' +
          v.name +
          '</div><div class=\"mod-option__price\">' +
          formatCLP(v.price) +
          "</div>";
        row.appendChild(radio);
        row.appendChild(text);
        g.appendChild(row);
      });

      wrap.appendChild(g);
    }

    mods.forEach(function (group) {
      const gid = String(group.id || group.name);
      const rules = resolveGroupDefaults(group);
      const opts = visibleModifierOptions(group);
      const g = document.createElement("div");
      g.className = "mod-group";
      const head = document.createElement("div");
      head.className = "mod-group__head";
      const h = document.createElement("p");
      h.className = "mod-group__title";
      h.textContent = group.name || "Modificadores";
      const tag = document.createElement("span");
      tag.className = "mod-group__tag";
      const tagBits = [];
      tagBits.push(rules.optional ? "Opcional" : "Obligatorio");
      tagBits.push(rules.multiSelect ? "Varios" : "Sólo uno");
      if (rules.multiSelect && (rules.minSelect > 0 || rules.maxSelect > 0)) {
        tagBits.push(
          "Min " + rules.minSelect + (rules.maxSelect > 0 ? " · Max " + rules.maxSelect : "")
        );
      }
      tag.textContent = tagBits.join(" · ");
      head.appendChild(h);
      head.appendChild(tag);
      g.appendChild(head);
      const errEl = document.createElement("p");
      errEl.className = "mod-group__error";
      errEl.hidden = true;
      errEl.setAttribute("role", "alert");
      g.appendChild(errEl);
      groupErrorByGid[gid] = errEl;

      if (!rules.multiSelect && !rules.optional) {
        const rname = "modpick-" + gid.replace(/[^a-zA-Z0-9_-]/g, "_");
        opts.forEach(function (o) {
          const row = document.createElement("label");
          row.className = "mod-check";
          const radio = document.createElement("input");
          radio.type = "radio";
          radio.name = rname;
          const k = optionKey(o);
          radio.checked = state.singlePick[gid] === k;
          radio.addEventListener("change", function () {
            state.singlePick[gid] = k;
            refreshPriceCta();
          });
          const text = document.createElement("div");
          text.style.flex = "1";
          const lp = optionLinePrice(o);
          text.innerHTML =
            '<div class="mod-option__name">' +
            o.name +
            '</div><div class="mod-option__price">' +
            (lp ? "+" + formatCLP(lp) : "") +
            "</div>";
          row.appendChild(radio);
          row.appendChild(text);
          g.appendChild(row);
        });
      } else if (!rules.multiSelect && rules.optional) {
        const rname = "modpick-o-" + gid.replace(/[^a-zA-Z0-9_-]/g, "_");
        const rowNone = document.createElement("label");
        rowNone.className = "mod-check";
        const r0 = document.createElement("input");
        r0.type = "radio";
        r0.name = rname;
        r0.checked = !state.singlePick[gid];
        r0.addEventListener("change", function () {
          state.singlePick[gid] = "";
          refreshPriceCta();
        });
        const t0 = document.createElement("div");
        t0.style.flex = "1";
        t0.innerHTML = '<div class="mod-option__name">Sin agregar</div>';
        rowNone.appendChild(r0);
        rowNone.appendChild(t0);
        g.appendChild(rowNone);
        opts.forEach(function (o) {
          const row = document.createElement("label");
          row.className = "mod-check";
          const radio = document.createElement("input");
          radio.type = "radio";
          radio.name = rname;
          const k = optionKey(o);
          radio.checked = state.singlePick[gid] === k;
          radio.addEventListener("change", function () {
            state.singlePick[gid] = k;
            refreshPriceCta();
          });
          const text = document.createElement("div");
          text.style.flex = "1";
          const lp = optionLinePrice(o);
          text.innerHTML =
            '<div class="mod-option__name">' +
            o.name +
            '</div><div class="mod-option__price">' +
            (lp ? "+" + formatCLP(lp) : "") +
            "</div>";
          row.appendChild(radio);
          row.appendChild(text);
          g.appendChild(row);
        });
      } else if (rules.multiSelect && rules.optional) {
        if (!state.optionalGroups[gid]) state.optionalGroups[gid] = new Set();
        opts.forEach(function (o) {
          const row = document.createElement("label");
          row.className = "mod-check";
          const cb = document.createElement("input");
          cb.type = "checkbox";
          const k = optionKey(o);
          cb.checked = state.optionalGroups[gid].has(k);
          cb.addEventListener("change", function () {
            if (cb.checked) {
              if (rules.maxSelect > 0 && state.optionalGroups[gid].size >= rules.maxSelect) {
                cb.checked = false;
                return;
              }
              state.optionalGroups[gid].add(k);
            } else {
              state.optionalGroups[gid].delete(k);
            }
            refreshPriceCta();
          });
          const text = document.createElement("div");
          text.style.flex = "1";
          const lp = optionLinePrice(o);
          text.innerHTML =
            '<div class="mod-option__name">' +
            o.name +
            '</div><div class="mod-option__price">' +
            (lp ? "+" + formatCLP(lp) : "") +
            "</div>";
          row.appendChild(cb);
          row.appendChild(text);
          g.appendChild(row);
        });
      } else {
        if (!state.requiredGroups[gid]) state.requiredGroups[gid] = {};
        opts.forEach(function (o) {
          const ok = optionKey(o);
          const row = document.createElement("div");
          row.className = "mod-option";
          const left = document.createElement("div");
          left.style.flex = "1";
          const lp = optionLinePrice(o);
          const meta = o.sku ? '<div class="mod-option__sku">SKU ' + o.sku + "</div>" : "";
          left.innerHTML =
            '<div class="mod-option__name">' +
            o.name +
            '</div><div class="mod-option__price">' +
            (lp ? "+" + formatCLP(lp) : "") +
            "</div>" +
            meta;
          const minus = document.createElement("button");
          minus.type = "button";
          minus.className = "mod-option__btn";
          minus.textContent = "–";
          const qty = document.createElement("div");
          qty.className = "mod-option__qty";
          qty.textContent = String(state.requiredGroups[gid][ok] || 0);
          const plus = document.createElement("button");
          plus.type = "button";
          plus.className = "mod-option__btn";
          plus.textContent = "+";

          function setQty(n) {
            const cap = optionMaxQty(o);
            state.requiredGroups[gid][ok] = clamp(n, 0, cap);
            qty.textContent = String(state.requiredGroups[gid][ok] || 0);
            ensureAllValid();
            refreshPriceCta();
          }

          minus.addEventListener("click", function () {
            const cur = state.requiredGroups[gid][ok] || 0;
            setQty(cur - 1);
          });
          plus.addEventListener("click", function () {
            const cur = state.requiredGroups[gid][ok] || 0;
            if (cur === 0) {
              const n = countDistinctPositiveQty(gid, group);
              if (rules.maxSelect > 0 && n >= rules.maxSelect) return;
            }
            if (cur >= optionMaxQty(o)) return;
            setQty(cur + 1);
          });

          row.appendChild(left);
          row.appendChild(minus);
          row.appendChild(qty);
          row.appendChild(plus);
          g.appendChild(row);
        });
      }

      wrap.appendChild(g);
    });

    const notesWrap = document.createElement("div");
    notesWrap.className = "mod-group";
    const nh = document.createElement("p");
    nh.className = "mod-group__title";
    nh.textContent = "Comentarios";
    const ta = document.createElement("textarea");
    ta.className = "menu-search"; // reuse base input style
    ta.style.maxWidth = "100%";
    ta.style.margin = "10px 0 0";
    ta.style.minHeight = "90px";
    ta.placeholder = "Ej. sin cebolla, bien cocido…";
    ta.addEventListener("input", function () {
      state.notes = ta.value || "";
    });
    notesWrap.appendChild(nh);
    notesWrap.appendChild(ta);
    wrap.appendChild(notesWrap);

    function setCtaLabel() {
      const cta = document.getElementById("product-add");
      if (!cta) return;
      const unit = computeUnitPrice();
      const oos = isProductOutOfStock(product);
      ensureAllValid();
      const q = Math.max(1, parseInt(String(state.orderQty), 10) || 1);
      const line = unit * q;
      cta.disabled = !!oos;
      if (oos) {
        cta.textContent = "Producto agotado";
      } else {
        cta.textContent = "Agregar • " + formatCLP(line);
      }
    }

    ensureAllValid();
    price.textContent = formatCLP(computeUnitPrice());
    setCtaLabel();

    (function setupProductQtyFooter() {
      const minus = document.getElementById("product-qty-minus");
      const plus = document.getElementById("product-qty-plus");
      const val = document.getElementById("product-qty-value");
      const qwrap = document.getElementById("product-modal-qty-wrap");
      const banner = document.getElementById("product-modal-oos-banner");
      if (!minus || !plus || !val) return;
      state.orderQty = 1;
      const cap = maxProductOrderQty(product);

      function clearStockExceededBannerTimer() {
        if (banner && banner.__olcExceededTimer) {
          clearTimeout(banner.__olcExceededTimer);
          banner.__olcExceededTimer = null;
        }
      }

      function hideStockLimitMessage() {
        clearStockExceededBannerTimer();
        if (banner && !isProductOutOfStock(product)) {
          banner.hidden = true;
        }
      }

      function showStockExceededMessage() {
        if (!banner || isProductOutOfStock(product)) return;
        clearStockExceededBannerTimer();
        banner.hidden = false;
        banner.textContent = "Productos agotados";
        banner.__olcExceededTimer = setTimeout(function () {
          banner.__olcExceededTimer = null;
          if (banner && !isProductOutOfStock(product)) {
            banner.hidden = true;
          }
        }, 10000);
      }

      function refreshQtyFooter() {
        val.textContent = String(state.orderQty);
        minus.disabled = state.orderQty <= 1;
        if (product.stockEnabled) {
          plus.disabled = false;
          hideStockLimitMessage();
        } else {
          plus.disabled = state.orderQty >= 99;
          if (banner) banner.hidden = true;
        }
        setCtaLabel();
      }
      if (isProductOutOfStock(product)) {
        if (qwrap) qwrap.hidden = true;
        if (banner) {
          clearStockExceededBannerTimer();
          banner.hidden = false;
          banner.textContent = "Productos agotados";
        }
        minus.disabled = true;
        plus.disabled = true;
        return;
      }
      if (qwrap) qwrap.hidden = false;
      if (banner) banner.hidden = true;
      minus.onclick = function () {
        state.orderQty = Math.max(1, state.orderQty - 1);
        refreshQtyFooter();
      };
      plus.onclick = function () {
        if (product.stockEnabled) {
          if (state.orderQty >= cap) {
            showStockExceededMessage();
            return;
          }
          state.orderQty = Math.min(cap, state.orderQty + 1);
          refreshQtyFooter();
          return;
        }
        state.orderQty = Math.min(99, state.orderQty + 1);
        refreshQtyFooter();
      };
      refreshQtyFooter();
    })();

    return {
      el: wrap,
      getSelection: function () {
        const q = Math.max(1, Math.min(99, parseInt(String(state.orderQty), 10) || 1));
        const cap = maxProductOrderQty(product);
        const qty = product.stockEnabled ? Math.min(q, Math.max(0, cap)) : q;
        return {
          variantName: state.variantName,
          variantPrice: state.variantPrice,
          mods: collectSelectedMods(),
          notes: state.notes,
          unit: computeUnitPrice(),
          orderQty: qty,
          ok: ensureAllValid() && !isProductOutOfStock(product) && qty >= 1,
        };
      },
      showAddValidationErrors: showAddValidationErrors,
    };
  }

  function setCheckoutChromeMode(deliveryStep) {
    const cm = document.getElementById("checkout-modal");
    const ho = document.getElementById("checkout-head-order");
    const hd = document.getElementById("checkout-head-delivery");
    if (cm) {
      if (deliveryStep) cm.classList.add("checkout-modal--delivery-step");
      else cm.classList.remove("checkout-modal--delivery-step");
    }
    if (ho) ho.hidden = !!deliveryStep;
    if (hd) hd.hidden = !deliveryStep;
  }

  function renderCheckoutDeliveryForm(body, cart) {
    body.innerHTML = "";
    const stack = document.createElement("div");
    stack.className = "checkout-delivery-stack";

    const f1 = document.createElement("div");
    f1.className = "delivery-field";
    const l1 = document.createElement("label");
    l1.className = "delivery-field__label";
    l1.setAttribute("for", "checkout-delivery-name");
    l1.textContent = "Nombre:";
    const wrap1 = document.createElement("div");
    wrap1.className = "delivery-input-wrap";
    const ic = document.createElement("span");
    ic.className = "delivery-input-icon";
    ic.setAttribute("aria-hidden", "true");
    ic.innerHTML =
      "<svg width=\"20\" height=\"20\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\"><path d=\"M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2\"/><circle cx=\"12\" cy=\"7\" r=\"4\"/></svg>";
    const nameInp = document.createElement("input");
    nameInp.type = "text";
    nameInp.id = "checkout-delivery-name";
    nameInp.className = "delivery-input";
    nameInp.setAttribute("autocomplete", "name");
    nameInp.value = cart.deliveryName || "";
    wrap1.appendChild(ic);
    wrap1.appendChild(nameInp);
    f1.appendChild(l1);
    f1.appendChild(wrap1);
    stack.appendChild(f1);

    const f2 = document.createElement("div");
    f2.className = "delivery-field";
    const l2 = document.createElement("label");
    l2.className = "delivery-field__label";
    l2.setAttribute("for", "checkout-delivery-phone");
    l2.textContent = "Teléfono";
    const row = document.createElement("div");
    row.className = "delivery-phone-row";
    const countrySel = document.createElement("select");
    countrySel.id = "checkout-delivery-country";
    countrySel.className = "delivery-country";
    countrySel.setAttribute("aria-label", "Código de país");
    const opt = document.createElement("option");
    opt.value = "+56";
    opt.selected = true;
    opt.textContent = "🇨🇱 +56";
    countrySel.appendChild(opt);
    const phoneInp = document.createElement("input");
    phoneInp.type = "tel";
    phoneInp.id = "checkout-delivery-phone";
    phoneInp.className = "delivery-input delivery-input--phone";
    phoneInp.setAttribute("autocomplete", "tel-national");
    phoneInp.setAttribute("inputmode", "numeric");
    phoneInp.placeholder = "9 1234 5678";
    const full = String(cart.deliveryPhone || "").trim();
    if (full.indexOf("+56") === 0) {
      phoneInp.value = full.slice(3).replace(/^\s+/, "");
    } else {
      phoneInp.value = full;
    }
    row.appendChild(countrySel);
    row.appendChild(phoneInp);
    f2.appendChild(l2);
    f2.appendChild(row);
    stack.appendChild(f2);

    const confirmWrap = document.createElement("div");
    confirmWrap.className = "checkout-delivery-confirm-wrap";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "checkout-delivery-confirm";
    btn.className = "btn delivery-contact-confirm";
    btn.textContent = "Confirmar";
    btn.onclick = function () {
      const n = document.getElementById("checkout-delivery-name");
      const p = document.getElementById("checkout-delivery-phone");
      const co = document.getElementById("checkout-delivery-country");
      if (!n || !p || !co) return;
      const name = String(n.value || "").trim();
      const localDigits = String(p.value || "").replace(/\D/g, "");
      if (name.length < 2) {
        window.alert("Ingresa tu nombre.");
        n.focus();
        return;
      }
      if (localDigits.length < 8) {
        window.alert("Ingresa un teléfono válido.");
        p.focus();
        return;
      }
      const c = loadCart();
      const cc = String(co.value || "+56").trim() || "+56";
      c.deliveryName = name;
      c.deliveryPhone = cc + localDigits;
      saveCart(c);
      checkoutDeliveryStep = false;
      renderCheckout(c);
    };
    confirmWrap.appendChild(btn);
    stack.appendChild(confirmWrap);

    body.appendChild(stack);
    setTimeout(function () {
      nameInp.focus();
    }, 60);
  }

  function renderCheckout(cart) {
    const body = document.getElementById("checkout-modal-body");
    if (!body) return;
    body.innerHTML = "";

    if (!cart.items.length) {
      checkoutDeliveryStep = false;
      setCheckoutChromeMode(false);
      const p = document.createElement("p");
      p.className = "menu-empty";
      p.hidden = false;
      p.textContent = "Tu pedido está vacío.";
      body.appendChild(p);
      return;
    }

    if (checkoutDeliveryStep && !isDeliveryCart(cart)) {
      checkoutDeliveryStep = false;
    }

    if (checkoutDeliveryStep && isDeliveryCart(cart)) {
      setCheckoutChromeMode(true);
      renderCheckoutDeliveryForm(body, cart);
      return;
    }

    setCheckoutChromeMode(false);

    cart.items.forEach(function (it) {
      const row = document.createElement("div");
      row.className = "cart-item";

      const rm = document.createElement("button");
      rm.type = "button";
      rm.className = "cart-item__remove";
      rm.setAttribute("aria-label", "Eliminar " + it.name + " del pedido");
      rm.innerHTML =
        "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"20\" height=\"20\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" aria-hidden=\"true\"><path d=\"M3 6h18\"/><path d=\"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6\"/><path d=\"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\"/><line x1=\"10\" y1=\"11\" x2=\"10\" y2=\"17\"/><line x1=\"14\" y1=\"11\" x2=\"14\" y2=\"17\"/></svg>";
      rm.addEventListener("click", function () {
        const c = loadCart();
        removeCartItem(c, it.key);
        saveCart(c);
        updateOrderBar(c);
        renderCheckout(c);
      });

      const left = document.createElement("div");
      left.className = "cart-item__left";
      const name = document.createElement("p");
      name.className = "cart-item__name";
      name.textContent = it.name + (it.variantName ? " («" + it.variantName + "»)" : "");
      const meta = document.createElement("p");
      meta.className = "cart-item__meta";
      const bits = [];
      if (it.mods && it.mods.length) {
        bits.push(
          it.mods
            .map(function (m) {
              return (m.qty && m.qty > 1 ? m.qty + "× " : "") + m.option;
            })
            .join(", ")
        );
      }
      if (it.notes) bits.push("Nota: " + it.notes);
      meta.textContent = bits.join(" · ");
      left.appendChild(name);
      if (meta.textContent) left.appendChild(meta);

      const right = document.createElement("div");
      right.className = "cart-item__right";
      const pr = document.createElement("div");
      pr.className = "cart-item__price";
      pr.textContent = formatCLP(it.total);

      const qty = document.createElement("div");
      qty.className = "cart-qty";
      const minus = document.createElement("button");
      minus.type = "button";
      minus.textContent = "–";
      const qn = document.createElement("span");
      qn.textContent = String(it.qty);
      const plus = document.createElement("button");
      plus.type = "button";
      plus.textContent = "+";
      minus.addEventListener("click", function () {
        const c = loadCart();
        setCartItemQty(c, it.key, (it.qty || 1) - 1);
        saveCart(c);
        updateOrderBar(c);
        renderCheckout(c);
      });
      plus.addEventListener("click", function () {
        const c = loadCart();
        setCartItemQty(c, it.key, (it.qty || 1) + 1);
        saveCart(c);
        updateOrderBar(c);
        renderCheckout(c);
      });
      qty.appendChild(minus);
      qty.appendChild(qn);
      qty.appendChild(plus);

      right.appendChild(pr);
      right.appendChild(qty);

      row.appendChild(rm);
      row.appendChild(left);
      row.appendChild(right);
      body.appendChild(row);
    });

    const total = document.createElement("p");
    total.style.margin = "16px 0 0";
    total.style.fontWeight = "900";
    total.textContent = "Total: " + formatCLP(cartTotal(cart));
    body.appendChild(total);

    const choices = document.createElement("div");
    choices.className = "checkout-choices";
    const b1 = document.createElement("button");
    b1.type = "button";
    b1.className = "checkout-choice";
    b1.textContent = "Para llevar";
    const b2 = document.createElement("button");
    b2.type = "button";
    b2.className = "checkout-choice is-secondary";
    b2.textContent = "A domicilio";
    function setType(t) {
      const c = loadCart();
      c.serviceType = t;
      checkoutDeliveryStep = false;
      if (!isDeliveryCart(c)) {
        c.deliveryName = "";
        c.deliveryPhone = "";
      }
      saveCart(c);
      renderCheckout(c);
    }
    b1.addEventListener("click", function () {
      setType("Para llevar");
    });
    b2.addEventListener("click", function () {
      const c = loadCart();
      c.serviceType = "A domicilio";
      saveCart(c);
      checkoutDeliveryStep = true;
      renderCheckout(c);
    });
    choices.appendChild(b1);
    choices.appendChild(b2);
    body.appendChild(choices);

    const note = document.createElement("p");
    note.className = "checkout-note";
    note.textContent = cart.serviceType
      ? "Seleccionado: " + cart.serviceType
      : "Selecciona Para llevar o A domicilio.";
    body.appendChild(note);
  }

  function render(categories, currencySymbol, productIndex) {
    const nav = document.getElementById("menu-category-nav");
    const root = document.getElementById("menu-root");
    const empty = document.getElementById("menu-empty");
    if (!nav || !root) return;

    nav.innerHTML = "";
    root.innerHTML = "";

    if (!categories.length) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    categories.forEach(function (cat) {
      const chip = document.createElement("a");
      chip.className = "menu-category-chip";
      chip.href = "#cat-" + cat.id;
      chip.textContent = cat.name;
      chip.addEventListener("click", function (e) {
        e.preventDefault();
        const el = document.getElementById("cat-" + cat.id);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      nav.appendChild(chip);
    });

    categories.forEach(function (cat) {
      const section = document.createElement("section");
      section.className = "menu-category";
      section.id = "cat-" + cat.id;
      section.setAttribute("aria-labelledby", "heading-" + cat.id);

      const h2 = document.createElement("h2");
      h2.className = "menu-category-title";
      h2.id = "heading-" + cat.id;
      h2.textContent = cat.name;
      section.appendChild(h2);

      const grid = document.createElement("div");
      grid.className =
        "menu-product-grid" +
        (cat.layout === "row" ? " menu-product-grid--row" : "");

      (cat.products || []).forEach(function (p) {
        if (isProductHidden(p)) return;
        const priceLabel = productPriceLabel(p);
        const card = document.createElement("article");
        card.className = "menu-product-card";

        const body = document.createElement("div");
        body.className = "menu-product-card__body";

        if (p.imageUrl && String(p.imageUrl).trim()) {
          const img = document.createElement("img");
          img.className = "menu-product-card__thumb";
          img.src = String(p.imageUrl).trim();
          img.alt = "";
          img.loading = "lazy";
          body.appendChild(img);
        }

        const h3 = document.createElement("h3");
        h3.className = "menu-product-card__name";
        h3.textContent = p.name;

        const price = document.createElement("p");
        price.className = "menu-product-card__price";
        price.textContent = priceLabel;

        const top = document.createElement("div");
        top.className = "menu-product-card__top";
        const left = document.createElement("div");
        left.style.flex = "1";
        left.appendChild(h3);
        left.appendChild(price);
        if (isProductOutOfStock(p)) {
          const oosLab = document.createElement("p");
          oosLab.className = "menu-product-card__oos";
          oosLab.textContent = "Producto agotado";
          left.appendChild(oosLab);
        } else if (p.stockEnabled) {
          const st = Math.max(0, parseInt(String(p.stock), 10) || 0);
          const av = document.createElement("p");
          av.className = "menu-product-card__stock-hint";
          av.textContent = st + " disponible" + (st === 1 ? "" : "s");
          left.appendChild(av);
        }

        const add = document.createElement("button");
        add.type = "button";
        add.className = "menu-product-card__add";
        add.setAttribute("aria-label", "Agregar " + p.name);
        add.textContent = "+";
        if (isProductOutOfStock(p)) {
          add.disabled = true;
          add.classList.add("menu-product-card__add--disabled");
          add.title = "Sin stock";
        }
        add.addEventListener("click", function () {
          if (isProductOutOfStock(p)) return;
          const modal = document.getElementById("product-modal");
          const titleEl = document.getElementById("product-modal-title");
          const bodyEl = document.getElementById("product-modal-body");
          if (!modal || !bodyEl || !titleEl) return;
          titleEl.textContent = "Agregar al pedido";
          bodyEl.innerHTML = "";
          const ui = buildModifierUI(p);
          bodyEl.appendChild(ui.el);
          const addBtn = document.getElementById("product-add");
          addBtn.onclick = function () {
            const sel = ui.getSelection();
            if (!sel.ok) {
              if (typeof ui.showAddValidationErrors === "function") ui.showAddValidationErrors();
              return;
            }
            const cart = loadCart();
            const unit = sel.unit;
            const addQty = clamp(sel.orderQty != null ? sel.orderQty : 1, 1, 99);
            const key = buildCartItemKey(p.id, sel.variantName, sel.mods, sel.notes);
            const item = {
              key: key,
              productId: p.id,
              name: p.name,
              variantName: sel.variantName || "",
              mods: sel.mods || [],
              notes: sel.notes || "",
              unit: unit,
              qty: addQty,
              total: unit * addQty,
            };
            upsertCartItem(cart, item);
            saveCart(cart);
            updateOrderBar(cart);
            closeOverlays();
          };
          openOverlay(modal);
        });

        top.appendChild(left);
        top.appendChild(add);
        body.appendChild(top);

        if (p.description) {
          const desc = document.createElement("p");
          desc.className = "menu-product-card__desc";
          desc.textContent = p.description;
          body.appendChild(desc);
        }

        card.appendChild(body);
        grid.appendChild(card);
      });

      section.appendChild(grid);
      root.appendChild(section);
    });

    injectMenuJsonLd(categories, currencySymbol);
  }

  function showError(msg) {
    const err = document.getElementById("menu-error");
    const root = document.getElementById("menu-root");
    const nav = document.getElementById("menu-category-nav");
    const empty = document.getElementById("menu-empty");
    if (err) {
      err.hidden = false;
      err.textContent = msg;
    }
    if (root) root.innerHTML = "";
    if (nav) nav.innerHTML = "";
    if (empty) empty.hidden = true;
  }

  function init() {
    const search = document.getElementById("menu-search");
    let raw = { categories: [], currencySymbol: "$" };

    fetch("data/menu.json", { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("No se pudo cargar data/menu.json (" + r.status + ").");
        return r.json();
      })
      .then(function (data) {
        const errEl = document.getElementById("menu-error");
        if (errEl) {
          errEl.hidden = true;
          errEl.textContent = "";
        }
        raw = data;
        menuModifierLibrary = Array.isArray(data.modifierLibrary) ? data.modifierLibrary : [];
        const categories = data.categories || [];
        const idx = indexMenu(categories);
        render(categories, data.currencySymbol || "$", idx);

        const cart = loadCart();
        updateOrderBar(cart);

        const back = document.getElementById("overlay-backdrop");
        const pmClose = document.getElementById("product-modal-close");
        const cmClose = document.getElementById("checkout-modal-close");
        if (back) back.addEventListener("click", closeOverlays);
        if (pmClose) pmClose.addEventListener("click", closeOverlays);
        if (cmClose) cmClose.addEventListener("click", closeOverlays);
        document.addEventListener("keydown", function (e) {
          if (e.key !== "Escape") return;
          if (checkoutDeliveryStep) {
            const cm = document.getElementById("checkout-modal");
            if (cm && !cm.hidden) {
              checkoutDeliveryStep = false;
              renderCheckout(loadCart());
              e.preventDefault();
              return;
            }
          }
          closeOverlays();
        });

        const openBtn = document.getElementById("order-open");
        if (openBtn) {
          openBtn.addEventListener("click", function () {
            const cm = document.getElementById("checkout-modal");
            if (!cm) return;
            const c = loadCart();
            renderCheckout(c);
            openOverlay(cm);
          });
        }

        const checkoutDelBack = document.getElementById("checkout-delivery-back");
        if (checkoutDelBack) {
          checkoutDelBack.addEventListener("click", function () {
            checkoutDeliveryStep = false;
            renderCheckout(loadCart());
          });
        }
        const checkoutCloseDelivery = document.getElementById("checkout-modal-close-delivery");
        if (checkoutCloseDelivery) {
          checkoutCloseDelivery.addEventListener("click", closeAllOverlays);
        }

        if (search) {
          search.addEventListener("input", function () {
            const filtered = filterCategories(raw.categories || [], search.value);
            render(filtered, raw.currencySymbol || "$", idx);
          });
        }
      })
      .catch(function (e) {
        showError(e.message || "Error al cargar el menú.");
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
