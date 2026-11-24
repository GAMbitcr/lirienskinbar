/**
 * Personas, PIN de 6 dígitos, códigos de activación y sesiones.
 * - El PIN lo crea cada persona con un código de activación de un solo uso que genera un admin.
 * - PIN y código se guardan con hash (sal por persona + pimienta en las propiedades del script).
 * - 5 intentos fallidos bloquean a esa persona 15 minutos; hay un freno general contra intentos masivos.
 */
var Auth = {
  WEAK: ['123456', '654321', '012345', '543210', '234567', '345678', '456789', '987654', '876543', '765432', '121212', '123123', '112233', '102030'],

  hash: function (secret, salt) {
    var pepper = Util.props().getProperty('PEPPER') || '';
    var h = Util.sha256(salt + '|' + secret + '|' + pepper);
    for (var i = 1; i < CONFIG.PIN_ITERATIONS; i++) h = Util.sha256(h + salt);
    return h;
  },

  validatePin: function (pin) {
    pin = Util.str(pin);
    if (!/^\d{6}$/.test(pin)) throw new ApiError('INVALID', 'El PIN tiene que ser de 6 dígitos.');
    if (/^(\d)\1{5}$/.test(pin) || Auth.WEAK.indexOf(pin) >= 0) throw new ApiError('INVALID', 'Ese PIN es muy fácil de adivinar. Elegí otro.');
    return pin;
  },

  user: function (userId) {
    var rows = Db.rows('users');
    for (var i = 0; i < rows.length; i++) if (Util.str(rows[i].user_id) === userId) return rows[i];
    return null;
  },
  activeUser: function (userId) {
    var u = Auth.user(Util.str(userId));
    if (!u || !Util.bool(u.active)) throw new ApiError('AUTH', 'No encontramos a esa persona. Pedile a un admin que revise tu usuario.');
    return u;
  },
  activationPending: function (u) {
    return Util.str(u.activation_hash) !== '' && Util.str(u.activation_expires) > Util.now();
  },

  /** Lista para la pantalla de ingreso: solo nombre y estado, nunca hashes. */
  publicUsers: function () {
    var rows = Db.rows('users'), out = [];
    for (var i = 0; i < rows.length; i++) {
      var u = rows[i];
      if (!Util.bool(u.active)) continue;
      var hasPin = Util.str(u.pin_hash) !== '';
      if (!hasPin && !Auth.activationPending(u)) continue; // sin PIN ni código vigente: no puede entrar
      out.push({ userId: Util.str(u.user_id), name: Util.str(u.name), role: Util.str(u.role), hasPin: hasPin });
    }
    return out;
  },

  /* --- Bloqueo por intentos --- */
  checkThrottle: function (userId) {
    var cache = Util.cache();
    if (parseInt(cache.get('fail:' + userId) || '0', 10) >= CONFIG.MAX_FAILS) {
      throw new ApiError('LOCKED', 'Demasiados intentos. Esperá ' + CONFIG.LOCK_MINUTES + ' minutos o pedile a un admin un código nuevo.');
    }
    if (parseInt(cache.get('fail:all') || '0', 10) >= CONFIG.GLOBAL_FAILS_PER_10_MIN) {
      throw new ApiError('LOCKED', 'Hay demasiados intentos fallidos en este momento. Probá de nuevo en unos minutos.');
    }
  },
  fail: function (userId, message) {
    var cache = Util.cache();
    var n = parseInt(cache.get('fail:' + userId) || '0', 10) + 1;
    cache.put('fail:' + userId, String(n), CONFIG.LOCK_MINUTES * 60);
    cache.put('fail:all', String(parseInt(cache.get('fail:all') || '0', 10) + 1), 600);
    Db.log('warn', 'auth.fail', userId, 'intento ' + n);
    var left = CONFIG.MAX_FAILS - n;
    throw new ApiError('AUTH', left > 0 ? message + ' Te quedan ' + left + (left === 1 ? ' intento.' : ' intentos.') : 'Demasiados intentos. Esperá ' + CONFIG.LOCK_MINUTES + ' minutos o pedile a un admin un código nuevo.');
  },

  /* --- Sesiones (en las propiedades del script, con el token guardado como hash) --- */
  startSession: function (u) {
    var props = Util.props();
    var all = props.getProperties();
    var now = new Date().getTime();
    for (var k in all) {
      if (k.indexOf('sess:') === 0 && parseInt(String(all[k]).split('|')[3], 10) < now) props.deleteProperty(k);
    }
    var token = Util.randomHex() + Util.randomHex().slice(0, 16);
    var exp = now + CONFIG.SESSION_HOURS * 3600 * 1000;
    props.setProperty('sess:' + Util.sha256(token), [Util.str(u.user_id), Util.str(u.role), Util.str(u.name), exp].join('|'));
    Util.cache().remove('fail:' + Util.str(u.user_id));
    return { token: token, expiresAt: Util.iso(new Date(exp)), userId: Util.str(u.user_id), name: Util.str(u.name), role: Util.str(u.role) };
  },
  requireSession: function (token) {
    token = Util.str(token);
    var raw = token ? Util.props().getProperty('sess:' + Util.sha256(token)) : null;
    if (raw) {
      var p = String(raw).split('|');
      if (parseInt(p[3], 10) > new Date().getTime()) return { userId: p[0], role: p[1], name: p[2] };
    }
    throw new ApiError('AUTH', 'Tu sesión terminó. Ingresá de nuevo con tu PIN.');
  },
  endSessions: function (userId) {
    var props = Util.props();
    var all = props.getProperties();
    for (var k in all) if (k.indexOf('sess:') === 0 && String(all[k]).split('|')[0] === userId) props.deleteProperty(k);
  },

  /* --- Acciones --- */
  login: function (req) {
    var u = Auth.activeUser(req.userId);
    var id = Util.str(u.user_id);
    Auth.checkThrottle(id);
    if (Util.str(u.pin_hash) === '') throw new ApiError('NEEDS_ACTIVATION', 'Todavía no creaste tu PIN. Usá el código de activación que te dio un admin.');
    if (Auth.hash(Util.str(req.pin), Util.str(u.salt)) !== Util.str(u.pin_hash)) Auth.fail(id, 'PIN incorrecto.');
    Db.log('info', 'auth.login', id, '');
    return Auth.startSession(u);
  },

  /** Primer ingreso (o PIN restablecido): código de activación + PIN nuevo. */
  activate: function (req) {
    var u = Auth.activeUser(req.userId);
    var id = Util.str(u.user_id);
    Auth.checkThrottle(id);
    if (!Auth.activationPending(u)) throw new ApiError('INVALID', 'Ese código ya no sirve. Pedile a un admin uno nuevo.');
    var code = Util.str(req.code).replace(/\D/g, '');
    if (Auth.hash(code, 'act:' + id) !== Util.str(u.activation_hash)) Auth.fail(id, 'El código de activación no coincide.');
    var pin = Auth.validatePin(req.pin);
    u.salt = Util.randomHex().slice(0, 32);
    u.pin_hash = Auth.hash(pin, u.salt);
    u.activation_hash = '';
    u.activation_expires = '';
    u.pin_set_at = Util.now();
    Db.update('users', u);
    Auth.endSessions(id);
    Db.log('info', 'auth.activate', id, '');
    return Auth.startSession(u);
  },

  changePin: function (req, session) {
    var u = Auth.activeUser(session.userId);
    Auth.checkThrottle(session.userId);
    if (Auth.hash(Util.str(req.currentPin), Util.str(u.salt)) !== Util.str(u.pin_hash)) Auth.fail(session.userId, 'Tu PIN actual no coincide.');
    var pin = Auth.validatePin(req.newPin);
    if (pin === Util.str(req.currentPin)) throw new ApiError('INVALID', 'El PIN nuevo tiene que ser distinto al actual.');
    u.salt = Util.randomHex().slice(0, 32);
    u.pin_hash = Auth.hash(pin, u.salt);
    u.pin_set_at = Util.now();
    Db.update('users', u);
    Auth.endSessions(session.userId);
    Db.log('info', 'auth.changePin', session.userId, '');
    return Auth.startSession(u);
  },

  logout: function (req) {
    var token = Util.str(req.token);
    if (token) Util.props().deleteProperty('sess:' + Util.sha256(token));
    return { ok: true };
  },

  /* --- Gestión de personas (admin, o los dueños desde el menú del Sheet) --- */
  listUsers: function () {
    var rows = Db.rows('users'), out = [];
    for (var i = 0; i < rows.length; i++) {
      var u = rows[i];
      var hasPin = Util.str(u.pin_hash) !== '';
      out.push({ userId: Util.str(u.user_id), name: Util.str(u.name), role: Util.str(u.role), active: Util.bool(u.active), hasPin: hasPin, activationPending: Auth.activationPending(u), activationExpires: Auth.activationPending(u) ? Util.str(u.activation_expires) : null, pinSetAt: Util.str(u.pin_set_at) || null });
    }
    return out;
  },

  _newCode: function (u) {
    var code = Util.randomDigits(8);
    u.activation_hash = Auth.hash(code, 'act:' + Util.str(u.user_id));
    u.activation_expires = Util.iso(new Date(new Date().getTime() + CONFIG.ACTIVATION_HOURS * 3600 * 1000));
    return code;
  },
  _role: function (role) {
    role = Util.str(role);
    if (role !== 'admin' && role !== 'staff') throw new ApiError('INVALID', 'El rol tiene que ser admin o colaboradora.');
    return role;
  },
  _countAdmins: function (exceptId) {
    var rows = Db.rows('users'), n = 0;
    for (var i = 0; i < rows.length; i++) if (Util.str(rows[i].role) === 'admin' && Util.bool(rows[i].active) && Util.str(rows[i].user_id) !== exceptId) n++;
    return n;
  },

  createUser: function (req, session) {
    var name = Util.str(req.name).replace(/\s+/g, ' ');
    if (name.length < 2 || name.length > 40) throw new ApiError('INVALID', 'Escribí el nombre de la persona (2 a 40 letras).');
    var role = Auth._role(req.role);
    var base = Util.slug(name) || 'persona', id = base, n = 2;
    while (Auth.user(id)) id = base + '-' + (n++);
    var rows = Db.rows('users');
    for (var i = 0; i < rows.length; i++) if (Util.key(rows[i].name) === Util.key(name) && Util.bool(rows[i].active)) throw new ApiError('CONFLICT', 'Ya hay una persona activa con ese nombre.');
    var u = { user_id: id, name: name, role: role, active: true, pin_hash: '', salt: '', activation_hash: '', activation_expires: '', pin_set_at: '', created_at: Util.now() };
    var code = Auth._newCode(u);
    Db.append('users', [u]);
    Db.log('info', 'user.create', session ? session.userId : 'menu', id + ' · ' + role);
    return { userId: id, name: name, role: role, activationCode: code, activationExpires: u.activation_expires };
  },

  updateUser: function (req, session) {
    var u = Auth.user(Util.str(req.userId));
    if (!u) throw new ApiError('NOT_FOUND', 'No encontramos a esa persona.');
    var id = Util.str(u.user_id);
    if (req.role !== undefined) {
      var role = Auth._role(req.role);
      if (role !== 'admin' && Util.str(u.role) === 'admin' && Auth._countAdmins(id) === 0) throw new ApiError('INVALID', 'Tiene que quedar al menos una persona admin.');
      u.role = role;
    }
    if (req.active !== undefined) {
      var active = !!req.active;
      if (!active && Util.str(u.role) === 'admin' && Auth._countAdmins(id) === 0) throw new ApiError('INVALID', 'Tiene que quedar al menos una persona admin activa.');
      if (!active && session && session.userId === id) throw new ApiError('INVALID', 'No podés desactivar tu propio usuario.');
      u.active = active;
    }
    if (req.name !== undefined) {
      var name = Util.str(req.name).replace(/\s+/g, ' ');
      if (name.length < 2 || name.length > 40) throw new ApiError('INVALID', 'Escribí el nombre de la persona (2 a 40 letras).');
      u.name = name;
    }
    Db.update('users', u);
    Auth.endSessions(id); // el rol y el nombre viajan en la sesión: tiene que volver a entrar
    Db.log('info', 'user.update', session ? session.userId : 'menu', id);
    return { ok: true };
  },

  /** Código nuevo de un solo uso. El PIN anterior deja de servir y se cierran sus sesiones. */
  resetPin: function (req, session) {
    var u = Auth.user(Util.str(req.userId));
    if (!u || !Util.bool(u.active)) throw new ApiError('NOT_FOUND', 'No encontramos a esa persona o está desactivada.');
    var id = Util.str(u.user_id);
    var code = Auth._newCode(u);
    u.pin_hash = '';
    u.salt = '';
    Db.update('users', u);
    Auth.endSessions(id);
    Util.cache().remove('fail:' + id);
    Db.log('info', 'user.resetPin', session ? session.userId : 'menu', id);
    return { userId: id, name: Util.str(u.name), activationCode: code, activationExpires: u.activation_expires };
  }
};
