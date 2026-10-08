import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests/browser', timeout:30000, workers:1,
  use:{baseURL:'http://127.0.0.1:8767',channel:'chrome',headless:true},
  webServer:{command:'PORT=8767 npm run dev',url:'http://127.0.0.1:8767',reuseExistingServer:!process.env.CI},
});
