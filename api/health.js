const { route } = require('./_util');
module.exports = route('GET', () => ({ ok: true, v: '1.1', search: true, cloud: true }));
