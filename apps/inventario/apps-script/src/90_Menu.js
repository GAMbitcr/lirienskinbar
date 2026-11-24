/** Menú "Lirien" dentro del Sheet: instalación y tareas de los dueños. */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Lirien')
    .addItem('1. Configurar hojas', 'menuSetup')
    .addItem('2. Cargar catálogo base (8 nov 2026)', 'menuSeed')
    .addItem('3. Agregar persona y generar código', 'menuAddUser')
    .addSeparator()
    .addItem('Importar inventario desde la hoja "legacy"', 'menuImportLegacy')
    .addItem('Generar código nuevo para una persona', 'menuResetPin')
    .addItem('Recalcular hoja de stock', 'menuRebuildStock')
    .addItem('Refrescar datos de la app', 'menuRefresh')
    .addItem('Activar aviso diario de stock bajo', 'menuInstallDigest')
    .addToUi();
}

function menuRun_(fn) {
  var ui = SpreadsheetApp.getUi();
  Db.reset();
  try {
    var message = withLock(fn);
    if (message) ui.alert('Lirien', message, ui.ButtonSet.OK);
  } catch (err) {
    ui.alert('Lirien', err && err.isApi ? err.message : 'Algo falló: ' + err, ui.ButtonSet.OK);
  }
}

function menuSetup() {
  menuRun_(function () { Db.setup(); return 'Hojas listas. Siguiente paso: "2. Cargar catálogo base" y luego "3. Agregar persona".'; });
}

function menuSeed() {
  menuRun_(function () { var r = Seed.load(); return 'Catálogo cargado: ' + r.products + ' productos, ' + r.variants + ' variantes y ' + r.units + ' unidades (foto del 8 de noviembre). Subí el inventario actualizado desde la app (Admin → Importar) para ponerlo al día.'; });
}

function menuAddUser() {
  var ui = SpreadsheetApp.getUi();
  var name = ui.prompt('Lirien · Agregar persona', 'Nombre (como va a aparecer en la app):', ui.ButtonSet.OK_CANCEL);
  if (name.getSelectedButton() !== ui.Button.OK) return;
  var role = ui.alert('Lirien · Rol', '¿' + name.getResponseText() + ' es admin (dueños)?\n\nSí = admin · No = colaboradora (solo consulta y ventas)', ui.ButtonSet.YES_NO_CANCEL);
  if (role === ui.Button.CANCEL) return;
  menuRun_(function () {
    var r = Auth.createUser({ name: name.getResponseText(), role: role === ui.Button.YES ? 'admin' : 'staff' }, null);
    return 'Código de activación de ' + r.name + ': ' + r.activationCode.slice(0, 4) + ' ' + r.activationCode.slice(4) + '\n\nEs de un solo uso y vence en ' + CONFIG.ACTIVATION_HOURS + ' horas. Con ese código, ' + r.name + ' crea su PIN de 6 dígitos en la app. No queda guardado: anotalo ahora.';
  });
}

function menuResetPin() {
  var ui = SpreadsheetApp.getUi();
  var who = ui.prompt('Lirien · Código nuevo', 'Nombre de la persona (tal como está en la hoja users):', ui.ButtonSet.OK_CANCEL);
  if (who.getSelectedButton() !== ui.Button.OK) return;
  menuRun_(function () {
    var rows = Db.rows('users'), key = Util.key(who.getResponseText()), found = null;
    for (var i = 0; i < rows.length; i++) if (Util.key(rows[i].name) === key || Util.str(rows[i].user_id) === Util.str(who.getResponseText())) found = rows[i];
    if (!found) throw new ApiError('NOT_FOUND', 'No encontramos a esa persona en la hoja users.');
    var r = Auth.resetPin({ userId: Util.str(found.user_id) }, null);
    return 'Código de activación de ' + r.name + ': ' + r.activationCode.slice(0, 4) + ' ' + r.activationCode.slice(4) + '\n\nSu PIN anterior ya no sirve. El código vence en ' + CONFIG.ACTIVATION_HOURS + ' horas.';
  });
}

/** Lee la pestaña "legacy" (copia del Sheet de siempre: A nombre, B precio final, C existencias, D urna, E oferta). */
function legacyRows_() {
  var sh = Db.ss().getSheetByName('legacy');
  if (!sh) throw new ApiError('SETUP', 'No hay una pestaña llamada "legacy". Copiá ahí el inventario actualizado.');
  var values = sh.getDataRange().getValues(), rows = [];
  for (var i = 0; i < values.length; i++) {
    var name = Util.str(values[i][0]);
    if (!name || name === 'ƒ' || /^(nombre|producto)$/i.test(name) || /precio final/i.test(Util.str(values[i][1]))) continue;
    rows.push({ line: i + 1, name: name, price: values[i][1], stock: values[i][2], location: values[i][3], offer: values[i][4] });
  }
  return rows;
}

function menuImportLegacy() {
  var ui = SpreadsheetApp.getUi();
  var plan = null;
  Db.reset();
  try { plan = Import.plan(legacyRows_(), null); } catch (err) { ui.alert('Lirien', err && err.isApi ? err.message : String(err), ui.ButtonSet.OK); return; }
  var s = plan.summary;
  var ok = ui.alert('Lirien · Importar inventario', s.rows + ' filas leídas.\n\n• ' + s.priceChanges + ' cambios de precio\n• ' + s.stockChanges + ' diferencias de stock (' + (s.stockUnitsDelta >= 0 ? '+' : '') + s.stockUnitsDelta + ' unidades)\n• ' + s.newItems + ' productos o variantes nuevas\n• ' + s.missing + ' del catálogo no vienen en el archivo (no se tocan)\n• ' + s.warnings + ' avisos para revisar (quedan en la hoja review)\n\n¿Aplicar?', ui.ButtonSet.YES_NO);
  if (ok !== ui.Button.YES) return;
  menuRun_(function () { var r = Import.apply({ rows: legacyRows_() }, null); return 'Listo: ' + r.applied.variantsUpdated + ' variantes actualizadas, ' + r.applied.variantsCreated + ' nuevas y ' + r.applied.movements + ' movimientos registrados.'; });
}

function menuRebuildStock() {
  menuRun_(function () { var d = Stock.rebuild(); return d ? 'Stock recalculado: ' + d + ' SKU no cuadraban y se corrigieron (quedó anotado en log).' : 'Stock recalculado: todo cuadraba.'; });
}

function menuRefresh() {
  menuRun_(function () { Catalog.invalidate(); return 'Listo. La app va a mostrar los datos nuevos al actualizar.'; });
}

function menuInstallDigest() {
  var ui = SpreadsheetApp.getUi();
  var mail = ui.prompt('Lirien · Aviso diario', 'Correo que recibe el aviso de stock bajo (cada día a las 8 a. m.):', ui.ButtonSet.OK_CANCEL);
  if (mail.getSelectedButton() !== ui.Button.OK) return;
  menuRun_(function () {
    var email = Util.str(mail.getResponseText());
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ApiError('INVALID', 'Ese correo no parece válido.');
    Util.props().setProperty('ALERT_EMAIL', email);
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) if (triggers[i].getHandlerFunction() === 'dailyDigest') ScriptApp.deleteTrigger(triggers[i]);
    ScriptApp.newTrigger('dailyDigest').timeBased().everyDays(1).atHour(8).create();
    return 'Aviso activado para ' + email + '.';
  });
}

/** Disparador diario: recalcula el stock y manda el resumen de agotados y últimas unidades. */
function dailyDigest() {
  Db.reset();
  var email = Util.props().getProperty('ALERT_EMAIL');
  var data = withLock(function () { Stock.rebuild(); return Catalog.build(); });
  if (!email) return;
  var low = [], out = [];
  for (var i = 0; i < data.length; i++) {
    var p = data[i];
    if (p.status !== 'active') continue;
    for (var k = 0; k < p.variants.length; k++) {
      var v = p.variants[k];
      if (!v.active) continue;
      var name = p.vendor + ' ' + p.title + (v.optionValue ? ' · ' + v.optionValue : '');
      if (v.stock <= 0) out.push(name); else if (v.stock <= v.minStock) low.push(name + ' (' + v.stock + ')');
    }
  }
  if (!low.length) return; // los agotados no cambian de un día a otro: solo se avisa si hay últimas unidades
  MailApp.sendEmail(email, 'Lirien · ' + low.length + ' productos en últimas unidades', 'Últimas unidades:\n- ' + low.join('\n- ') + '\n\nAgotados: ' + out.length + '\n\nMirá el detalle en la app, pestaña Alertas.');
}
