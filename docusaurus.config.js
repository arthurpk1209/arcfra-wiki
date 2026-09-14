// @ts-check
const {themes: prismThemes} = require('prism-react-renderer');

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Arcfra知識庫',
  tagline: '基於 Docusaurus 的知識庫系統',
  favicon: 'img/logo.svg',

  url: 'https://kb.arcfra.com',
  baseUrl: '/',

  // 部署到自己的伺服器 / Docker,不需要 GitHub Pages 相關設定
  organizationName: 'arcfra',
  projectName: 'arcfra-wiki',

  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',

  i18n: {
    defaultLocale: 'zh-Hant',
    locales: ['zh-Hant'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          path: 'arcfra-wiki', // 內容目錄(資料夾/檔案名用英文,內容仍可以是中文)
          routeBasePath: '/', // 文件即首頁,模仿目標站「打開即進知識庫」的體驗
          sidebarPath: require.resolve('./sidebars.js'),
          editUrl: 'https://github.com/arcfra/arcfra-wiki/edit/main/',
        },
        blog: false, // 純知識庫,不需要部落格模組
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
    // 離線本地搜尋,不依賴 Algolia,適合內網/私有部署,支援 Ctrl+K
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
        title: 'Arcfra知識庫',
        logo: {
          alt: 'Arcfra知識庫 Logo',
          src: 'img/logo.svg',
        },
        items: [
          {
            type: 'docSidebar',
            sidebarId: 'kbSidebar',
            position: 'left',
            label: '首頁',
          },
          {to: '/about', label: '關於我們', position: 'left'},
          {
            href: 'https://github.com/arcfra/arcfra-wiki',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [],
        copyright: `© ${new Date().getFullYear()} Arcfra知識庫. Powered by Docusaurus.`,
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
