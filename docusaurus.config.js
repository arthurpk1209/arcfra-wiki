// @ts-check
const {themes: prismThemes} = require('prism-react-renderer');

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Arcfra知识库',
  tagline: '基于 Docusaurus 的知识库系统',
  favicon: 'img/logo.svg',

  url: 'https://kb.arcfra.com',
  baseUrl: '/',

  // 部署到自己的服务器 / Docker,不需要 GitHub Pages 相关配置
  organizationName: 'arcfra',
  projectName: 'arcfra-kb',

  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',

  i18n: {
    defaultLocale: 'zh-Hans',
    locales: ['zh-Hans'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          path: 'arcfra-wiki', // 内容目录(文件夹/文件名用英文,内容仍可以是中文)
          routeBasePath: '/', // 文档即首页,模仿目标站「打开即进知识库」的体验
          sidebarPath: require.resolve('./sidebars.js'),
          editUrl: 'https://github.com/arcfra/arcfra-kb/edit/main/',
        },
        blog: false, // 纯知识库,不需要博客模块
        pages: {
          path: 'src/pages',
        },
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
      }),
    ],
  ],

  themes: [
    // 离线本地搜索,不依赖 Algolia,适合内网/私有部署,支持 Ctrl+K
    [
      require.resolve('@easyops-cn/docusaurus-search-local'),
      /** @type {import('@easyops-cn/docusaurus-search-local').PluginOptions} */
      ({
        hashed: true,
        language: ['zh', 'en'],
        indexDocs: true,
        indexBlog: false,
        indexPages: true,
        docsRouteBasePath: '/',
        highlightSearchTermsOnTargetPage: true,
        searchResultLimits: 8,
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      colorMode: {
        defaultMode: 'light',
        respectPrefersColorScheme: true,
      },
      navbar: {
        title: 'Arcfra知识库',
        logo: {
          alt: 'Arcfra知识库 Logo',
          src: 'img/logo.svg',
        },
        items: [
          {
            type: 'docSidebar',
            sidebarId: 'kbSidebar',
            position: 'left',
            label: '首页',
          },
          {to: '/about', label: '关于我们', position: 'left'},
          {
            href: 'https://github.com/arcfra/arcfra-kb',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [],
        copyright: `© ${new Date().getFullYear()} Arcfra知识库. Powered by Docusaurus.`,
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
      },
      docs: {
        sidebar: {
          hideable: true,
          autoCollapseCategories: true,
        },
      },
    }),
};

module.exports = config;
