import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';

import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  output: "hybrid",
  integrations: [preact()],
  site: 'https://dailyjobpost.online',
  adapter: cloudflare()
});