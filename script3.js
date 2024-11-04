let globalData = [];
const LIMITE_MONTO = 25000;

// Estado de filtros
let estadoFiltros = {
    cliente: '',
    mes: '',
    montoMinimo: '',
    montoMaximo: '',
    estado: '',
    fechaInicio: '',
    fechaFin: ''
};

// Elementos del modal
const modal = document.getElementById('detailsModal');
const closeBtn = document.getElementsByClassName('close')[0];

// Cerrar modal
closeBtn.onclick = function() {
    modal.style.display = "none";
};

window.onclick = function(event) {
    if (event.target == modal) {
        modal.style.display = "none";
    }
};

const TOKEN_TELEGRAM = 'TU_TELEGRAM_TOKEN';
const ID_CHAT_TELEGRAM = 'TU_CHAT_ID_TELEGRAM';

function enviarAlertaTelegram(textoAlerta) {
    const url = `https://api.telegram.org/bot${TOKEN_TELEGRAM}/sendMessage`;
    const mensaje = encodeURIComponent(textoAlerta);

    fetch(`${url}?chat_id=${ID_CHAT_TELEGRAM}&text=${mensaje}`)
        .then(response => response.json())
        .then(data => {
            if (!data.ok) {
                console.error('Error al enviar mensaje a Telegram:', data.description);
            } else {
                console.log('Mensaje enviado a Telegram correctamente');
            }
        })
        .catch(error => console.error('Error en la solicitud de Telegram:', error));
}

function procesarArchivo() {
    const archivoInput = document.getElementById('fileInput');
    const archivo = archivoInput.files[0];

    if (!archivo) {
        alert('Por favor seleccione un archivo');
        return;
    }

    const lector = new FileReader();
    lector.onload = function(e) {
        const datos = new Uint8Array(e.target.result);
        const libro = XLSX.read(datos, { type: 'array' });
        const primeraHoja = libro.Sheets[libro.SheetNames[0]];
        const datosJson = XLSX.utils.sheet_to_json(primeraHoja);

        // Guardar datos en localStorage
        localStorage.setItem('transacciones', JSON.stringify(datosJson));
        globalData = datosJson;

        procesarTransacciones(datosJson);  // Procesa y muestra las transacciones
        enviarAlertasExcedidas(datosJson);  // Enviar alertas a Telegram para transacciones que superan el límite
        actualizarUltimaActualizacion();
    };

    lector.onerror = function() {
        alert('Error al leer el archivo. Por favor, intente de nuevo.');
    };

    lector.readAsArrayBuffer(archivo);
}

function cargarTransacciones() {
    const datosGuardados = localStorage.getItem('transacciones');
    if (datosGuardados) {
        globalData = JSON.parse(datosGuardados);
        procesarTransacciones(globalData);
    }
}

function actualizarUltimaActualizacion() {
    const ahora = new Date();
    document.getElementById('lastUpdate').textContent = 
        `Última actualización: ${ahora.toLocaleDateString()} ${ahora.toLocaleTimeString()}`;
}

// Función para aplicar filtros
function aplicarFiltros(datos) {
    return datos.filter(row => {
        const monto = parseFloat(row.Monto);
        const estado = monto > LIMITE_MONTO ? 'excede' : 'normal';

        return (
            (!estadoFiltros.cliente || row.Nombre_Cliente.toLowerCase().includes(estadoFiltros.cliente.toLowerCase())) &&
            (!estadoFiltros.mes || row.Mes.toLowerCase().includes(estadoFiltros.mes.toLowerCase())) &&
            (!estadoFiltros.montoMinimo || monto >= parseFloat(estadoFiltros.montoMinimo)) &&
            (!estadoFiltros.montoMaximo || monto <= parseFloat(estadoFiltros.montoMaximo)) &&
            (!estadoFiltros.estado || estado === estadoFiltros.estado) &&
            (!estadoFiltros.fechaInicio || Date.parse(row.Fecha) >= Date.parse(estadoFiltros.fechaInicio)) &&
            (!estadoFiltros.fechaFin || Date.parse(row.Fecha) <= Date.parse(estadoFiltros.fechaFin))
        );
    });
}

function procesarTransacciones(datos) {
    const datosFiltrados = aplicarFiltros(datos); // Filtrar datos según `estadoFiltros`
    const transaccionesPorClienteMes = {};
    let montoTotal = 0;
    let contadorAlertas = 0;

    if (datosFiltrados.length === 0) {
        document.getElementById('totalTransfers').textContent = '0';
        document.getElementById('uniqueClients').textContent = '0';
        document.getElementById('totalAmount').textContent = '$0.00';
        return; // Salir si no hay datos filtrados
    }

    datosFiltrados.forEach(row => {
        const claveCliente = `${row.Nombre_Cliente}-${row.Mes}`;
        if (!transaccionesPorClienteMes[claveCliente]) {
            transaccionesPorClienteMes[claveCliente] = {
                cliente: row.Nombre_Cliente,
                mes: row.Mes,
                transacciones: [],
                totalMonto: 0
            };
        }

        const monto = parseFloat(row.Monto);
        const estaReportada = row.Reportada && row.Reportada.toLowerCase() === 'sí';

        transaccionesPorClienteMes[claveCliente].transacciones.push({
            monto: monto,
            nroTransferencia: row['N° Transferencia'],
            banco: row.Banco,
            facturas: row.Facturas,
            reportada: estaReportada
        });

        transaccionesPorClienteMes[claveCliente].totalMonto += monto;
        montoTotal += monto;
    });

    // Actualizar métricas
    document.getElementById('totalTransfers').textContent = datosFiltrados.length;
    document.getElementById('uniqueClients').textContent = 
        new Set(datosFiltrados.map(row => row.Nombre_Cliente)).size;
    document.getElementById('totalAmount').textContent = 
        `$${montoTotal.toLocaleString('es-ES', {minimumFractionDigits: 2})}`;

    // Mostrar alertas
    const contenedorAlertas = document.getElementById('alerts');
    contenedorAlertas.innerHTML = '';

    for (const clave in transaccionesPorClienteMes) {
        const info = transaccionesPorClienteMes[clave];
        if (info.totalMonto > LIMITE_MONTO && !info.transacciones.some(t => t.reportada)) {
            contadorAlertas++;
            const alertaHtml = `
                <div class="alert-card" onclick="marcarComoReportada('${clave}')">
                    <div class="alert-header">¡Alerta! Transferencias exceden límite</div>
                    <p><strong>Cliente:</strong> ${info.cliente}</p>
                    <p><strong>Mes:</strong> ${info.mes}</p>
                    <p><strong>Total:</strong> $${info.totalMonto.toLocaleString('es-ES', {minimumFractionDigits: 2})}</p>
                    <p><strong>Haz clic para marcar como reportada</strong></p>
                </div>
            `;
            contenedorAlertas.innerHTML += alertaHtml;
        }
    }

    document.getElementById('activeAlerts').textContent = contadorAlertas;

    actualizarTabla(transaccionesPorClienteMes);
}

function actualizarTabla(transaccionesPorClienteMes) {
    const tbody = document.querySelector('#transactionsTable tbody');
    tbody.innerHTML = '';

    Object.values(transaccionesPorClienteMes).forEach(info => {
        const fila = document.createElement('tr');
        const excedeLimite = info.totalMonto > LIMITE_MONTO;

        fila.innerHTML = `
            <td>${info.cliente}</td>
            <td>${info.mes}</td>
            <td>${info.transacciones.length}</td>
            <td>$${info.totalMonto.toLocaleString('es-ES', {minimumFractionDigits: 2})}</td>
            <td>
                <span class="status-badge ${excedeLimite ? 'status-warning' : 'status-normal'}">
                    ${excedeLimite ? '⚠️ Excede límite' : '✅ Normal'}
                </span>
            </td>
            <td>
                <button class="btn" onclick='mostrarDetalles(${JSON.stringify(info)})'>
                    Ver Detalles
                </button>
            </td>
        `;

        tbody.appendChild(fila);
    });
}

function mostrarDetalles(info) {
    const contenidoModal = document.getElementById('modalContent');

    let detallesHtml = `
        <h3>Cliente: ${info.cliente}</h3>
        <h4>Mes: ${info.mes}</h4>
        <table>
            <thead>
                <tr>
                    <th>N° Transferencia</th>
                    <th>Banco</th>
                    <th>Monto</th>
                    <th>Facturas</th>
                    <th>Reportada</th>
                </tr>
            </thead>
            <tbody>
    `;

    info.transacciones.forEach(t => {
        detallesHtml += `
            <tr>
                <td>${t.nroTransferencia}</td>
                <td>${t.banco}</td>
                <td>$${t.monto.toLocaleString('es-ES', {minimumFractionDigits: 2})}</td>
                <td>${t.facturas}</td>
                <td>${t.reportada ? 'Sí' : 'No'}</td>
            </tr>
        `;
    });

    detallesHtml += `
            </tbody>
        </table>
    `;

    contenidoModal.innerHTML = detallesHtml;
    modal.style.display = "block";
}

// Función para enviar alertas
function enviarAlertasExcedidas(datos) {
    const alertas = datos.filter(row => parseFloat(row.Monto) > LIMITE_MONTO && (!row.Reportada || row.Reportada.toLowerCase() !== 'sí'));
    alertas.forEach(alerta => {
        enviarAlertaTelegram(`Alerta: ${alerta.Nombre_Cliente} ha superado el límite de $${LIMITE_MONTO} en ${alerta.Mes}. Monto: $${alerta.Monto}`);
    });
}

// Escuchar cambios en los filtros
document.getElementById('clientFilter').addEventListener('input', (e) => {
    estadoFiltros.cliente = e.target.value;
    cargarTransacciones(); // Volver a cargar transacciones aplicando filtros
});

// Similar para otros filtros...

window.onload = cargarTransacciones; // Cargar datos al inicio
