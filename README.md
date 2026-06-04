# CurioVault

CurioVault 是一个个人收藏夹网站，用来整理自己觉得不错、也值得留下来的东西。内容包括音乐、影视、书籍、图片和文章，前台负责展示，后台负责管理收藏数据。

## 功能

- 前台收藏页：按音乐、影视、书籍、图片、文章分区展示。
- 首页动态背景：使用 Firestore 中收藏条目的 `coverUrl` 作为瓷砖背景来源。
- 分类展柜：首页按分类展示收藏数量和封面堆叠效果。
- 后台管理：支持添加、编辑、删除、批量选择、搜索、导入、导出和智能填充收藏。
- Firestore 数据：统一使用 `items` 集合保存收藏内容。

## 目录

```text
admin/       后台管理界面
collection/  前台收藏网站
api/         Vercel Serverless Function，用于小米 MiMo 智能填充代理
```

## 数据字段

Firestore 集合名固定为 `items`，主要字段：

```text
category     分类：music / movie / tv / books / images / articles
title        标题
artist       艺术家、作者、导演等
coverUrl     封面图片 URL
description  描述
link         外部链接
year         年份或年代文本
rating       评分
tags         标签数组
createdAt    添加时间
updatedAt    更新时间
```

## 本地预览

这是静态站点，可以用 VS Code Live Server 或任意静态服务器打开。

推荐入口：

```text
collection/index.html
```

后台入口：

```text
admin/index.html
```

## 智能填充

后台“添加作品 / 编辑作品”弹窗里的“一键填充”会调用 Vercel Serverless Function `/api/autofillCollectionItem`，再由服务端请求小米 MiMo API。不要把 MiMo API Key 写进前端文件。

在 Vercel 项目设置里添加环境变量：

```text
MIMO_API_KEY=你的 MiMo API Key
MIMO_MODEL=mimo-v2.5-pro
```

音乐分类会优先调用网易云音乐开放平台搜索歌曲，再调用“批量获取歌曲信息”补全封面、歌手、专辑和曲风标签，最后交给 MiMo 整理描述和标签。未配置网易云环境变量或接口失败时，会自动回退到 MiMo。按你的网易云开放平台应用配置填写：

```text
NETEASE_MUSIC_SEARCH_URL=网易云官方歌曲搜索接口地址
NETEASE_MUSIC_SEARCH_METHOD=POST
NETEASE_MUSIC_SONG_LIST_URL=https://openapi.music.163.com/openapi/music/basic/song/list/get/v2
NETEASE_MUSIC_SONG_LIST_METHOD=POST
NETEASE_MUSIC_APP_ID=你的网易云 AppID
NETEASE_MUSIC_ACCESS_TOKEN=你的网易云 accessToken
NETEASE_MUSIC_APP_SECRET=你的网易云 App Secret
NETEASE_MUSIC_DEVICE={"deviceType":"andrwear","os":"otos","appVer":"0.1","channel":"hm","model":"kys","deviceId":"357","brand":"hm","osVer":"8.1.0"}
```

如果后台和 API 都部署在同一个 Vercel 项目，后台会自动请求：

```text
/api/autofillCollectionItem
```

当前采用 GitHub Pages 托管网页、Vercel 只跑 API。部署 Vercel API 后，需要把 Vercel API 完整地址写入 `collection/js/firebase-config.js`：

```js
var CURIOVAULT_AUTOFILL_ENDPOINT = 'https://你的-vercel-项目.vercel.app/api/autofillCollectionItem';
```

## 说明

当前项目直接在前端读取 Firebase / Firestore。测试阶段可以使用临时开放规则；正式使用前建议给后台写入加鉴权，避免数据库被公开写入。
