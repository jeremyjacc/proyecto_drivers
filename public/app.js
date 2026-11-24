const state = {
  mesas: [],
  ingredientes: [],
  inventario: [],
  platos: [],
  pedidos: [],
  cocina: [],
  notificaciones: [],
  pendientesEntrega: [],
  entregas: [],
  tipoPedido: "MESA",
  mesaSeleccionada: null,
  carrito: [],
  pedidoCajaId: null,
};

const $ = (id) => document.getElementById(id);

function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(n) {
  return `$${Number(n || 0).toFixed(2)}`;
}

function toast(msg, kind = "ok") {
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.textContent = msg;
  $("toast-container").appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

async function api(path, options = {}) {
  const method = options.method || "GET";
  const init = {
    method,
    headers: options.body ? { "Content-Type": "application/json" } : {},
    body: options.body ? JSON.stringify(options.body) : undefined,
  };
  const res = await fetch(path, init);
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  $("api-last-summary").textContent = `${method} ${path} → ${res.status} ${res.statusText}`;
  $("api-last-json").textContent = JSON.stringify(data, null, 2);

  if (!res.ok) {
    const err = new Error(data?.error?.mensaje || `Error HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function estadoPill(estado) {
  if (["LIBRE", "LISTO", "ENTREGADO", "PAGADO", "APROBADO"].includes(estado)) return "pill-ok";
  if (["EN_PREPARACION", "EN_CAMINO", "ASIGNADA"].includes(estado)) return "pill-info";
  if (["ENVIADO", "PENDIENTE_PAGO"].includes(estado)) return "pill-warn";
  if (["OCUPADA", "CANCELADO", "DEVUELTO", "DENEGADO"].includes(estado)) return "pill-danger";
  return "pill-muted";
}

async function cargarTodo() {
  try {
    const health = await fetch("/health").then((r) => r.json());
    $("health-pill").textContent = health.estado === "ok" ? "Backend + PostgreSQL OK" : "Error";
    $("health-pill").className = `pill ${health.estado === "ok" ? "pill-ok" : "pill-danger"}`;
  } catch {
    $("health-pill").textContent = "Sin conexión";
    $("health-pill").className = "pill pill-danger";
  }

  const filtroNotif = $("filtro-notif").value;
  const filtroEnt = $("filtro-entregas").value;
  const notifUrl = filtroNotif ? `/api/notificaciones?destino=${encodeURIComponent(filtroNotif)}` : "/api/notificaciones";
  const entUrl = filtroEnt ? `/api/entregas?estado=${encodeURIComponent(filtroEnt)}` : "/api/entregas";

  const [mesas, ingredientes, inventario, platos, pedidos, cocina, notificaciones, pendientesEntrega, entregas] =
    await Promise.all([
      fetch("/api/mesas").then((r) => r.json()),
      fetch("/api/ingredientes").then((r) => r.json()),
      fetch("/api/inventario").then((r) => r.json()),
      fetch("/api/platos").then((r) => r.json()),
      fetch("/api/pedidos").then((r) => r.json()),
      fetch("/api/cocina/pedidos").then((r) => r.json()),
      fetch(notifUrl).then((r) => r.json()),
      fetch("/api/entregas/pendientes").then((r) => r.json()),
      fetch(entUrl).then((r) => r.json()),
    ]);

  state.mesas = mesas;
  state.ingredientes = ingredientes;
  state.inventario = inventario;
  state.platos = platos;
  state.pedidos = pedidos;
  state.cocina = cocina;
  state.notificaciones = notificaciones;
  state.pendientesEntrega = pendientesEntrega;
  state.entregas = entregas;

  if (!state.mesaSeleccionada && mesas.length) {
    state.mesaSeleccionada = mesas[0].id;
  }

  renderTodo();
}

function renderTodo() {
  const cobrables = state.pedidos.filter(
    (p) => p.pagoEstado === "PENDIENTE_PAGO" && (p.estado === "LISTO" || (p.tipo === "DOMICILIO" && p.estado === "CERRADO")),
  );
  $("badge-cocina").textContent = state.cocina.length;
  $("badge-caja").textContent = cobrables.length;
  $("badge-entregas").textContent = state.pendientesEntrega.length;

  renderMesero();
  renderCocina();
  renderCaja(cobrables);
  renderEntregas();
  renderInventario();
}

function renderMesero() {
  $("mesas-grid").innerHTML = state.mesas.length
    ? state.mesas
        .map(
          (m) => `
      <button type="button" class="mesa-card ${state.mesaSeleccionada === m.id ? "selected" : ""}" data-mesa="${m.id}">
        <strong>Mesa ${m.numero}</strong>
        <span class="pill ${estadoPill(m.estado)}">${esc(m.estado)}</span>
      </button>`,
        )
        .join("")
    : `<div class="empty-state">No hay mesas registradas.</div>`;

  $("platos-grid").innerHTML = state.platos.length
    ? state.platos
        .map((p) => {
          const recetaTxt = p.receta.map((l) => `${esc(l.ingrediente)} (${l.cantidad}${esc(l.unidad)})`).join(" · ");
          return `
        <div class="plato-card">
          <div class="plato-top">
            <div>
              <strong>${esc(p.nombre)}</strong>
              <div>${money(p.precio)}</div>
            </div>
            <span class="pill ${p.porcionesDisponibles > 0 ? "pill-ok" : "pill-danger"}">
              ${p.porcionesDisponibles} disp.
            </span>
          </div>
          <div class="plato-receta">${recetaTxt}</div>
          <button type="button" class="btn btn-secondary btn-sm" data-add-plato="${p.id}">
            + Agregar al pedido
          </button>
        </div>`;
        })
        .join("")
    : `<div class="empty-state">No hay platos en la carta.</div>`;

  if (!state.carrito.length) {
    $("carrito-lista").innerHTML = `<div class="empty-state">Agrega platos desde la carta para armar el pedido.</div>`;
    $("carrito-total").textContent = "$0.00";
  } else {
    let total = 0;
    $("carrito-lista").innerHTML = state.carrito
      .map((item, idx) => {
        const plato = state.platos.find((p) => p.id === item.platoId);
        const sub = (plato?.precio || 0) * item.cantidad;
        total += sub;
        return `
        <div class="carrito-item">
          <div class="carrito-item-top">
            <strong>${esc(plato?.nombre || `Plato #${item.platoId}`)}</strong>
            <div class="qty-controls">
              <button type="button" class="btn btn-ghost btn-sm" data-qty="${idx}:-1">−</button>
              <span>${item.cantidad}</span>
              <button type="button" class="btn btn-ghost btn-sm" data-qty="${idx}:1">+</button>
              <span>${money(sub)}</span>
            </div>
          </div>
          <input type="text" placeholder="Nota opcional (ej. sin cebolla)" value="${esc(item.nota)}" data-nota="${idx}" />
        </div>`;
      })
      .join("");
    $("carrito-total").textContent = money(total);
  }

  const recientes = [...state.pedidos].reverse().slice(0, 8);
  $("pedidos-recientes").innerHTML = recientes.length
    ? recientes
        .map((p) => {
          const desc = p.tipo === "MESA" ? `Mesa ${p.mesa?.numero ?? "-"}` : `Domicilio · ${esc(p.cliente?.nombre)}`;
          const itemsTxt = p.items.map((i) => `${i.cantidad}× ${esc(i.plato)}`).join(", ");
          const editable = p.estado === "ENVIADO";
          return `
        <div class="subcard">
          <div class="subcard-head">
            <strong>Pedido #${p.id} · ${desc}</strong>
            <div class="actions-row">
              <span class="pill ${estadoPill(p.estado)}">${esc(p.estado)}</span>
              <span class="pill ${estadoPill(p.pagoEstado)}">${esc(p.pagoEstado)}</span>
            </div>
          </div>
          <div class="hint">${itemsTxt} · Total ${money(p.total)}</div>
          ${
            editable
              ? `<div class="actions-row">
                  <button type="button" class="btn btn-secondary btn-sm" data-modificar="${p.id}">+1 al 1er plato</button>
                  <button type="button" class="btn btn-danger btn-sm" data-cancelar="${p.id}">Cancelar</button>
                </div>`
              : ""
          }
        </div>`;
        })
        .join("")
    : `<div class="empty-state">Aún no se han registrado pedidos.</div>`;
}

function renderCocina() {
  $("cocina-tablero").innerHTML = state.cocina.length
    ? state.cocina
        .map((p) => {
          const destino = p.tipo === "MESA" ? `Mesa ${p.mesa?.numero}` : `Domicilio (${esc(p.cliente?.nombre)})`;
          return `
        <div class="kds-card ${p.estado === "EN_PREPARACION" ? "en-prep" : ""}">
          <div class="subcard-head">
            <strong>#${p.id} · ${destino}</strong>
            <span class="pill ${estadoPill(p.estado)}">${esc(p.estado)}</span>
          </div>
          <ul>
            ${p.items
              .map(
                (i) =>
                  `<li><strong>${i.cantidad}×</strong> ${esc(i.plato)}${
                    i.nota ? ` <span class="nota-inline">(${esc(i.nota)})</span>` : ""
                  }</li>`,
              )
              .join("")}
          </ul>
          ${p.notas ? `<div class="hint">Nota: ${esc(p.notas)}</div>` : ""}
          <div class="actions-row">
            ${
              p.estado === "ENVIADO"
                ? `<button type="button" class="btn btn-primary btn-sm" data-iniciar="${p.id}">Iniciar preparación</button>`
                : `<button type="button" class="btn btn-ok btn-sm" data-listo="${p.id}">Marcar Listo</button>`
            }
          </div>
        </div>`;
        })
        .join("")
    : `<div class="empty-state">No hay pedidos pendientes en cocina.</div>`;

  const notifs = [...state.notificaciones].reverse().slice(0, 15);
  $("notificaciones-lista").innerHTML = notifs.length
    ? notifs
        .map(
          (n) => `
      <div class="notif-item ${n.destino === "SALON" ? "salon" : ""}">
        <strong>${esc(n.destino)}</strong> · ${esc(n.mensaje)}
      </div>`,
        )
        .join("")
    : `<div class="empty-state">Sin notificaciones.</div>`;
}

function renderCaja(cobrables) {
  $("caja-pendientes").innerHTML = cobrables.length
    ? cobrables
        .map((p) => {
          const origen = p.tipo === "MESA" ? `Mesa ${p.mesa?.numero}` : `Domicilio · ${esc(p.cliente?.nombre)}`;
          return `
        <div class="subcard">
          <div class="subcard-head">
            <strong>Pedido #${p.id} (${origen})</strong>
            <span class="pill ${estadoPill(p.estado)}">${esc(p.estado)}</span>
          </div>
          <div>Total a cobrar: <strong>${money(p.total)}</strong></div>
          <button type="button" class="btn btn-primary btn-sm" data-seleccionar-caja="${p.id}">
            Seleccionar para cobrar
          </button>
        </div>`;
        })
        .join("")
    : `<div class="empty-state">No hay pedidos pendientes de cobro (primero márcalos LISTO en Cocina).</div>`;

  const pedido = cobrables.find((p) => p.id === state.pedidoCajaId) || null;
  if (!pedido) {
    $("caja-pedido-badge").textContent = "Ninguno seleccionado";
    $("caja-detalle").innerHTML = `<div class="empty-state">Selecciona un pedido para cobrar.</div>`;
    return;
  }

  $("caja-pedido-badge").textContent = `Pedido #${pedido.id} · ${money(pedido.total)}`;
  $("caja-detalle").innerHTML = `
    <div class="stack-sm">
      <div>Total calculado por backend: <strong>${money(pedido.total)}</strong></div>
      <label class="field">
        <span>Método de pago</span>
        <select id="pago-metodo">
          <option value="EFECTIVO">EFECTIVO</option>
          <option value="TARJETA">TARJETA</option>
          <option value="TRANSFERENCIA">TRANSFERENCIA</option>
        </select>
      </label>
      <div id="pago-efectivo-wrap">
        <label class="field">
          <span>Monto recibido ($)</span>
          <input id="pago-monto" type="number" step="0.01" min="0" value="${pedido.total}" />
        </label>
      </div>
      <div id="pago-tarjeta-wrap" class="hidden">
        <label class="field">
          <span>Resultado de autorización (simulado por cajero)</span>
          <select id="pago-auth">
            <option value="APROBADO">APROBADO</option>
            <option value="DENEGADO">DENEGADO (prueba error 402)</option>
          </select>
        </label>
        <label class="field">
          <span>Motivo si es denegado / Referencia</span>
          <input id="pago-motivo" type="text" placeholder="Ej. Fondos insuficientes o AUT-123" />
        </label>
      </div>
      <button id="btn-ejecutar-cobro" type="button" class="btn btn-ok btn-block">
        Confirmar pago y descontar inventario
      </button>
    </div>`;

  $("pago-metodo").addEventListener("change", (e) => {
    const esEfectivo = e.target.value === "EFECTIVO";
    $("pago-efectivo-wrap").classList.toggle("hidden", !esEfectivo);
    $("pago-tarjeta-wrap").classList.toggle("hidden", esEfectivo);
  });
}

function renderEntregas() {
  $("entregas-pendientes").innerHTML = state.pendientesEntrega.length
    ? state.pendientesEntrega
        .map(
          (p) => `
      <div class="subcard">
        <div class="subcard-head">
          <strong>Pedido #${p.id} · ${esc(p.cliente?.nombre)}</strong>
          <span class="pill ${estadoPill(p.pagoEstado)}">${esc(p.pagoEstado)}</span>
        </div>
        <div class="hint">Dirección: ${esc(p.direccionEntrega)} · Tel: ${esc(p.cliente?.telefono)}</div>
        <button type="button" class="btn btn-primary btn-sm" data-tomar="${p.id}">Tomar pedido</button>
      </div>`,
        )
        .join("")
    : `<div class="empty-state">No hay pedidos a domicilio listos sin repartidor.</div>`;

  $("entregas-lista").innerHTML = state.entregas.length
    ? state.entregas
        .map(
          (e) => `
      <div class="subcard">
        <div class="subcard-head">
          <strong>Entrega #${e.id} (Pedido #${e.pedidoId}) · ${esc(e.repartidor)}</strong>
          <span class="pill ${estadoPill(e.estado)}">${esc(e.estado)}</span>
        </div>
        <div>${esc(e.direccion)}</div>
        <div class="hint">Cliente: ${esc(e.cliente.nombre)} (${esc(e.cliente.telefono)})</div>
        ${e.motivoDevolucion ? `<div class="hint">Motivo devolución: ${esc(e.motivoDevolucion)}</div>` : ""}
        <div class="actions-row">
          ${
            e.estado === "ASIGNADA"
              ? `<button type="button" class="btn btn-primary btn-sm" data-en-camino="${e.id}">Marcar En Camino</button>`
              : ""
          }
          ${
            e.estado === "EN_CAMINO"
              ? `<button type="button" class="btn btn-ok btn-sm" data-entregado="${e.id}">Entregado</button>
                 <button type="button" class="btn btn-danger btn-sm" data-devuelto="${e.id}">Devuelto</button>`
              : ""
          }
        </div>
      </div>`,
        )
        .join("")
    : `<div class="empty-state">No hay entregas registradas con ese filtro.</div>`;
}

function renderInventario() {
  $("inventario-tbody").innerHTML = state.inventario
    .map(
      (i) => `
    <tr>
      <td><strong>${esc(i.ingrediente)}</strong></td>
      <td>${esc(i.unidad)}</td>
      <td>${i.cantidad}</td>
      <td>${i.comprometido}</td>
      <td><strong>${i.disponible}</strong></td>
      <td>
        <button type="button" class="btn btn-secondary btn-sm" data-reponer="${i.ingredienteId}">
          + Reponer
        </button>
      </td>
    </tr>`,
    )
    .join("");

  const selects = document.querySelectorAll(".receta-ing-select");
  selects.forEach((sel) => {
    const val = sel.value;
    sel.innerHTML = state.ingredientes
      .map((ing) => `<option value="${ing.id}">${esc(ing.nombre)} (${esc(ing.unidad)})</option>`)
      .join("");
    if (val) sel.value = val;
  });
}

function agregarLineaReceta() {
  const row = document.createElement("div");
  row.className = "inline-form";
  row.innerHTML = `
    <select class="receta-ing-select" required>
      ${state.ingredientes.map((ing) => `<option value="${ing.id}">${esc(ing.nombre)} (${esc(ing.unidad)})</option>`).join("")}
    </select>
    <input class="receta-cant" type="number" min="0.01" step="0.01" placeholder="Cant." required />
    <button type="button" class="btn btn-ghost btn-sm">✕</button>`;
  row.querySelector("button").addEventListener("click", () => row.remove());
  $("receta-builder").appendChild(row);
}

/* ---------- Eventos ---------- */

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    $(`panel-${btn.dataset.tab}`).classList.add("active");
  });
});

$("btn-refresh").addEventListener("click", () => cargarTodo());
$("btn-toggle-json").addEventListener("click", () => $("api-last-json").classList.toggle("hidden"));
$("filtro-notif").addEventListener("change", () => cargarTodo());
$("filtro-entregas").addEventListener("change", () => cargarTodo());

$("tipo-mesa").addEventListener("click", () => {
  state.tipoPedido = "MESA";
  $("tipo-mesa").classList.add("active");
  $("tipo-domicilio").classList.remove("active");
  $("bloque-mesa").classList.remove("hidden");
  $("bloque-domicilio").classList.add("hidden");
});

$("tipo-domicilio").addEventListener("click", () => {
  state.tipoPedido = "DOMICILIO";
  $("tipo-domicilio").classList.add("active");
  $("tipo-mesa").classList.remove("active");
  $("bloque-domicilio").classList.remove("hidden");
  $("bloque-mesa").classList.add("hidden");
});

$("btn-limpiar-carrito").addEventListener("click", () => {
  state.carrito = [];
  renderMesero();
});

$("btn-enviar-pedido").addEventListener("click", async () => {
  try {
    const body = {
      tipo: state.tipoPedido,
      notas: $("pedido-notas").value.trim() || undefined,
      items: state.carrito.map((c) => ({
        platoId: c.platoId,
        cantidad: c.cantidad,
        ...(c.nota.trim() ? { nota: c.nota.trim() } : {}),
      })),
    };
    if (state.tipoPedido === "MESA") {
      body.mesaId = state.mesaSeleccionada;
    } else {
      body.cliente = { nombre: $("dom-nombre").value.trim(), telefono: $("dom-telefono").value.trim() };
      body.direccionEntrega = $("dom-direccion").value.trim();
    }
    const creado = await api("/api/pedidos", { method: "POST", body });
    state.carrito = [];
    $("pedido-notas").value = "";
    toast(`Pedido #${creado.id} enviado a cocina`);
    await cargarTodo();
  } catch (e) {
    toast(e.message, "err");
    await cargarTodo();
  }
});

document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("button");
  if (!t) return;

  try {
    if (t.dataset.mesa) {
      state.mesaSeleccionada = Number(t.dataset.mesa);
      renderMesero();
    } else if (t.dataset.addPlato) {
      const platoId = Number(t.dataset.addPlato);
      const ex = state.carrito.find((c) => c.platoId === platoId);
      if (ex) ex.cantidad += 1;
      else state.carrito.push({ platoId, cantidad: 1, nota: "" });
      renderMesero();
    } else if (t.dataset.qty) {
      const [idx, delta] = t.dataset.qty.split(":").map(Number);
      state.carrito[idx].cantidad += delta;
      if (state.carrito[idx].cantidad <= 0) state.carrito.splice(idx, 1);
      renderMesero();
    } else if (t.dataset.cancelar) {
      await api(`/api/pedidos/${t.dataset.cancelar}/cancelar`, { method: "POST" });
      toast(`Pedido #${t.dataset.cancelar} cancelado`);
      await cargarTodo();
    } else if (t.dataset.modificar) {
      const p = state.pedidos.find((x) => x.id === Number(t.dataset.modificar));
      const items = p.items.map((i, idx) => ({
        platoId: i.platoId,
        cantidad: idx === 0 ? i.cantidad + 1 : i.cantidad,
        ...(i.nota ? { nota: i.nota } : {}),
      }));
      await api(`/api/pedidos/${p.id}/items`, { method: "PUT", body: { items } });
      toast(`Pedido #${p.id} modificado`);
      await cargarTodo();
    } else if (t.dataset.iniciar) {
      await api(`/api/cocina/pedidos/${t.dataset.iniciar}/iniciar`, { method: "POST" });
      toast(`Pedido #${t.dataset.iniciar} en preparación`);
      await cargarTodo();
    } else if (t.dataset.listo) {
      await api(`/api/cocina/pedidos/${t.dataset.listo}/listo`, { method: "POST" });
      toast(`Pedido #${t.dataset.listo} listo y notificado al salón`);
      await cargarTodo();
    } else if (t.dataset.seleccionarCaja) {
      state.pedidoCajaId = Number(t.dataset.seleccionarCaja);
      await api(`/api/pedidos/${state.pedidoCajaId}/total`);
      renderTodo();
    } else if (t.id === "btn-ejecutar-cobro") {
      const metodo = $("pago-metodo").value;
      const body = { metodo };
      if (metodo === "EFECTIVO") {
        body.montoRecibido = Number($("pago-monto").value);
      } else {
        body.resultadoAutorizacion = $("pago-auth").value;
        const txt = $("pago-motivo").value.trim();
        if (txt && body.resultadoAutorizacion === "DENEGADO") body.motivoDenegacion = txt;
        if (txt && body.resultadoAutorizacion === "APROBADO") body.referencia = txt;
      }
      const res = await api(`/api/pedidos/${state.pedidoCajaId}/pagos`, { method: "POST", body });
      $("caja-resultado").innerHTML = `
        <div class="subcard">
          <div class="subcard-head">
            <strong>Pago aprobado #${res.pago.id}</strong>
            <span class="pill pill-ok">Cambio: ${money(res.cambio)}</span>
          </div>
          <div class="hint">Ingredientes descontados: ${res.ingredientesDescontados
            .map((c) => `${esc(c.ingrediente)} -${c.cantidad}${esc(c.unidad)}`)
            .join(", ")}</div>
        </div>`;
      toast(`Pedido #${state.pedidoCajaId} cobrado`);
      state.pedidoCajaId = null;
      await cargarTodo();
    } else if (t.dataset.tomar) {
      const repartidor = $("repartidor-nombre").value.trim();
      await api("/api/entregas", { method: "POST", body: { pedidoId: Number(t.dataset.tomar), repartidor } });
      toast(`Entrega tomada por ${repartidor}`);
      await cargarTodo();
    } else if (t.dataset.enCamino) {
      await api(`/api/entregas/${t.dataset.enCamino}/en-camino`, { method: "POST" });
      toast(`Entrega #${t.dataset.enCamino} en camino`);
      await cargarTodo();
    } else if (t.dataset.entregado) {
      await api(`/api/entregas/${t.dataset.entregado}/entregado`, { method: "POST" });
      toast(`Entrega #${t.dataset.entregado} completada`);
      await cargarTodo();
    } else if (t.dataset.devuelto) {
      const motivo = window.prompt("Motivo de devolución:", "Cliente ilocalizable");
      if (!motivo) return;
      await api(`/api/entregas/${t.dataset.devuelto}/devuelto`, { method: "POST", body: { motivo } });
      toast(`Entrega #${t.dataset.devuelto} devuelta`, "err");
      await cargarTodo();
    } else if (t.dataset.reponer) {
      const raw = window.prompt("Cantidad a reponer:", "500");
      if (!raw) return;
      await api(`/api/inventario/${t.dataset.reponer}/reposiciones`, {
        method: "POST",
        body: { cantidad: Number(raw) },
      });
      toast("Stock repuesto");
      await cargarTodo();
    }
  } catch (e) {
    toast(e.message, "err");
    await cargarTodo();
  }
});

document.addEventListener("input", (ev) => {
  if (ev.target.dataset.nota !== undefined) {
    state.carrito[Number(ev.target.dataset.nota)].nota = ev.target.value;
  }
});

$("form-mesa").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api("/api/mesas", { method: "POST", body: { numero: Number($("nueva-mesa-num").value) } });
    $("nueva-mesa-num").value = "";
    toast("Mesa creada");
    await cargarTodo();
  } catch (err) {
    toast(err.message, "err");
  }
});

$("form-ingrediente").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api("/api/ingredientes", {
      method: "POST",
      body: {
        nombre: $("nuevo-ing-nombre").value.trim(),
        unidad: $("nuevo-ing-unidad").value.trim(),
        existenciaInicial: Number($("nuevo-ing-stock").value),
      },
    });
    e.target.reset();
    $("nuevo-ing-stock").value = "0";
    toast("Ingrediente creado");
    await cargarTodo();
  } catch (err) {
    toast(err.message, "err");
  }
});

$("btn-add-receta-linea").addEventListener("click", agregarLineaReceta);

$("form-plato").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const receta = [...$("receta-builder").children].map((row) => ({
      ingredienteId: Number(row.querySelector("select").value),
      cantidad: Number(row.querySelector("input").value),
    }));
    await api("/api/platos", {
      method: "POST",
      body: {
        nombre: $("nuevo-plato-nombre").value.trim(),
        precio: Number($("nuevo-plato-precio").value),
        receta,
      },
    });
    e.target.reset();
    $("receta-builder").innerHTML = "";
    agregarLineaReceta();
    toast("Plato creado");
    await cargarTodo();
  } catch (err) {
    toast(err.message, "err");
  }
});

await cargarTodo();
agregarLineaReceta();
