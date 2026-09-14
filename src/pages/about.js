import React from 'react';
import Layout from '@theme/Layout';

export default function About() {
  return (
    <Layout title="關於我們" description="Arcfra知識庫 - 關於我們">
      <main className="container margin-vert--lg">
        <h1>關於我們</h1>
        <p>Arcfra知識庫,基於 Docusaurus 構建,內容以 Markdown 管理。</p>
      </main>
    </Layout>
  );
}
