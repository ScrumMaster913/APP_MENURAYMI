(function () {
  const HANDOFF_KEY = "olc_tracking_handoff:v1";
  const HANDOFF_MAX_MS = 45 * 60 * 1000;

  const RESTAURANT_WA_DIGITS =
    (document.body && document.body.getAttribute("data-restaurant-wa")) || "56552741723";

  let consultMessage = "";
  let consultPublicId = null;
  let modalMessage = "";
  let modalPublicId = null;

  function formatCLP(n) {
    const v = Math.round(Number(n)) || 0;
    try {
      return new Intl.NumberFormat("es-CL", {
        style: "currency",
        currency: "CLP",
        maximumFractionDigits: 0,
      }).format(v);
    } catch (e) {
      return "$" + v.toLocaleString("es-CL");
    }
  }

  function readHandoff() {
    try {
      const raw = sessionStorage.getItem(HANDOFF_KEY);
      if (!raw) return null;
      const o = JSON.parse(raw);
      if (!o || typeof o !== "object") return null;
      return o;
    } catch (e) {
      return null;
    }
  }

  function clearHandoff() {
    try {
      sessionStorage.removeItem(HANDOFF_KEY);
    } catch (e) {}
  }

  function normalizeUrlOrderId(raw) {
    const s = String(raw || "").trim();
    if (s === "pending") return "pending";
    if (/^[a-f0-9]{12}$/i.test(s)) return s.toLowerCase();
    return null;
  }

  function handoffMatchesUrl(urlNorm, h) {
    if (!h || typeof h.orderMessage !== "string" || !String(h.orderMessage).trim()) return false;
    if (typeof h.ts !== "number" || !isFinite(h.ts) || Date.now() - h.ts > HANDOFF_MAX_MS) return false;
    if (urlNorm === "pending") {
      return h.publicId == null || String(h.publicId).trim() === "";
    }
    return String(h.publicId || "")
      .trim()
      .toLowerCase() === urlNorm;
  }

  function maskName(name) {
    const s = String(name || "").trim();
    if (!s) return "—";
    const vis = s.slice(0, Math.min(3, s.length));
    return vis + "***";
  }

  function applyPaymentBadge(badgeEl, order) {
    if (!badgeEl) return;
    badgeEl.classList.remove("tracking-pay-badge--paid", "tracking-pay-badge--refunded");
    const raw = order && order.paymentStatus != null ? String(order.paymentStatus).toLowerCase().trim() : "unpaid";
    if (raw === "paid") {
      badgeEl.textContent = "Pagado";
      badgeEl.classList.add("tracking-pay-badge--paid");
      return;
    }
    if (raw === "refunded") {
      badgeEl.textContent = "Reembolsado";
      badgeEl.classList.add("tracking-pay-badge--refunded");
      return;
    }
    badgeEl.textContent = "No pagado";
  }

  function maskPhone(phone) {
    const d = String(phone || "").replace(/\D/g, "");
    if (d.length < 8) return phone ? String(phone).trim() : "—";
    if (d.length >= 10) {
      return "+" + d.slice(0, 2) + " " + d.slice(2, 9) + "***";
    }
    return d.slice(0, Math.min(6, d.length)) + "***";
  }

  function openWhatsappPrefilled(message, publicId) {
    let text = String(message || "").trim();
    const pid = publicId != null ? String(publicId).trim() : "";
    if (pid) text = "Ref. pedido: " + pid + (text ? "\n\n" + text : "");
    if (!text) text = "Hola, consulta sobre mi pedido.";
    const url = "https://wa.me/" + RESTAURANT_WA_DIGITS + "?text=" + encodeURIComponent(text);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function closeWaUi() {
    const back = document.getElementById("overlay-backdrop");
    const wa = document.getElementById("whatsapp-order-step");
    if (back) back.hidden = true;
    if (wa) wa.hidden = true;
    document.body.classList.remove("olc-drawer-open");
  }

  function openWaModal() {
    const back = document.getElementById("overlay-backdrop");
    const wa = document.getElementById("whatsapp-order-step");
    const refWrap = document.getElementById("whatsapp-order-step-ref-wrap");
    const refEl = document.getElementById("whatsapp-order-step-ref");
    if (refWrap && refEl) {
      const pid = modalPublicId != null ? String(modalPublicId).trim() : "";
      if (pid) {
        refEl.textContent = pid;
        refWrap.hidden = false;
      } else {
        refWrap.hidden = true;
      }
    }
    if (back) back.hidden = false;
    document.body.classList.add("olc-drawer-open");
    if (wa) wa.hidden = false;
    const sendBtn = document.getElementById("whatsapp-order-step-send");
    if (sendBtn) sendBtn.focus();
  }

  function showError(msg) {
    const err = document.getElementById("tracking-error");
    const content = document.getElementById("tracking-content");
    if (content) content.hidden = true;
    if (err) {
      err.textContent = msg;
      err.hidden = false;
    }
  }

  function wireModal() {
    const back = document.getElementById("overlay-backdrop");
    const closeBtn = document.getElementById("whatsapp-order-step-close");
    const sendBtn = document.getElementById("whatsapp-order-step-send");
    if (back) back.addEventListener("click", closeWaUi);
    if (closeBtn) closeBtn.addEventListener("click", closeWaUi);
    if (sendBtn) {
      sendBtn.addEventListener("click", function () {
        if (!modalMessage) return;
        sendBtn.disabled = true;
        openWhatsappPrefilled(modalMessage, modalPublicId);
        sendBtn.disabled = false;
        closeWaUi();
      });
    }
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      const wa = document.getElementById("whatsapp-order-step");
      if (wa && !wa.hidden) {
        closeWaUi();
        e.preventDefault();
      }
    });
  }

  function renderFromOrder(order) {
    const content = document.getElementById("tracking-content");
    const err = document.getElementById("tracking-error");
    if (err) err.hidden = true;
    if (content) content.hidden = false;

    const numEl = document.getElementById("tracking-order-num");
    if (numEl) numEl.textContent = "#" + String(order.id || "—");

    const contact = document.getElementById("tracking-contact-line");
    if (contact) {
      contact.textContent =
        maskName(order.deliveryName) + " · " + maskPhone(order.deliveryPhone);
    }
    const addr = document.getElementById("tracking-address-line");
    if (addr) {
      const st = String(order.serviceType || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      const isPickup = st.indexOf("recojo") !== -1;
      const isHospitalHcc = st.indexOf("hospital") !== -1 && st.indexOf("hcc") !== -1;
      const bits = [];
      if (String(order.deliveryAddressLabel || "").trim()) bits.push(String(order.deliveryAddressLabel).trim());
      if (String(order.customerComment || "").trim()) bits.push(String(order.customerComment).trim());
      if (!bits.length && isPickup) {
        addr.textContent = "Recojo en local del restaurante.";
      } else if (!bits.length && isHospitalHcc) {
        addr.textContent = "Entrega: Hospital Carlos Cisternas, Calama, Chile.";
      } else {
        addr.textContent = bits.length ? bits.join(" · ") : "—";
      }
    }

    const n = Math.max(1, Number(order.lineCount) || 1);
    const sumToggle = document.getElementById("tracking-summary-toggle");
    const sumCount = document.getElementById("tracking-summary-count");
    const sumPanel = document.getElementById("tracking-summary-panel");
    const sumPre = document.getElementById("tracking-summary-pre");
    if (sumCount) sumCount.textContent = String(n);
    if (sumPre) sumPre.textContent = String(order.orderMessage || "").trim() || "—";
    if (sumToggle && sumPanel) {
      sumToggle.hidden = false;
      sumToggle.addEventListener("click", function () {
        sumPanel.hidden = !sumPanel.hidden;
      });
    }

    const payLine = document.getElementById("tracking-pay-line");
    if (payLine) {
      const lab = String(order.paymentMethodLabel || "").trim() || "Pago";
      payLine.textContent = lab + " · " + formatCLP(order.totalClp);
    }

    const payBadge = document.getElementById("tracking-pay-badge");
    applyPaymentBadge(payBadge, order);

    consultMessage = String(order.orderMessage || "").trim();
    consultPublicId = order.publicId != null ? String(order.publicId).trim() : null;

    const consultBtn = document.getElementById("tracking-wa-consult");
    if (consultBtn) consultBtn.hidden = !consultMessage;
  }

  function renderPendingOnly(boot) {
    const content = document.getElementById("tracking-content");
    const err = document.getElementById("tracking-error");
    if (err) err.hidden = true;
    if (content) content.hidden = false;

    const numEl = document.getElementById("tracking-order-num");
    if (numEl) numEl.textContent = "#—";

    const contact = document.getElementById("tracking-contact-line");
    if (contact) contact.textContent = "Pedido sin almacenamiento en servidor (modo local).";
    const addr = document.getElementById("tracking-address-line");
    if (addr) addr.textContent = "Revisa el detalle en el mensaje de WhatsApp.";

    const sumToggle = document.getElementById("tracking-summary-toggle");
    const sumPanel = document.getElementById("tracking-summary-panel");
    const sumPre = document.getElementById("tracking-summary-pre");
    const sumCount = document.getElementById("tracking-summary-count");
    if (sumCount) sumCount.textContent = String(Math.max(1, Number(boot.itemCount) || 1));
    if (sumPre) sumPre.textContent = String(boot.orderMessage || "").trim();
    if (sumToggle && sumPanel) {
      sumToggle.hidden = false;
      sumToggle.addEventListener("click", function () {
        sumPanel.hidden = !sumPanel.hidden;
      });
    }

    const payLine = document.getElementById("tracking-pay-line");
    if (payLine) {
      payLine.textContent = "Total estimado · " + formatCLP(boot.totalClp);
    }

    const payBadge = document.getElementById("tracking-pay-badge");
    applyPaymentBadge(payBadge, { paymentStatus: "unpaid" });

    consultMessage = String(boot.orderMessage || "").trim();
    consultPublicId = boot.publicId != null ? String(boot.publicId).trim() : null;

    const consultBtn = document.getElementById("tracking-wa-consult");
    if (consultBtn) consultBtn.hidden = !consultMessage;
  }

  function run() {
    wireModal();

    const params = new URLSearchParams(window.location.search);
    const urlRaw = params.get("order_id");
    const urlNorm = normalizeUrlOrderId(urlRaw);
    if (urlNorm == null) {
      showError("Enlace de seguimiento no válido. Falta order_id o el formato no es correcto.");
      return;
    }

    const rawHandoff = readHandoff();
    const boot = rawHandoff && handoffMatchesUrl(urlNorm, rawHandoff) ? rawHandoff : null;
    if (boot) clearHandoff();

    const openAutoModal = Boolean(boot);
    if (openAutoModal) {
      modalMessage = String(boot.orderMessage || "").trim();
      modalPublicId = boot.publicId != null && String(boot.publicId).trim() ? String(boot.publicId).trim() : null;
    }

    const consultBtn = document.getElementById("tracking-wa-consult");
    if (consultBtn) {
      consultBtn.addEventListener("click", function () {
        if (!consultMessage) return;
        openWhatsappPrefilled(consultMessage, consultPublicId);
      });
    }

    if (urlNorm === "pending") {
      if (!boot) {
        showError(
          "No encontramos los datos de tu pedido en este navegador. Vuelve al menú y confirma de nuevo, o abre el enlace que recibiste justo después de pedir."
        );
        return;
      }
      renderPendingOnly(boot);
      if (openAutoModal && modalMessage) {
        requestAnimationFrame(function () {
          openWaModal();
        });
      }
      return;
    }

    fetch("api/get-order.php?order_id=" + encodeURIComponent(urlNorm), { cache: "no-store" })
      .then(function (r) {
        return r.json().then(function (body) {
          return { ok: r.ok, status: r.status, body: body };
        });
      })
      .then(function (res) {
        if (!res.body || !res.body.ok || !res.body.order) {
          const msg =
            (res.body && res.body.error) ||
            (res.status === 404 ? "Pedido no encontrado." : "No se pudo cargar el pedido.");
          showError(msg);
          return;
        }
        const order = res.body.order;
        renderFromOrder(order);
        if (openAutoModal && modalMessage) {
          requestAnimationFrame(function () {
            openWaModal();
          });
        }
      })
      .catch(function () {
        showError("Error de red al cargar el pedido.");
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
