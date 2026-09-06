import React from 'react';
import Layout from '@theme/Layout';

export default function About() {
  return (
    <Layout title="关于我们" description="Arcfra知识库 - 关于我们">
      <main className="container margin-vert--lg">
        <h1>关于我们</h1>
        <p>Arcfra知识库,基于 Docusaurus 构建,内容以 Markdown 管理。</p>
      </main>
    </Layout>
  );
}
