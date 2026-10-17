(() => {
  const cfg = window.STUDY_HUB_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const safeUrl = (u) => (/^https?:\/\//i.test(u || "") ? u : "");
  const fmt = (d) => new Date(d).toLocaleDateString();

  const configured = cfg.url && cfg.anonKey && !cfg.url.includes("YOUR-PROJECT") && window.supabase;
  if (!configured) { $("config-warning").classList.remove("hidden"); return; }
  const sb = window.supabase.createClient(cfg.url, cfg.anonKey);

  let mode = "login", me = null, profile = null, materials = [], timer;

  function say(msg, type) {
    const el = $("global-status");
    el.textContent = msg; el.className = "status " + (type || "");
    clearTimeout(timer);
    if (type !== "error") timer = setTimeout(() => el.classList.add("hidden"), 4000);
  }
  const fail = (e) => say(e && e.message ? e.message : String(e), "error");

  // ---------- auth ----------
  function setMode(m) {
    mode = m;
    $("tab-login").className = m === "login" ? "active" : "secondary";
    $("tab-signup").className = m === "signup" ? "active" : "secondary";
    $("name-wrap").classList.toggle("hidden", m !== "signup");
    $("auth-submit").textContent = m === "login" ? "Log in" : "Create account";
    $("password").autocomplete = m === "login" ? "current-password" : "new-password";
  }
  $("tab-login").onclick = () => setMode("login");
  $("tab-signup").onclick = () => setMode("signup");

  $("auth-form").onsubmit = async (e) => {
    e.preventDefault();
    const uid = $("uid").value.trim(), password = $("password").value;
    if (!/^\d{9}$/.test(uid)) return fail("University ID must be exactly 9 digits.");
    const email = uid + "@studyhub.local";
    $("auth-submit").disabled = true;
    try {
      if (mode === "signup") {
        const name = $("full-name").value.trim();
        if (!name) throw new Error("Please enter your full name.");
        const { data, error } = await sb.auth.signUp({ email, password, options: { data: { uid, full_name: name } } });
        if (error) throw error;
        if (!data.session) throw new Error("Account created, but email confirmation is on. Turn it off in Supabase (Authentication > Providers > Email).");
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      $("auth-form").reset();
    } catch (err) { fail(err); }
    $("auth-submit").disabled = false;
  };

  $("logout-btn").onclick = () => sb.auth.signOut();

  sb.auth.onAuthStateChange((_evt, session) => {
    setTimeout(() => onSession(session), 0); // avoid deadlock inside the auth callback
  });
  sb.auth.getSession().then(({ data }) => onSession(data.session));

  async function onSession(session) {
    me = session ? session.user : null;
    const on = !!me;
    $("auth-panel").classList.toggle("hidden", on);
    ["profile-panel", "message-panel", "app-panel"].forEach((id) => $(id).classList.toggle("hidden", !on));
    $("welcome-panel").classList.toggle("hidden", on);
    if (!on) { profile = null; return; }
    try {
      await loadProfile();
      await Promise.all([loadMaterials(), loadMyMessages(), loadExtras(), profile.role === "admin" ? loadAdmin() : 0]);
    } catch (err) { fail(err); }
  }

  // ---------- profile ----------
  async function loadProfile() {
    const { data, error } = await sb.from("profiles").select("*").eq("id", me.id).single();
    if (error) throw error;
    profile = data;
    $("account-name").textContent = data.full_name;
    $("account-uid").textContent = "ID " + data.uid;
    const admin = data.role === "admin";
    $("role-pill").textContent = admin ? "Admin" : "Student";
    $("admin-panel").classList.toggle("hidden", !admin);
    $("branch").value = data.branch || "";
    $("college").value = data.college || "";
    $("major").value = data.major || "";
    $("track").value = data.track || "";
    $("semester").value = data.semester || "";
    $("system").value = data.eng_system || "";
  }

  $("profile-form").onsubmit = async (e) => {
    e.preventDefault();
    const { error } = await sb.from("profiles").update({
      branch: $("branch").value, college: $("college").value.trim(), major: $("major").value.trim(),
      track: $("track").value.trim() || null, semester: $("semester").value, eng_system: $("system").value.trim() || null
    }).eq("id", me.id);
    error ? fail(error) : say("Profile saved.", "ok");
  };

  // ---------- materials ----------
  async function loadMaterials() {
    const { data, error } = await sb.from("materials").select("*, profiles(full_name)").order("created_at", { ascending: false });
    if (error) throw error;
    materials = data;
    renderMaterials();
  }

  function renderMaterials() {
    const q = $("material-search").value.trim().toLowerCase();
    const rows = materials.filter((m) => (m.status === "approved" || m.user_id === me.id) &&
      [m.title, m.course, m.type, m.description].join(" ").toLowerCase().includes(q));
    $("materials-list").innerHTML = rows.length ? rows.map((m) => {
      const link = safeUrl(m.link), img = safeUrl(m.image_url);
      return `<div class="item"><div class="item-head"><div><h3>${esc(m.title)}</h3>
        <span class="pill">${esc(m.type)}</span> <span class="pill">${esc(m.course)}</span></div>
        ${m.status !== "approved" ? `<span class="pill ${m.status}">${m.status}</span>` : ""}</div>
        ${img ? `<img src="${esc(img)}" alt="" loading="lazy" style="max-width:100%;border-radius:10px;margin-top:8px">` : ""}
        ${m.description ? `<p>${esc(m.description)}</p>` : ""}
        ${link ? `<p><a href="${esc(link)}" target="_blank" rel="noopener noreferrer">Open resource</a></p>` : ""}
        <div class="meta">Shared by ${esc(m.profiles ? m.profiles.full_name : "a student")} on ${fmt(m.created_at)}</div></div>`;
    }).join("") : `<div class="empty">No materials found yet.</div>`;
  }

  $("material-search").oninput = renderMaterials;
  $("refresh-btn").onclick = () => refreshAll();
  async function refreshAll() {
    try { await Promise.all([loadMaterials(), loadMyMessages(), loadExtras(), profile.role === "admin" ? loadAdmin() : 0]); say("Refreshed.", "ok"); }
    catch (err) { fail(err); }
  }

  $("material-form").onsubmit = async (e) => {
    e.preventDefault();
    const { error } = await sb.from("materials").insert({
      course: $("material-course").value.trim(), type: $("material-type").value, title: $("material-title").value.trim(),
      link: $("material-link").value.trim() || null, description: $("material-desc").value.trim() || null,
      image_url: $("material-image").value.trim() || null
    });
    if (error) return fail(error);
    $("material-form").reset();
    say("Submitted. An admin will review it soon.", "ok");
    loadMaterials().catch(fail);
    if (profile.role === "admin") loadAdmin().catch(fail);
  };

  // ---------- messages ----------
  async function loadMyMessages() {
    const { data, error } = await sb.from("messages").select("*").eq("user_id", me.id).order("created_at", { ascending: false });
    if (error) throw error;
    $("my-messages").innerHTML = data.map((m) => `<div class="item"><h3>${esc(m.subject)}</h3>
      <p style="white-space:pre-wrap">${esc(m.body)}</p>
      ${m.reply ? `<p style="white-space:pre-wrap"><strong>Admin reply:</strong> ${esc(m.reply)}</p>` : `<span class="pill pending">Waiting for reply</span>`}
      <div class="meta">${fmt(m.created_at)}</div></div>`).join("");
  }

  $("message-form").onsubmit = async (e) => {
    e.preventDefault();
    const { error } = await sb.from("messages").insert({ subject: $("msg-subject").value.trim(), body: $("msg-body").value.trim() });
    if (error) return fail(error);
    $("message-form").reset();
    say("Message sent.", "ok");
    loadMyMessages().catch(fail);
    if (profile.role === "admin") loadAdmin().catch(fail);
  };

  // ---------- extra entries ----------
  async function loadExtras() {
    const { data, error } = await sb.from("extra_entries").select("*, profiles(full_name)").order("created_at", { ascending: false });
    if (error) throw error;
    $("extra-list").innerHTML = data.length ? data.map((x) => `<div class="item"><div class="item-head"><h3>${esc(x.course)}</h3><span class="pill">${esc(x.key)}</span></div>
      <div class="meta">Added by ${esc(x.profiles ? x.profiles.full_name : "a student")}</div></div>`).join("") : `<div class="empty">No extra entries yet.</div>`;
  }

  $("extra-form").onsubmit = async (e) => {
    e.preventDefault();
    const { error } = await sb.from("extra_entries").insert({ key: $("extra-key").value.trim(), course: $("extra-course").value.trim() });
    if (error) return fail(error);
    $("extra-form").reset();
    loadExtras().catch(fail);
  };

  // ---------- admin ----------
  async function loadAdmin() {
    const [pend, msgs] = await Promise.all([
      sb.from("materials").select("*, profiles(full_name, uid)").eq("status", "pending").order("created_at"),
      sb.from("messages").select("*, profiles(full_name, uid)").order("created_at", { ascending: false })
    ]);
    if (pend.error) throw pend.error;
    if (msgs.error) throw msgs.error;

    $("pending-list").innerHTML = pend.data.length ? pend.data.map((m) => `<div class="item"><h3>${esc(m.title)}</h3>
      <span class="pill">${esc(m.type)}</span> <span class="pill">${esc(m.course)}</span>
      ${m.description ? `<p>${esc(m.description)}</p>` : ""}
      ${safeUrl(m.link) ? `<p><a href="${esc(safeUrl(m.link))}" target="_blank" rel="noopener noreferrer">${esc(m.link)}</a></p>` : ""}
      <div class="meta">${esc(m.profiles.full_name)} (${esc(m.profiles.uid)})</div>
      <div class="actions"><button class="success" data-act="approved" data-id="${m.id}">Approve</button>
      <button class="danger" data-act="rejected" data-id="${m.id}">Reject</button></div></div>`).join("") : `<div class="empty">Nothing waiting.</div>`;

    $("admin-messages").innerHTML = msgs.data.length ? msgs.data.map((m) => `<div class="item"><h3>${esc(m.subject)}</h3>
      <div class="meta">${esc(m.profiles.full_name)} (${esc(m.profiles.uid)}) · ${fmt(m.created_at)}</div>
      <p style="white-space:pre-wrap">${esc(m.body)}</p>
      <label for="reply-${m.id}">Reply</label><textarea id="reply-${m.id}" maxlength="5000">${esc(m.reply || "")}</textarea>
      <div class="actions"><button data-reply="${m.id}">Save reply</button></div></div>`).join("") : `<div class="empty">No messages.</div>`;
  }

  $("pending-list").onclick = async (e) => {
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    const { error } = await sb.from("materials").update({ status: b.dataset.act }).eq("id", b.dataset.id);
    if (error) return fail(error);
    say("Material " + b.dataset.act + ".", "ok");
    Promise.all([loadAdmin(), loadMaterials()]).catch(fail);
  };

  $("admin-messages").onclick = async (e) => {
    const b = e.target.closest("button[data-reply]");
    if (!b) return;
    const reply = $("reply-" + b.dataset.reply).value.trim();
    if (!reply) return fail("Write a reply first.");
    const { error } = await sb.from("messages").update({ reply, replied_at: new Date().toISOString() }).eq("id", b.dataset.reply);
    error ? fail(error) : say("Reply saved.", "ok");
  };
})();
