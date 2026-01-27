"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.pool = void 0;

var _pg = _interopRequireDefault(require("pg"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }

var Pool = _pg["default"].Pool;
var pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});
exports.pool = pool;
//# sourceMappingURL=db.dev.js.map
