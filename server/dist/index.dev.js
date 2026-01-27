"use strict";

require("dotenv/config");

var _express = _interopRequireDefault(require("express"));

var _cors = _interopRequireDefault(require("cors"));

var _clerkSdkNode = require("@clerk/clerk-sdk-node");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }

// server/index.js
// 一个最简版的 Express + Clerk 后端，只做两件事：
// 1) 提供 /health 用来测试后端有没有跑起来
// 2) 提供 /users/sync，用 Clerk 验证 Authorization 里的 token
var app = (0, _express["default"])();
var port = process.env.PORT || 4000; // 允许前端（Expo）访问

app.use((0, _cors["default"])());
app.use(_express["default"].json()); // 健康检查：浏览器打开 http://localhost:4000/health 看看

app.get('/health', function (req, res) {
  res.json({
    ok: true
  });
}); // 同步用户信息（前端 sign-in / sign-up 成功后会调用这里）

app.post('/users/sync', (0, _clerkSdkNode.ClerkExpressWithAuth)(), function _callee(req, res) {
  var _ref, userId, sessionId;

  return regeneratorRuntime.async(function _callee$(_context) {
    while (1) {
      switch (_context.prev = _context.next) {
        case 0:
          _context.prev = 0;
          _ref = req.auth || {}, userId = _ref.userId, sessionId = _ref.sessionId;

          if (userId) {
            _context.next = 4;
            break;
          }

          return _context.abrupt("return", res.status(401).json({
            error: 'Unauthenticated'
          }));

        case 4:
          return _context.abrupt("return", res.json({
            userId: userId,
            sessionId: sessionId,
            message: 'User sync placeholder – backend is working 🎉'
          }));

        case 7:
          _context.prev = 7;
          _context.t0 = _context["catch"](0);
          console.error('[BE] /users/sync error:', _context.t0);
          return _context.abrupt("return", res.status(500).json({
            error: 'Internal server error'
          }));

        case 11:
        case "end":
          return _context.stop();
      }
    }
  }, null, null, [[0, 7]]);
}); // 启动服务器

app.listen(port, function () {
  console.log("Backend listening on http://localhost:".concat(port));
});
//# sourceMappingURL=index.dev.js.map
