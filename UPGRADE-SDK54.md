# SDK 54 + Expo Router v6 注意事项

- 需要 Node >= 20.19.4（使用 nvm 切换）
- 安装依赖建议：
    npx expo install
    npm i expo-router@^6.0.14
    npm i @clerk/clerk-expo@2.17.1 react-dom@18.2.0 --save-exact
- 入口文件：client/index.js -> import 'expo-router/entry';