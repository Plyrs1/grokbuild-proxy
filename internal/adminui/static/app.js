/* grokbuild Admin SPA — in-memory admin key, textContent-only DOM */
(function () {
  "use strict";

  var API_BASE = "";

  var state = {
    key: "",
    route: "login",
    system: null,
    settings: null,
    busy: false,
    credentials: [],
    credPage: 1,
    credPageSize: 12, // 0 means show all
  };

  // ---------- DOM helpers (no innerHTML for untrusted data) ----------

  function $(id) {
    return document.getElementById(id);
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null && text !== "") node.textContent = String(text);
    return node;
  }

  function clear(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
  }

  function show(node, on) {
    if (!node) return;
    node.classList.toggle("hidden", !on);
  }

  function setText(node, text) {
    if (node) node.textContent = text == null ? "" : String(text);
  }

  // ---------- Toast ----------

  function toast(message, kind) {
    var host = $("toast-host");
    if (!host) return;
    var t = el("div", "toast " + (kind || ""));
    t.textContent = message;
    host.appendChild(t);
    setTimeout(function () {
      if (t.parentNode) t.parentNode.removeChild(t);
    }, 3200);
  }

  // ---------- Modal ----------

  function openModal(title, bodyNode, footNodes) {
    var modal = $("modal");
    setText($("modal-title"), title || "Dialog");
    var body = $("modal-body");
    clear(body);
    if (bodyNode) body.appendChild(bodyNode);
    var foot = $("modal-foot");
    clear(foot);
    (footNodes || []).forEach(function (n) {
      foot.appendChild(n);
    });
    show(modal, true);
  }

  function closeModal() {
    show($("modal"), false);
    clear($("modal-body"));
    clear($("modal-foot"));
  }

  // ---------- API ----------

  function apiErrorMessage(data, status) {
    if (data && data.error) {
      if (typeof data.error === "string") return data.error;
      if (data.error.message) return data.error.message;
    }
    if (data && data.message) return data.message;
    return "Request failed HTTP " + status;
  }

  function api(method, path, body) {
    var headers = {
      Accept: "application/json",
    };
    if (state.key) {
      headers.Authorization = "Bearer " + state.key;
    }
    var opts = { method: method, headers: headers };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      opts.body = typeof body === "string" ? body : JSON.stringify(body);
    }
    return fetch(API_BASE + path, opts).then(function (res) {
      return res.text().then(function (text) {
        var data = null;
        if (text) {
          try {
            data = JSON.parse(text);
          } catch (_) {
            data = { raw: text };
          }
        }
        if (res.status === 401) {
          logout(true);
          var err401 = new Error(apiErrorMessage(data, res.status) || "Unauthorized");
          err401.status = 401;
          throw err401;
        }
        if (!res.ok) {
          var err = new Error(apiErrorMessage(data, res.status));
          err.status = res.status;
          err.data = data;
          throw err;
        }
        return data;
      });
    });
  }

  function apiForm(method, path, form) {
    var headers = { Accept: "application/json" };
    if (state.key) headers.Authorization = "Bearer " + state.key;
    return fetch(API_BASE + path, { method: method, headers: headers, body: form }).then(function (res) {
      return res.text().then(function (text) {
        var data = null;
        if (text) {
          try {
            data = JSON.parse(text);
          } catch (_) {
            data = { raw: text };
          }
        }
        if (res.status === 401) {
          logout(true);
          throw new Error(apiErrorMessage(data, res.status) || "Unauthorized");
        }
        if (!res.ok) {
          var err = new Error(apiErrorMessage(data, res.status));
          err.status = res.status;
          err.data = data;
          throw err;
        }
        return data;
      });
    });
  }

  // ---------- Routing ----------

  function parseRoute() {
    var hash = (location.hash || "").replace(/^#\/?/, "");
    var name = (hash.split("?")[0] || "").split("/")[0] || "";
    if (!name) name = state.key ? "credentials" : "login";
    return name;
  }

  function navigate(route) {
    if (!route) route = "credentials";
    location.hash = "#/" + route;
  }

  function requireAuth(route) {
    if (route === "login") return "login";
    if (!state.key) return "login";
    return route;
  }

  function setActiveNav(route) {
    var links = document.querySelectorAll("#main-nav a");
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      a.classList.toggle("active", a.getAttribute("data-route") === route);
    }
  }

  function render() {
    var route = requireAuth(parseRoute());
    state.route = route;

    show($("view-login"), route === "login");
    show($("view-shell"), route !== "login");

    if (route === "login") {
      if (state.key) {
        navigate("credentials");
      }
      return;
    }

    setActiveNav(route);
    show($("page-credentials"), route === "credentials");
    show($("page-proxies"), route === "proxies");
    show($("page-clients"), route === "clients");
    show($("page-settings"), route === "settings");
    show($("page-system"), route === "system");
    show($("page-integration"), route === "integration");

    if (route === "credentials") loadCredentials();
    else if (route === "proxies") loadProxies();
    else if (route === "clients") loadClients();
    else if (route === "settings") loadSettings();
    else if (route === "system") loadSystem();
    else if (route === "integration") renderIntegration();
  }

  // ---------- Auth ----------

  function logout(silent) {
    state.key = "";
    state.system = null;
    if (!silent) toast("Logged out", "ok");
    navigate("login");
    render();
  }

  function login(key) {
    key = (key || "").trim();
    if (!key) {
      setText($("login-error"), "Please enter admin key");
      show($("login-error"), true);
      return Promise.resolve();
    }
    var btn = $("login-submit");
    if (btn) btn.disabled = true;
    show($("login-error"), false);
    var prev = state.key;
    state.key = key;
    return api("GET", "/admin/system")
      .then(function (sys) {
        state.system = sys;
        setText($("shell-version"), (sys && sys.version) || "Admin Panel");
        toast("Login successful", "ok");
        navigate("credentials");
        render();
      })
      .catch(function (err) {
        state.key = prev;
        setText($("login-error"), err.message || "Login failed");
        show($("login-error"), true);
      })
      .finally(function () {
        if (btn) btn.disabled = false;
      });
  }

  // ---------- Formatting & Selection Helpers ----------
  
  function updateCredentialSelectionUI() {
    var checkboxes = document.querySelectorAll(".cred-checkbox");
    var checked = document.querySelectorAll(".cred-checkbox:checked");
    
    show($("btn-cred-delete-selected"), checked.length > 0);
    show($("btn-cred-export-selected"), checked.length > 0);

    var select = $("sel-cred-select");
    if (select && checkboxes.length > 0) {
      var allExpiredCount = document.querySelectorAll(".cred-checkbox[data-expired='true']").length;
      var checkedExpiredCount = document.querySelectorAll(".cred-checkbox[data-expired='true']:checked").length;
      
      if (checked.length === checkboxes.length) {
        select.value = "all";
      } else if (checked.length === 0) {
        select.value = "none";
      } else if (allExpiredCount > 0 && checked.length === allExpiredCount && checkedExpiredCount === allExpiredCount) {
        select.value = "expired";
      } else {
        // If it's partial and doesn't exactly match 'expired', we should probably just leave it
        // alone, or if we want to be strict, set it to "none" but "none" implies Select None.
        // Let's add a "partial" option if it doesn't exist to make it clearer, but wait, we can't easily modify the HTML if we don't have to.
        // If we don't set select.value, it stays on whatever the user clicked. But what if they manually click a checkbox?
        // Let's create an option if it's indeterminate.
        var partialOpt = select.querySelector("option[value='partial']");
        if (partialOpt) {
          select.value = "partial";
        }
      }
    }
  }

  function handleCredentialSelectChange() {
    var select = $("sel-cred-select");
    if (!select) return;
    
    var val = select.value;
    var checkboxes = document.querySelectorAll(".cred-checkbox");
    
    checkboxes.forEach(function(chk) {
      if (val === "all") {
        chk.checked = true;
      } else if (val === "none") {
        chk.checked = false;
      } else if (val === "expired") {
        chk.checked = chk.dataset.expired === "true";
      }
    });
    
    // We no longer reset the select back to "none", 
    // so it properly reflects the chosen batch operation.
    updateCredentialSelectionUI();
  }
  
  function handleCredentialDeleteSelected() {
    var checked = document.querySelectorAll(".cred-checkbox:checked");
    if (checked.length === 0) return;
    
    if (!confirm("Confirm delete " + checked.length + " selected credentials?")) return;
    
    var ids = [];
    checked.forEach(function(chk) {
      ids.push(chk.value);
    });
    
    var btn = $("btn-cred-delete-selected");
    if (btn) btn.disabled = true;
    
    // Check if bulk delete exists
    api("POST", "/admin/credentials/delete-bulk", { ids: ids })
      .then(function(res) {
        toast("Deleted " + (res.deleted || ids.length) + " credentials", "ok");
        loadCredentials();
      })
      .catch(function(err) {
        // Fallback to loop if bulk endpoint not available
        toast("Bulk delete failed, trying individually: " + err.message, "warn");
        
        var promises = ids.map(function(id) {
          return api("DELETE", "/admin/credentials/" + encodeURIComponent(id))
            .catch(function(e) {
              console.error("Failed to delete " + id, e);
            });
        });
        
        Promise.all(promises).then(function() {
          toast("Finished deleting selected credentials", "ok");
          loadCredentials();
        });
      })
      .finally(function() {
        if (btn) btn.disabled = false;
      });
  }
  
  function handleCredentialExportSelected() {
    var checked = document.querySelectorAll(".cred-checkbox:checked");
    if (checked.length === 0) return;
    
    var ids = [];
    checked.forEach(function(chk) {
      if (chk.dataset.id) {
        ids.push(chk.dataset.id);
      }
    });
    
    if (ids.length === 0) {
      toast("No valid credentials selected", "err");
      return;
    }

    var btn = $("btn-cred-export-selected");
    if (btn) btn.disabled = true;

    // Call the new backend endpoint to generate the file
    // The response is JSON that we download as a file
    fetch("/admin/credentials/export-bulk", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + state.key
      },
      body: JSON.stringify({ ids: ids })
    })
      .then(function(res) {
        if (!res.ok) {
          return res.json().then(function(errBody) {
            throw new Error(errBody.error || "Export failed with status " + res.status);
          }).catch(function() {
            throw new Error("Export failed with status " + res.status);
          });
        }
        // Get raw response text, assume it's JSON array/object or text
        return res.blob();
      })
      .then(function(blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = "grokbuild-credentials-" + new Date().toISOString().slice(0, 10) + ".json";
        document.body.appendChild(a);
        a.click();
        
        setTimeout(function() {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 100);
        
        toast("Exported " + ids.length + " credentials", "ok");
      })
      .catch(function(err) {
        toast("Export failed: " + err.message, "err");
      })
      .finally(function() {
        if (btn) btn.disabled = false;
      });
  }

  function handleCredentialExportAll() {
    var creds = state.credentials || [];
    if (!creds.length) {
      toast("No credentials to export", "err");
      return;
    }
    var ids = [];
    for (var i = 0; i < creds.length; i++) {
      if (creds[i].id) ids.push(creds[i].id);
    }
    if (!ids.length) {
      toast("No valid credentials to export", "err");
      return;
    }

    var btn = $("btn-cred-export-all");
    if (btn) btn.disabled = true;

    fetch("/admin/credentials/export-bulk", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + state.key
      },
      body: JSON.stringify({ ids: ids })
    })
      .then(function(res) {
        if (!res.ok) {
          return res.json().then(function(errBody) {
            throw new Error(errBody.error || "Export failed with status " + res.status);
          }).catch(function() {
            throw new Error("Export failed with status " + res.status);
          });
        }
        return res.blob();
      })
      .then(function(blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = "grokbuild-credentials-" + new Date().toISOString().slice(0, 10) + ".json";
        document.body.appendChild(a);
        a.click();
        setTimeout(function() {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 100);
        toast("Exported " + ids.length + " credentials", "ok");
      })
      .catch(function(err) {
        toast("Export failed: " + err.message, "err");
      })
      .finally(function() {
        if (btn) btn.disabled = false;
      });
  }

  // ---------- Format helpers ----------

  function fmtTime(v) {
    if (!v) return "\u2014";
    try {
      var d = new Date(v);
      if (isNaN(d.getTime())) return String(v);
      return d.toLocaleString();
    } catch (_) {
      return String(v);
    }
  }

  function shortId(id) {
    if (!id) return "\u2014";
    if (id.length <= 12) return id;
    return id.slice(0, 6) + "\u2026" + id.slice(-4);
  }

  function inspectionStatusText(status) {
    var labels = {
      healthy: "Healthy",
      unauthorized: "Unauthorized",
      unauthorized_unconfirmed: "Unconfirmed unauthorized",
      rate_limited: "Rate limited",
      mass_failure_guard: "Mass failure guard",
      state_changed: "Credential changed, results not applied",
      settings_changed: "Inspection settings changed, results not applied",
    };
    return labels[status] || status || "No record";
  }

  // ---------- Credentials ----------

  function credPageCount() {
    var total = (state.credentials && state.credentials.length) || 0;
    if (!total) return 1;
    if (!state.credPageSize) return 1;
    return Math.max(1, Math.ceil(total / state.credPageSize));
  }

  function clampCredPage() {
    var pages = credPageCount();
    if (state.credPage < 1) state.credPage = 1;
    if (state.credPage > pages) state.credPage = pages;
  }

  function credPageSlice() {
    var creds = state.credentials || [];
    if (!state.credPageSize) return creds.slice();
    clampCredPage();
    var start = (state.credPage - 1) * state.credPageSize;
    return creds.slice(start, start + state.credPageSize);
  }

  function updateCredPaginationUI() {
    var total = (state.credentials && state.credentials.length) || 0;
    var bars = document.querySelectorAll("[data-pag-bar]");

    if (!total) {
      bars.forEach(function (bar) { show(bar, false); });
      return;
    }

    clampCredPage();
    var pages = credPageCount();
    var page = state.credPage;
    var size = state.credPageSize;
    var start = size ? (page - 1) * size + 1 : 1;
    var end = size ? Math.min(page * size, total) : total;

    bars.forEach(function (bar) {
      show(bar, true);
      var sizeSel = bar.querySelector('[data-pag="size"]');
      if (sizeSel) {
        var want = String(state.credPageSize);
        if (sizeSel.value !== want) sizeSel.value = want;
      }
      var info = bar.querySelector('[data-pag="info"]');
      if (info) info.textContent = "Showing " + start + "\u2013" + end + " of " + total;
      var label = bar.querySelector('[data-pag="label"]');
      if (label) label.textContent = "Page " + page + " of " + pages;
      var prev = bar.querySelector('[data-pag="prev"]');
      if (prev) prev.disabled = page <= 1;
      var next = bar.querySelector('[data-pag="next"]');
      if (next) next.disabled = page >= pages;
    });
  }

  function renderCredentialsPage() {
    var list = $("cred-list");
    var empty = $("cred-empty");
    if (!list) return;

    clear(list);
    var creds = state.credentials || [];
    if (!creds.length) {
      show(empty, true);
      updateCredPaginationUI();
      updateCredentialSelectionUI();
      return;
    }
    show(empty, false);

    credPageSlice().forEach(function (c) {
      list.appendChild(renderCredentialCard(c));
    });

    updateCredPaginationUI();
    updateCredentialSelectionUI();
  }

  function setCredPage(page) {
    state.credPage = page;
    clampCredPage();
    renderCredentialsPage();
  }

  function setCredPageSize(size) {
    var n = parseInt(size, 10);
    if (isNaN(n) || n < 0) n = 12;
    // 0 = show all
    state.credPageSize = n;
    state.credPage = 1;
    renderCredentialsPage();
  }

  function loadCredentials() {
    var list = $("cred-list");
    var empty = $("cred-empty");
    if (!list) return;
    clear(list);
    show(empty, false);
    document.querySelectorAll("[data-pag-bar]").forEach(function (bar) { show(bar, false); });

    // Also load summary stats
    api("GET", "/admin/summary")
      .then(function (summary) {
        setText($("stat-total-acc"), summary.total_accounts || 0);
        setText($("stat-working-acc"), summary.working_accounts || 0);
        setText($("stat-error-acc"), summary.error_accounts || 0);
      })
      .catch(function (err) {
        console.error("Failed to load summary", err);
      });

    api("GET", "/admin/credentials")
      .then(function (data) {
        state.credentials = (data && data.credentials) || [];
        clampCredPage();
        renderCredentialsPage();
      })
      .catch(function (err) {
        state.credentials = [];
        renderCredentialsPage();
        toast("Failed to load credentials: " + err.message, "err");
      });
  }

  function renderCredentialCard(c) {
    var card = el("article", "card cred-card");
    card.dataset.id = c.id || "";

    var top = el("div", "cred-top");
    var left = el("div", "row gap");
    left.style.alignItems = "center";
    
    var chk = el("input", "cred-checkbox");
    chk.type = "checkbox";
    chk.value = c.id || "";
    chk.dataset.id = c.id || "";
    if (c.token_expired) {
      chk.dataset.expired = "true";
    }
    chk.addEventListener("change", updateCredentialSelectionUI);
    // Store reference to raw object so we can use it for export later
    chk.dataset.raw = JSON.stringify(c);
    
    // Status identifier for quick selection (e.g., expired)
    var isExpired = false;
    if (c.last_inspection_status === "unauthorized" || c.last_inspection_status === "unauthorized_unconfirmed" || c.lifecycle_state === "quarantined") {
      isExpired = true;
    }
    chk.dataset.expired = isExpired;
    
    chk.addEventListener("change", updateCredentialSelectionUI);
    
    left.appendChild(chk);
    
    var titleBox = el("div");
    var title = el("h3", "cred-title", c.name || c.email || c.id || "(unnamed)");
    titleBox.appendChild(title);
    if (c.email && c.email !== c.name) {
      titleBox.appendChild(el("div", "muted", c.email));
    }
    left.appendChild(titleBox);
    top.appendChild(left);

    var quarantined = c.lifecycle_state === "quarantined";
    var badge = el(
      "span",
      "badge " + (c.enabled ? "badge-ok" : quarantined ? "badge-danger" : "badge-off"),
      c.enabled ? "Enabled" : quarantined ? "Quarantined" : "Disabled"
    );
    top.appendChild(badge);
    card.appendChild(top);

    var meta = el("div", "cred-meta");
    meta.appendChild(lineMeta("ID", shortId(c.id)));
    meta.appendChild(lineMeta("Priority", String(c.priority != null ? c.priority : 0)));
    meta.appendChild(lineMeta("Expires at", fmtTime(c.expires_at)));
    meta.appendChild(
      lineMeta(
        "Outbound proxy",
        c.proxy_mode === "url" ? c.proxy_url || "Configured" : c.proxy_mode === "direct" ? "Direct" : "Inherit global"
      )
    );
    if (c.disable_reason) meta.appendChild(lineMeta("Disable reason", c.disable_reason));
    if (c.quarantined_at) meta.appendChild(lineMeta("Quarantined at", fmtTime(c.quarantined_at)));
    meta.appendChild(
      lineMeta(
        "Tokens",
        (c.has_access_token ? "Access token" : "\u2014") +
          " / " +
          (c.has_refresh_token ? "Refresh token" : "\u2014")
      )
    );
    if (c.failure_count) {
      meta.appendChild(lineMeta("Failure count", String(c.failure_count)));
    }
    if (c.last_error) {
      var errLine = el("div");
      errLine.appendChild(el("span", "badge badge-danger", "Error"));
      errLine.appendChild(document.createTextNode(" "));
      errLine.appendChild(el("span", "", c.last_error));
      meta.appendChild(errLine);
    }
    if (c.cooldown_until) {
      meta.appendChild(lineMeta("Cool-down until", fmtTime(c.cooldown_until)));
    }
    if (c.last_inspection_at || c.last_inspection_status || c.last_inspection_error) {
      meta.appendChild(lineMeta("Last inspection", fmtTime(c.last_inspection_at)));
      meta.appendChild(lineMeta("Inspection result", inspectionStatusText(c.last_inspection_status)));
      if (c.last_inspection_error) {
        meta.appendChild(lineMeta("Inspection details", c.last_inspection_error));
      }
    }
    if (c.access_token) {
      meta.appendChild(lineMeta("Access token (masked)", c.access_token));
    }
    var usageBox = el("div", "usage-box");
    usageBox.appendChild(el("div", "muted", "Loading quota\u2026"));
    meta.appendChild(usageBox);
    card.appendChild(meta);
    // Async fill usage summary on each card (no raw JSON).
    fillCredentialUsage(usageBox, c.id);

    var prioRow = el("div", "priority-row");
    prioRow.appendChild(el("span", "label", "Priority"));
    var prioInput = el("input");
    prioInput.type = "number";
    prioInput.value = String(c.priority != null ? c.priority : 0);
    prioInput.setAttribute("aria-label", "Priority");
    var prioBtn = el("button", "btn btn-sm", "Save");
    prioBtn.type = "button";
    prioBtn.addEventListener("click", function () {
      var n = parseInt(prioInput.value, 10);
      if (isNaN(n)) {
        toast("Priority must be a number", "err");
        return;
      }
      prioBtn.disabled = true;
      // PUT /admin/credentials/{id}/priority  body: {"priority":n}
      api("PUT", "/admin/credentials/" + encodeURIComponent(c.id) + "/priority", {
        priority: n,
      })
        .then(function () {
          toast("Priority updated", "ok");
          loadCredentials();
        })
        .catch(function (err) {
          toast("Update failed: " + err.message, "err");
        })
        .finally(function () {
          prioBtn.disabled = false;
        });
    });
    prioRow.appendChild(prioInput);
    prioRow.appendChild(prioBtn);
    card.appendChild(prioRow);

    var actions = el("div", "cred-actions");

    var toggle = el("button", "btn btn-sm", c.enabled ? "Disable" : "Enable");
    toggle.type = "button";
    toggle.addEventListener("click", function () {
      toggle.disabled = true;
      // POST /admin/credentials/{id}/disable  body: {"enabled": true|false}
      api("POST", "/admin/credentials/" + encodeURIComponent(c.id) + "/disable", {
        enabled: !c.enabled,
      })
        .then(function () {
          toast(c.enabled ? "Disabled" : "Enabled", "ok");
          loadCredentials();
        })
        .catch(function (err) {
          toast("Toggle failed: " + err.message, "err");
        })
        .finally(function () {
          toggle.disabled = false;
        });
    });
    actions.appendChild(toggle);

    var refresh = el("button", "btn btn-sm", "Refresh token");
    refresh.type = "button";
    refresh.addEventListener("click", function () {
      refresh.disabled = true;
      api("POST", "/admin/credentials/" + encodeURIComponent(c.id) + "/refresh")
        .then(function () {
          toast("Token refreshed", "ok");
          loadCredentials();
        })
        .catch(function (err) {
          toast("Failed to refresh token: " + err.message, "err");
        })
        .finally(function () {
          refresh.disabled = false;
        });
    });
    actions.appendChild(refresh);

    var proxyBtn = el("button", "btn btn-sm", "Proxy");
    proxyBtn.type = "button";
    proxyBtn.addEventListener("click", function () {
      showCredentialProxy(c);
    });
    actions.appendChild(proxyBtn);

    var billing = el("button", "btn btn-sm", "Billing");
    billing.type = "button";
    billing.addEventListener("click", function () {
      showBilling(c);
    });
    actions.appendChild(billing);

    var del = el("button", "btn btn-sm btn-danger", "Delete");
    del.type = "button";
    del.addEventListener("click", function () {
      if (!confirm("Confirm delete credential " + (c.name || c.id) + " ?")) return;
      del.disabled = true;
      api("DELETE", "/admin/credentials/" + encodeURIComponent(c.id))
        .then(function () {
          toast("Deleted", "ok");
          loadCredentials();
        })
        .catch(function (err) {
          toast("Delete failed: " + err.message, "err");
        })
        .finally(function () {
          del.disabled = false;
        });
    });
    actions.appendChild(del);

    card.appendChild(actions);
    return card;
  }

  function showCredentialProxy(c) {
    var body = el("div", "stack");
    var modeField = el("label", "field");
    modeField.appendChild(el("span", "label", "Proxy mode"));
    var mode = el("select");
    [
      ["inherit", "Inherit global"],
      ["direct", "Force direct"],
      ["url", "Custom proxy URL"],
    ].forEach(function (value) {
      var option = el("option", "", value[1]);
      option.value = value[0];
      option.selected = (c.proxy_mode || "inherit") === value[0];
      mode.appendChild(option);
    });
    modeField.appendChild(mode);
    body.appendChild(modeField);
    var urlField = el("label", "field");
    urlField.appendChild(el("span", "label", "Proxy URL"));
    var proxyURL = el("input");
    proxyURL.type = "password";
    proxyURL.placeholder = "http://user:pass@host:port or socks5h://host:port";
    urlField.appendChild(proxyURL);
    body.appendChild(urlField);
    body.appendChild(el("p", "muted", "Existing proxy password is not shown; when switching to a custom URL, you will need to re-enter it completely."));
    function sync() {
      proxyURL.disabled = mode.value !== "url";
    }
    mode.addEventListener("change", sync);
    sync();

    var cancel = el("button", "btn", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", closeModal);
    var save = el("button", "btn btn-primary", "Save");
    save.type = "button";
    save.addEventListener("click", function () {
      if (mode.value === "url" && !(proxyURL.value || "").trim()) {
        toast("Please enter a complete proxy URL", "err");
        return;
      }
      save.disabled = true;
      api("PUT", "/admin/credentials/" + encodeURIComponent(c.id) + "/proxy", {
        mode: mode.value,
        url: (proxyURL.value || "").trim(),
      })
        .then(function () {
          proxyURL.value = "";
          toast("Credential proxy updated", "ok");
          closeModal();
          loadCredentials();
        })
        .catch(function (err) {
          toast("Proxy settings failed: " + err.message, "err");
        })
        .finally(function () {
          save.disabled = false;
        });
    });
    openModal("Credential Proxy \u00b7 " + (c.name || c.email || shortId(c.id)), body, [cancel, save]);
  }

  function lineMeta(label, value) {
    var row = el("div");
    row.appendChild(el("strong", "", label + ": "));
    row.appendChild(el("code", "", value));
    return row;
  }

  function showBilling(c) {
    if (state.system && state.system.billing && state.system.billing.enabled === false) {
      toast("Billing checks are disabled in config", "warn");
      return;
    }
    var body = el("div", "stack");
    body.appendChild(el("p", "muted", "Loading billing\u2026"));
    var closeBtn = el("button", "btn", "Close");
    closeBtn.type = "button";
    closeBtn.addEventListener("click", closeModal);
    var reloadBtn = el("button", "btn btn-primary", "Refresh");
    reloadBtn.type = "button";
    openModal("Billing \u00b7 " + (c.name || c.email || shortId(c.id)), body, [
      reloadBtn,
      closeBtn,
    ]);

    function load() {
      clear(body);
      body.appendChild(el("p", "muted", "Loading billing\u2026"));
      reloadBtn.disabled = true;
      api("GET", "/admin/credentials/" + encodeURIComponent(c.id) + "/billing")
        .then(function (snap) {
          clear(body);
          body.appendChild(renderBillingDashboard(snap));
          // Raw JSON is optional debug only — collapsed by default.
          var details = el("details", "raw-details");
          var summary = el("summary", "", "Debug: Raw JSON (collapsed by default)");
          details.appendChild(summary);
          var pre = el("pre", "code");
          pre.textContent = JSON.stringify(snap, null, 2);
          details.appendChild(pre);
          body.appendChild(details);
        })
        .catch(function (err) {
          clear(body);
          body.appendChild(el("p", "error", err.message || "Failed to load billing"));
        })
        .finally(function () {
          reloadBtn.disabled = false;
        });
    }
    reloadBtn.addEventListener("click", load);
    load();
  }

  function fillCredentialUsage(box, credId) {
    if (!box || !credId) return;
    if (state.system && state.system.billing && state.system.billing.enabled === false) {
      clear(box);
      box.appendChild(el("div", "muted", "Billing checks are disabled in config"));
      return;
    }
    api("GET", "/admin/credentials/" + encodeURIComponent(credId) + "/billing")
      .then(function (snap) {
        clear(box);
        var build = (snap && snap.grok_build) || {};
        if (!build.reported || build.shared_weekly_usage_percent == null) {
          box.appendChild(usageBar("Grok Build", 0, "Not reported", "neutral"));
          return;
        }
        var pct = num(build.shared_weekly_usage_percent);
        var label = "Shared weekly quota used " + pct.toFixed(1) + "%";
        if (build.grok_build_contribution_percent != null) {
          label += " \u00b7 Build contribution " + num(build.grok_build_contribution_percent).toFixed(1) + "%";
        }
        box.appendChild(usageBar("Grok Build", pct, label, toneFromPct(pct)));
      })
      .catch(function (err) {
        clear(box);
        box.appendChild(el("div", "error", "Quota: " + (err.message || "Failed")));
      });
  }

  function parseUsage(snap) {
    var m = (snap && snap.monthly) || {};
    var w = (snap && snap.weekly) || {};
    var limit = optionalNum(m.monthlyLimit);
    var used = optionalNum(m.used);
    var rem = limit != null && used != null ? Math.max(0, limit - used) : null;
    var monthPct = limit != null && limit > 0 && used != null ? (used / limit) * 100 : null;
    var weekPct = optionalNum(w.creditUsagePercent);
    return {
      limit: limit,
      used: used,
      rem: rem,
      monthPct: monthPct,
      weekPct: weekPct,
      monthLabel:
        limit != null && limit > 0 && used != null
          ? fmtNum(used) + " / " + fmtNum(limit) + " (remaining " + fmtNum(rem) + ")"
          : used != null
            ? "Used " + fmtNum(used) + " (no limit field)"
            : "Not reported",
      weekLabel: weekPct != null ? weekPct.toFixed(1) + "%" : "Not reported",
      monthTone: monthPct != null ? toneFromPct(monthPct) : "neutral",
      weekTone: weekPct != null ? toneFromPct(weekPct) : "neutral",
      period:
        (m.billingPeriodStart || "") && (m.billingPeriodEnd || "")
          ? fmtDay(m.billingPeriodStart) + " \u2192 " + fmtDay(m.billingPeriodEnd)
          : m.billingPeriodEnd
            ? "Until " + fmtDay(m.billingPeriodEnd)
            : "",
      weekEnd: w.billingPeriodEnd ? fmtDay(w.billingPeriodEnd) : "",
      products: parseProductUsage(w.productUsage),
    };
  }

  function parseProductUsage(raw) {
    if (!raw) return [];
    try {
      var arr = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (!Array.isArray(arr)) return [];
      return arr
        .map(function (p) {
          return {
            name: p.product || p.name || "?",
            pct: optionalNum(p.usagePercent != null ? p.usagePercent : p.usage_percent),
          };
        })
        .filter(function (p) {
          return p.name;
        });
    } catch (_) {
      return [];
    }
  }

  function renderBillingDashboard(snap) {
    var u = parseUsage(snap);
    var build = (snap && snap.grok_build) || {};
    var wrap = el("div", "stack billing-dash");

    var hero = el("div", "billing-hero");
    hero.appendChild(el("div", "billing-hero-title", "Grok Build Quota"));
    hero.appendChild(
      el(
        "div",
        "billing-hero-value",
        build.reported && build.shared_weekly_usage_percent != null
          ? num(build.shared_weekly_usage_percent).toFixed(1) + "% used"
          : "Not reported"
      )
    );
    hero.appendChild(
      el(
        "div",
        "muted",
        build.grok_build_contribution_percent != null
          ? "Grok Build's consumption contribution to the shared weekly quota pool " + num(build.grok_build_contribution_percent).toFixed(1) + "% (not an independent limit)"
          : "Shared weekly quota; upstream does not separately report Grok Build consumption contribution"
      )
    );
    wrap.appendChild(hero);

    if (build.reported && build.shared_weekly_usage_percent != null) {
      wrap.appendChild(usageBar("Shared weekly quota", num(build.shared_weekly_usage_percent), num(build.shared_weekly_usage_percent).toFixed(1) + "%", toneFromPct(num(build.shared_weekly_usage_percent))));
    }

    var diagnostics = el("details", "raw-details");
    diagnostics.appendChild(el("summary", "", "Diagnostics: Monthly/API & Product Details"));
    var grid = el("div", "billing-grid");
    grid.appendChild(statCard("Monthly used", u.used != null ? fmtNum(u.used) : "Not reported"));
    grid.appendChild(statCard("Monthly limit", u.limit != null ? fmtNum(u.limit) : "Not reported"));
    grid.appendChild(statCard("Monthly remaining", u.rem != null ? fmtNum(u.rem) : "Not reported"));
    grid.appendChild(statCard("Weekly usage", u.weekPct != null ? u.weekPct.toFixed(1) + "%" : "Not reported"));
    diagnostics.appendChild(grid);

    if (u.period) {
      diagnostics.appendChild(lineMeta("Monthly billing period", u.period));
    }
    if (u.weekEnd) {
      diagnostics.appendChild(lineMeta("Weekly billing period ends", u.weekEnd));
    }

    if (u.products.length) {
      diagnostics.appendChild(el("div", "section-label", "Product usage"));
      u.products.forEach(function (p) {
        diagnostics.appendChild(
          usageBar(
            p.name,
            p.pct != null ? p.pct : 0,
            p.pct != null ? p.pct.toFixed(1) + "%" : "Not reported",
            p.pct != null ? toneFromPct(p.pct) : "neutral"
          )
        );
      });
    }
	if (snap && snap.monthly_error) diagnostics.appendChild(el("p", "error", "Monthly API: " + snap.monthly_error));
	if (snap && snap.weekly_error) diagnostics.appendChild(el("p", "error", "Weekly quota API: " + snap.weekly_error));
	wrap.appendChild(diagnostics);

    if (!build.reported) {
      wrap.appendChild(
        el("p", "muted", "Grok Build shared weekly quota: not reported. Monthly/API data is still available in the diagnostics section.")
      );
    } else if (num(build.shared_weekly_usage_percent) >= 100) {
      wrap.appendChild(
        el("p", "error", "Weekly quota exhausted (upstream may return 402 billing error).")
      );
    } else if (u.monthPct != null && u.monthPct >= 95) {
      wrap.appendChild(el("p", "error", "Monthly quota nearly exhausted. Consider switching accounts."));
    }

    return wrap;
  }

  function usageBar(label, pct, detail, tone) {
    var box = el("div", "usage-bar-wrap");
    var head = el("div", "usage-bar-head");
    head.appendChild(el("span", "", label));
    head.appendChild(el("span", "muted", detail || ""));
    box.appendChild(head);
    var track = el("div", "usage-track");
    var fill = el("div", "usage-fill " + (tone || "tone-ok"));
    var width = Math.max(0, Math.min(100, Number(pct) || 0));
    fill.style.width = width.toFixed(1) + "%";
    track.appendChild(fill);
    box.appendChild(track);
    return box;
  }

  function statCard(label, value) {
    var card = el("div", "stat-card");
    card.appendChild(el("div", "muted", label));
    card.appendChild(el("div", "stat-value", value));
    return card;
  }

  function num(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }

  function optionalNum(v) {
    if (v == null || v === "") return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  function fmtNum(n) {
    n = num(n);
    try {
      return n.toLocaleString("en-US", { maximumFractionDigits: 1 });
    } catch (_) {
      return String(n);
    }
  }

  function fmtDay(iso) {
    if (!iso) return "";
    // Keep date part readable without forcing timezone conversion surprises.
    var s = String(iso);
    if (s.length >= 10) return s.slice(0, 10);
    return s;
  }

  function toneFromPct(pct) {
    pct = num(pct);
    if (pct >= 95) return "tone-danger";
    if (pct >= 70) return "tone-warn";
    return "tone-ok";
  }

  function importDefaultGrok() {
    // POST /admin/credentials/import-grok with empty/{} body → default ~/.grok path
    api("POST", "/admin/credentials/import-grok", {})
      .then(function (data) {
        var n = (data && data.imported) || 0;
        toast("Imported " + n + " credentials", "ok");
        loadCredentials();
      })
      .catch(function (err) {
        toast("Import failed: " + err.message, "err");
      });
  }

  function startDeviceLogin() {
    api("POST", "/admin/oauth/device/start", {})
      .then(function (data) {
        var body = el("div", "stack");
        body.appendChild(el("p", "muted", "Complete authorization on the xAI page. This window will automatically detect the result."));
        var code = el("code", "code-block", data.user_code || "");
        body.appendChild(code);
        var link = el("a", "btn btn-primary", "Open authorization page");
        link.href = data.verification_uri_complete || data.verification_uri || "#";
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        body.appendChild(link);
        var status = el("p", "muted", "Waiting for authorization\u2026");
        status.id = "device-login-status";
        body.appendChild(status);
        var cancel = el("button", "btn", "Cancel");
        cancel.type = "button";
        cancel.addEventListener("click", closeModal);
        openModal("Browser Login", body, [cancel]);

        var interval = Math.max(1, Number(data.interval) || 5) * 1000;
        function poll() {
          if (!$("device-login-status")) return;
          api("POST", "/admin/oauth/device/poll", { session_id: data.session_id })
            .then(function (result) {
              if (result && result.status === "authorized") {
                toast("Account authorized successfully", "ok");
                closeModal();
                loadCredentials();
                return;
              }
              setText($("device-login-status"), "Waiting for authorization\u2026");
              var delay = Math.max(1, Number(result && result.retry_after) || interval / 1000) * 1000;
              setTimeout(poll, delay);
            })
            .catch(function (err) {
              if (err.status === 429) {
                var retry = Number(err.data && err.data.retry_after) || interval / 1000;
                setTimeout(poll, Math.max(1, retry) * 1000);
                return;
              }
              setText($("device-login-status"), "Authorization failed: " + err.message);
            });
        }
        setTimeout(poll, interval);
      })
      .catch(function (err) {
        toast("Failed to start browser login: " + err.message, "err");
      });
  }

  function openImportRawModal() {
    var body = el("div", "stack");
    body.appendChild(
      el(
        "p",
        "muted",
        "Upload multiple Grok / CPA JSON or SSO files, or paste content directly. Raw text is sent as-is; duplicate JSON top-level names will not be overwritten in the browser."
      )
    );
    var formatField = el("label", "field");
    formatField.appendChild(el("span", "label", "Content type"));
    var format = el("select");
    [
      ["auto", "Auto-detect"],
      ["json", "Grok / CPA JSON"],
      ["sso", "SSO text / JSON"],
    ].forEach(function (option) {
      var node = el("option", "", option[1]);
      node.value = option[0];
      format.appendChild(node);
    });
    formatField.appendChild(format);
    body.appendChild(formatField);

    var fileField = el("label", "field");
    fileField.appendChild(el("span", "label", "Select files (multiple allowed)"));
    var fileInput = el("input");
    fileInput.type = "file";
    fileInput.multiple = true;
    fileInput.accept = ".json,.txt,.sso,application/json,text/plain";
    fileField.appendChild(fileInput);
    body.appendChild(fileField);

    body.appendChild(el("div", "muted", "Or paste content"));
    var ta = el("textarea");
    ta.placeholder = "auth.json / CPA xAI JSON / one SSO per line";
    body.appendChild(ta);
    var status = el("div", "muted");
    body.appendChild(status);
    var importDetails = el("pre", "code");
    importDetails.style.display = "none";
    body.appendChild(importDetails);

    var cancel = el("button", "btn", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", closeModal);

    var ok = el("button", "btn btn-primary", "Import");
    ok.type = "button";
    ok.addEventListener("click", function () {
      var rawText = (ta.value || "").trim();
      var selected = fileInput.files || [];
      if (!rawText && !selected.length) {
        toast("Please select files or paste content", "err");
        return;
      }
      ok.disabled = true;
      setText(status, "Creating import job\u2026");
      var request;
      if (selected.length) {
        var form = new FormData();
        form.append("format", format.value || "auto");
        for (var i = 0; i < selected.length; i++) form.append("files", selected[i], selected[i].name);
        if (rawText) {
          form.append("files", new Blob([rawText], { type: "text/plain" }), "pasted.txt");
        }
        request = apiForm("POST", "/admin/import-jobs", form);
      } else {
        request = api("POST", "/admin/import-jobs", {
          name: format.value === "json" ? "pasted.json" : "pasted.txt",
          format: format.value || "auto",
          text: rawText,
        });
      }
      request
        .then(function (job) {
          setText(status, "Job created, parsing and writing\u2026");
          return pollImportJob(job.id, status, importDetails);
        })
        .then(function (job) {
          var imported = num(job.created) + num(job.updated);
          var message =
            "Import complete: " + imported + " entries (created " + num(job.created) + ", updated " + num(job.updated) +
            ", skipped " + num(job.skipped) + ")";
          if (job.failed) message += ", failed " + job.failed;
          if (job.warning_count) message += ", warnings " + job.warning_count;
          toast(message, job.failed ? "err" : "ok");
          ta.value = "";
          fileInput.value = "";
          loadCredentials();
        })
        .catch(function (err) {
          toast("Import failed: " + err.message, "err");
          setText(status, "Import failed: " + err.message);
        })
        .finally(function () {
          ok.disabled = false;
        });
    });

    openModal("Batch import credentials", body, [cancel, ok]);
  }

  function pollImportJob(id, statusNode, detailsNode) {
    return new Promise(function (resolve, reject) {
      function poll() {
        api("GET", "/admin/import-jobs/" + encodeURIComponent(id))
          .then(function (job) {
            setText(
              statusNode,
              "Status: " + (job.status || "unknown") +
                " \u00b7 Files " + num(job.files_processed) + "/" + num(job.files_total) +
                " \u00b7 Entries " + num(job.processed) + "/" + num(job.total) +
                " \u00b7 Created " + num(job.created) +
                " \u00b7 Updated " + num(job.updated) +
                " \u00b7 Skipped " + num(job.skipped) +
                " \u00b7 Failed " + num(job.failed)
            );
            renderImportJobDetails(job, detailsNode);
            if (job.status === "completed" || job.status === "partial" || job.status === "failed") {
              if (job.status === "failed" && !job.created && !job.updated) {
                var detail = job.error || ((job.results || [])[0] || {}).error || "Import job failed";
                reject(new Error(detail));
                return;
              }
              resolve(job);
              return;
            }
            setTimeout(poll, 500);
          })
          .catch(reject);
      }
      poll();
    });
  }

  function renderImportJobDetails(job, node) {
    if (!node) return;
    var lines = [];
    (job.files || []).forEach(function (file) {
      lines.push(
        (file.source || "file") + " \u00b7 " + (file.name || "(unnamed)") + " \u00b7 " + (file.status || "unknown") +
          " \u00b7 " + num(file.processed) + "/" + num(file.total)
      );
      (file.warnings || []).forEach(function (warning) {
        lines.push("  Warning [" + (warning.field || "unknown") + "] " + (warning.message || ""));
      });
      (file.results || []).forEach(function (result) {
        var line = "  " + (result.source || "entry") + " \u00b7 " + (result.status || "unknown");
        if (result.error) line += " \u00b7 " + result.error;
        lines.push(line);
        (result.warnings || []).forEach(function (warning) {
          lines.push("    Warning [" + (warning.field || "unknown") + "] " + (warning.message || ""));
        });
      });
    });
    node.style.display = lines.length ? "block" : "none";
    setText(node, lines.join("\n"));
  }

  // ---------- Proxies ----------

  function loadProxies() {
    var wrap = $("proxy-list");
    var empty = $("proxy-empty");
    var chkEnabled = $("chk-proxy-pool-enabled");
    if (!wrap) return;
    clear(wrap);
    show(empty, false);
    show(wrap, true);
    
    // Disable checkbox temporarily while loading
    if (chkEnabled) chkEnabled.disabled = true;

    api("GET", "/admin/proxies")
      .then(function (data) {
        var proxies = (data && data.proxies) || [];
        if (chkEnabled) {
          chkEnabled.checked = !!data.pool_enabled;
          chkEnabled.disabled = false;
        }
        
        if (!proxies.length) {
          show(empty, true);
          show(wrap, false);
          return;
        }
        wrap.appendChild(renderProxyTable(proxies));
      })
      .catch(function (err) {
        toast("Failed to load proxies: " + err.message, "err");
        if (chkEnabled) chkEnabled.disabled = false;
      });
  }

  function renderProxyTable(proxies) {
    var table = el("table");
    var thead = el("thead");
    var hr = el("tr");
    ["URL", "Status", ""].forEach(function (h) {
      hr.appendChild(el("th", "", h));
    });
    thead.appendChild(hr);
    table.appendChild(thead);

    var tbody = el("tbody");
    proxies.forEach(function (p) {
      var tr = el("tr");
      var urlTd = el("td");
      urlTd.appendChild(el("code", "", p.url || "\u2014"));
      tr.appendChild(urlTd);
      
      var st = el("td");
      st.appendChild(
        el(
          "span",
          "badge " + (p.status === "error" ? "badge-danger" : "badge-ok"),
          p.status === "error" ? "Error" : "Active"
        )
      );
      tr.appendChild(st);

      var act = el("td");
      var del = el("button", "btn btn-sm btn-danger", "Remove");
      del.type = "button";
      del.addEventListener("click", function () {
        if (!confirm("Confirm remove proxy " + p.url + " ?")) return;
        del.disabled = true;
        api("DELETE", "/admin/proxies", { proxy: p.url })
          .then(function () {
            toast("Proxy removed", "ok");
            loadProxies();
          })
          .catch(function (err) {
            toast("Remove failed: " + err.message, "err");
            del.disabled = false;
          });
      });
      act.appendChild(del);
      tr.appendChild(act);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    return table;
  }

  function openAddProxyModal() {
    var body = el("div", "stack");
    var field = el("label", "field");
    field.appendChild(el("span", "label", "Proxy URL"));
    var input = el("input");
    input.type = "text";
    input.placeholder = "http://user:pass@host:port";
    field.appendChild(input);
    body.appendChild(field);
    body.appendChild(el("p", "muted", "Proxy format: http://user:pass@host:port or socks5://host:port"));

    var cancel = el("button", "btn", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", closeModal);

    var ok = el("button", "btn btn-primary", "Add");
    ok.type = "button";
    ok.addEventListener("click", function () {
      var url = (input.value || "").trim();
      if (!url) {
        toast("Please enter a proxy URL", "err");
        return;
      }
      ok.disabled = true;
      api("POST", "/admin/proxies", { proxy: url })
        .then(function () {
          toast("Proxy added", "ok");
          closeModal();
          loadProxies();
        })
        .catch(function (err) {
          toast("Add failed: " + err.message, "err");
          ok.disabled = false;
        });
    });

    openModal("Add Proxy", body, [cancel, ok]);
  }
  
  function openAssignProxyModal() {
    var body = el("div", "stack");
    body.appendChild(el("p", "muted", "Assign proxies from the pool to your credentials."));
    
    var modeField = el("label", "field");
    modeField.appendChild(el("span", "label", "Target"));
    var mode = el("select");
    [
      ["missing", "Only accounts without a proxy"],
      ["all", "Override all accounts"]
    ].forEach(function (option) {
      var node = el("option", "", option[1]);
      node.value = option[0];
      mode.appendChild(node);
    });
    modeField.appendChild(mode);
    body.appendChild(modeField);

    var cancel = el("button", "btn", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", closeModal);

    var ok = el("button", "btn btn-primary", "Assign");
    ok.type = "button";
    ok.addEventListener("click", function () {
      ok.disabled = true;
      api("POST", "/admin/accounts/assign-proxies", { override_all: mode.value === "all" })
        .then(function (res) {
          toast("Assigned proxies to " + (res.assigned_count || 0) + " accounts", "ok");
          closeModal();
          loadCredentials();
        })
        .catch(function (err) {
          toast("Assign failed: " + err.message, "err");
          ok.disabled = false;
        });
    });

    openModal("Assign Proxies", body, [cancel, ok]);
  }

  // ---------- Clients ----------

  function loadClients() {
    var wrap = $("client-list");
    var empty = $("client-empty");
    if (!wrap) return;
    clear(wrap);
    show(empty, false);
    show(wrap, true);
    api("GET", "/admin/clients")
      .then(function (data) {
        var clients = (data && data.clients) || [];
        if (!clients.length) {
          show(empty, true);
          show(wrap, false);
          return;
        }
        wrap.appendChild(renderClientTable(clients));
      })
      .catch(function (err) {
        toast("Failed to load clients: " + err.message, "err");
      });
  }

  function renderClientTable(clients) {
    var table = el("table");
    var thead = el("thead");
    var hr = el("tr");
    ["Name", "ID", "Prefix", "Created at", "Status", ""].forEach(function (h) {
      hr.appendChild(el("th", "", h));
    });
    thead.appendChild(hr);
    table.appendChild(thead);

    var tbody = el("tbody");
    clients.forEach(function (c) {
      var tr = el("tr");
      tr.appendChild(el("td", "", c.name || "\u2014"));
      var idTd = el("td");
      idTd.appendChild(el("code", "", shortId(c.id)));
      tr.appendChild(idTd);
      var prefTd = el("td");
      prefTd.appendChild(el("code", "", c.prefix || "\u2014"));
      tr.appendChild(prefTd);
      tr.appendChild(el("td", "", fmtTime(c.created_at)));
      var st = el("td");
      st.appendChild(
        el(
          "span",
          "badge " + (c.disabled ? "badge-off" : "badge-ok"),
          c.disabled ? "Disabled" : "Active"
        )
      );
      tr.appendChild(st);

      var act = el("td");
      var del = el("button", "btn btn-sm btn-danger", "Delete");
      del.type = "button";
      del.addEventListener("click", function () {
        if (!confirm("Confirm revoke client key " + (c.name || c.id) + " ?")) return;
        del.disabled = true;
        api("DELETE", "/admin/clients/" + encodeURIComponent(c.id))
          .then(function () {
            toast("Client key deleted", "ok");
            loadClients();
          })
          .catch(function (err) {
            toast("Delete failed: " + err.message, "err");
          })
          .finally(function () {
            del.disabled = false;
          });
      });
      act.appendChild(del);
      tr.appendChild(act);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    return table;
  }

  function openCreateClientModal() {
    var body = el("div", "stack");
    var field = el("label", "field");
    field.appendChild(el("span", "label", "Name (optional)"));
    var input = el("input");
    input.type = "text";
    input.placeholder = "e.g. claude-code-local";
    field.appendChild(input);
    body.appendChild(field);

    var cancel = el("button", "btn", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", closeModal);

    var ok = el("button", "btn btn-primary", "Create");
    ok.type = "button";
    ok.addEventListener("click", function () {
      ok.disabled = true;
      api("POST", "/admin/clients", { name: (input.value || "").trim() })
        .then(function (data) {
          var plain = (data && (data.plaintext || data.api_key)) || "";
          showOncePlaintext(plain, data && data.client);
          loadClients();
        })
        .catch(function (err) {
          toast("Create failed: " + err.message, "err");
        })
        .finally(function () {
          ok.disabled = false;
        });
    });

    openModal("Create Client Key", body, [cancel, ok]);
  }

  function showOncePlaintext(plain, client) {
    var body = el("div", "stack");
    body.appendChild(
      el(
        "div",
        "warn-note",
        "The plaintext API Key is shown only once and cannot be viewed again after closing. Please copy and save it now."
      )
    );
    if (client && client.name) {
      body.appendChild(el("div", "muted", "Name: " + client.name));
    }
    body.appendChild(el("div", "plaintext-box", plain || "(empty)"));

    var copy = el("button", "btn btn-primary", "Copy");
    copy.type = "button";
    copy.addEventListener("click", function () {
      copyText(plain).then(
        function () {
          toast("Copied", "ok");
        },
        function () {
          toast("Copy failed, please select manually", "err");
        }
      );
    });
    var close = el("button", "btn", "I have saved it");
    close.type = "button";
    close.addEventListener("click", closeModal);
    openModal("Client Key", body, [copy, close]);
  }

  // ---------- Runtime settings ----------

  function loadSettings() {
    var host = $("settings-body");
    if (!host) return;
    clear(host);
    host.appendChild(el("p", "muted", "Loading runtime settings\u2026"));
    api("GET", "/admin/settings")
      .then(function (settings) {
        state.settings = settings;
        clear(host);
        host.appendChild(renderSettings(settings || {}));
      })
      .catch(function (err) {
        clear(host);
        host.appendChild(el("p", "error", "Failed to load settings: " + err.message));
      });
  }

  function renderSettings(settings) {
    var wrap = el("div", "stack");
    var globalProxy = settings.global_proxy || {};
    var converter = settings.sso_converter || {};
    var inspection = settings.inspection || {};

    wrap.appendChild(el("h3", "", "Global Outbound Proxy"));
    var proxyMode = settingSelect(
      "Proxy mode",
      [
        ["environment", "Read HTTP(S)_PROXY environment variables"],
        ["direct", "Force direct"],
        ["url", "Fixed proxy URL"],
      ],
      globalProxy.mode || "environment"
    );
    wrap.appendChild(proxyMode.field);
    if (globalProxy.url) wrap.appendChild(el("p", "muted", "Current: " + globalProxy.url));
    var proxyURL = settingInput(
      "New proxy URL",
      "password",
      "http://user:pass@host:port or socks5h://host:port"
    );
    wrap.appendChild(proxyURL.field);

    wrap.appendChild(el("h3", "", "SSO Conversion Service"));
    var converterEnabled = settingCheckbox("Enable SSO file conversion", !!converter.enabled);
    var converterEndpoint = settingInput("Service endpoint", "url", "https://converter.example");
    converterEndpoint.input.value = converter.endpoint || "";
    var converterKey = settingInput("API Key (leave empty to keep current)", "password", "Conversion service API Key");
    var converterClear = settingCheckbox("Clear saved API Key", false);
    var converterInsecure = settingCheckbox(
      "Allow plain HTTP (trusted container network only)",
      !!converter.allow_insecure_http
    );
    var converterTimeout = settingInput("Conversion timeout (seconds)", "number");
    converterTimeout.input.value = converter.timeout_sec || 600;
    var converterBatch = settingInput("Max SSO per batch", "number");
    converterBatch.input.value = converter.max_batch || 50;
    [
      converterEnabled,
      converterEndpoint,
      converterKey,
      converterClear,
      converterInsecure,
      converterTimeout,
      converterBatch,
    ].forEach(function (item) {
      wrap.appendChild(item.field);
    });
    wrap.appendChild(
      el(
        "p",
        "muted",
        converter.api_key_configured ? "API Key configured (will not be displayed)" : "No API Key configured"
      )
    );

    wrap.appendChild(el("h3", "", "Automatic Credential Inspection"));
    var inspectEnabled = settingCheckbox("Enable scheduled inspection", !!inspection.enabled);
    var inspectInterval = settingInput("Inspection interval (seconds)", "number");
    inspectInterval.input.value = inspection.interval_sec || 3600;
    var inspectTimeout = settingInput("Per-account timeout (seconds)", "number");
    inspectTimeout.input.value = inspection.timeout_sec || 30;
    var inspectConcurrency = settingInput("Concurrency", "number");
    inspectConcurrency.input.value = inspection.concurrency || 2;
    var inspectConfirm = settingInput("Consecutive 401 confirm count", "number");
    inspectConfirm.input.value = inspection.confirm_unauthorized || 2;
    var inspectPurge = settingInput("Auto-delete after quarantine (seconds, 0 = do not delete)", "number");
    inspectPurge.input.value = inspection.purge_after_sec || 0;
    [
      inspectEnabled,
      inspectInterval,
      inspectTimeout,
      inspectConcurrency,
      inspectConfirm,
      inspectPurge,
    ].forEach(function (item) {
      wrap.appendChild(item.field);
    });
    wrap.appendChild(el("p", "muted", "401 after refresh review is quarantined; 429 only enters cool-down, not considered invalid."));
    var inspectionStatus = el("p", "muted", "Loading inspection status\u2026");
    wrap.appendChild(inspectionStatus);
    api("GET", "/admin/inspection")
      .then(function (data) {
        if (data.running) {
          setText(inspectionStatus, "Inspection is running");
        } else if (data.has_run && data.last) {
          setText(
            inspectionStatus,
            "Last inspection: " + fmtTime(data.last.finished_at) +
              " \u00b7 Healthy " + num(data.last.healthy) +
              " \u00b7 Quarantined " + num(data.last.quarantined) +
              " \u00b7 429 " + num(data.last.rate_limited)
          );
        } else {
          setText(inspectionStatus, "No inspection has been performed yet");
        }
      })
      .catch(function () {
        setText(inspectionStatus, "Inspection status unavailable");
      });
    var runInspection = el("button", "btn", "Run inspection now");
    runInspection.type = "button";
    runInspection.addEventListener("click", function () {
      runInspection.disabled = true;
      setText(inspectionStatus, "Inspecting, please wait\u2026");
      api("POST", "/admin/inspection/run")
        .then(function (summary) {
          setText(
            inspectionStatus,
            "Inspection complete: Healthy " + num(summary.healthy) +
              " \u00b7 Quarantined " + num(summary.quarantined) +
              " \u00b7 429 " + num(summary.rate_limited) +
              (summary.mass_failure_guard ? " \u00b7 Mass failure guard triggered" : "")
          );
          loadCredentials();
        })
        .catch(function (err) {
          setText(inspectionStatus, "Inspection failed: " + err.message);
        })
        .finally(function () {
          runInspection.disabled = false;
        });
    });
    wrap.appendChild(runInspection);

    var save = el("button", "btn btn-primary", "Save Runtime Settings");
    save.type = "button";
    save.addEventListener("click", function () {
      var payload = {};
      var nextMode = proxyMode.input.value;
      var nextURL = (proxyURL.input.value || "").trim();
      if (nextMode !== (globalProxy.mode || "environment") || nextURL) {
        if (nextMode === "url" && !nextURL) {
          toast("You must enter a complete proxy URL when switching to a fixed proxy", "err");
          return;
        }
        payload.global_proxy = { mode: nextMode, url: nextURL };
      }
      payload.sso_converter = {
        enabled: converterEnabled.input.checked,
        allow_insecure_http: converterInsecure.input.checked,
        timeout_sec: parseInt(converterTimeout.input.value, 10),
        max_batch: parseInt(converterBatch.input.value, 10),
        clear_api_key: converterClear.input.checked,
      };
      if ((converterEndpoint.input.value || "").trim()) {
        payload.sso_converter.endpoint = converterEndpoint.input.value.trim();
      }
      if ((converterKey.input.value || "").trim()) {
        payload.sso_converter.api_key = converterKey.input.value.trim();
      }
      payload.inspection = Object.assign({}, inspection, {
        enabled: inspectEnabled.input.checked,
        interval_sec: parseInt(inspectInterval.input.value, 10),
        timeout_sec: parseInt(inspectTimeout.input.value, 10),
        concurrency: parseInt(inspectConcurrency.input.value, 10),
        confirm_unauthorized: parseInt(inspectConfirm.input.value, 10),
        purge_after_sec: parseInt(inspectPurge.input.value, 10),
      });
      save.disabled = true;
      api("PUT", "/admin/settings", payload)
        .then(function () {
          proxyURL.input.value = "";
          converterKey.input.value = "";
          toast("Runtime settings saved", "ok");
          loadSettings();
        })
        .catch(function (err) {
          toast("Failed to save settings: " + err.message, "err");
        })
        .finally(function () {
          save.disabled = false;
        });
    });
    wrap.appendChild(save);
    return wrap;
  }

  function settingInput(label, type, placeholder) {
    var field = el("label", "field");
    field.appendChild(el("span", "label", label));
    var input = el("input");
    input.type = type || "text";
    if (placeholder) input.placeholder = placeholder;
    field.appendChild(input);
    return { field: field, input: input };
  }

  function settingCheckbox(label, checked) {
    var field = el("label", "row gap");
    var input = el("input");
    input.type = "checkbox";
    input.checked = checked;
    field.appendChild(input);
    field.appendChild(el("span", "", label));
    return { field: field, input: input };
  }

  function settingSelect(label, options, selected) {
    var field = el("label", "field");
    field.appendChild(el("span", "label", label));
    var input = el("select");
    options.forEach(function (value) {
      var option = el("option", "", value[1]);
      option.value = value[0];
      option.selected = value[0] === selected;
      input.appendChild(option);
    });
    field.appendChild(input);
    return { field: field, input: input };
  }

  // ---------- System ----------

  function loadSystem() {
    var host = $("system-body");
    if (!host) return;
    clear(host);
    host.appendChild(el("p", "muted", "Loading\u2026"));
    api("GET", "/admin/system")
      .then(function (sys) {
        state.system = sys;
        setText($("shell-version"), (sys && sys.version) || "Admin Panel");
        clear(host);
        host.appendChild(renderSystem(sys));
      })
      .catch(function (err) {
        clear(host);
        host.appendChild(el("p", "error", err.message || "Failed to load"));
      });
  }

  function renderSystem(sys) {
    var wrap = el("div", "stack");
    var dl = el("dl", "kv");
    addKV(dl, "Version", sys.version);
    addKV(dl, "Listen address", sys.listen);
    addKV(dl, "Data directory", sys.data_dir);
    addKV(dl, "Chat backend", sys.chat_backend);
    if (sys.upstream) {
      addKV(dl, "Upstream URL", sys.upstream.base_url);
      addKV(dl, "Client version", sys.upstream.client_version);
      addKV(dl, "Client identifier", sys.upstream.client_identifier);
      addKV(dl, "User-Agent", sys.upstream.user_agent);
      addKV(dl, "Token auth header", String(!!sys.upstream.token_auth));
    }
    if (sys.anthropic) {
      addKV(dl, "Anthropic endpoint", sys.anthropic.enabled ? "Enabled" : "Disabled");
    }
    if (sys.pool) {
      var pool = sys.pool;
      addKV(dl, "Account pool available", String(pool.available || 0) + " / " + String(pool.total || 0));
      addKV(dl, "Cooling down", pool.cooling || 0);
      addKV(dl, "Disabled", pool.disabled || 0);
      addKV(dl, "Token expired", pool.expired || 0);
      addKV(dl, "Next recovery", pool.next_recovery_at ? fmtTime(pool.next_recovery_at) : "\u2014");
      addKV(dl, "Last success", pool.last_success_at ? fmtTime(pool.last_success_at) : "\u2014");
    }
    if (sys.limits) {
      var lim = sys.limits;
      addKV(dl, "Max request body", String(lim.MaxBodyBytes != null ? lim.MaxBodyBytes : lim.max_body_bytes || "\u2014"));
      addKV(dl, "Request timeout (seconds)", String(lim.RequestTimeoutSec != null ? lim.RequestTimeoutSec : lim.request_timeout_sec || "\u2014"));
      addKV(dl, "Max concurrency", String(lim.MaxConcurrent != null ? lim.MaxConcurrent : lim.max_concurrent || "\u2014"));
    }
    wrap.appendChild(dl);

    var raw = el("details");
    raw.appendChild(el("summary", "", "Debug: Raw JSON"));
    var pre = el("pre", "code");
    pre.textContent = JSON.stringify(sys, null, 2);
    raw.appendChild(pre);
    wrap.appendChild(raw);
    return wrap;
  }

  function addKV(dl, k, v) {
    dl.appendChild(el("dt", "", k));
    dl.appendChild(el("dd", "", v == null || v === "" ? "\u2014" : String(v)));
  }

  // ---------- Integration ----------

  function renderIntegration() {
    var origin = location.origin || "http://127.0.0.1:8080";
    var anthropic =
      'export ANTHROPIC_BASE_URL="' +
      origin +
      '"\n' +
      'export ANTHROPIC_AUTH_TOKEN="<client key>"';
    var openai =
      'export OPENAI_BASE_URL="' +
      origin +
      '/v1"\n' +
      'export OPENAI_API_KEY="<client key>"';
    setText($("snippet-anthropic"), anthropic);
    setText($("snippet-openai"), openai);
  }

  function copyIntegration() {
    var a = ($("snippet-anthropic") && $("snippet-anthropic").textContent) || "";
    var o = ($("snippet-openai") && $("snippet-openai").textContent) || "";
    var all = a + "\n\n" + o;
    copyText(all).then(
      function () {
        toast("Integration snippet copied", "ok");
      },
      function () {
        toast("Copy failed", "err");
      }
    );
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand("copy");
        document.body.removeChild(ta);
        if (ok) resolve();
        else reject(new Error("Copy failed"));
      } catch (e) {
        reject(e);
      }
    });
  }

  // ---------- Wire events ----------

  function bind() {
    var loginForm = $("login-form");
    if (loginForm) {
      loginForm.addEventListener("submit", function (e) {
        e.preventDefault();
        login(($("login-key") && $("login-key").value) || "");
      });
    }

    var logoutBtn = $("btn-logout");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", function () {
        logout(false);
      });
    }

    var credRefresh = $("btn-cred-refresh-list");
    if (credRefresh) credRefresh.addEventListener("click", loadCredentials);

    var impDef = $("btn-import-default");
    if (impDef) impDef.addEventListener("click", importDefaultGrok);

    var deviceLogin = $("btn-device-login");
    if (deviceLogin) deviceLogin.addEventListener("click", startDeviceLogin);

    var impRaw = $("btn-import-raw");
    if (impRaw) impRaw.addEventListener("click", openImportRawModal);

    var clientRefresh = $("btn-client-refresh");
    if (clientRefresh) clientRefresh.addEventListener("click", loadClients);

    var clientCreate = $("btn-client-create");
    if (clientCreate) clientCreate.addEventListener("click", openCreateClientModal);

    var sysRefresh = $("btn-system-refresh");
    if (sysRefresh) sysRefresh.addEventListener("click", loadSystem);

    var proxyRefresh = $("btn-proxy-refresh");
    if (proxyRefresh) proxyRefresh.addEventListener("click", loadProxies);
    
    var proxyAdd = $("btn-proxy-add");
    if (proxyAdd) proxyAdd.addEventListener("click", openAddProxyModal);
    
    var credAssign = $("btn-cred-assign-proxy");
    if (credAssign) credAssign.addEventListener("click", openAssignProxyModal);
    
    var chkProxyEnabled = $("chk-proxy-pool-enabled");
    if (chkProxyEnabled) {
      chkProxyEnabled.addEventListener("change", function() {
        chkProxyEnabled.disabled = true;
        api("POST", "/admin/proxies/pool/toggle", { enabled: chkProxyEnabled.checked })
          .then(function() {
            toast(chkProxyEnabled.checked ? "Proxy pool enabled" : "Proxy pool disabled", "ok");
            loadProxies();
          })
          .catch(function(err) {
            chkProxyEnabled.checked = !chkProxyEnabled.checked;
            toast("Failed to toggle proxy pool: " + err.message, "err");
            chkProxyEnabled.disabled = false;
          });
      });
    }

    // Credential Selection Action Bindings
    var selectChange = $("sel-cred-select");
    if (selectChange) selectChange.addEventListener("change", handleCredentialSelectChange);
    
    var deleteSelected = $("btn-cred-delete-selected");
    if (deleteSelected) deleteSelected.addEventListener("click", handleCredentialDeleteSelected);
    
    var exportSelected = $("btn-cred-export-selected");
    if (exportSelected) exportSelected.addEventListener("click", handleCredentialExportSelected);

    var exportAll = $("btn-cred-export-all");
    if (exportAll) exportAll.addEventListener("click", handleCredentialExportAll);

    document.querySelectorAll('[data-pag="size"]').forEach(function (sel) {
      sel.value = String(state.credPageSize);
      sel.addEventListener("change", function () {
        setCredPageSize(sel.value);
      });
    });
    document.querySelectorAll('[data-pag="prev"]').forEach(function (btn) {
      btn.addEventListener("click", function () {
        setCredPage(state.credPage - 1);
      });
    });
    document.querySelectorAll('[data-pag="next"]').forEach(function (btn) {
      btn.addEventListener("click", function () {
        setCredPage(state.credPage + 1);
      });
    });

    var settingsRefresh = $("btn-settings-refresh");
    if (settingsRefresh) settingsRefresh.addEventListener("click", loadSettings);

    var copyInt = $("btn-copy-integration");
    if (copyInt) copyInt.addEventListener("click", copyIntegration);

    var modalClose = $("modal-close");
    if (modalClose) modalClose.addEventListener("click", closeModal);

    var modal = $("modal");
    if (modal) {
      modal.addEventListener("click", function (e) {
        if (e.target && e.target.getAttribute("data-close") === "1") closeModal();
      });
    }

    window.addEventListener("hashchange", render);
  }

  function boot() {
    bind();
    // Keep the admin key only in this page's JavaScript memory. Reloading the
    // page intentionally requires re-authentication.
    state.key = "";
    if (state.key) {
      api("GET", "/admin/system")
        .then(function (sys) {
          state.system = sys;
          setText($("shell-version"), (sys && sys.version) || "Admin Panel");
          if (!location.hash || location.hash === "#" || location.hash === "#/") {
            navigate("credentials");
          }
          render();
        })
        .catch(function () {
          if (!state.key) {
            navigate("login");
          }
          render();
        });
    } else {
      if (!location.hash || location.hash === "#" || location.hash === "#/credentials") {
        navigate("login");
      }
      render();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
