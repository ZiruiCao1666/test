
# Student Motivation (Expo + Clerk + Neon)

最小可运行的“登录界面 + 简单后端写库”模板。前端使用 Expo（.jsx），后端 Node/Express 连接 Neon Postgres。

## 目录
- client/  —— Expo 应用（移动端）
- server/  —— Node + Express 后端（写入/更新用户）

---

## 准备

### 1) 后端（server）
1. 复制 `server/.env.example` 为 `server/.env`，填入：
   - `DATABASE_URL`：你的 Neon 连接串
   - `CLERK_SECRET_KEY`：Clerk 后台的 **Secret key**
2. 安装依赖并启动：
   ```bash
   cd server
   npm i
   npm run dev
   ```
   服务运行在 `http://localhost:4000`。

### 2) 前端（client）
1. 复制 `client/.env.example` 为 `client/.env`，如果你使用本地后端则保持：
   ```
   EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=...你的 publishable key...
   EXPO_PUBLIC_API_BASE_URL=http://localhost:4000
   ```
2. 安装依赖并启动 Expo：
   ```bash
   cd client
   npm i
   npm run start
   ```

打开 Expo App 扫描二维码即可在手机上运行。

---

## 路由与页面
- `client/app/_layout.jsx`：注入 `ClerkProvider`（使用 EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY）
- `client/app/(auth)/sign-in.jsx`：极简登录页（邮箱/密码），登录成功后调用 `/users/sync` 写库
- `client/app/index.jsx`：登录后的占位首页

---

## 说明
- 登录鉴权由 Clerk 完成；后端仅通过 Bearer token 验证用户身份并在 Neon 中 upsert 一条用户记录。
- 所有前端变量使用 `EXPO_PUBLIC_*` 前缀；后端使用 `CLERK_SECRET_KEY`（不要放到前端）。
