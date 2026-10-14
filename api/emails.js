const { A, route, body } = require('./_util');
module.exports = route('POST', (req) => A.readInbox(body(req)));
