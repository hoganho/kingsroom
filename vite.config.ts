// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Helper function to format the date
const getBuildVersion = () => {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  return `${year}${month}${day}.${hours}${minutes}`;
};

export default defineConfig({
  plugins: [react()],
  // ✅ NEW SECTION: This injects the build version into your app
  define: {
    'import.meta.env.VITE_BUILD_VERSION': JSON.stringify(getBuildVersion()),
  },
});